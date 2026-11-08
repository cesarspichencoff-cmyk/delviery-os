package br.com.tata.entregas

import android.content.Context
import androidx.room.Room
import androidx.work.ListenableWorker
import androidx.work.testing.TestListenableWorkerBuilder
import br.com.tata.entregas.data.DeviceStateEntity
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.GpsPointEntity
import br.com.tata.entregas.data.OutboxEventEntity
import br.com.tata.entregas.data.TermAckEntity
import br.com.tata.entregas.sync.DeviceSession
import br.com.tata.entregas.sync.EntregasApi
import br.com.tata.entregas.sync.SyncWorker
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockkConstructor
import io.mockk.mockkObject
import io.mockk.unmockkAll
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
import java.net.InetAddress
import java.net.ServerSocket
import java.net.SocketException
import java.net.SocketTimeoutException
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.concurrent.thread

/**
 * Actually executes SyncWorker.doWork() with real EntregasApi HTTP requests
 * to TWO independent ephemeral 127.0.0.1 test servers + real Room/SQLite.
 *
 * Only the constructor's URL boundary is replaced with test endpoints; the
 * Worker, HTTP client, wire encoding, receipts, Room and work-result decisions
 * are production code. No HTTPS, real OAuth, Android device, POS or internet.
 */
@RunWith(RobolectricTestRunner::class)
class SyncWorkerDualLoopbackHttpRoomTest {
    private data class Seen(val path: String, val body: String, val auth: String?)

    private class LocalHttp(
        val respond: (String, JSONObject, String?) -> Pair<Int, JSONObject>,
    ) : AutoCloseable {
        private val listener = ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"))
        private val collected = CopyOnWriteArrayList<Seen>()
        private val thread = thread(isDaemon = true, name = "deliveryos-dual-loopback") {
            listener.soTimeout = 500
            while (!listener.isClosed) {
                try {
                    listener.accept().use { sock ->
                        sock.soTimeout = 2_000
                        val input = sock.getInputStream().bufferedReader(Charsets.UTF_8)
                        val first = input.readLine() ?: return@use
                        val target = first.split(" ").getOrNull(1) ?: return@use
                        var length = 0
                        var auth: String? = null
                        while (true) {
                            val line = input.readLine() ?: return@use
                            if (line.isEmpty()) break
                            when {
                                line.startsWith("Content-Length:", true) ->
                                    length = line.substringAfter(":").trim().toIntOrNull() ?: 0
                                line.startsWith("Authorization:", true) ->
                                    auth = line.substringAfter(":").trim()
                            }
                        }
                        require(length in 0..16_384) { "LAB_REQUEST_SIZE_OUT_OF_BOUNDS" }
                        val bytes = CharArray(length)
                        var filled = 0
                        while (filled < length) {
                            val n = input.read(bytes, filled, length - filled)
                            if (n < 0) break
                            filled += n
                        }
                        require(filled == length) { "LAB_REQUEST_TRUNCATED" }
                        val body = String(bytes)
                        collected.add(Seen(target, body, auth))
                        val (status, json) = respond(target, if (body.isBlank()) JSONObject() else JSONObject(body), auth)
                        val payload = json.toString().toByteArray(Charsets.UTF_8)
                        val header = "HTTP/1.1 $status Fixture\r\n" +
                            "Content-Type: application/json; charset=utf-8\r\n" +
                            "Content-Length: ${payload.size}\r\n" +
                            "Connection: close\r\n\r\n"
                        sock.getOutputStream().use {
                            it.write(header.toByteArray(Charsets.US_ASCII))
                            it.write(payload)
                            it.flush()
                        }
                    }
                } catch (_: SocketTimeoutException) {
                    // No pending local traffic.
                } catch (e: SocketException) {
                    if (!listener.isClosed) throw e
                }
            }
        }
        val url: String get() = "http://127.0.0.1:${listener.localPort}"
        val seen: List<Seen> get() = collected.toList()
        override fun close() {
            listener.close()
            thread.join(1_500)
        }
    }

    private lateinit var context: Context
    private lateinit var db: EntregasDatabase
    private lateinit var dbName: String
    private lateinit var platform: LocalHttp
    private lateinit var pilot: LocalHttp
    @Volatile private var eventReply = "ok"
    @Volatile private var termReply = "ok"
    @Volatile private var platformDelegationReply = "ok"
    @Volatile private var gpsReply = "ok"

