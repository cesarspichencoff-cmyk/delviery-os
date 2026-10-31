package br.com.tata.entregas

import android.content.Context
import androidx.room.Room
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.sync.OperationalEventRecorder
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
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
 * C5 — o produtor da fila `outbox_event`, com Room real no Robolectric.
 *
 * A tabela existia, o SyncWorker a drenava, o piloto a recebia com recibo —
 * e nada a preenchia. Estes testes provam o que o produtor grava, o que ele
 * recusa e que a gravação é idempotente e ordenada, na mesma fila que o
 * worker consome (`nextBatch`).
 */
@RunWith(RobolectricTestRunner::class)
class OperationalEventRecorderTest {
    private lateinit var ctx: Context
    private lateinit var name: String
    private lateinit var db: EntregasDatabase

    @Before fun setup() {
        ctx = RuntimeEnvironment.getApplication()
        name = "outbox-producer-${System.nanoTime()}.db"
        db = Room.databaseBuilder(ctx, EntregasDatabase::class.java, name).build()
    }

    @After fun teardown() {
        db.close()
        ctx.deleteDatabase(name)
    }

    private fun envelope(
        eventId: String,
        type: String = "ConfirmTripDeparture",
        extra: JSONObject.() -> Unit = {},
    ): String {
        val command = JSONObject()
            .put("type", type)
            .put("command_id", "cmd-$eventId")
            .put("occurred_at", "2026-10-31T12:00:00.000Z")
            .put("trip_id", "T-1")
        command.extra()
        return JSONObject()
            .put("event_id", eventId)
            .put("idempotency_key", eventId)
            .put("command", command)
            .toString()
    }

    @Test fun saidaValidaEntraPendenteComSequencia() = runBlocking {
        val r = OperationalEventRecorder.record(db, envelope("ev-1"), 1_000L)
        assertEquals(OperationalEventRecorder.Result.Recorded("ev-1", duplicate = false), r)
        val fila = db.outbox().nextBatch(10)
        assertEquals(1, fila.size)
        val e = fila[0]
        assertEquals("ev-1", e.eventId)
        assertEquals("ev-1", e.idempotencyKey)
        assertEquals("ConfirmTripDeparture", e.kind)
        assertEquals("T-1", e.tripId)
        assertEquals("pending", e.syncState)
        assertEquals(1L, e.sequenceLocal)
        assertEquals("cmd-ev-1", JSONObject(e.payload).getString("command_id"))
    }

    @Test fun mesmoEventIdNaoDuplica() = runBlocking {
        OperationalEventRecorder.record(db, envelope("ev-1"), 1_000L)
        val segunda = OperationalEventRecorder.record(db, envelope("ev-1"), 2_000L)
        assertEquals(OperationalEventRecorder.Result.Recorded("ev-1", duplicate = true), segunda)
        assertEquals(1, db.outbox().pendingCount())
        assertEquals(1L, db.outbox().maxSequence())
    }

    @Test fun ordemDosToquesViraOrdemDoLote() = runBlocking {
        OperationalEventRecorder.record(db, envelope("ev-a"), 1_000L)
        OperationalEventRecorder.record(db, envelope("ev-b", "RecordArrivalReported") { put("delivery_id", "D-1") }, 1_001L)
        OperationalEventRecorder.record(db, envelope("ev-c", "ConfirmDelivery") { put("delivery_id", "D-1") }, 1_002L)
        val fila = db.outbox().nextBatch(10)
        assertEquals(listOf("ev-a", "ev-b", "ev-c"), fila.map { it.eventId })
        assertEquals(listOf(1L, 2L, 3L), fila.map { it.sequenceLocal })
    }

    @Test fun recusaComandoQueNaoEDoMotoboy() = runBlocking {
        for (tipo in listOf("CreateTrip", "CloseTripManually", "AssignInternalRider", "StartHandoff")) {
            val r = OperationalEventRecorder.record(db, envelope("ev-$tipo", tipo), 1_000L)
            assertEquals(OperationalEventRecorder.Result.Refused("tipo_nao_permitido"), r)
        }
        assertEquals(0, db.outbox().pendingCount())
    }

    @Test fun recusaIdentidadeOuCorpoForaDoContrato() = runBlocking {
        val casos = listOf(
            "json_invalido" to "{nao e json",
            "event_id_invalido" to envelope("ev com espaco"),
            "comando_ausente" to JSONObject().put("event_id", "ev-x").toString(),
            "command_id_invalido" to envelope("ev-y") { put("command_id", "id/com/barra") },
            "horario_invalido" to envelope("ev-z") { put("occurred_at", "ontem") },
            "viagem_ausente" to envelope("ev-w") { remove("trip_id") },
            "parada_ausente" to envelope("ev-v", "ConfirmDelivery"),
            "ocorrencia_invalida" to envelope("ev-u", "CreateOccurrence"),
            "comando_grande_demais" to envelope("ev-t", "CreateOccurrence") {
                put("occurrence_id", "OCC-1")
                put("report", "x".repeat(OperationalEventRecorder.MAX_COMMAND_BYTES))
            },
        )
        for ((motivo, json) in casos) {
            val r = OperationalEventRecorder.record(db, json, 1_000L)
            assertEquals("caso $motivo", OperationalEventRecorder.Result.Refused(motivo), r)
        }
        assertEquals(0, db.outbox().pendingCount())
    }

    @Test fun ocorrenciaSemViagemEntraComTripNulo() = runBlocking {
        val json = envelope("ev-occ", "CreateOccurrence") {
            remove("trip_id")
            put("occurrence_id", "OCC-M-1")
            put("report", "Problema registrado pelo motoboy")
        }
        val r = OperationalEventRecorder.record(db, json, 1_000L)
        assertEquals(OperationalEventRecorder.Result.Recorded("ev-occ", duplicate = false), r)
        assertEquals(null, db.outbox().nextBatch(1)[0].tripId)
    }

    @Test fun listaParaPaginaNaoExpoeCorpoDoComando() = runBlocking {
        OperationalEventRecorder.record(db, envelope("ev-1", "ConfirmDelivery") {
            put("delivery_id", "D-9")
            put("segredo_de_teste", "nao-deve-aparecer")
        }, 1_000L)
        val lista = JSONArray(OperationalEventRecorder.recentJson(db))
        assertEquals(1, lista.length())
        val item = lista.getJSONObject(0)
        assertEquals("ev-1", item.getString("event_id"))
        assertEquals("ConfirmDelivery", item.getString("kind"))
        assertEquals("T-1", item.getString("trip_id"))
        assertEquals("D-9", item.getString("delivery_id"))
        assertEquals("pending", item.getString("state"))
        assertFalse(lista.toString().contains("nao-deve-aparecer"))
        assertFalse(item.has("payload"))
        assertFalse(item.has("command"))
    }

    @Test fun respostaDaPonteDizOQueAconteceu() {
        val ok = JSONObject(OperationalEventRecorder.toJson(OperationalEventRecorder.Result.Recorded("ev-1", false)))
        assertTrue(ok.getBoolean("ok"))
        assertEquals("ev-1", ok.getString("event_id"))
        assertFalse(ok.getBoolean("duplicate"))
        val recusa = JSONObject(OperationalEventRecorder.toJson(OperationalEventRecorder.Result.Refused("tipo_nao_permitido")))
        assertFalse(recusa.getBoolean("ok"))
        assertEquals("tipo_nao_permitido", recusa.getString("error"))
    }
}
