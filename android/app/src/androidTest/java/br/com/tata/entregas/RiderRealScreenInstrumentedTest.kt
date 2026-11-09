package br.com.tata.entregas

import android.content.Context
import android.net.Uri
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.WorkManagerTestInitHelper
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.sync.OperationalEventRecorder
import br.com.tata.entregas.sync.EventReceiptDecision
import br.com.tata.entregas.sync.EventReceiptItem
import br.com.tata.entregas.sync.decideEventReceipt
import br.com.tata.entregas.sync.SyncWorker
import org.json.JSONObject
import br.com.tata.entregas.ui.MainActivity
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayInputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Loads the actual rider-mobile HTML, JS modules and CSS into an Android WebView
 * backed by test APK assets. HTTPS requests are intercepted before any network.
 * Uses the actual EntregasNative bridge, Room and WorkManager test scheduler.
 *
 * This is NOT an HTTPS server, backend ACK, actual worker execution, GPS,
 * physical Xiaomi, production site or native bridge confinement test.
 */
@RunWith(AndroidJUnit4::class)
class RiderRealScreenInstrumentedTest {
    private val eventId = "LAB_REAL_RIDER_UI_EVENT_001"
    private val labOrigin = "https://10.0.2.2:5193"
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    private class InMemorySite(private val context: Context) : WebViewClient() {
        var requestsOutsideLab = 0
            private set
        var blockedGoogleFontStylesheet = 0
            private set
        var attemptedDemoMutation = 0
            private set
        val paths = mutableSetOf<String>()
        val missingAssets = mutableSetOf<String>()

        private fun response(data: String, mime: String = "application/json"): WebResourceResponse =
            WebResourceResponse(mime, "UTF-8", ByteArrayInputStream(data.toByteArray(Charsets.UTF_8)))

        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
            val url = request?.url ?: return true
            return url.scheme != "https" || url.host != "10.0.2.2" ||
                url.port != 5193
        }

