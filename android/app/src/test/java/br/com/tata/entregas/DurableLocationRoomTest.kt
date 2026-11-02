package br.com.tata.entregas

import android.content.Context
import androidx.room.Room
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.GpsPointEntity
import br.com.tata.entregas.location.CaptureSessionLifecycle
import br.com.tata.entregas.location.DurableLocationPublication
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
 * Verifica a decisão de publicação com o banco SQLite/Room efetivo, sem GPS.
 * Não constitui teste de callback real do Fused ou de dispositivo físico.
 */
@RunWith(RobolectricTestRunner::class)
class DurableLocationRoomTest {
    private lateinit var context: Context
    private lateinit var name: String
    private lateinit var db: EntregasDatabase

    @Before fun setup() {
        context = RuntimeEnvironment.getApplication()
        name = "durable-publication-fixture-${System.nanoTime()}.db"
        db = Room.databaseBuilder(context, EntregasDatabase::class.java, name).build()
    }

    @After fun close() {
        db.close()
        context.deleteDatabase(name)
    }

    private fun point(id: String) = GpsPointEntity(
        pointId = id,
        idempotencyKey = "key-$id",
        tripId = "trip-fixture",
        deviceId = "device-fixture",
        latitude = 0.0,
        longitude = 0.0,
        accuracyM = 5.0,
        speedMps = null,
        headingDeg = null,
        altitudeM = null,
        occurredAt = "2026-11-02T01:00:00.000Z",
        elapsedRealtimeNanos = 1L,
        provider = "fixture",
        isMock = false,
        capturedOffline = true,
        sequenceLocal = 0L,
        syncState = "pending",
        attempts = 0,
        lastError = null,
        createdAtMs = 1000L,
    )

    @Test fun roomInsertPrecedesPublicationAuthorization() = runBlocking {
        val lifecycle = CaptureSessionLifecycle()
        val session = lifecycle.begin("A") {}
        val rowId = db.insertGpsSequenced(point("one"), 1000L)
        assertTrue(rowId > 0L)
        assertTrue(DurableLocationPublication.mayPublish(rowId, lifecycle.isCurrent(session)))
        assertEquals(1, db.gpsPoints().pendingCount())
    }

    @Test fun duplicateInsertNeverAuthorizesAnotherPublication() = runBlocking {
        val lifecycle = CaptureSessionLifecycle()
        val session = lifecycle.begin("A") {}
        val original = point("duplicate")
        val initial = db.insertGpsSequenced(original, 1000L)
        val duplicate = db.insertGpsSequenced(original, 1001L)
        assertTrue(initial > 0L)
        assertEquals(-1L, duplicate)
        assertFalse(DurableLocationPublication.mayPublish(duplicate, lifecycle.isCurrent(session)))
        assertEquals(1, db.gpsPoints().pendingCount())
    }

    @Test fun stopWhileInsertInProgressDoesNotAuthorizeStalePosition() = runBlocking {
        val lifecycle = CaptureSessionLifecycle()
        val session = lifecycle.begin("A") {}
        val rowId = db.insertGpsSequenced(point("already-observed"), 1002L)
        lifecycle.stop {}
        assertFalse(DurableLocationPublication.mayPublish(rowId, lifecycle.isCurrent(session)))
        assertEquals(1, db.gpsPoints().pendingCount())
    }

    @Test fun restartedTripWithSameIdDoesNotReviveOldPosition() = runBlocking {
        val lifecycle = CaptureSessionLifecycle()
        val old = lifecycle.begin("A") {}
        val rowId = db.insertGpsSequenced(point("stale"), 1003L)
        lifecycle.stop {}
        val current = lifecycle.begin("A") {}
        assertFalse(DurableLocationPublication.mayPublish(rowId, lifecycle.isCurrent(old)))
        assertTrue(lifecycle.isCurrent(current))
        assertEquals(1, db.gpsPoints().pendingCount())
    }
}
