package br.com.tata.entregas

import android.content.Context
import androidx.room.Room
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.OutboxEventEntity
import br.com.tata.entregas.sync.ApiResult
import br.com.tata.entregas.sync.EventBatchHttpRejectionHold
import br.com.tata.entregas.sync.retainUnreceiptedEventBatch
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
 * Usa o DAO real com SQLite em arquivo e fecha/reabre entre tentativas.
 * A entrada e o HTTP sao ficticios, sem servidor, GPS ou aparelho.
 */
@RunWith(RobolectricTestRunner::class)
class EventBatchHttpRejectionRoomTest {
    private lateinit var context: Context
    private lateinit var dbName: String
    private lateinit var db: EntregasDatabase

    private fun open(): EntregasDatabase =
        Room.databaseBuilder(context, EntregasDatabase::class.java, dbName).build()

    @Before fun setup() {
        context = RuntimeEnvironment.getApplication()
        dbName = "event-batch-4xx-fixture-${System.nanoTime()}.db"
        db = open()
    }

    @After fun teardown() {
        db.close()
        context.deleteDatabase(dbName)
    }

    private fun event(id: String, order: Long) = OutboxEventEntity(
        eventId = id,
        idempotencyKey = "key-$id",
        tripId = "trip-ficticio",
        kind = "fixture-only",
        payload = """{"ficticio":true}""",
        occurredAt = "2026-11-08T12:30:00Z",
        sequenceLocal = order,
        syncState = "pending",
        attempts = 0,
        lastError = null,
        createdAtMs = 1000L,
    )

    @Test fun pilot403PreservaIdentidadeAoReabrirOBanco() = runBlocking {
        val original = event("evt-403", 1)
        db.outbox().insert(original)
        val decision = retainUnreceiptedEventBatch(
            db, listOf(original.eventId), ApiResult.Rejected("piloto sem autorizacao", 403),
            delegationDenied = false,
        )
        assertEquals(EventBatchHttpRejectionHold.PILOT_AUTHORIZATION_BLOCKED, decision)
        db.close()
        db = open()
        val saved = db.outbox().nextBatch(20).single()
        assertEquals(original.eventId, saved.eventId)
        assertEquals(original.idempotencyKey, saved.idempotencyKey)
        assertEquals(original.payload, saved.payload)
        assertEquals(original.sequenceLocal, saved.sequenceLocal)
        assertEquals("failed", saved.syncState)
        assertEquals(1, saved.attempts)
        assertEquals(1, db.outbox().pendingCount())
        assertEquals(0, db.outbox().rejectedCount())
    }

    @Test fun domain422SemReciboConservaDoisEventosEOrdem() = runBlocking {
        val first = event("evt-1", 1)
        val second = event("evt-2", 2)
        db.outbox().insert(first)
        db.outbox().insert(second)
        val classification = retainUnreceiptedEventBatch(
            db, listOf(first.eventId, second.eventId),
            ApiResult.Rejected("lote_sem_recibo", 422),
            delegationDenied = false,
        )
        assertEquals(EventBatchHttpRejectionHold.UNATTESTED_BATCH_REJECTION, classification)
        db.close()
        db = open()
        val next = db.outbox().nextBatch(20)
        assertEquals(listOf(first.eventId, second.eventId), next.map { it.eventId })
        assertEquals(listOf(first.idempotencyKey, second.idempotencyKey),
            next.map { it.idempotencyKey })
        assertTrue(next.all { it.syncState == "failed" && it.attempts == 1 })
        assertEquals(2, db.outbox().pendingCount())
        assertEquals(0, db.outbox().rejectedCount())
        // Uma confirmacao individual posterior nao deve afetar o outro.
        db.outbox().markSent(listOf(first.eventId))
        assertEquals(listOf(second.eventId), db.outbox().nextBatch(20).map { it.eventId })
        assertEquals(1, db.outbox().pendingCount())
    }

    @Test fun reenviosRepetidosMantemChaveSemInserirDuplicata() = runBlocking {
        val original = event("evt-repeat", 1)
        db.outbox().insert(original)
        repeat(3) {
            val decision = retainUnreceiptedEventBatch(
                db, listOf(original.eventId), ApiResult.Rejected("revisar", 409),
                delegationDenied = false,
            )
            assertEquals(EventBatchHttpRejectionHold.UNATTESTED_BATCH_REJECTION, decision)
            assertEquals(-1L, db.outbox().insert(original))
        }
        db.close()
        db = open()
        val saved = db.outbox().recent(20)
        assertEquals(1, saved.size)
        assertEquals(original.idempotencyKey, saved.single().idempotencyKey)
        assertEquals("failed", saved.single().syncState)
        assertEquals(3, saved.single().attempts)
    }

    @Test fun respostaAtrasadaNaoReabreEventoTerminal() = runBlocking {
        db.outbox().insert(event("evt-sent", 1))
        db.outbox().insert(event("evt-rejected", 2))
        db.outbox().markSent(listOf("evt-sent"))
        db.outbox().markRejected(listOf("evt-rejected"), "recibo individual recusou")
        retainUnreceiptedEventBatch(
            db, listOf("evt-sent", "evt-rejected"),
            ApiResult.Rejected("timeout tardio", 422),
            delegationDenied = false,
        )
        db.close()
        db = open()
        assertEquals(0, db.outbox().pendingCount())
        assertEquals(1, db.outbox().rejectedCount())
        assertTrue(db.outbox().nextBatch(10).isEmpty())
        val saved = db.outbox().recent(10).associateBy { it.eventId }
        assertEquals("sent", saved.getValue("evt-sent").syncState)
        assertEquals("rejected", saved.getValue("evt-rejected").syncState)
    }

    @Test fun loteComIdentidadeAmbiguaNaoEscreveNoRoom() = runBlocking {
        val original = event("evt-valid", 1)
        db.outbox().insert(original)
        for (ids in listOf(emptyList(), listOf(""), listOf(original.eventId, original.eventId))) {
            var rejected = false
            try {
                retainUnreceiptedEventBatch(
                    db, ids, ApiResult.Rejected("contrato invalido", 400),
                    delegationDenied = false,
                )
            } catch (_: IllegalArgumentException) {
                rejected = true
            }
            assertTrue(rejected)
        }
        val saved = db.outbox().recent(20).single()
        assertEquals("pending", saved.syncState)
        assertEquals(0, saved.attempts)
        assertFalse(db.outbox().nextBatch(20).isEmpty())
    }

    @Test fun delegacaoRecusada409NuncaViraRejeicaoDeDominio() = runBlocking {
        val original = event("evt-delegated", 1)
        db.outbox().insert(original)
        val decision = retainUnreceiptedEventBatch(
            db, listOf(original.eventId), ApiResult.Rejected("delegacao invalida", 409),
            delegationDenied = true,
        )
        assertEquals(EventBatchHttpRejectionHold.PILOT_AUTHORIZATION_BLOCKED, decision)
        assertEquals("failed", db.outbox().nextBatch(20).single().syncState)
        assertEquals(0, db.outbox().rejectedCount())
    }
}
