package br.com.tata.entregas

import br.com.tata.entregas.sync.ApiResult
import br.com.tata.entregas.sync.EntregasApi
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.net.InetAddress
import java.net.ServerSocket
import java.util.concurrent.atomic.AtomicReference

/** JVM-only, two independent loopback HTTP receivers. Not a TLS or device proof. */
@RunWith(RobolectricTestRunner::class)
class PilotDelegationHttpTest {
    private class LocalReceiver(
        private val body: String,
        private val seen: AtomicReference<String?>,
    ) : AutoCloseable {
        private val server = ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"))
        val baseUrl: String get() = "http://127.0.0.1:${server.localPort}"
        private val thread = Thread {
            try {
                server.accept().use { socket ->
                    socket.soTimeout = 5000
                    val reader = socket.getInputStream().bufferedReader()
                    reader.readLine() // request line
                    while (true) {
                        val line = reader.readLine() ?: break
                        if (line.isEmpty()) break
                        if (line.startsWith("Authorization:", ignoreCase = true)) {
                            seen.set(line.substringAfter(':').trim())
                        }
                    }
                    val bytes = body.toByteArray(Charsets.UTF_8)
                    val header = "HTTP/1.1 200 OK\r\n" +
                        "Content-Type: application/json\r\n" +
                        "Content-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
                    socket.getOutputStream().use {
                        it.write(header.toByteArray(Charsets.US_ASCII))
                        it.write(bytes)
                        it.flush()
                    }
                }
            } catch (_: java.io.IOException) { /* server closed in finally */ }
        }.apply { isDaemon = true; start() }
        override fun close() {
            server.close()
            thread.join(3000)
        }
    }

    @Test fun credentialAudiencesAreSeparatedAtHttpBoundary() {
        val platformBearer = AtomicReference<String?>()
        val pilotBearer = AtomicReference<String?>()
        val platformToken = "LAB-PLATFORM-ONLY"
        val pilotToken = "pt1.cGF5bG9hZA.c2lnbmF0dXJl"
        val response = JSONObject().apply {
            put("ok", true)
            put("pilot_token", pilotToken)
            put("expires_in_s", 180)
            put("actor_id", "LAB-RIDER")
            put("unit_id", "LAB-UNIT")
            put("device_id", "LAB-DEVICE")
            put("audience", "deliveryos-pilot-event-write")
        }.toString()
        LocalReceiver(response, platformBearer).use { platform ->
            LocalReceiver("""{"ok":true,"results":[{"event_id":"LAB-EVENT","ok":true}]}""", pilotBearer).use { pilot ->
                val platformApi = EntregasApi(platform.baseUrl, { platformToken })
                val delegated = platformApi.requestPilotWriteToken("LAB-RIDER", "LAB-DEVICE")
                assertTrue(delegated is ApiResult.Ok)
                val pilotApi = EntregasApi(pilot.baseUrl, { (delegated as ApiResult.Ok).value })
                val result = pilotApi.sendEvents(listOf(JSONObject().put("event_id", "LAB-EVENT")), "LAB")
                assertTrue(result is ApiResult.Ok)
                assertEquals("Bearer $platformToken", platformBearer.get())
                assertEquals("Bearer $pilotToken", pilotBearer.get())
                assertTrue(platformBearer.get() != pilotBearer.get())
            }
        }
    }
}
