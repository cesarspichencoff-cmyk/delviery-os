package br.com.tata.entregas

import android.content.Context
import androidx.room.Room
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.GpsPointEntity
import br.com.tata.entregas.sync.applyGpsBatchResponse
import br.com.tata.entregas.sync.interpretarRespostaHttp
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * 403 da autenticação do aparelho num lote de GPS, com o Room real.
 *
 * A plataforma usa 403 para "a unidade do token ficou velha, renove e repita"
 * e para "revogado, pare e avise", e nos dois casos manda preservar os dados
 * locais (`corpoDeRecusa` em `src/platform/auth/device-auth.ts`). A recusa é
 * de QUEM mandou, nunca do QUE foi mandado: o lote não pode virar `rejected`
 * terminal, senão o aparelho reautorizado nunca mais o envia.
 *
 * Corpos e pontos são fictícios; nenhuma coordenada real.
 */
@RunWith(RobolectricTestRunner::class)
class GpsAuthorizationRefusalTest {
    private lateinit var ctx: Context
    private lateinit var name: String
    private lateinit var db: EntregasDatabase

    private fun open() = Room.databaseBuilder(ctx, EntregasDatabase::class.java, name).build()

    @Before fun setup() {
        ctx = RuntimeEnvironment.getApplication()
        name = "gps-authz-fixture-${System.nanoTime()}.db"
        db = open()
    }

    @After fun teardown() {
        db.close()
        ctx.deleteDatabase(name)
    }

    private fun point(n: Long) = GpsPointEntity(
        pointId = "fixture-point-$n",
        idempotencyKey = "fixture-key-$n",
        tripId = "fixture-trip",
        deviceId = "fixture-device",
        latitude = 0.0,
        longitude = 0.0,
        accuracyM = 5.0,
        speedMps = null,
        headingDeg = null,
        altitudeM = null,
        occurredAt = "2026-10-20T10:00:0${n}Z",
        elapsedRealtimeNanos = n,
        provider = "fixture",
        isMock = false,
        capturedOffline = true,
        sequenceLocal = n,
        syncState = "pending",
        attempts = 0,
        lastError = null,
        createdAtMs = 1_000L + n,
    )

    private suspend fun queue(count: Long): List<GpsPointEntity> {
        for (n in 1..count) db.gpsPoints().insert(point(n))
        return db.gpsPoints().nextBatch(100)
    }

    /** Recusa de lote de GPS: `responder(auth.status, "nao_autorizado", corpoDeRecusa(auth))`. */
    private val gpsRenovavel = """
        {"classe":"nao_autorizado","ok":false,"motivo":"unidade_divergente",
         "instrucao":"renovar_e_repetir","preservar_dados_locais":true,
         "humano":"Este aparelho não está autorizado para esta unidade."}
    """.trimIndent()

    private val gpsRevogado = """
        {"classe":"nao_autorizado","ok":false,"motivo":"dispositivo_revogado",
         "instrucao":"parar_e_avisar","preservar_dados_locais":true,
         "humano":"Este aparelho foi revogado. Fale com o responsável."}
    """.trimIndent()

    /** `corpoDeRecusa` sem `classe`, como a rota da fila B5 responde. */
    private val semClasse = """
        {"ok":false,"motivo":"dispositivo_desconhecido","instrucao":"parar_e_avisar",
         "preservar_dados_locais":true,"humano":"Este aparelho não está cadastrado."}
    """.trimIndent()

    @Test fun `403 renovar_e_repetir preserva o lote e pede nova credencial`() = runBlocking {
        val batch = queue(3)
        val outcome = applyGpsBatchResponse(db, batch, interpretarRespostaHttp(403, gpsRenovavel))

        assertTrue("credencial precisa ser renovada", outcome.credentialRefused)
        assertEquals(0, db.gpsPoints().rejectedCount())
        assertEquals(3, db.gpsPoints().pendingCount())
    }

    @Test fun `403 parar_e_avisar preserva o lote para o aparelho reautorizado`() = runBlocking {
        val batch = queue(3)
        val outcome = applyGpsBatchResponse(db, batch, interpretarRespostaHttp(403, gpsRevogado))

        // A revogação local é decidida pelo bootstrap em /api/device/session,
        // que esta credencial descartada obriga a consultar.
        assertTrue(outcome.credentialRefused)
        assertFalse(outcome.retryable)
        assertEquals(0, db.gpsPoints().rejectedCount())
        assertEquals(3, db.gpsPoints().pendingCount())
    }

    @Test fun `403 de corpoDeRecusa sem classe tambem preserva`() = runBlocking {
        val batch = queue(2)
        applyGpsBatchResponse(db, batch, interpretarRespostaHttp(403, semClasse))
        assertEquals(0, db.gpsPoints().rejectedCount())
        assertEquals(2, db.gpsPoints().pendingCount())
    }

