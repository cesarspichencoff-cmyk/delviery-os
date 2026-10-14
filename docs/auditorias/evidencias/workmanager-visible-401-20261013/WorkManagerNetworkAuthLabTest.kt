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

/** WorkManager PRODUCTION scheduler, fake TEST ONLY platform/HTTPS pilot, no GPS. */
@RunWith(AndroidJUnit4::class)
class WorkManagerNetworkAuthLabTest {
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private val id="LAB-WM-20261013-E1"
    private val idOfficial="LAB-WM-20261013-E2"
    private val db get() = EntregasDatabase.get(ctx)
    private fun ensureGpsOff() {
        assertFalse((ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager).isLocationEnabled)
    }
    private suspend fun seed(eid: String, sequence: Long) {
        val body=JSONObject().apply {
            put("type","RecordArrivalReported")
            put("unit_id","LAB-WM-20261013")
            put("trip_id","LAB-WM-T1")
            put("delivery_id","LAB-WM-D1")
            put("command_id","cmd-"+eid)
            put("source_mode","simulated")
            put("occurred_at","2026-10-13T21:20:00Z")
        }
        val ent=OutboxEventEntity(
            eventId=eid,idempotencyKey=eid+"-IDEMP",tripId="LAB-WM-T1",
            kind="arrival_reported",payload=body.toString(),occurredAt="2026-10-13T21:20:00Z",
            sequenceLocal=sequence,syncState="pending",attempts=0,lastError=null,createdAtMs=System.currentTimeMillis()
        )
        assertTrue(db.outbox().insert(ent)>=0)
    }
    private suspend fun waitFor(label:String, millis:Long=35000, pred:suspend ()->Boolean) {
        val stop=System.currentTimeMillis()+millis
        while(System.currentTimeMillis()<stop) {
            if(pred()) { println("LAB_WAIT_CONDITION_PASS "+label);return }
            delay(450)
        }
        fail("Timed out "+label)
    }
    @Test fun stage01_offline_real_workmanager_keeps_failed_event() = runBlocking {
        ensureGpsOff()
        assertEquals(0,db.outbox().pendingCount())
        seed(id,1)
        SyncScheduler.requestNow(ctx)
        waitFor("workmanager_worker_wrote_failed",40000) {
            db.outbox().nextBatch(10).any { it.eventId==id && it.syncState=="failed" }
        }
        assertEquals(1,db.outbox().pendingCount())
        assertNotNull("platform returned fake lab actor",db.deviceState().get(EntregasDatabase.KEY_RIDER_ID))
        assertNotNull("real DeviceSession persisted fake lab token",DeviceSession.sessaoAtual(db))
        val work=WorkManager.getInstance(ctx).getWorkInfosForUniqueWork(SyncWorker.UNIQUE_NOW).get(6,TimeUnit.SECONDS)
        assertTrue(work.isNotEmpty())
        println("WM_STAGE1_PASS worker_ran platform_fake_session_authentic offline_pilot_event_failed_persistent gps_off state="+work.last().state)
    }
    @Test fun stage02_recovered_scheduler_syncs_with_valid_receipt() = runBlocking {
        ensureGpsOff()
        assertEquals(1,db.outbox().pendingCount())
        // WorkManager retry exists from stage01; do not call requestNow here.
        waitFor("workmanager_retries_after_restored_https",85000) { db.outbox().pendingCount()==0 }
        assertTrue(db.outbox().nextBatch(10).isEmpty())
        val work=WorkManager.getInstance(ctx).getWorkInfosForUniqueWork(SyncWorker.UNIQUE_NOW).get(6,TimeUnit.SECONDS)
        assertTrue(work.isNotEmpty())
        println("WM_STAGE2_PASS automatic_retry_recovered receipt_exact_id room_no_pending work_state="+work.last().state)
    }
    @Test fun stage03_official_pilot_denies_unauthenticated_sync_fail_closed() = runBlocking {
        ensureGpsOff()
        seed(idOfficial,2)
        SyncScheduler.requestNow(ctx)
        waitFor("official_pilot_401_kept_event",50000) {
            db.outbox().nextBatch(10).any { it.eventId==idOfficial && it.syncState=="failed" }
        }
        assertEquals(1,db.outbox().pendingCount())
        assertEquals(0,db.gpsPoints().pendingCount())
        println("WM_STAGE3_FAIL_CLOSED_EXPECTED official_pilot_http_401 event_failed_in_room NO_ACCEPTANCE")
    }
    @Test fun stage04_confirm_401_and_worker_terminal_state() = runBlocking {
        ensureGpsOff()
        val pending=db.outbox().nextBatch(10)
        assertEquals(1,pending.size)
        assertEquals(idOfficial,pending.single().eventId)
        assertEquals("failed",pending.single().syncState)
        val event=pending.single()
        val payload=JSONObject().apply {
            put("event_id",event.eventId)
            put("idempotency_key",event.idempotencyKey)
            put("kind",event.kind)
            put("occurred_at",event.occurredAt)
            put("sequence_local",event.sequenceLocal)
            put("command",JSONObject(event.payload))
        }
        val r=br.com.tata.entregas.sync.EntregasApi(BuildConfig.ENTREGAS_BASE_URL,{null},4000)
            .sendEvents(listOf(payload),"LAB-401-DIAGNOSTIC")
        assertTrue("Official pilot must deny tokenless batch; was "+r,r is br.com.tata.entregas.sync.ApiResult.Unauthorized)
        assertEquals(401,(r as br.com.tata.entregas.sync.ApiResult.Unauthorized).status)
        waitFor("workmanager_terminal_state_after_http_401",15000) {
            WorkManager.getInstance(ctx).getWorkInfosForUniqueWork(SyncWorker.UNIQUE_NOW)
                .get(5,TimeUnit.SECONDS).any { it.state==androidx.work.WorkInfo.State.FAILED }
        }
        assertEquals(1,db.outbox().pendingCount())
        println("WM_STAGE4_HTTP_401_WORKER_FAILED_ROOM_EVENT_PRESERVED gps_off")
    }
    @Test fun stage99_cleanup_test_only() {
        ensureGpsOff()
        WorkManager.getInstance(ctx).cancelUniqueWork(SyncWorker.UNIQUE_NOW).result.get(8,TimeUnit.SECONDS)
        WorkManager.getInstance(ctx).cancelUniqueWork(SyncWorker.UNIQUE_PERIODIC).result.get(8,TimeUnit.SECONDS)
        println("WM_STAGE99_CANCELLED_LAB_WORK_ONLY")
    }
}
