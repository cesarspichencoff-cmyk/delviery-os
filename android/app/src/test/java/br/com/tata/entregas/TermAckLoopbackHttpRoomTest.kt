package br.com.tata.entregas

import android.content.Context
import androidx.room.Room
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.TermAckEntity
import br.com.tata.entregas.sync.ApiResult
import br.com.tata.entregas.sync.EntregasApi
import br.com.tata.entregas.sync.persistTermAckOnVerifiedReceipt
import br.com.tata.entregas.sync.termAckWireJson
import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import java.net.InetSocketAddress
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Uses the production HTTP client and the same receipt-to-Room transition
 * invoked by SyncWorker. Server is bound to 127.0.0.1 with a random port;
 * NEVER accesses either pilot, platform, Xiaomi, customer or production data.
 *
 * This is HTTP transport plus Room verification, not a full live scheduler,
 * TLS/certificate, real-server, consent-policy, or field-device approval.
 */
@RunWith(RobolectricTestRunner::class)
class TermAckLoopbackHttpRoomTest {
    private lateinit var context: Context
    private lateinit var dbName: String
    private lateinit var db: EntregasDatabase
    private lateinit var server: HttpServer
    private lateinit var api: EntregasApi

    @Volatile private var responseStatus = 200
    @Volatile private var responseBody = "{}"
    @Volatile private var lastAuthorization: String? = null
    private val requestBodies = CopyOnWriteArrayList<String>()

