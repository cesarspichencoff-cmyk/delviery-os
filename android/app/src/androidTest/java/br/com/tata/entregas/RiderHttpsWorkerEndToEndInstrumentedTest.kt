package br.com.tata.entregas

import android.content.Context
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.WorkManagerTestInitHelper
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.sync.OperationalEventRecorder
import br.com.tata.entregas.sync.SyncWorker
import br.com.tata.entregas.ui.MainActivity
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayInputStream
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Disposable emulator only: real rider UI -> JS bridge -> WorkManager ->
 * actual SyncWorker -> real HTTPS platform & pilot -> Room -> rider UI.
 * A transient runner CA is trusted only in this debug instrumentation build;
 * no hostname-verifier override, no HTTP downgrade, no production endpoint.
 */
@RunWith(AndroidJUnit4::class)
class RiderHttpsWorkerEndToEndInstrumentedTest {
    private val eventId = "LAB_HTTPS_WORKER_UI_EVENT_001"

    private class LabSite(private val context: Context) : WebViewClient() {
        private fun text(data: String, mime: String = "application/json") =
            WebResourceResponse(mime, "UTF-8",
                ByteArrayInputStream(data.toByteArray(Charsets.UTF_8)))

        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
            val url = request?.url ?: return true
            return url.scheme != "https" || url.host != "10.0.2.2" || url.port != 5193
        }

