package br.com.tata.entregas

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.GpsPointEntity
import br.com.tata.entregas.data.OutboxEventEntity
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Prova o estado Room real no Robolectric, inclusive fechamento/reabertura
 * do arquivo SQLite. SyncWorker NOW e PERIODIC sao jobs distintos e podem
 * observar o mesmo lote: uma resposta atrasada nao pode regredir estado final.
 */
@RunWith(RobolectricTestRunner::class)
class RoomSyncRaceRecoveryTest {
    private lateinit var ctx: Context
    private lateinit var name: String
    private lateinit var db: EntregasDatabase

    private fun open() = Room.databaseBuilder(ctx, EntregasDatabase::class.java, name).build()

    @Before fun setup() {
        ctx = ApplicationProvider.getApplicationContext()
        name = "sync-race-fixture-${System.nanoTime()}.db"
        db = open()
    }

    @After fun teardown() {
        db.close()
        ctx.deleteDatabase(name)
    }

    private fun gps(id: String) = GpsPointEntity(
        pointId = id,
        idempotencyKey = "key-$id",
        tripId = "trip-fixture",
        deviceId = "device-fixture",
        latitude = 0.0,
        longitude = 0.0,
        accuracyM = 1.0,
        speedMps = null,
        headingDeg = null,
        altitudeM = null,
        occurredAt = "2026-10-09T10:00:00Z",
        elapsedRealtimeNanos = 1L,
        provider = "fixture",
        isMock = false,
        capturedOffline = true,
        sequenceLocal = 1L,
        syncState = "pending",
        attempts = 0,
        lastError = null,
        createdAtMs = 1_000L,
    )

    private fun event(id: String) = OutboxEventEntity(
        eventId = id,
        idempotencyKey = "event-key-$id",
        tripId = "trip-fixture",
        kind = "fixture",
        payload = "{}",
        occurredAt = "2026-10-09T10:00:00Z",
        sequenceLocal = 1L,
        syncState = "pending",
        attempts = 0,
        lastError = null,
        createdAtMs = 1_000L,
    )

    @Test fun confirmedGpsNeverReentersQueueOnLateTimeout() = runBlocking {
        db.gpsPoints().insert(gps("gps-1"))
        val ids = db.gpsPoints().nextBatch(20).map { it.pointId }
        db.gpsPoints().markSent(ids)
        // Older worker returns after the successful one.
        db.gpsPoints().markFailed(ids, "SocketTimeoutException")
        db.gpsPoints().markRejected(ids, "stale_rejection")
        db.close()
        db = open()
        assertEquals(0, db.gpsPoints().pendingCount())
        assertEquals(0, db.gpsPoints().rejectedCount())
        assertTrue(db.gpsPoints().nextBatch(20).isEmpty())
        assertEquals(1, db.gpsPoints().countForTrip("trip-fixture"))
    }

    @Test fun definitivelyRejectedGpsCannotBeRevivedByLateSuccess() = runBlocking {
        db.gpsPoints().insert(gps("gps-2"))
        val ids = db.gpsPoints().nextBatch(20).map { it.pointId }
        db.gpsPoints().markRejected(ids, "invalid_point")
        db.gpsPoints().markSent(ids)
        db.gpsPoints().markFailed(ids, "later_timeout")
        db.close()
        db = open()
        assertEquals(1, db.gpsPoints().rejectedCount())
        assertEquals(0, db.gpsPoints().pendingCount())
    }

    @Test fun confirmedOutboxEventStaysConfirmedAfterLateFailure() = runBlocking {
        db.outbox().insert(event("evt-1"))
        val ids = db.outbox().nextBatch(20).map { it.eventId }
        db.outbox().markSent(ids)
        db.outbox().markFailed(ids, "network_timeout")
        db.close()
        db = open()
        assertEquals(0, db.outbox().pendingCount())
        assertTrue(db.outbox().nextBatch(20).isEmpty())
    }

    @Test fun pendingGpsFailureRemainsRetryableAcrossRestart() = runBlocking {
        db.gpsPoints().insert(gps("gps-3"))
        db.gpsPoints().markFailed(listOf("gps-3"), "timeout")
        db.close()
        db = open()
        val recovered = db.gpsPoints().nextBatch(20)
        assertEquals(1, recovered.size)
        assertEquals("failed", recovered.single().syncState)
        assertEquals("key-gps-3", recovered.single().idempotencyKey)
        assertEquals(1, recovered.single().attempts)
        db.gpsPoints().markSent(listOf("gps-3"))
        assertEquals(0, db.gpsPoints().pendingCount())
    }

    @Test fun pendingOutboxFailureRemainsRetryableAcrossRestart() = runBlocking {
        db.outbox().insert(event("evt-2"))
        db.outbox().markFailed(listOf("evt-2"), "timeout")
        db.close()
        db = open()
        val recovered = db.outbox().nextBatch(20)
        assertEquals(1, recovered.size)
        assertEquals("failed", recovered.single().syncState)
        assertEquals("event-key-evt-2", recovered.single().idempotencyKey)
        db.outbox().markSent(listOf("evt-2"))
        assertEquals(0, db.outbox().pendingCount())
    }
}