    private fun open(): EntregasDatabase =
        Room.databaseBuilder(context, EntregasDatabase::class.java, dbName).build()

    private fun ack(id: String = "ACK-DUAL-001") = TermAckEntity(
        acknowledgementId = id,
        riderId = "actor-fixture",
        unitId = "ITAIM",
        termVersion = "term-fixture",
        termMaterialVersion = "material-fixture",
        termHash = "hash-fixture",
        status = "accepted",
        acceptedAt = "2026-11-08T12:30:00Z",
        deviceId = "device-fixture",
        appVersion = "debug-fixture",
        language = "pt-BR",
        origin = "rider_app",
        correlationId = "correlation-fixture",
        schemaVersion = "consent@1.0.0",
        syncState = "pending",
    )

    private fun event(id: String = "EVT-DUAL-001") = OutboxEventEntity(
        eventId = id, idempotencyKey = "key-$id", tripId = "trip-fixture",
        kind = "delivery_fixture", payload = """{"fixture":true}""",
        occurredAt = "2026-11-08T12:30:00Z", sequenceLocal = 1,
        syncState = "pending", attempts = 0, lastError = null, createdAtMs = 1_000L,
    )

    private fun point(id: String = "GPS-DUAL-001") = GpsPointEntity(
        pointId = id, idempotencyKey = "gps-key-$id",
        tripId = "trip-fixture", deviceId = "device-fixture",
        latitude = 0.0, longitude = 0.0, accuracyM = 3.0,
        speedMps = null, headingDeg = null, altitudeM = null,
        occurredAt = "2026-11-08T12:30:00Z", elapsedRealtimeNanos = 1,
        provider = "fixture", isMock = false, capturedOffline = true,
        sequenceLocal = 1, syncState = "pending", attempts = 0,
        lastError = null, createdAtMs = 1_000L,
    )

    private fun platformResponse(path: String, body: JSONObject, auth: String?): Pair<Int, JSONObject> {
        assertEquals("Bearer PLATFORM-DEVICE-ONLY-FICTICIO", auth)
        return when (path) {
            "/api/device/pilot-delegation" -> {
                if (platformDelegationReply == "forbidden") 403 to JSONObject()
                else 200 to JSONObject()
                    .put("ok", true).put("pilot_token", "pt1.local.signature")
                    .put("expires_in_s", 120).put("actor_id", "actor-fixture")
                    .put("unit_id", "ITAIM").put("device_id", "device-fixture")
                    .put("audience", "deliveryos-pilot-event-write")
            }
            "/api/gps/batch" -> if (gpsReply == "retry") {
                503 to JSONObject()
            } else {
                200 to JSONObject().put("accepted", body.getJSONArray("points").length())
                    .put("duplicate", 0).put("rejected", 0)
            }
            "/api/device/queue-depth" -> 200 to JSONObject().put("ok", true)
            else -> 404 to JSONObject().put("human", "fixture_unknown_route")
        }
    }

    private fun pilotResponse(path: String, body: JSONObject, auth: String?): Pair<Int, JSONObject> =
        when (path) {
            "/api/term/acknowledge" -> {
                assertEquals(null, auth) // Device bearer cannot leak to pilot.
                when (termReply) {
                    "reject422" -> 422 to JSONObject().put("human", "fixture_term_422")
                    "missing" -> 200 to JSONObject().put("ok", true)
                        .put("acknowledgement_id", body.getString("acknowledgement_id"))
                    else -> 200 to JSONObject()
                        .put("ok", true)
                        .put("acknowledgement_id", body.getString("acknowledgement_id"))
                        .put("receipt", JSONObject()
                            .put("recibo", body.getString("acknowledgement_id"))
                            .put("unidade", body.getString("unit_id"))
                            .put("versao_do_termo", body.getString("term_version"))
                            .put("impressao_do_texto", body.getString("term_hash"))
                            .put("aparelho", body.getString("device_id"))
                            .put("situacao", "aceito"))
                }
            }
            "/api/events/batch" -> {
                assertEquals("Bearer pt1.local.signature", auth)
                when (eventReply) {
                    "reject422" -> 422 to JSONObject().put("human", "fixture_event_422")
                    "missing" -> 200 to JSONObject().put("ok", true)
                    else -> {
                        val list = body.getJSONArray("events")
                        val results = JSONArray()
                        for (i in 0 until list.length())
                            results.put(JSONObject().put("event_id",
                                list.getJSONObject(i).getString("event_id")).put("ok", true))
                        200 to JSONObject().put("ok", true).put("results", results)
                    }
                }
            }
            "/api/policies" -> {
                assertEquals(null, auth)
                503 to JSONObject().put("human", "fixture_no_retention_policy")
            }
            else -> 404 to JSONObject().put("human", "fixture_unknown_route")
        }

