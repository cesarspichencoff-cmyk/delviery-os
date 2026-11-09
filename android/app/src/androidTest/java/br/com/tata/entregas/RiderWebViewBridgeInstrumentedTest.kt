package br.com.tata.entregas

import android.webkit.WebView
import android.view.ViewGroup
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.WorkManagerTestInitHelper
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.sync.SyncWorker
import br.com.tata.entregas.ui.MainActivity
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Real Android WebView + production JavascriptInterface + SQLite Room +
 * WorkManager TestDriver. All identities/data are lab-only and no worker
 * is executed: no server, GPS, term, real delivery or TLS request is used.
 *
 * This is not a Xiaomi, a real Rider UI screenshot, or a remote event receipt.
 */
@RunWith(AndroidJUnit4::class)
class RiderWebViewBridgeInstrumentedTest {

    private val labHtml = """
        <!doctype html>
        <html><head><meta charset="utf-8"/></head>
        <body>
          <button id="record-and-sync" type="button">Tentar sincronizar ações</button>
          <span id="result">Ainda não solicitado</span>
          <script>
            document.getElementById('record-and-sync').onclick = function () {
              const event = {
                event_id: 'LAB_WEBVIEW_BRIDGE_EVENT_001',
                idempotency_key: 'LAB_WEBVIEW_BRIDGE_EVENT_001',
                command: {
                  type: 'ConfirmTripDeparture',
                  command_id: 'LAB_WEBVIEW_BRIDGE_COMMAND_001',
                  trip_id: 'LAB_WEBVIEW_BRIDGE_TRIP',
                  occurred_at: '2026-11-08T20:00:00Z'
                }
              };
              const response = JSON.parse(window.EntregasNative.recordOperationalEvent(
                JSON.stringify(event)
              ));
              if (response.ok === true) {
                window.EntregasNative.syncNow();
                document.getElementById('result').textContent = 'RECORDED_NOT_ACKED';
              } else {
                document.getElementById('result').textContent = 'REFUSED';
              }
            };
          </script>
        </body></html>
    """.trimIndent()

    private fun evaluate(scenario: ActivityScenario<MainActivity>, script: String): String {
        val result = AtomicReference<String>()
        val completed = CountDownLatch(1)
        scenario.onActivity { activity ->
            val container = activity.findViewById<ViewGroup>(android.R.id.content)
            val web = container.getChildAt(0) as WebView
            web.evaluateJavascript(script) {
                result.set(it)
                completed.countDown()
            }
        }
        assertTrue("WebView JS callback not received", completed.await(15, TimeUnit.SECONDS))
        return result.get() ?: "null"
    }

    @Test fun actualWebViewRecordsRoomEventAndRequestsOneNativeWorkWithoutRemoteAck() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        // The test WorkManager does not execute workers by itself.
        // This prevents external HTTP / background GPS and allows queue inspection.
        WorkManagerTestInitHelper.initializeTestWorkManager(context)

        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            // MainActivity asynchronously enqueues the periodic worker before
            // loading its initial page. On newer Android engines that delayed
            // load can replace the laboratory HTML after injection.
            // Observe that INITIAL navigation was requested first.
            var initialRequested = false
            for (attempt in 0 until 60) {
                scenario.onActivity { activity ->
                    val web = (activity.findViewById<ViewGroup>(android.R.id.content))
                        .getChildAt(0) as WebView
                    initialRequested = web.url?.startsWith(
                        br.com.tata.entregas.BuildConfig.ENTREGAS_BASE_URL,
                    ) == true
                }
                if (initialRequested) break
                Thread.sleep(250)
            }
            assertTrue("Initial MainActivity navigation was not observed", initialRequested)

            scenario.onActivity { activity ->
                val container = activity.findViewById<ViewGroup>(android.R.id.content)
                val web = container.getChildAt(0) as WebView
                // Inline synthetic HTML on a test-only origin. No real server.
                web.loadDataWithBaseURL(
                    "https://10.0.2.2:5193/rider-mobile/",
                    labHtml, "text/html", "UTF-8", null,
                )
            }

            var ready = false
            repeat(40) {
                val js = evaluate(scenario,
                    "Boolean(document.getElementById('record-and-sync') && window.EntregasNative && window.EntregasNative.recordOperationalEvent)")
                if (js == "true") {
                    ready = true
                    return@repeat
                }
                Thread.sleep(250)
            }
            val legacy = InstrumentationRegistry.getArguments()
                .getString("webviewExpected") == "legacy"
            if (!ready && legacy) {
                // Old WebView with no document-start support must never fall
                // back to the public unguarded Java bridge. The raw transport
                // is present, but no action can be sent without its secret.
                assertEquals("true", evaluate(scenario,
                    """!!window.EntregasNativeRaw &&
                       typeof window.EntregasNativeRaw.recordOperationalEvent==='function'"""))
                val denied = evaluate(scenario,
                    """window.EntregasNativeRaw.recordOperationalEvent(
                        'LAB_WRONG_CAPABILITY',
                        '{"event_id":"LAB_UNAUTHORIZED_BRIDGE_EVENT"}')""")
                assertTrue("Legacy iframe-accessible raw bridge was not denied",
                    denied.contains("native_origin_denied"))
                val db = EntregasDatabase.get(context)
                assertTrue(runBlocking {
                    db.outbox().recent(50).none { it.eventId == "LAB_UNAUTHORIZED_BRIDGE_EVENT" }
                })
                return@use
            }
            if (!ready) {
                val probe = evaluate(scenario, """
                    JSON.stringify({
                      dom:document.readyState,
                      button:!!document.getElementById('record-and-sync'),
                      native:!!window.EntregasNative,
                      record:!!window.EntregasNative &&
                          typeof window.EntregasNative.recordOperationalEvent==='function'
                    })
                """.trimIndent())
                throw AssertionError("LAB_BRIDGE_NOT_READY probe=$probe webview=" +
                    (WebView.getCurrentWebViewPackage()?.versionName ?: "unknown"))
            }

