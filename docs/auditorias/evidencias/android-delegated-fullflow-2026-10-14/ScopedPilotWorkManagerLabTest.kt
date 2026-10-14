package br.com.tata.entregas

import android.content.Context
import android.location.LocationManager
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.WorkManager
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.OutboxEventEntity
import br.com.tata.entregas.sync.DeviceSession
import br.com.tata.entregas.sync.SyncScheduler
import br.com.tata.entregas.sync.SyncWorker
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

/** Dedicated emulator + synthetic pilot and platform only; GPS must be disabled. */
@RunWith(AndroidJUnit4::class)
class ScopedPilotWorkManagerLabTest {
    private val ctx: Context get() = ApplicationProvider.getApplicationContext()
    private val db get() = EntregasDatabase.get(ctx)
    private val eventId = "LAB-WM-20261014-ARRIVAL-01"

    private fun gpsMustBeOff() {
        assertFalse((ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager).isLocationEnabled)
    }

    @Test fun arrivalUsesScopedCredentialAndRetainsReceipt() = runBlocking {
        gpsMustBeOff()
        assertEquals(0, db.outbox().pendingCount())
        val command = JSONObject().apply {
            put("type", "RecordArrivalReported")
            put("command_id", "LAB-ARRIVAL-20261014")
            put("unit_id", "LAB-WM-20261014")
            put("trip_id", "LAB-WM-T1")
            put("delivery_id", "LAB-WM-D1")
            put("source_mode", "simulated")
            put("occurred_at", "2026-10-14T12:00:00Z")
        }
        val event = OutboxEventEntity(
            eventId=eventId, idempotencyKey=eventId+"-IDEMP",
            tripId="LAB-WM-T1", kind="arrival_reported", payload=command.toString(),
            occurredAt="2026-10-14T12:00:00Z", sequenceLocal=1,
            syncState="pending", attempts=0, lastError=null,
            createdAtMs=System.currentTimeMillis(),
        )
        assertTrue(db.outbox().insert(event)>=0)
        SyncScheduler.requestNow(ctx)
        var success = false
        val deadline=System.currentTimeMillis()+70000L
        while(System.currentTimeMillis()<deadline) {
            if(db.outbox().pendingCount()==0) { success=true; break }
            delay(500)
        }
        val queued=db.outbox().nextBatch(10)
        assertTrue("event must be confirmed by official pilot receipt; pending="+
            queued.map{it.eventId+":"+it.syncState+":"+it.lastError},success)
        assertEquals(0,db.gpsPoints().pendingCount())
        assertEquals("rid-WM-LAB",db.deviceState().get(EntregasDatabase.KEY_RIDER_ID))
        assertNotNull(DeviceSession.sessaoAtual(db))
        val works=WorkManager.getInstance(ctx)
            .getWorkInfosForUniqueWork(SyncWorker.UNIQUE_NOW).get(8,TimeUnit.SECONDS)
        assertTrue(works.isNotEmpty())
        assertTrue(works.last().state==androidx.work.WorkInfo.State.SUCCEEDED)
        gpsMustBeOff()
        println("LAB_SCOPED_REAL_WORKMANAGER_SUCCESS_RECEIPT_EVENT="+eventId)
        println("LAB_SCOPED_ROW_PENDING=0 WORKER_SUCCEEDED GPS_OFF")
    }
}