    @Before fun setup() {
        context = RuntimeEnvironment.getApplication()
        dbName = "dual-worker-loopback-${System.nanoTime()}.db"
        db = open()
        runBlocking {
            db.deviceState().put(DeviceStateEntity(EntregasDatabase.KEY_RIDER_ID, "actor-fixture", 1L))
            db.deviceState().put(DeviceStateEntity(EntregasDatabase.KEY_DEVICE_ID, "device-fixture", 1L))
        }
        platform = LocalHttp(::platformResponse)
        pilot = LocalHttp(::pilotResponse)
        assertTrue(platform.url.startsWith("http://127.0.0.1:"))
        assertTrue(pilot.url.startsWith("http://127.0.0.1:"))
        assertFalse(platform.url == pilot.url)

        // These real HTTP clients are created BEFORE any constructor mocking.
        val realPlatform = EntregasApi(platform.url, { "PLATFORM-DEVICE-ONLY-FICTICIO" }, 2_000)
        val realPilot = EntregasApi(pilot.url, { null }, 2_000)
        val realDelegatedPilot = EntregasApi(pilot.url, { "pt1.local.signature" }, 2_000)

        mockkObject(EntregasDatabase.Companion)
        every { EntregasDatabase.get(any()) } answers { db }
        mockkObject(DeviceSession)
        coEvery { DeviceSession.estaRevogado(any()) } returns false
        coEvery { DeviceSession.sessaoAtual(any()) } returns
            DeviceSession.Sessao("PLATFORM-DEVICE-ONLY-FICTICIO", Long.MAX_VALUE)
        every { DeviceSession.precisaAutenticar(any(), any()) } returns false
        mockkConstructor(EntregasApi::class)
        every { anyConstructed<EntregasApi>().sendTermAcknowledgement(any()) } answers {
            realPilot.sendTermAcknowledgement(firstArg())
        }
        every { anyConstructed<EntregasApi>().requestPilotWriteToken(any(), any()) } answers {
            realPlatform.requestPilotWriteToken(firstArg(), secondArg())
        }
        every { anyConstructed<EntregasApi>().sendEvents(any(), any()) } answers {
            realDelegatedPilot.sendEvents(firstArg(), secondArg())
        }
        every { anyConstructed<EntregasApi>().sendPoints(any(), any()) } answers {
            realPlatform.sendPoints(firstArg(), secondArg())
        }
        every { anyConstructed<EntregasApi>().sendQueueDepth(any(), any()) } answers {
            realPlatform.sendQueueDepth(firstArg(), secondArg())
        }
        every { anyConstructed<EntregasApi>().policies() } answers {
            realPilot.policies()
        }
        // Any unexpected SDK route is a test failure, never a real endpoint.
        every { anyConstructed<EntregasApi>().authenticateDevice(any(), any(), any()) } throws
            IllegalStateException("UNEXPECTED_DEVICE_BOOTSTRAP")
        every { anyConstructed<EntregasApi>().health() } throws
            IllegalStateException("UNEXPECTED_HEALTH_REQUEST")
        every { anyConstructed<EntregasApi>().captureState(any()) } throws
            IllegalStateException("UNEXPECTED_CAPTURE_STATE_REQUEST")
    }

    @After fun teardown() {
        if (::db.isInitialized) db.close()
        if (::platform.isInitialized) platform.close()
        if (::pilot.isInitialized) pilot.close()
        unmockkAll()
        if (::context.isInitialized && ::dbName.isInitialized)
            context.deleteDatabase(dbName)
    }