        override fun shouldInterceptRequest(
            view: WebView?, request: WebResourceRequest?,
        ): WebResourceResponse {
            val url = request?.url
            if (url?.scheme == "https" && url.host == "fonts.googleapis.com") return text("", "text/css")
            if (url?.scheme != "https" || url.host != "10.0.2.2" || url.port != 5193)
                return text("LAB_CROSS_ORIGIN_DENIED", "text/plain")
            val path = url.path ?: "/"
            when (path) {
                "/api/session" -> return text("""{"actor":{"actor_id":"rider-lab","role":"motoboy_interno"}}""")
                "/api/policies" -> return text("""{"flags":{"offline_queue_enabled":true,"gps_capture_enabled":false},"term":{"publishable":false}}""")
                "/api/snapshot" -> return text("""{"actor":{"actor_id":"rider-lab","role":"motoboy_interno"},"connection":"online","pending_sync":0,"trips":[]}""")
            }
            if (path.startsWith("/api/") || !Regex("^/[A-Za-z0-9_./-]+$").matches(path) ||
                path.contains("..")) return text("LAB_ROUTE_DENIED", "text/plain")
            val asset = path.removePrefix("/").let { p -> if (p.endsWith("/")) p + "index.html" else p }
            val mime = when {
                asset.endsWith(".html") -> "text/html"
                asset.endsWith(".js") -> "application/javascript"
                asset.endsWith(".css") -> "text/css"
                else -> "text/plain"
            }
            return try {
                WebResourceResponse(mime, "UTF-8",
                    ByteArrayInputStream(context.assets.open(asset).use { it.readBytes() }))
            } catch (_: Exception) {
                text("LAB_MISSING_ASSET", "text/plain")
            }
        }
    }

    private fun eval(activity: ActivityScenario<MainActivity>, js: String): String {
        val value = AtomicReference<String>()
        val latch = CountDownLatch(1)
        activity.onActivity { a ->
            val web = a.findViewById<ViewGroup>(android.R.id.content).getChildAt(0) as WebView
            web.evaluateJavascript(js) {
                value.set(it)
                latch.countDown()
            }
        }
        assertTrue("LAB_JS_TIMED_OUT", latch.await(15, TimeUnit.SECONDS))
        return value.get() ?: "null"
    }

    private fun until(activity: ActivityScenario<MainActivity>, js: String): Boolean {
        repeat(70) {
            if (eval(activity, js) == "true") return true
            Thread.sleep(200)
        }
        return false
    }

    private fun allWork(context: Context): List<WorkInfo> =
        WorkManager.getInstance(context)
            .getWorkInfosForUniqueWork(SyncWorker.UNIQUE_NOW)
            .get(15, TimeUnit.SECONDS)

    private fun awaitNewWork(context: Context, before: Set<UUID>): WorkInfo {
        repeat(65) {
            val found = allWork(context).firstOrNull { it.id !in before && it.state == WorkInfo.State.ENQUEUED }
            if (found != null) return found
            Thread.sleep(150)
        }
        throw AssertionError("LAB_WORK_NOT_ENQUEUED")
    }

    private fun awaitWork(context: Context, id: UUID, state: WorkInfo.State): Boolean {
        repeat(95) {
            if (allWork(context).any { it.id == id && it.state == state }) return true
            Thread.sleep(200)
        }
        return false
    }

    @Test fun realHttps422ThenReceiptPersistsSameEventAndIsShownOnActualRiderScreen() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = EntregasDatabase.get(context)
        WorkManagerTestInitHelper.initializeTestWorkManager(context)

        val json = """
          {"event_id":"$eventId","idempotency_key":"$eventId","command":{
            "type":"ConfirmTripDeparture",
            "command_id":"LAB_HTTPS_UI_COMMAND_001",
            "trip_id":"LAB_HTTPS_UI_TRIP_001",
            "occurred_at":"2026-11-08T21:00:00Z"}}
        """.trimIndent()
        val recorded = runBlocking {
            OperationalEventRecorder.record(db, json, System.currentTimeMillis())
        }
        assertTrue(recorded is OperationalEventRecorder.Result.Recorded)
        val original = runBlocking { db.outbox().recent(50).single { it.eventId == eventId } }
        assertEquals("pending", original.syncState)

        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { a ->
                val web = a.findViewById<ViewGroup>(android.R.id.content).getChildAt(0) as WebView
                web.webViewClient = LabSite(
                    androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().context)
                web.loadUrl("https://10.0.2.2:5193/rider-mobile/")
            }
            assertTrue("LAB_REAL_RIDER_NOT_READY",
                until(scenario, """document.getElementById('compatibilityHold').hidden &&
                    !document.getElementById('pendingLine').hidden &&
                    !document.getElementById('btnSyncNow').hidden"""))
            assertEquals("false", eval(scenario, """!document.getElementById('confirmedLine').hidden"""))
            val past = allWork(context).map { it.id }.toSet()
            eval(scenario, """document.getElementById('btnSyncNow').click();true""")
            val first = awaitNewWork(context, past)
            val driver = WorkManagerTestInitHelper.getTestDriver(context)
                ?: throw AssertionError("LAB_TEST_DRIVER_MISSING")
            driver.setAllConstraintsMet(first.id)
            assertTrue("HTTP 422 without event receipt must fail worker",
                awaitWork(context, first.id, WorkInfo.State.FAILED))
            val notAccepted = runBlocking { db.outbox().recent(50).single { it.eventId == eventId } }
            assertEquals("failed", notAccepted.syncState)
            assertEquals(original.sequenceLocal, notAccepted.sequenceLocal)
            assertEquals(original.idempotencyKey, notAccepted.idempotencyKey)
            assertTrue("UI showed ACK before server receipt",
                until(scenario, """document.getElementById('pendingLine').textContent.includes('sem confirmação do servidor') &&
                    document.getElementById('confirmedLine').hidden"""))

            val seen = allWork(context).map { it.id }.toSet()
            eval(scenario, """document.getElementById('btnSyncNow').click();true""")
            val second = awaitNewWork(context, seen)
            assertFalse("LAB_RETRY_NOT_FRESH_WORK", first.id == second.id)
            driver.setAllConstraintsMet(second.id)
            assertTrue("Worker did not accept HTTPS event receipt",
                awaitWork(context, second.id, WorkInfo.State.SUCCEEDED))
            val accepted = runBlocking { db.outbox().recent(50).single { it.eventId == eventId } }
            assertEquals("sent", accepted.syncState)
            assertEquals(original.idempotencyKey, accepted.idempotencyKey)
            assertEquals(original.sequenceLocal, accepted.sequenceLocal)
            assertTrue("Actual rider UI failed to show this server receipt",
                until(scenario, """!document.getElementById('confirmedLine').hidden &&
                  document.getElementById('confirmedLine').textContent.includes('confirmação do servidor para 1 ação')"""))
            assertEquals("false", eval(scenario,
                """document.body.innerText.includes('LAB_PLATFORM_SESSION_NONPROD')"""))
            assertEquals("false", eval(scenario,
                """document.body.innerText.includes('pt1.labwrite.signedfixture')"""))
        }
    }
}
