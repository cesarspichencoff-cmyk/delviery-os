package br.com.tata.entregas

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.GpsPointEntity
import br.com.tata.entregas.data.TermAckEntity
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Persistência real, em SQLite de verdade.
 *
 * O que estes testes provam é a promessa mais cara do piloto: **nada se
 * perde**. Fechar o app, o sistema matar o processo, reiniciar o aparelho,
 * enviar o lote duas vezes — em nenhum desses casos um ponto pode sumir ou
 * virar dois.
 *
 * Rodam em aparelho ou emulador (`./gradlew connectedDebugAndroidTest`).
 */
@RunWith(AndroidJUnit4::class)
class PersistenceInstrumentedTest {

    private lateinit var dbFile: File
    private lateinit var db: EntregasDatabase

    private fun open(): EntregasDatabase =
        Room.databaseBuilder(
            ApplicationProvider.getApplicationContext(),
            EntregasDatabase::class.java,
            dbFile.name,
        ).build()

    @Before
    fun setUp() {
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        dbFile = ctx.getDatabasePath("entregas-test-${System.nanoTime()}.db")
        db = open()
    }

    @After
    fun tearDown() {
        db.close()
        dbFile.delete()
    }

    private fun point(seq: Long, occurredAt: String, trip: String = "trip-1") = GpsPointEntity(
        pointId = "gps:dev-1:$trip:$occurredAt",
        idempotencyKey = "gps:dev-1:$trip:$occurredAt",
        tripId = trip,
        deviceId = "dev-1",
        latitude = -23.5,
        longitude = -46.6,
        accuracyM = 12.0,
        speedMps = 5.0,
        headingDeg = 90.0,
        altitudeM = null,
        occurredAt = occurredAt,
        elapsedRealtimeNanos = seq * 1_000_000_000L,
        provider = "fused",
        isMock = false,
        capturedOffline = false,
        sequenceLocal = seq,
        syncState = "pending",
        attempts = 0,
        lastError = null,
        createdAtMs = System.currentTimeMillis(),
    )

    @Test
    fun fechar_o_aplicativo_nao_perde_evento() = runBlocking {
        db.gpsPoints().insert(point(1, "2026-04-01T12:00:00.000Z"))
        db.gpsPoints().insert(point(2, "2026-04-01T12:00:30.000Z"))
        db.close()

        // Processo recriado: objeto novo, mesmos bytes no disco.
        db = open()
        assertEquals(2, db.gpsPoints().pendingCount())
    }

    @Test
    fun mesma_amostra_duas_vezes_nao_duplica() = runBlocking {
        val p = point(1, "2026-04-01T12:00:00.000Z")
        db.gpsPoints().insert(p)
        db.gpsPoints().insert(p.copy(sequenceLocal = 99, attempts = 5))
        assertEquals(1, db.gpsPoints().pendingCount())
    }

    @Test
    fun enviar_o_lote_duas_vezes_nao_duplica() = runBlocking {
        val ids = listOf("2026-04-01T12:00:00.000Z", "2026-04-01T12:00:30.000Z")
            .mapIndexed { i, at -> point((i + 1).toLong(), at) }
        ids.forEach { db.gpsPoints().insert(it) }

        val batch = db.gpsPoints().nextBatch(100).map { it.pointId }
        db.gpsPoints().markSent(batch)
        db.gpsPoints().markSent(batch) // reenvio do mesmo lote

        assertEquals(0, db.gpsPoints().pendingCount())
        assertEquals(2, db.gpsPoints().countForTrip("trip-1"))
    }

    @Test
    fun falha_parcial_permanece_visivel_e_volta_ao_lote() = runBlocking {
        db.gpsPoints().insert(point(1, "2026-04-01T12:00:00.000Z"))
        val ids = db.gpsPoints().nextBatch(100).map { it.pointId }

        db.gpsPoints().markFailed(ids, "SocketTimeoutException")

        val again = db.gpsPoints().nextBatch(100)
        assertEquals(1, again.size)
        assertEquals("failed", again[0].syncState)
        assertEquals(1, again[0].attempts)
        assertEquals("SocketTimeoutException", again[0].lastError)
    }

    @Test
    fun viagem_encerrada_antes_da_sincronizacao_continua_reconstruivel() = runBlocking {
        db.gpsPoints().insert(point(1, "2026-04-01T12:00:00.000Z"))
        db.gpsPoints().insert(point(2, "2026-04-01T12:00:30.000Z"))
        // Viagem encerra: a chave de viagem ativa some...
        db.deviceState().clear(EntregasDatabase.KEY_ACTIVE_TRIP)
        assertNull(db.deviceState().get(EntregasDatabase.KEY_ACTIVE_TRIP))
        // ...mas os pontos continuam lá, esperando rede.
        assertEquals(2, db.gpsPoints().pendingCount())
        assertEquals(2, db.gpsPoints().nextBatch(100).size)
    }

    @Test
    fun lote_sai_na_ordem_em_que_o_aparelho_observou() = runBlocking {
        db.gpsPoints().insert(point(3, "2026-04-01T12:01:00.000Z"))
        db.gpsPoints().insert(point(1, "2026-04-01T12:00:00.000Z"))
        db.gpsPoints().insert(point(2, "2026-04-01T12:00:30.000Z"))
        val seqs = db.gpsPoints().nextBatch(100).map { it.sequenceLocal }
        assertEquals(listOf(1L, 2L, 3L), seqs)
    }

    @Test
    fun aceite_do_termo_sobrevive_ao_reinicio_e_e_append_only() = runBlocking {
        val ack = TermAckEntity(
            acknowledgementId = "ack-1",
            riderId = "rid-1",
            unitId = "ITAIM",
            termVersion = "1.0.0",
            termMaterialVersion = "1",
            termHash = "hash-abc",
            status = "accepted",
            acceptedAt = "2026-04-01T11:00:00.000Z",
            deviceId = "dev-1",
            appVersion = "1.0.0-piloto",
            language = "pt-BR",
            origin = "rider_app",
            correlationId = "corr-1",
            schemaVersion = "consent@1.0.0",
            syncState = "pending",
        )
        db.termAcks().insert(ack)
        // Tentativa de reescrever com outro status: ignorada.
        db.termAcks().insert(ack.copy(status = "declined", acceptedAt = "2020-01-01T00:00:00.000Z"))

        db.close()
        db = open()

        val found = db.termAcks().findAccepted("rid-1", "hash-abc")
        assertNotNull("aceite continua válido depois do reinício", found)
        assertEquals("accepted", found!!.status)
        assertEquals(1, db.termAcks().history("rid-1").size)
    }

    @Test
    fun expurgo_de_retencao_nao_apaga_o_que_ainda_nao_subiu() = runBlocking {
        val antigo = point(1, "2026-01-01T12:00:00.000Z").copy(createdAtMs = 1_000L)
        db.gpsPoints().insert(antigo)
        db.gpsPoints().insert(point(2, "2026-04-01T12:00:00.000Z").copy(createdAtMs = 1_000L))
        db.gpsPoints().markSent(listOf(antigo.pointId))

        val removed = db.gpsPoints().purgeSyncedBefore(2_000L)

        assertEquals("só o já sincronizado é expurgado", 1, removed)
        assertEquals(1, db.gpsPoints().pendingCount())
    }
}