    private suspend fun runWorker(attempt: Int = 0): ListenableWorker.Result =
        TestListenableWorkerBuilder<SyncWorker>(context)
            .setRunAttemptCount(attempt).build().doWork()

    private suspend fun enqueueAll() {
        db.termAcks().insert(ack())
        db.outbox().insert(event())
        db.gpsPoints().insert(point())
    }

    @Test fun twoLoopbackServersConfirmTermEventAndGpsWithoutSharingBearer() = runBlocking {
        enqueueAll()
        assertTrue(runWorker() is ListenableWorker.Result.Success)
        assertEquals("sent", db.termAcks().byId(ack().acknowledgementId)?.syncState)
        assertEquals(0, db.outbox().pendingCount())
        assertEquals(0, db.gpsPoints().pendingCount())
        assertTrue(platform.seen.any { it.path == "/api/gps/batch" })
        assertTrue(platform.seen.any { it.path == "/api/device/pilot-delegation" })
        assertTrue(pilot.seen.any { it.path == "/api/events/batch" })
        assertTrue(pilot.seen.any { it.path == "/api/term/acknowledge" })
        assertTrue(platform.seen.all { it.auth == "Bearer PLATFORM-DEVICE-ONLY-FICTICIO" })
        assertTrue(pilot.seen.none { it.auth == "Bearer PLATFORM-DEVICE-ONLY-FICTICIO" })
        db.close()
        db = open()
        assertEquals("sent", db.termAcks().byId(ack().acknowledgementId)?.syncState)
        assertEquals(0, db.outbox().pendingCount())
        assertEquals(0, db.gpsPoints().pendingCount())
    }

    @Test fun term422CannotClaimWorkerSuccessWhileOtherLanesSucceed() = runBlocking {
        enqueueAll()
        termReply = "reject422"
        assertTrue(runWorker(attempt = 2) is ListenableWorker.Result.Failure)
        assertEquals("pending", db.termAcks().byId(ack().acknowledgementId)?.syncState)
        assertEquals(0, db.outbox().pendingCount())
        assertEquals(0, db.gpsPoints().pendingCount())
        termReply = "ok"
        assertTrue(runWorker(attempt = 2) is ListenableWorker.Result.Success)
        assertEquals("sent", db.termAcks().byId(ack().acknowledgementId)?.syncState)
    }

    @Test fun event422KeepsOriginalIdempotencyUntilPerEventReceiptArrives() = runBlocking {
        enqueueAll()
        eventReply = "reject422"
        assertTrue(runWorker(attempt = 2) is ListenableWorker.Result.Failure)
        val original = db.outbox().nextBatch(10).single()
        assertEquals("failed", original.syncState)
        assertEquals("key-EVT-DUAL-001", original.idempotencyKey)
        assertEquals(0, db.outbox().rejectedCount())
        eventReply = "ok"
        assertTrue(runWorker(attempt = 2) is ListenableWorker.Result.Success)
        assertEquals(0, db.outbox().pendingCount())
        assertEquals(0, db.outbox().rejectedCount())
        val transmitted = pilot.seen.filter { it.path == "/api/events/batch" }
        assertEquals(2, transmitted.size)
        assertEquals(
            JSONObject(transmitted[0].body).getJSONArray("events").getJSONObject(0)
                .getString("idempotency_key"),
            JSONObject(transmitted[1].body).getJSONArray("events").getJSONObject(0)
                .getString("idempotency_key"),
        )
    }

    @Test fun platformDelegation403CannotSendToPilotOrConsumeEvent() = runBlocking {
        enqueueAll()
        platformDelegationReply = "forbidden"
        assertTrue(runWorker(attempt = 2) is ListenableWorker.Result.Failure)
        assertTrue(pilot.seen.none { it.path == "/api/events/batch" })
        assertEquals(0, db.outbox().rejectedCount())
        assertEquals("key-EVT-DUAL-001", db.outbox().nextBatch(10).single().idempotencyKey)
        assertEquals("sent", db.termAcks().byId(ack().acknowledgementId)?.syncState)
        assertEquals(0, db.gpsPoints().pendingCount())
    }
}
