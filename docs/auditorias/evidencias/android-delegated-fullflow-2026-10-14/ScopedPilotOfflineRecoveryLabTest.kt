package br.com.tata.entregas

import android.content.Context
import android.location.LocationManager
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.WorkManager
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.OutboxEventEntity
import br.com.tata.entregas.sync.SyncScheduler
import br.com.tata.entregas.sync.SyncWorker
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

/** ONLY for isolated synthetic API34 emu5580 + loopback test services; no GPS. */
@RunWith(AndroidJUnit4::class)
class ScopedPilotOfflineRecoveryLabTest {
    private val ctx: Context get()=ApplicationProvider.getApplicationContext()
    private val db get()=EntregasDatabase.get(ctx)
    private val eventId="LAB-WM-20261014-DELIVERED-02"
    private fun mustRemainGpsOff() {
        assertFalse((ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager).isLocationEnabled)
    }

    @Test fun stage01_dropPilotKeepOfflineEvent() = runBlocking {
        mustRemainGpsOff()
        assertEquals(0,db.outbox().pendingCount())
        val command=JSONObject().apply {
            put("type","ConfirmDelivery")
            put("command_id","LAB-DELIVERY-20261014")
            put("unit_id","LAB-WM-20261014")
            put("trip_id","LAB-WM-T1")
            put("delivery_id","LAB-WM-D1")
            put("source_mode","simulated")
            put("occurred_at","2026-10-14T12:05:00Z")
        }
        assertTrue(db.outbox().insert(OutboxEventEntity(
            eventId=eventId,idempotencyKey=eventId+"-IDEMP",tripId="LAB-WM-T1",
            kind="delivery_confirmed",payload=command.toString(),occurredAt="2026-10-14T12:05:00Z",
            sequenceLocal=2,syncState="pending",attempts=0,lastError=null,
            createdAtMs=System.currentTimeMillis(),
        ))>=0)
        SyncScheduler.requestNow(ctx)
        val deadline=System.currentTimeMillis()+40000
        var held=false
        while(System.currentTimeMillis()<deadline) {
            val row=db.outbox().nextBatch(10).find{it.eventId==eventId}
            if(row!=null && row.syncState=="failed") { held=true; break }
            delay(450)
        }
        assertTrue("offline pilot must preserve original event as failed",held)
        assertEquals(1,db.outbox().pendingCount())
        assertEquals(eventId,db.outbox().nextBatch(10).single().eventId)
        mustRemainGpsOff()
        println("LAB_OFFLINE_EVENT_PRESERVED_"+eventId)
    }

    @Test fun stage02_workerAutomaticallyRecoversAfterRestore() = runBlocking {
        mustRemainGpsOff()
        assertEquals(1,db.outbox().pendingCount())
        val deadline=System.currentTimeMillis()+90000L
        var recovered=false
        while(System.currentTimeMillis()<deadline) {
            if(db.outbox().pendingCount()==0){recovered=true;break}
            delay(500)
        }
        assertTrue("WorkManager retry should confirm original event after pilot resumes; state="+
            db.outbox().nextBatch(10).map{it.eventId+":"+it.syncState+":"+it.lastError},recovered)
        val works=WorkManager.getInstance(ctx)
            .getWorkInfosForUniqueWork(SyncWorker.UNIQUE_NOW).get(8,TimeUnit.SECONDS)
        assertTrue(works.isNotEmpty())
        assertTrue(works.any{it.state==androidx.work.WorkInfo.State.SUCCEEDED})
        mustRemainGpsOff()
        println("LAB_OFFLINE_AUTO_RECOVERY_ROOM_EMPTY_WORKER_SUCCEEDED")
    }
}