            // DOM click runs the same JS -> EntregasJsBridge -> MainActivity
            // boundary as the real app; not a synthetic native method stub.
            assertEquals("\"RECORDED_NOT_ACKED\"", evaluate(scenario,
                "document.getElementById('record-and-sync').click();document.getElementById('result').textContent"))

            val db = EntregasDatabase.get(context)
            val events = runBlocking { db.outbox().recent(50) }
            val event = events.single { it.eventId == "LAB_WEBVIEW_BRIDGE_EVENT_001" }
            assertEquals("pending", event.syncState)
            assertEquals("LAB_WEBVIEW_BRIDGE_EVENT_001", event.idempotencyKey)
            assertTrue(event.sequenceLocal > 0)
            assertFalse("A JS click cannot attest server delivery", event.syncState == "sent")

            val work = WorkManager.getInstance(context)
                .getWorkInfosForUniqueWork(SyncWorker.UNIQUE_NOW)
                .get(15, TimeUnit.SECONDS)
            assertEquals("Duplicate immediate work scheduled", 1, work.size)
            assertEquals(WorkInfo.State.ENQUEUED, work.single().state)

            // Separate CSP-free lab page: the sandbox frame MUST execute and
            // reach the raw Java interface. This proves the native capability
            // check independent of the production HTML's additional CSP.
            val forgedEventId = "LAB_SANDBOX_FORGED_EVENT_001"
            val forged = JSONObject().apply {
                put("event_id", forgedEventId)
                put("idempotency_key", forgedEventId)
                put("command", JSONObject().apply {
                    put("type", "ConfirmTripDeparture")
                    put("command_id", "LAB_SANDBOX_COMMAND_001")
                    put("trip_id", "LAB_SANDBOX_TRIP_001")
                    put("occurred_at", "2026-11-08T20:00:00Z")
                })
            }.toString()
            val child = """
              (function () {
                var hasRaw = !!window.EntregasNativeRaw;
                var blockedParent = false;
                try { window.top.EntregasNative; } catch (_) { blockedParent = true; }
                var response = "NO_RAW_BRIDGE";
                if (hasRaw) {
                  try {
                    response = String(window.EntregasNativeRaw.recordOperationalEvent(
                      "INVALID_SANDBOX_PROOF", ${JSONObject.quote(forged)}
                    ));
                  } catch (_) { response = "BRIDGE_CALL_EXCEPTION"; }
                }
                parent.postMessage({
                  kind:"LAB_SANDBOX_NATIVE_RESULT",raw:hasRaw,
                  publicFacade:typeof window.EntregasNative,
                  blockedParent:blockedParent,response:response
                },"*");
              })();
            """.trimIndent()
            val html = "<!doctype html><script>" + child + "</script>"
            val attack = """
                (function () {
                  window.__labSandboxResult = null;
                  window.addEventListener('message',function (m) {
                    if (m.data && m.data.kind === 'LAB_SANDBOX_NATIVE_RESULT')
                      window.__labSandboxResult = m.data;
                  });
                  var frame = document.createElement("iframe");
                  frame.setAttribute("sandbox","allow-scripts");
                  frame.srcdoc = ${JSONObject.quote(html)};
                  document.body.appendChild(frame);
                  return true;
                })();
            """.trimIndent()
            assertEquals("true", evaluate(scenario, attack))
            var received = false
            repeat(45) {
                if (evaluate(scenario, "!!window.__labSandboxResult") == "true") {
                    received = true
                    return@repeat
                }
                Thread.sleep(150)
            }
            assertTrue("Sandbox attack did not execute", received)
            assertEquals("true", evaluate(scenario, """
                window.__labSandboxResult.raw === true &&
                window.__labSandboxResult.publicFacade === 'undefined' &&
                window.__labSandboxResult.blockedParent === true &&
                window.__labSandboxResult.response.indexOf('native_origin_denied') >= 0
            """.trimIndent()))
            assertTrue("Sandbox iframe forged event reached Room", runBlocking {
                db.outbox().recent(100).none { it.eventId == forgedEventId }
            })
        }
    }
}
