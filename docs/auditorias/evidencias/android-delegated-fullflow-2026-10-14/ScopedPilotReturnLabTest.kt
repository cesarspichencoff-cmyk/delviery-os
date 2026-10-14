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

/** Only synthetic API34 / separate HTTPS lab, not for deployment. */
@RunWith(AndroidJUnit4::class)
class ScopedPilotReturnLabTest {
    private val ctx: Context get()=ApplicationProvider.getApplicationContext()
    private val db get()=EntregasDatabase.get(ctx)
    @Test fun fullNativeReturnCommandHasIndividualReceipt() = runBlocking {
        assertFalse((ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager).isLocationEnabled)
        assertEquals(0,db.outbox().pendingCount())
        val eventId="LAB-WM-20261014-RETURN-03"
        val body=JSONObject().apply {
            put("type","StartTripReturn")
            put("command_id","LAB-RETURN-20261014")
            put("unit_id","LAB-WM-20261014")
            put("trip_id","LAB-WM-T1")
            put("source_mode","simulated")
            put("occurred_at","2026-10-14T12:22:00Z")
        }
        assertTrue(db.outbox().insert(OutboxEventEntity(
            eventId=eventId,idempotencyKey=eventId+"-IDEMP",tripId="LAB-WM-T1",
            kind="trip_return_started",payload=body.toString(),
            occurredAt="2026-10-14T12:22:00Z",sequenceLocal=3,
            syncState="pending",attempts=0,lastError=null,
            createdAtMs=System.currentTimeMillis(),
        ))>=0)
        SyncScheduler.requestNow(ctx)
        var accepted=false
        val deadline=System.currentTimeMillis()+70000
        while(System.currentTimeMillis()<deadline){
            if(db.outbox().pendingCount()==0){accepted=true;break}
            delay(350)
        }
        assertTrue("must only clear after individual receipt; pending="+
            db.outbox().nextBatch(10).map{it.eventId+":"+it.syncState+":"+it.lastError},accepted)
        assertEquals(0,db.gpsPoints().pendingCount())
        val works=WorkManager.getInstance(ctx)
            .getWorkInfosForUniqueWork(SyncWorker.UNIQUE_NOW).get(7,TimeUnit.SECONDS)
        assertTrue(works.any{it.state==androidx.work.WorkInfo.State.SUCCEEDED})
        println("LAB_NATIVE_RETURN_EVENT_CONFIRMED="+eventId)
    }
}