        override fun shouldInterceptRequest(
            view: WebView?, request: WebResourceRequest?,
        ): WebResourceResponse {
            val url = request?.url
            // Production tokens.css imports public Google Fonts. Keep the
            // original stylesheet bytes, but prevent ALL external network
            // requests during the test. System font fallback is sufficient.
            if (url?.scheme == "https" && url.host == "fonts.googleapis.com") {
                blockedGoogleFontStylesheet++
                return response("", "text/css")
            }
            if (url == null || url.scheme != "https" || url.host != "10.0.2.2" ||
                url.port != 5193) {
                requestsOutsideLab++
                return response("DENIED", "text/plain")
            }
            val path = url.path ?: "/"
            synchronized(paths) { paths.add(path) }
            if (path == "/api/connection") {
                attemptedDemoMutation++
                return response("""{"error":"DEMO_MUTATION_DENIED"}""")
            }
            if (path == "/api/session") {
                return response("""{"actor":{"actor_id":"rider-lab","role":"motoboy_interno"}}""")
            }
            if (path == "/api/policies") {
                return response("""{"flags":{"offline_queue_enabled":true,"gps_capture_enabled":false},"term":{"publishable":false}}""")
            }
            if (path == "/api/snapshot") {
                return response("""{"actor":{"actor_id":"rider-lab","role":"motoboy_interno"},"connection":"online","pending_sync":0,"trips":[]}""")
            }
            if (path.startsWith("/api/")) return response("""{"error":"UNEXPECTED_LAB_ROUTE"}""")
            if (!Regex("^/[A-Za-z0-9_./-]+$").matches(path) || path.contains("..")) {
                return response("FORBIDDEN", "text/plain")
            }
            val assetPath = path.removePrefix("/").let {
                if (it.endsWith("/")) it + "index.html" else it
            }
            val mime = when {
                assetPath.endsWith(".html") -> "text/html"
                assetPath.endsWith(".js") -> "application/javascript"
                assetPath.endsWith(".css") -> "text/css"
                else -> "text/plain"
            }
            return try {
                val bytes = context.assets.open(assetPath).use { it.readBytes() }
                WebResourceResponse(mime, "UTF-8", ByteArrayInputStream(bytes))
            } catch (_: Exception) {
                synchronized(missingAssets) { missingAssets.add(assetPath) }
                response("LAB_ASSET_NOT_FOUND", "text/plain")
            }
        }
    }

    private fun webOf(activity: MainActivity): WebView =
        (activity.findViewById<ViewGroup>(android.R.id.content)).getChildAt(0) as WebView

    private fun eval(scenario: ActivityScenario<MainActivity>, js: String): String {
        val answer = AtomicReference<String>()
        val latch = CountDownLatch(1)
        scenario.onActivity { activity ->
            webOf(activity).evaluateJavascript(js) {
                answer.set(it)
                latch.countDown()
            }
        }
        assertTrue("Timed out waiting for real WebView JS", latch.await(15, TimeUnit.SECONDS))
        return answer.get() ?: "null"
    }

    private fun until(scenario: ActivityScenario<MainActivity>, js: String): Boolean {
        repeat(40) {
            if (eval(scenario, js) == "true") return true
            Thread.sleep(250)
        }
        return false
    }

    @Test fun realRiderScreenReadsRoomAndRequestsNativeWorkWithoutPretendingAck() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = EntregasDatabase.get(context)
        WorkManagerTestInitHelper.initializeTestWorkManager(context)

        val command = """
            {"event_id":"$eventId","idempotency_key":"$eventId",
             "command":{"type":"ConfirmTripDeparture",
               "command_id":"LAB_REAL_RIDER_UI_COMMAND_001",
               "trip_id":"LAB_REAL_RIDER_UI_TRIP_001",
               "occurred_at":"2026-11-08T20:00:00Z"}}
        """.trimIndent()
        val recorded = runBlocking { OperationalEventRecorder.record(db, command, 1794168000000L) }
        assertTrue("Expected locally recorded synthetic event", recorded is OperationalEventRecorder.Result.Recorded)
        assertEquals("pending", runBlocking { db.outbox().recent(50) }.first { it.eventId == eventId }.syncState)

        val testSite = InMemorySite(instrumentation.context)
        val consoleKinds = mutableSetOf<String>()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val web = webOf(activity)
                web.webViewClient = testSite
                web.webChromeClient = object : WebChromeClient() {
                    override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                        if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                            val kind = when {
                                message.message().contains("Unexpected token") -> "UNEXPECTED_TOKEN"
                                message.message().contains("SyntaxError") -> "SYNTAX_ERROR"
                                message.message().contains("module", true) -> "MODULE_ERROR"
                                message.message().contains("CORS") -> "CORS_ERROR"
                                message.message().contains("Failed to load") -> "LOAD_ERROR"
                                else -> "OTHER_CONSOLE_ERROR"
                            }
                            synchronized(consoleKinds) { consoleKinds.add(kind) }
                        }
                        return true
                    }
                }
                web.loadUrl("$labOrigin/rider-mobile/")
            }
            val expected = InstrumentationRegistry.getArguments().getString("webviewExpected")
            if (expected == "legacy") {
                assertTrue("Old WebView must show an explicit compatibility HOLD",
                    until(scenario, """!!document.getElementById('compatibilityHold') &&
                        !document.getElementById('compatibilityHold').hidden &&
                        document.getElementById('main').hidden &&
                        window.getComputedStyle(document.getElementById('main')).display==='none' &&
                        window.getComputedStyle(document.querySelector('.m-nav')).display==='none' &&
                        document.getElementById('compatibilityTitle').textContent.includes('Não foi possível iniciar') &&
                        document.getElementById('connLine').textContent.includes('indisponível')"""))
                assertEquals("false", eval(scenario,
                    """!!document.querySelector('script[src="/rider-mobile/rider.js"]')"""))
                assertEquals("false", eval(scenario,
                    """!document.getElementById('btnSyncNow').hidden"""))
                assertEquals("pending", runBlocking {
                    db.outbox().recent(50).first { it.eventId == eventId }.syncState
                })
                assertEquals(0, testSite.attemptedDemoMutation)
                assertEquals(0, testSite.requestsOutsideLab)
                return@use
            }
            assertEquals("modern", expected)
            assertTrue("Modern emulator must NOT be on compatibility HOLD",
                until(scenario, """!!document.getElementById('compatibilityHold') &&
                    document.getElementById('compatibilityHold').hidden"""))
            val shown = until(scenario, """!!document.getElementById('pendingLine') &&
                 !document.getElementById('pendingLine').hidden &&
                 document.getElementById('pendingLine').textContent.includes('guardada') &&
                 document.getElementById('btnSyncNow')?.textContent.includes('Tentar sincronizar')""")
            if (!shown) {
                // Sanitized lab-only diagnostics: booleans, static paths and
                // DOM readiness, never contents of an order or a native error.
                // Use ES5 only in this PROBE; an old WebView may not support
                // optional chaining and must not break the diagnostic itself.
                val probe = eval(scenario, """
                    JSON.stringify({
                      dom:document.readyState,
                      page:!!document.getElementById('pendingLine'),
                      queued:!!document.getElementById('pendingLine') && !document.getElementById('pendingLine').hidden,
                      sync:!!document.getElementById('btnSyncNow') && !document.getElementById('btnSyncNow').hidden,
                      native:!!window.EntregasNative && typeof window.EntregasNative.operationalEvents==='function',
                      queue:!!document.getElementById('pendingLine') && document.getElementById('pendingLine').textContent.indexOf('guardada')>=0,
                      module:!!document.querySelector('script[src="/rider-mobile/rider.js"]')
                    })
                """.trimIndent())
                val paths = synchronized(testSite.paths) { testSite.paths.toList().sorted() }
                val missing = synchronized(testSite.missingAssets) { testSite.missingAssets.toList().sorted() }
                val errors = synchronized(consoleKinds) { consoleKinds.toList().sorted() }
                val webview = WebView.getCurrentWebViewPackage()?.versionName ?: "unknown"
                throw AssertionError("REAL_RIDER_PENDING_NOT_SHOWN probe=$probe webview=$webview console=$errors assets=$paths missing=$missing")
            }
            assertTrue("Native sync button is not displayed by actual rider.js",
                until(scenario, """!document.getElementById('btnSyncNow').hidden"""))
            assertEquals("false", eval(scenario,
                """!document.getElementById('confirmedLine').hidden"""))
            assertEquals("true", eval(scenario,
                """document.getElementById('btnSyncNow').click();true"""))
            assertTrue("Request must be shown as pending, never server ACK",
                until(scenario, """document.getElementById('syncRequestLine').textContent.includes('Aguardando confirmação do servidor')"""))
            val jobs = WorkManager.getInstance(context)
                .getWorkInfosForUniqueWork(SyncWorker.UNIQUE_NOW)
                .get(15, TimeUnit.SECONDS)
            assertEquals("Expected only one native immediate sync", 1, jobs.size)
            assertEquals(WorkInfo.State.ENQUEUED, jobs.single().state)

            runBlocking { db.outbox().markFailed(listOf(eventId), "FICT_SECRET_AUTH_TOKEN") }
            assertTrue("Real screen must display pending uncertain retry",
                until(scenario, """document.getElementById('pendingLine').textContent.includes('sem confirmação do servidor')"""))
            assertEquals("false", eval(scenario,
                """!document.getElementById('confirmedLine').hidden"""))
            assertEquals("false", eval(scenario,
                """document.body.innerText.includes('FICT_SECRET_AUTH_TOKEN')"""))
            val persisted = runBlocking { db.outbox().recent(50) }.first { it.eventId == eventId }
            assertEquals(eventId, persisted.idempotencyKey)
            assertEquals("failed", persisted.syncState)
            assertFalse(persisted.syncState == "sent")

            // This is a SYNTHETIC receipt supplied directly to the SAME
            // validator called by SyncWorker. HTTP and doWork() are covered
            // separately by the JVM dual-loopback fixture; they are NOT
            // executed from this Android UI test.
            val item = listOf(EventReceiptItem(eventId))
            val missing = decideEventReceipt(
                item, JSONObject("""{"ok":true,"results":[]}"""),
            )
            val wrong = decideEventReceipt(
                item, JSONObject().put("ok", true).put(
                    "results", org.json.JSONArray().put(
                        JSONObject().put("event_id", "LAB_OTHER_EVENT").put("ok", true),
                    ),
                ),
            )
            assertTrue("Missing per-event receipt must not confirm", missing is EventReceiptDecision.Invalid)
            assertTrue("Wrong event identity must not confirm", wrong is EventReceiptDecision.Invalid)
            assertEquals("failed", runBlocking {
                db.outbox().recent(50).first { it.eventId == eventId }.syncState
            })
            assertEquals("false", eval(scenario,
                """!document.getElementById('confirmedLine').hidden"""))

            val valid = decideEventReceipt(
                item, JSONObject().put("ok", true).put(
                    "results", org.json.JSONArray().put(
                        JSONObject().put("event_id", eventId).put("ok", true),
                    ),
                ),
            )
            assertTrue("Only matched per-event receipt can advance state",
                valid is EventReceiptDecision.Apply)
            val sentIds = (valid as EventReceiptDecision.Apply).sentIds
            assertEquals(listOf(eventId), sentIds)
            assertTrue(valid.rejected.isEmpty())
            assertTrue(valid.retryable.isEmpty())
            // Mirror the Worker's EXACT DAO transition after validation:
            // event identity and local sequence must remain stable.
            runBlocking { db.outbox().markSent(sentIds) }
            assertTrue("Actual Android rider.js did not show the matched Room confirmation",
                until(scenario, """!document.getElementById('confirmedLine').hidden &&
                    document.getElementById('confirmedLine').textContent.includes('confirmação do servidor para 1 ação')"""))
            // Other instrumented tests may have independent pending lab
            // actions in this same Room. A receipt for THIS event must not
            // clear or hide the rest of the queue.
            assertEquals("true", eval(scenario,
                """document.getElementById('confirmedLine').textContent.includes('1 ação')"""))
            val afterReceipt = runBlocking {
                db.outbox().recent(50).first { it.eventId == eventId }
            }
            assertEquals("sent", afterReceipt.syncState)
            assertEquals(persisted.sequenceLocal, afterReceipt.sequenceLocal)
            assertEquals(persisted.idempotencyKey, afterReceipt.idempotencyKey)
            assertEquals("No demo connection endpoint may run on native screen", 0, testSite.attemptedDemoMutation)
            assertEquals("No cross-origin request should leave fixture", 0, testSite.requestsOutsideLab)
            synchronized(testSite.paths) {
                assertTrue("Actual rider.js not requested", "/rider-mobile/rider.js" in testSite.paths)
                assertTrue("Actual /api/policies not requested", "/api/policies" in testSite.paths)
            }

            // Production rider HTML has a no-frames / no-inline-script CSP.
            // No child frame may even execute the raw bridge attack.
            assertEquals("true", eval(scenario,
                """(function () {
                  var meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
                  return !!meta && meta.content.includes("frame-src 'none'") &&
                    meta.content.includes("script-src 'self'") &&
                    meta.content.includes("connect-src 'self'");
                })()"""))
            val childDocument = "<!doctype html><script>parent.postMessage(" +
                "{kind:'LAB_CSP_CHILD_EXECUTED'},'*')</script>"
            val attempt = """
                (function () {
                  window.__labInlineExecuted = false;
                  window.__labChildExecuted = false;
                  window.addEventListener('message', function (m) {
                    if (m.data && m.data.kind === 'LAB_CSP_CHILD_EXECUTED')
                      window.__labChildExecuted = true;
                  });
                  var injected = document.createElement('script');
                  injected.textContent = "window.__labInlineExecuted = true";
                  document.body.appendChild(injected);
                  var iframe = document.createElement('iframe');
                  iframe.setAttribute('sandbox', 'allow-scripts');
                  iframe.srcdoc = ${JSONObject.quote(childDocument)};
                  document.body.appendChild(iframe);
                  return true;
                })();
            """.trimIndent()
            assertEquals("true", eval(scenario, attempt))
            Thread.sleep(500)
            assertEquals("true", eval(scenario,
                """window.__labInlineExecuted === false &&
                   window.__labChildExecuted === false"""))
            assertTrue("CSP attack must not create a native Room event", runBlocking {
                db.outbox().recent(100).none { it.eventId == "LAB_CSP_CHILD_FORGED" }
            })
        }
    }
}