    @Test fun `lote recusado por 403 sobrevive a restart e drena na ordem apos reautorizar`() = runBlocking {
        val batch = queue(3)
        // Duas execuções recusadas (ex.: NOW e PERIODIC) antes da renovação.
        applyGpsBatchResponse(db, batch, interpretarRespostaHttp(403, gpsRenovavel))
        applyGpsBatchResponse(db, db.gpsPoints().nextBatch(100), interpretarRespostaHttp(403, gpsRenovavel))
        db.close()
        db = open() // processo morto no meio da janela de sincronização

        val recovered = db.gpsPoints().nextBatch(100)
        assertEquals(listOf(1L, 2L, 3L), recovered.map { it.sequenceLocal })
        assertEquals(batch.map { it.idempotencyKey }, recovered.map { it.idempotencyKey })
        assertTrue(recovered.all { it.syncState == "failed" && it.attempts == 2 })
        assertEquals(3, db.gpsPoints().countForTrip("fixture-trip"))

        // Nova credencial: o MESMO lote, com as MESMAS chaves, é aceito.
        val ok = interpretarRespostaHttp(200, """{"accepted":3,"duplicate":0,"rejected":0,"rejections":[]}""")
        val outcome = applyGpsBatchResponse(db, recovered, ok)
        assertFalse(outcome.credentialRefused)
        assertFalse(outcome.retryable)
        assertEquals(0, db.gpsPoints().pendingCount())
        assertEquals(0, db.gpsPoints().rejectedCount())
        assertEquals(3, db.gpsPoints().countForTrip("fixture-trip"))
    }

    @Test fun `reenvio apos 403 com recibo duplicado fecha a fila sem duplicar linha`() = runBlocking {
        val batch = queue(2)
        applyGpsBatchResponse(db, batch, interpretarRespostaHttp(403, gpsRenovavel))
        val retry = db.gpsPoints().nextBatch(100)
        assertEquals("o lote recusado precisa voltar inteiro", 2, retry.size)
        val ok = interpretarRespostaHttp(200, """{"accepted":0,"duplicate":2,"rejected":0,"rejections":[]}""")
        applyGpsBatchResponse(db, retry, ok)
        assertEquals(0, db.gpsPoints().pendingCount())
        assertEquals(2, db.gpsPoints().countForTrip("fixture-trip"))
    }

    /* --- o que NÃO é recusa de autorização do aparelho continua terminal --- */

    @Test fun `403 com corpo do piloto continua recusa definitiva`() = runBlocking {
        val batch = queue(2)
        val body = """{"ok":false,"human":"Só o próprio motoboy registra o aceite do termo.","code":"not_rider"}"""
        val outcome = applyGpsBatchResponse(db, batch, interpretarRespostaHttp(403, body))
        assertFalse(outcome.credentialRefused)
        assertEquals(2, db.gpsPoints().rejectedCount())
        assertEquals(0, db.gpsPoints().pendingCount())
    }

    @Test fun `400 de contrato invalido continua recusa definitiva sem loop`() = runBlocking {
        val batch = queue(2)
        val body = """{"classe":"contrato_invalido","motivo":"lote_vazio","preservar_dados_locais":true}"""
        val outcome = applyGpsBatchResponse(db, batch, interpretarRespostaHttp(400, body))
        assertFalse(outcome.credentialRefused)
        assertFalse(outcome.retryable)
        assertEquals(2, db.gpsPoints().rejectedCount())
        assertTrue(db.gpsPoints().nextBatch(100).isEmpty())
    }

    @Test fun `403 sem corpo JSON ou com instrucao desconhecida continua definitivo`() = runBlocking {
        val batch = queue(2)
        applyGpsBatchResponse(db, batch.take(1), interpretarRespostaHttp(403, "<html>forbidden</html>"))
        applyGpsBatchResponse(
            db,
            batch.drop(1),
            interpretarRespostaHttp(403, """{"classe":"outra","instrucao":"prosseguir"}"""),
        )
        assertEquals(2, db.gpsPoints().rejectedCount())
    }

    @Test fun `401 continua preservando o lote e pedindo nova credencial`() = runBlocking {
        val batch = queue(2)
        val body = """{"classe":"nao_autenticado","motivo":"credencial_expirada","instrucao":"renovar_e_repetir"}"""
        val outcome = applyGpsBatchResponse(db, batch, interpretarRespostaHttp(401, body))
        assertTrue(outcome.credentialRefused)
        assertEquals(2, db.gpsPoints().pendingCount())
    }
}
