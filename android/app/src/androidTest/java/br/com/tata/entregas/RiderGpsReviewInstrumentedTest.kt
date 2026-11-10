package br.com.tata.entregas

import android.content.Context
import android.graphics.Bitmap
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.testing.WorkManagerTestInitHelper
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.GpsPointEntity
import br.com.tata.entregas.sync.ApiResult
import br.com.tata.entregas.sync.applyGpsBatchResponse
import br.com.tata.entregas.sync.drainGpsQueue
import br.com.tata.entregas.ui.MainActivity
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Android API 34 ONLY: actual packaged rider HTML/CSS/JS + origin-bound native
 * status() + persistent Room GPS outbox, with fully fictitious lab points.
 * WorkManager is test-only; NO worker, GPS sensor, HTTP, real user or server.
 * The mock batch responses exercise the exact production GPS receipt function.
 * Relaunch proves Activity recreation, NOT Android process-death recovery.
 */
@RunWith(AndroidJUnit4::class)
class RiderGpsReviewInstrumentedTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val labOrigin = "https://10.0.2.2:5193"
    private val heldId = "LAB_REVIEW_POINT_422_001"
    private val freshId = "LAB_FRESH_POINT_001"

    private class LabSite(private val context: Context) : WebViewClient() {
        private fun response(data: String, mime: String = "application/json") =
            WebResourceResponse(mime, "UTF-8",
                ByteArrayInputStream(data.toByteArray(Charsets.UTF_8)))

        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
            val uri = request?.url ?: return true
            return uri.scheme != "https" || uri.host != "10.0.2.2" || uri.port != 5193
        }

        override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse {
            val uri = request?.url
            if (uri?.scheme == "https" && uri.host == "fonts.googleapis.com")
                return response("", "text/css")
            if (uri?.scheme != "https" || uri.host != "10.0.2.2" || uri.port != 5193)
                return response("LAB_DENIED", "text/plain")
            val path = uri.path ?: "/"
            when (path) {
                "/api/session" -> return response("""{"actor":{"actor_id":"lab-rider","role":"motoboy_interno"}}""")
                "/api/policies" -> return response("""{"flags":{"offline_queue_enabled":true,"gps_capture_enabled":false},"term":{"publishable":false}}""")
                "/api/snapshot" -> return response("""{"unit_id":"ITAIM","actor":{"actor_id":"lab-rider","role":"motoboy_interno"},"connection":"online","pending_sync":0,"ready_orders":[],"trips":[]}""")
            }
            if (path.startsWith("/api/") || !Regex("^/[A-Za-z0-9_./-]+$").matches(path) ||
                path.contains("..")) return response("LAB_ROUTE_DENIED", "text/plain")
            val asset = path.removePrefix("/").let { if (it.endsWith("/")) it + "index.html" else it }
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
                response("LAB_MISSING_ASSET", "text/plain")
            }
        }
    }

    private fun point(id: String, sequence: Long) = GpsPointEntity(
        pointId = id,
        idempotencyKey = "idem-$id",
        tripId = "LAB_TRIP_ITAIM",
        deviceId = "LAB_DEVICE",
        latitude = 0.0,
        longitude = 0.0,
        accuracyM = 1.0,
        speedMps = null,
        headingDeg = null,
        altitudeM = null,
        occurredAt = "2026-11-10T08:00:00Z",
        elapsedRealtimeNanos = sequence,
        provider = "lab-fixture",
        isMock = true,
        capturedOffline = true,
        sequenceLocal = sequence,
        syncState = "pending",
        attempts = 0,
        lastError = null,
        createdAtMs = 1_000L,
    )

    private fun eval(scenario: ActivityScenario<MainActivity>, code: String): String {
        val result = AtomicReference<String>()
        val latch = CountDownLatch(1)
        scenario.onActivity { activity ->
            val web = (activity.findViewById<ViewGroup>(android.R.id.content))
                .getChildAt(0) as WebView
            web.evaluateJavascript(code) { value ->
                result.set(value)
                latch.countDown()
            }
        }
        assertTrue("LAB_GPS_REVIEW_JS_TIMEOUT", latch.await(15, TimeUnit.SECONDS))
        return result.get() ?: "null"
    }

    private fun until(scenario: ActivityScenario<MainActivity>, predicate: String): Boolean {
        repeat(65) {
            if (eval(scenario, predicate) == "true") return true
            Thread.sleep(200)
        }
        return false
    }

    private fun visibleNoticeScript() = """
        (function(){
          var el = document.getElementById('gpsReviewLine');
          if (!el || el.hidden || el.getAttribute('role') !== 'alert') return false;
          var style = window.getComputedStyle(el);
          var rect = el.getBoundingClientRect();
          return style.display !== 'none' && style.visibility === 'visible' &&
            rect.width > 15 && rect.height > 15 &&
            el.textContent.indexOf('1 registro de GPS guardado para revisão') >= 0 &&
            el.textContent.indexOf('envio automático') >= 0 &&
            el.textContent.indexOf('suspenso') >= 0 &&
            !document.body.innerText.includes('LAB_REMOTE_SECRET');
        })()
    """.trimIndent()

    private fun loadRealRider(): ActivityScenario<MainActivity> {
        val scenario = ActivityScenario.launch(MainActivity::class.java)
        scenario.onActivity { activity ->
            val web = (activity.findViewById<ViewGroup>(android.R.id.content))
                .getChildAt(0) as WebView
            // Same interception pattern as RiderRealScreenInstrumentedTest.
            // No external endpoint can return an HTTP response for this test.
            web.webViewClient = LabSite(instrumentation.context)
            web.loadUrl("$labOrigin/rider-mobile/")
        }
        return scenario
    }

    private fun screenshotOfHeldNotice(scenario: ActivityScenario<MainActivity>, context: Context) {
        assertEquals("true", eval(scenario, """
            (function(){
              var e=document.getElementById('gpsReviewLine');
              e.scrollIntoView({block:'center'});
              return true;
            })()
        """.trimIndent()))
        assertTrue("LAB_GPS_NOTICE_NOT_VISIBLE_AFTER_SCROLL",
            until(scenario, visibleNoticeScript()))
        // Screenshot is confined to this throwaway emulator. Lab identities only.
        val shot = instrumentation.uiAutomation.takeScreenshot()
            ?: throw AssertionError("LAB_GPS_REVIEW_SCREENSHOT_UNAVAILABLE")
        try {
            assertTrue("LAB_GPS_REVIEW_SCREENSHOT_EMPTY", shot.width > 100 && shot.height > 100)
            val dest = File(context.getExternalFilesDir(null), "gps-review-hold-lab.png")
            FileOutputStream(dest).use { output ->
                assertTrue("LAB_GPS_REVIEW_SCREENSHOT_WRITE_FAILED",
                    shot.compress(Bitmap.CompressFormat.PNG, 100, output))
            }
            assertTrue("LAB_GPS_REVIEW_SCREENSHOT_MISSING", dest.length() > 1_024)
        } finally {
            shot.recycle()
        }
    }

    @Test fun heldGpsIsVisibleAfterThreeUnreceiptedResponsesAndActivityRelaunch() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        WorkManagerTestInitHelper.initializeTestWorkManager(context)
        val db = EntregasDatabase.get(context)
        val original = point(heldId, 1001L)

        runBlocking {
            db.gpsPoints().insert(original)
            // No network: each fake 422 is classified through the REAL Kotlin
            // GPS batch handler, and persists an increment in SQLite Room.
            repeat(3) {
                val eligible = db.gpsPoints().nextBatch(10)
                assertEquals(listOf(heldId), eligible.map { it.pointId })
                val outcome = applyGpsBatchResponse(db, eligible,
                    ApiResult.Rejected("LAB_REMOTE_SECRET", 422))
                assertTrue(outcome.unreceiptedBatchBlocked)
            }
            val held = db.gpsPoints().reviewRequiredPoints(10).single()
            assertEquals(original.pointId, held.pointId)
            assertEquals(original.idempotencyKey, held.idempotencyKey)
            assertEquals(original.sequenceLocal, held.sequenceLocal)
            assertEquals(3, held.attempts)
            assertEquals("failed", held.syncState)
            assertEquals(1, db.gpsPoints().reviewRequiredCount())
            assertEquals(1, db.gpsPoints().pendingCount())
            assertTrue(db.gpsPoints().nextBatch(10).isEmpty())

            var blockedReplays = 0
            drainGpsQueue(db) {
                blockedReplays++
                ApiResult.Rejected("LAB_SHOULD_NEVER_SEND_HELD", 422)
            }
            assertEquals("Held GPS cannot be resent by normal drain", 0, blockedReplays)
        }

        loadRealRider().use { scenario ->
            assertTrue("LAB_REAL_WEBVIEW_GPS_HOLD_NOT_RENDERED", until(scenario, visibleNoticeScript()))
            assertEquals("true", eval(scenario, """
                (function(){
                  var s=window.EntregasNative && JSON.parse(window.EntregasNative.status());
                  return !!s && s.gps_review_required_points===1 && s.pending_points===1 &&
                    document.getElementById('gpsReviewLine').textContent.indexOf('LAB_REMOTE_SECRET') < 0 &&
                    document.getElementById('gpsReviewLine').querySelector('button')===null;
                })()
            """.trimIndent()))
            screenshotOfHeldNotice(scenario, context)
        }

        runBlocking {
            db.gpsPoints().insert(point(freshId, 1002L))
            val observed = mutableListOf<List<String>>()
            val outcome = drainGpsQueue(db) { batch ->
                observed.add(batch.map { it.pointId })
                ApiResult.Ok(JSONObject().apply {
                    put("accepted", batch.size)
                    put("duplicate", 0)
                    put("rejected", 0)
                })
            }
            assertEquals(listOf(listOf(freshId)), observed)
            assertEquals(false, outcome.retryable)
            assertEquals(1, db.gpsPoints().reviewRequiredCount())
            assertEquals(1, db.gpsPoints().pendingCount())
            assertTrue(db.gpsPoints().nextBatch(10).isEmpty())
            val preserved = db.gpsPoints().reviewRequiredPoints(10).single()
            assertEquals(original.idempotencyKey, preserved.idempotencyKey)
            assertEquals(3, preserved.attempts)
        }

        // Activity closed and relaunched, not merely DOM refresh. Room persists.
        loadRealRider().use { reopened ->
            assertTrue("LAB_RELAUNCHED_WEBVIEW_LOST_GPS_HOLD",
                until(reopened, visibleNoticeScript()))
            assertEquals("true", eval(reopened, """
                (function(){
                  var s=window.EntregasNative && JSON.parse(window.EntregasNative.status());
                  return !!s && s.gps_review_required_points===1 && s.pending_points===1 &&
                    document.getElementById('gpsReviewLine').getAttribute('role')==='alert' &&
                    document.getElementById('gpsReviewLine').querySelector('button')===null;
                })()
            """.trimIndent()))
        }
    }
}
