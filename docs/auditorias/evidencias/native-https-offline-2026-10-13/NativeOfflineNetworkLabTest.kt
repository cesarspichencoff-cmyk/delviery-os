package br.com.tata.entregas

import android.content.Context
import android.location.LocationManager
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.OutboxEventEntity
import br.com.tata.entregas.sync.ApiResult
import br.com.tata.entregas.sync.EntregasApi
import br.com.tata.entregas.sync.EventReceiptDecision
import br.com.tata.entregas.sync.EventReceiptItem
import br.com.tata.entregas.sync.decideEventReceipt
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

/**
 * TEST-ONLY: three separately invoked instrumented phases on one emulated Android.
 * Does not create GPS samples, activate native capture, or use real orders.
 * The endpoint is a disposable TLS receipt fixture, not the canonical pilot.
 */
@RunWith(AndroidJUnit4::class)
class NativeOfflineNetworkLabTest {
    private val id = "LAB-NATIVE-OFFLINE-20261013-E1"
    private val key = "LAB-NATIVE-OFFLINE-20261013-IDEMP-1"
    private val dbName = "native-offline-isolated-test-20261013.db"
    private val base = "https://10.0.2.2:5193"
    private val ctx get() = ApplicationProvider.getApplicationContext<Context>()
    private fun open() = Room.databaseBuilder(ctx, EntregasDatabase::class.java, dbName).build()
    private fun api() = EntregasApi(base, { null }, 3000)
    private fun cmd(): JSONObject = JSONObject().apply {
        put("type", "RecordArrivalReported")
        put("unit_id", "LAB-NATIVE-20261013")
        put("trip_id", "LAB-NATIVE-T01")
        put("delivery_id", "LAB-NATIVE-D01")
        put("command_id", "LAB-NATIVE-C01")
        put("occurred_at", "2026-10-13T21:00:00.000Z")
        put("source_mode", "simulated")
    }
    private fun wire(e: OutboxEventEntity): JSONObject = JSONObject().apply {
        put("event_id", e.eventId)
        put("idempotency_key", e.idempotencyKey)
        put("kind", e.kind)
        put("occurred_at", e.occurredAt)
        put("sequence_local", e.sequenceLocal)
        put("command", JSONObject(e.payload))
    }
    private fun gpsOff() {
        val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        assertFalse("GPS must remain disabled", lm.isLocationEnabled)
    }

    @Test fun stage01_endpoint_offline_preserves_native_room() = runBlocking {
        gpsOff()
        val db = open()
        val event = OutboxEventEntity(
            eventId=id,idempotencyKey=key,tripId="LAB-NATIVE-T01",
            kind="arrival_reported",payload=cmd().toString(),
            occurredAt="2026-10-13T21:00:00.000Z",sequenceLocal=1L,
            syncState="pending",attempts=0,lastError=null,createdAtMs=System.currentTimeMillis())
        assertTrue(db.outbox().insert(event) >= 0)
        val result = api().sendEvents(listOf(wire(event)), "LAB-CORRELATION")
        assertTrue("a real HTTPS request must fail when endpoint is absent; was $result",
            result is ApiResult.Retryable)
        db.outbox().markFailed(listOf(id), "HTTPS_endpoint_offline")
        assertEquals(1,db.outbox().pendingCount())
        assertEquals(0,db.gpsPoints().pendingCount())
        db.close()
        val restarted = open()
        val after = restarted.outbox().nextBatch(10)
        assertEquals(1,after.size)
        assertEquals(id,after.single().eventId)
        assertEquals(key,after.single().idempotencyKey)
        assertEquals("failed",after.single().syncState)
        assertEquals(1,after.single().attempts)
        restarted.close()
        println("NATIVE_OFFLINE_STAGE_1_PASS tcp_retryable durable_room_one pending_after_reopen gps_off")
    }

    @Test fun stage02_https_online_receipt_marks_sent() = runBlocking {
        gpsOff()
        val db = open()
        val list = db.outbox().nextBatch(10)
        assertEquals(1,list.size)
        assertEquals("failed",list.single().syncState)
        val result = api().sendEvents(list.map(::wire), "LAB-CORRELATION")
        assertTrue("expected verified lab TLS HTTP 200; got $result",result is ApiResult.Ok)
        val r = result as ApiResult.Ok
        val decision = decideEventReceipt(list.map { EventReceiptItem(it.eventId) },r.value)
        assertTrue("receipt must validate exact ID",decision is EventReceiptDecision.Apply)
        val apply = decision as EventReceiptDecision.Apply
        assertEquals(listOf(id),apply.sentIds)
        assertTrue(apply.rejected.isEmpty())
        db.outbox().markSent(apply.sentIds)
        assertEquals(0,db.outbox().pendingCount())
        db.close()
        val reopened = open()
        assertEquals(0,reopened.outbox().pendingCount())
        assertEquals(0,reopened.gpsPoints().pendingCount())
        reopened.close()
        println("NATIVE_OFFLINE_STAGE_2_PASS https_tls_exact_receipt_sent_persistent_room gps_off")
    }

    @Test fun stage03_retry_same_id_is_idempotent() = runBlocking {
        gpsOff()
        val db = open()
        assertEquals(0,db.outbox().pendingCount())
        // A transport-level replay uses the identical event_id and idempotency key.
        val event = OutboxEventEntity(
            eventId=id,idempotencyKey=key,tripId="LAB-NATIVE-T01",
            kind="arrival_reported",payload=cmd().toString(),
            occurredAt="2026-10-13T21:00:00.000Z",sequenceLocal=1L,
            syncState="sent",attempts=1,lastError=null,createdAtMs=System.currentTimeMillis())
        val r=api().sendEvents(listOf(wire(event)), "LAB-CORRELATION-REPLAY")
        assertTrue(r is ApiResult.Ok)
        assertTrue(decideEventReceipt(listOf(EventReceiptItem(id)),(r as ApiResult.Ok).value)
          is EventReceiptDecision.Apply)
        assertEquals(0,db.outbox().pendingCount())
        assertEquals(0,db.gpsPoints().pendingCount())
        db.close()
        println("NATIVE_OFFLINE_STAGE_3_PASS identical_idempotency_tls_replay zero_pending gps_off")
    }

    @Test fun stage99_lab_cleanup() {
        assertTrue(ctx.deleteDatabase(dbName))
        println("NATIVE_OFFLINE_TEST_DB_REMOVED")
    }
}