    @Before fun setup() {
        context = RuntimeEnvironment.getApplication()
        dbName = "term-loopback-room-${System.nanoTime()}.db"
        db = Room.databaseBuilder(context, EntregasDatabase::class.java, dbName).build()
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/api/term/acknowledge") { request ->
            try {
                lastAuthorization = request.requestHeaders.getFirst("Authorization")
                requestBodies.add(
                    request.requestBody.bufferedReader(Charsets.UTF_8).use { it.readText() },
                )
                val bytes = responseBody.toByteArray(Charsets.UTF_8)
                request.responseHeaders.set("Content-Type", "application/json; charset=utf-8")
                request.sendResponseHeaders(responseStatus, bytes.size.toLong())
                request.responseBody.use { it.write(bytes) }
            } finally {
                request.close()
            }
        }
        server.start()
        assertTrue(server.address.address.isLoopbackAddress)
        api = EntregasApi("http://127.0.0.1:${server.address.port}", { null }, 1_500)
    }

    @After fun teardown() {
        if (::server.isInitialized) server.stop(0)
        if (::db.isInitialized) db.close()
        if (::context.isInitialized && ::dbName.isInitialized)
            context.deleteDatabase(dbName)
    }

    private fun ack(id: String = "loopback-ack-1") = TermAckEntity(
        acknowledgementId = id,
        riderId = "ACTOR-FICTICIO",
        unitId = "ITAIM",
        termVersion = "term-fixture-v1",
        termMaterialVersion = "material-fixture-v1",
        termHash = "FICTIONAL-HASH",
        status = "accepted",
        acceptedAt = "2026-11-08T12:30:00Z",
        deviceId = "DEVICE-FICTICIO",
        appVersion = "debug-fixture",
        language = "pt-BR",
        origin = "rider_app",
        correlationId = "CORRELATION-FICTICIA",
        schemaVersion = "consent@1.0.0",
        syncState = "pending",
    )

    private fun matchingReceipt(a: TermAckEntity): JSONObject = JSONObject()
        .put("ok", true)
        .put("acknowledgement_id", a.acknowledgementId)
        .put("stored", true)
        .put("receipt", JSONObject()
            .put("recibo", a.acknowledgementId)
            .put("unidade", a.unitId)
            .put("versao_do_termo", a.termVersion)
            .put("impressao_do_texto", a.termHash)
            .put("situacao", "aceito")
            .put("aparelho", a.deviceId))

    private fun respond(status: Int, text: String) {
        responseStatus = status
        responseBody = text
    }

    private fun request(a: TermAckEntity): ApiResult<JSONObject> =
        api.sendTermAcknowledgement(termAckWireJson(a))

    @Test fun actualHttp200ExactReceiptMakesRoomSentAfterRestart() = runBlocking {
        val a = ack()
        db.termAcks().insert(a)
        respond(200, matchingReceipt(a).toString())
        val result = request(a)
        assertTrue(result is ApiResult.Ok)
        assertTrue(persistTermAckOnVerifiedReceipt(db, a, result))
        assertEquals(1, requestBodies.size)
        val sent = JSONObject(requestBodies.single())
        assertEquals(a.acknowledgementId, sent.getString("acknowledgement_id"))
        assertEquals(a.riderId, sent.getString("rider_id"))
        assertEquals(a.unitId, sent.getString("unit_id"))
        assertEquals(a.deviceId, sent.getString("device_id"))
        assertEquals(a.termHash, sent.getString("term_hash"))
        assertNull(lastAuthorization) // no platform token may go to pilot
        db.close()
        db = Room.databaseBuilder(context, EntregasDatabase::class.java, dbName).build()
        assertEquals("sent", db.termAcks().byId(a.acknowledgementId)?.syncState)
        assertTrue(db.termAcks().pending().isEmpty())
    }

    @Test fun actualHttp200MissingReceiptPreservesAppendOnlyPending() = runBlocking {
        val a = ack("missing-receipt")
        db.termAcks().insert(a)
        respond(200, JSONObject().put("ok", true)
            .put("acknowledgement_id", a.acknowledgementId).toString())
        assertFalse(persistTermAckOnVerifiedReceipt(db, a, request(a)))
        assertEquals("pending", db.termAcks().byId(a.acknowledgementId)?.syncState)
        assertEquals(1, db.termAcks().pending().size)
    }

    @Test fun actualHttp200ForeignDeviceReceiptNeverCompletesPending() = runBlocking {
        val a = ack("foreign-device")
        db.termAcks().insert(a)
        val foreign = matchingReceipt(a)
            .getJSONObject("receipt").put("aparelho", "OTHER-DEVICE")
        val response = matchingReceipt(a).put("receipt", foreign)
        respond(200, response.toString())
        assertFalse(persistTermAckOnVerifiedReceipt(db, a, request(a)))
        assertEquals("pending", db.termAcks().byId(a.acknowledgementId)?.syncState)
    }

    @Test fun actualHttp422WholeRequestDoesNotBecomeIndividualTerminalRefusal() = runBlocking {
        val a = ack("http422")
        db.termAcks().insert(a)
        respond(422, JSONObject().put("human", "lote invalido").toString())
        val result = request(a)
        assertTrue(result is ApiResult.Rejected)
        assertEquals(422, (result as ApiResult.Rejected).status)
        assertFalse(persistTermAckOnVerifiedReceipt(db, a, result))
        assertEquals("pending", db.termAcks().byId(a.acknowledgementId)?.syncState)
    }

    @Test fun actualHttp401RequiresAuthorizationButNeverErasesConsent() = runBlocking {
        val a = ack("http401")
        db.termAcks().insert(a)
        respond(401, "{}")
        val result = request(a)
        assertTrue(result is ApiResult.Unauthorized)
        assertFalse(persistTermAckOnVerifiedReceipt(db, a, result))
        assertEquals("pending", db.termAcks().byId(a.acknowledgementId)?.syncState)
    }

    @Test fun actualHttp200BrokenJsonIsRetryableNotAccepted() = runBlocking {
        val a = ack("broken-json")
        db.termAcks().insert(a)
        respond(200, "{")
        val result = request(a)
        assertTrue(result is ApiResult.Retryable)
        assertFalse(persistTermAckOnVerifiedReceipt(db, a, result))
        assertEquals("pending", db.termAcks().byId(a.acknowledgementId)?.syncState)
    }

    @Test fun httpRetryRetainsIdenticalIdentityUntilIdempotentStoredFalse() = runBlocking {
        val a = ack("retry-identical")
        assertTrue(db.termAcks().insert(a) > 0L)
        respond(200, JSONObject().put("ok", true).toString())
        assertFalse(persistTermAckOnVerifiedReceipt(db, a, request(a)))
        assertEquals(-1L, db.termAcks().insert(a))
        assertEquals(1, db.termAcks().pending().size)
        respond(200, matchingReceipt(a).put("stored", false).toString())
        assertTrue(persistTermAckOnVerifiedReceipt(db, a, request(a)))
        assertEquals(2, requestBodies.size)
        assertEquals(requestBodies[0], requestBodies[1])
        assertEquals("sent", db.termAcks().byId(a.acknowledgementId)?.syncState)
        assertTrue(db.termAcks().pending().isEmpty())
    }

    @Test fun localTransportConnectionRefusedIsRetryableWithoutChangingRoom() = runBlocking {
        val a = ack("server-unavailable")
        db.termAcks().insert(a)
        server.stop(0)
        val result = request(a)
        assertTrue(result is ApiResult.Retryable)
        assertFalse(persistTermAckOnVerifiedReceipt(db, a, result))
        assertNotNull(db.termAcks().byId(a.acknowledgementId))
        assertEquals("pending", db.termAcks().byId(a.acknowledgementId)?.syncState)
    }
}
