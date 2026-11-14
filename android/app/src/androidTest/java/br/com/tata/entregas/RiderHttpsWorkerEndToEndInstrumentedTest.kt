package br.com.tata.entregas

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.ParcelFileDescriptor
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
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
import br.com.tata.entregas.ui.OriginLockedClient
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayInputStream
import java.util.UUID
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean
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
    private val tripId = "LAB_HTTPS_UI_TRIP_001"
    private val deliveryId = "LAB_HTTPS_UI_DELIVERY_001"

    // Herda do cliente de produção: a morte do renderizador é tratada igual.
    private class LabSite(private val context: Context) : OriginLockedClient(BuildConfig.ENTREGAS_BASE_URL) {
        val policiesServed = AtomicBoolean(false)
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
                "/api/policies" -> {
                    policiesServed.set(true)
                    return text("""{"flags":{"offline_queue_enabled":true,"gps_capture_enabled":false},"term":{"publishable":false}}""")
                }
                "/api/snapshot" -> return text("""{
                    "unit_id":"ITAIM",
                    "actor":{"actor_id":"rider-lab","role":"motoboy_interno"},
                    "connection":"online","pending_sync":0,"ready_orders":[],
                    "trips":[{
                      "trip_id":"LAB_HTTPS_UI_TRIP_001","state":"em_rota",
                      "courier_actor_id":"rider-lab",
                      "deliveries":[{"delivery_id":"LAB_HTTPS_UI_DELIVERY_001",
                      "order_ref":"LAB_HTTPS_UI_ORDER_001","state":"em_rota",
                      "active":true,"planned_stop_order":1}]
                    }]
                }""")
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

    /**
     * Com o WorkManager de teste o trabalho novo fica ENQUEUED até o driver
     * liberar. Com o WorkManager REAL e rede, ele pode já estar rodando ou
     * terminado quando é visto — `anyState` aceita isso.
     */
    private fun awaitNewWork(context: Context, before: Set<UUID>, anyState: Boolean = false): WorkInfo {
        repeat(65) {
            val found = allWork(context).firstOrNull {
                it.id !in before && (anyState || it.state == WorkInfo.State.ENQUEUED)
            }
            if (found != null) return found
            Thread.sleep(150)
        }
        throw AssertionError("LAB_WORK_NOT_ENQUEUED")
    }

    private fun awaitWork(context: Context, id: UUID, state: WorkInfo.State, tries: Int = 95): Boolean {
        repeat(tries) {
            if (allWork(context).any { it.id == id && it.state == state }) return true
            Thread.sleep(200)
        }
        return false
    }

    /** Qual cenário de laboratório esta execução pediu; ausente = o ponta a ponta de sempre. */
    private val labScenario: String? =
        InstrumentationRegistry.getArguments().getString("deliveryosLabScenario")

    private fun shell(command: String): String =
        ParcelFileDescriptor.AutoCloseInputStream(
            InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand(command),
        ).use { it.readBytes().toString(Charsets.UTF_8) }

    /** Rede de verdade, validada pelo sistema — o que a restrição CONNECTED do WorkManager exige. */
    private fun online(context: Context): Boolean {
        val cm = context.getSystemService(ConnectivityManager::class.java) ?: return false
        val caps = cm.getNetworkCapabilities(cm.activeNetwork ?: return false) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    private fun setAirplaneMode(context: Context, on: Boolean) {
        shell("cmd connectivity airplane-mode " + if (on) "enable" else "disable")
        repeat(150) {
            if (online(context) != on) return
            Thread.sleep(200)
        }
        throw AssertionError(if (on) "LAB_DEVICE_DID_NOT_GO_OFFLINE" else "LAB_NETWORK_DID_NOT_COME_BACK")
    }

    private fun currentWeb(activity: ActivityScenario<MainActivity>): WebView {
        val found = AtomicReference<WebView>()
        activity.onActivity { a ->
            found.set(a.findViewById<ViewGroup>(android.R.id.content).getChildAt(0) as WebView)
        }
        return found.get()
    }

    @Test fun realHttps422ThenReceiptPersistsSameEventAndIsShownOnActualRiderScreen() {
        assumeTrue("LAB_OTHER_SCENARIO_REQUESTED", labScenario == null)
        endToEnd()
    }

    /**
     * O renderizador do WebView morre com a ação já guardada no aparelho e
     * ainda não enviada. A fila Room e o WorkManager não dependem do WebView:
     * a tela é trocada, mostra de novo a ação guardada, e o mesmo evento segue
     * até o recibo — sem segunda ação, sem terceiro lote.
     */
    @Test fun rendererKilledWithActionQueuedStillSyncsTheSameEventAndShowsReceipt() {
        assumeTrue("LAB_SCENARIO_NOT_REQUESTED", labScenario == "renderer-death")
        endToEnd(killRendererAfterQueued = true)
    }

    /**
     * Ação tomada SEM rede (modo avião de verdade) e com o WorkManager REAL,
     * sem driver de teste: a ação fica guardada, nada é tentado enquanto não há
     * rede, e a volta da rede dispara o envio sozinha. A fixture confere, por
     * fora, exatamente dois lotes idênticos e um único recibo.
     */
    @Test fun actionTakenOfflineWaitsForTheNetworkAndIsNeverSentTwice() {
        assumeTrue("LAB_SCENARIO_NOT_REQUESTED", labScenario == "offline-reconnect")
        val context = ApplicationProvider.getApplicationContext<Context>()
        try {
            endToEnd(realNetworkConstraint = true)
        } finally {
            // Nunca deixar o emulador sem rede, nem quando o teste reprova.
            shell("cmd connectivity airplane-mode disable")
            var waited = 0
            while (!online(context) && waited++ < 100) Thread.sleep(200)
        }
    }

    private fun endToEnd(
        killRendererAfterQueued: Boolean = false,
        realNetworkConstraint: Boolean = false,
    ) {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = EntregasDatabase.get(context)
        // Sem driver de teste no cenário offline: quem segura e quem solta o
        // envio é a restrição de rede do WorkManager de produção.
        if (!realNetworkConstraint) WorkManagerTestInitHelper.initializeTestWorkManager(context)

        // A real action must originate in the rider UI; no pre-seeded Room
        // row, synthetic bridge invocation or direct DAO transition.
        assertTrue("LAB_QUEUE_NOT_EMPTY_BEFORE_HUMAN_ACTION", runBlocking {
            db.outbox().recent(50).isEmpty()
        })
        val testSite = LabSite(
            androidx.test.platform.app.InstrumentationRegistry
                .getInstrumentation().context,
        )
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { a ->
                val web = a.findViewById<ViewGroup>(android.R.id.content).getChildAt(0) as WebView
                web.webViewClient = testSite
                web.loadUrl("https://10.0.2.2:5193/rider-mobile/")
            }
            assertTrue("Real rider Cheguei button did not become available",
                until(scenario, """document.getElementById('compatibilityHold').hidden &&
                    !document.getElementById('btnSecondary').hidden &&
                    !document.getElementById('btnSecondary').disabled &&
                    document.getElementById('btnSecondary').textContent === 'Cheguei'"""))
            assertTrue("Rider did not retrieve offline queue policy",
                (0 until 50).any {
                    if (testSite.policiesServed.get()) true
                    else { Thread.sleep(100); false }
                })
            // Allow the asynchronous native policy application and render to
            // complete before the human UI action. No state is faked.
            Thread.sleep(500)
            assertEquals("false", eval(scenario,
                """!document.getElementById('confirmedLine').hidden"""))
            // A página já carregou (servida em memória); a partir daqui o
            // aparelho fica sem rede nenhuma.
            if (realNetworkConstraint) setAirplaneMode(context, on = true)
            // Trigger the ACTUAL button and rider.js actArrive() handler.
            // In contrast to direct native calls, this exercises trip scope,
            // unit, session actor, event identity and Room producer.
            assertEquals("true", eval(scenario,
                """document.getElementById('btnSecondary').click();true"""))
            var original: br.com.tata.entregas.data.OutboxEventEntity? = null
            for (attempt in 0 until 70) {
                original = runBlocking { db.outbox().recent(50).singleOrNull() }
                if (original != null) break
                Thread.sleep(100)
            }
            val staged = original ?: throw AssertionError(
                "REAL_RIDER_CHEGUEI_DID_NOT_RECORD_IN_ROOM: " +
                    eval(scenario, "document.getElementById('errorBox').textContent"),
            )
            val eventId = staged.eventId
            assertTrue("UI action ID must be generated, not a fixed fixture",
                eventId.startsWith("ev-"))
            assertEquals("pending", staged.syncState)
            assertEquals(eventId, staged.idempotencyKey)
            assertEquals(tripId, staged.tripId)
            assertEquals("RecordArrivalReported", staged.kind)
            val command = JSONObject(staged.payload)
            assertEquals("ITAIM", command.getString("unit_id"))
            assertEquals(tripId, command.getString("trip_id"))
            assertEquals(deliveryId, command.getString("delivery_id"))
            assertEquals("rider-lab", command.getJSONObject("actor").getString("actor_id"))
            assertEquals("motoboy_interno",
                command.getJSONObject("actor").getString("role"))
            if (!until(scenario, """!document.getElementById('pendingLine').hidden &&
                    document.getElementById('pendingLine').textContent.includes('guardada')""")) {
                // Sanitized DOM flags only: no command payload, event IDs,
                // coordinates, raw error text or server response. Preserve
                // the failing assertion instead of making the lab green.
                val flags = eval(scenario, """
                    (function(){
                      var p=document.getElementById('pendingLine');
                      var h=document.getElementById('queueHoldLine');
                      var e=document.getElementById('errorBox');
                      return JSON.stringify({
                        pending_visible:!!p&&!p.hidden,
                        local_notice:!!p&&p.textContent.includes('guardada'),
                        queue_hold:!!h&&!h.hidden,
                        ui_error:!!e&&!!e.textContent.trim(),
                        page_visible:document.visibilityState==='visible'
                      });
                    })()
                """.trimIndent())
                throw AssertionError("LAB_REAL_RIDER_LOCAL_QUEUE_DISPLAY_NOT_PROVEN " + flags)
            }
            assertEquals("false", eval(scenario,
                """!document.getElementById('confirmedLine').hidden"""))
            val originalEntity = staged
            if (killRendererAfterQueued) {
                val dead = currentWeb(scenario)
                scenario.onActivity {
                    assertTrue("LAB_RENDERER_TERMINATE_REFUSED",
                        dead.webViewRenderProcess?.terminate() == true)
                }
                // Esperar a TROCA antes de qualquer JavaScript: um eval no
                // WebView morto nunca responde.
                assertTrue("LAB_DEAD_WEBVIEW_NOT_REPLACED", (0 until 100).any {
                    if (currentWeb(scenario) !== dead) true else { Thread.sleep(100); false }
                })
                assertTrue("LAB_RELOADED_RIDER_DID_NOT_SHOW_THE_QUEUED_ACTION",
                    until(scenario, """document.getElementById('compatibilityHold').hidden &&
                        !document.getElementById('pendingLine').hidden &&
                        document.getElementById('pendingLine').textContent.includes('guardada')"""))
                val survivor = runBlocking { db.outbox().recent(50).single() }
                assertEquals(eventId, survivor.eventId)
                assertEquals("pending", survivor.syncState)
                assertEquals(staged.sequenceLocal, survivor.sequenceLocal)
            }
            // A REAL native producer already calls SyncScheduler.requestNow()
            // as soon as it records an event. ExistingWorkPolicy.KEEP must
            // prevent an extra job; no human retry button is required yet.
            val first = awaitNewWork(context, emptySet())
            assertEquals("An automatic initial sync must be queued",
                WorkInfo.State.ENQUEUED, first.state)
            val driver = if (realNetworkConstraint) null
                else WorkManagerTestInitHelper.getTestDriver(context)
                    ?: throw AssertionError("LAB_TEST_DRIVER_MISSING")
            if (realNetworkConstraint) {
                // Sem rede, NADA é tentado: o trabalho espera, a ação continua
                // pendente e sem tentativa contada — por 6 s seguidos.
                repeat(12) {
                    assertFalse("LAB_DEVICE_ONLINE_DURING_OFFLINE_WINDOW", online(context))
                    val held = runBlocking { db.outbox().recent(50).single() }
                    assertEquals("LAB_OFFLINE_ACTION_LEFT_PENDING", "pending", held.syncState)
                    assertEquals("LAB_SYNC_ATTEMPTED_WITHOUT_NETWORK", 0, held.attempts)
                    assertEquals("LAB_WORK_RAN_WITHOUT_NETWORK", listOf(WorkInfo.State.ENQUEUED),
                        allWork(context).map { it.state })
                    Thread.sleep(500)
                }
                // A volta da rede é o único gatilho: ninguém toca em botão.
                setAirplaneMode(context, on = false)
            } else {
                driver!!.setAllConstraintsMet(first.id)
            }
            assertTrue("HTTP 422 without event receipt must fail worker",
                awaitWork(context, first.id, WorkInfo.State.FAILED,
                    tries = if (realNetworkConstraint) 300 else 95))
            val notAccepted = runBlocking { db.outbox().recent(50).single { it.eventId == eventId } }
            assertEquals("failed", notAccepted.syncState)
            assertEquals(originalEntity.sequenceLocal, notAccepted.sequenceLocal)
            assertEquals(originalEntity.idempotencyKey, notAccepted.idempotencyKey)
            assertTrue("UI showed ACK before server receipt",
                until(scenario, """document.getElementById('pendingLine').textContent.includes('sem confirmação do servidor') &&
                    document.getElementById('confirmedLine').hidden"""))

            val seen = allWork(context).map { it.id }.toSet()
            eval(scenario, """document.getElementById('btnSyncNow').click();true""")
            val second = awaitNewWork(context, seen, anyState = realNetworkConstraint)
            assertFalse("LAB_RETRY_NOT_FRESH_WORK", first.id == second.id)
            driver?.setAllConstraintsMet(second.id)
            assertTrue("Worker did not accept HTTPS event receipt",
                awaitWork(context, second.id, WorkInfo.State.SUCCEEDED,
                    tries = if (realNetworkConstraint) 300 else 95))
            val accepted = runBlocking { db.outbox().recent(50).single { it.eventId == eventId } }
            assertEquals("sent", accepted.syncState)
            assertEquals(originalEntity.idempotencyKey, accepted.idempotencyKey)
            assertEquals(originalEntity.sequenceLocal, accepted.sequenceLocal)
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
