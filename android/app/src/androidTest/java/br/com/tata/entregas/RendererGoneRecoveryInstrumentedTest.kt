package br.com.tata.entregas

import android.os.Build
import android.os.Process
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import br.com.tata.entregas.ui.MainActivity
import br.com.tata.entregas.ui.OriginLockedClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Morte do renderizador do WebView na `MainActivity` REAL, com o cliente de
 * produção — sem site de laboratório, sem cliente trocado.
 *
 * O renderizador é um processo à parte (`:sandboxed_process`). Quando ele
 * morre e nenhum cliente trata `onRenderProcessGone`, o WebView derruba o
 * processo do aplicativo: aborta se o renderizador quebrou, e se mata por
 * SIGKILL — sem exceção Java e sem tombstone — se o sistema o matou. Com o
 * aplicativo cai o serviço de captura da viagem, que vive no mesmo processo.
 *
 * Sem o tratamento, cada teste daqui termina em "Process crashed".
 */
@RunWith(AndroidJUnit4::class)
class RendererGoneRecoveryInstrumentedTest {

    private fun currentWeb(scenario: ActivityScenario<MainActivity>): WebView? {
        val found = AtomicReference<WebView?>()
        scenario.onActivity { a ->
            found.set(a.findViewById<ViewGroup>(android.R.id.content).getChildAt(0) as? WebView)
        }
        return found.get()
    }

    /** `null` quando o renderizador não responde — nunca uma falha por si só. */
    private fun eval(scenario: ActivityScenario<MainActivity>, js: String): String? {
        val value = AtomicReference<String?>()
        val latch = CountDownLatch(1)
        scenario.onActivity { a ->
            val web = a.findViewById<ViewGroup>(android.R.id.content).getChildAt(0) as? WebView
            if (web == null) latch.countDown()
            else web.evaluateJavascript(js) { value.set(it); latch.countDown() }
        }
        return if (latch.await(3, TimeUnit.SECONDS)) value.get() else null
    }

    private val riderUrl = BuildConfig.ENTREGAS_BASE_URL + "/rider-mobile/"

    /**
     * Um WebView na página do motoboy e com renderizador vivo. Sem servidor
     * de laboratório a página é a de erro de rede — o renderizador é o mesmo.
     */
    private fun awaitLiveWeb(
        scenario: ActivityScenario<MainActivity>,
        differentFrom: WebView? = null,
    ): WebView {
        repeat(100) {
            val web = currentWeb(scenario)
            val url = AtomicReference<String?>()
            if (web != null) scenario.onActivity { url.set(web.url) }
            if (web != null && web !== differentFrom && url.get() == riderUrl &&
                eval(scenario, "1+1") == "2" && currentWeb(scenario) === web) return web
            Thread.sleep(200)
        }
        throw AssertionError(
            if (differentFrom == null) "WEBVIEW_NEVER_BECAME_LIVE"
            else "DEAD_WEBVIEW_WAS_NOT_REPLACED_BY_A_LIVE_ONE_ON_THE_RIDER_PAGE",
        )
    }

    private fun survivesAndRecovers(kill: (WebView) -> Unit) {
        val pid = Process.myPid()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            val dead = awaitLiveWeb(scenario)
            scenario.onActivity { kill(dead) }

            // Chegar aqui já é metade da prova: o processo não caiu.
            val alive = awaitLiveWeb(scenario, differentFrom = dead)
            assertEquals("APP_PROCESS_WAS_REPLACED", pid, Process.myPid())

            // O morto saiu da tela; `alive` já provou que voltou para a página
            // do motoboy, e não para onde o morto estava.
            val client = AtomicReference<Any?>()
            val deadStillAttached = AtomicReference<Boolean>()
            scenario.onActivity {
                client.set(alive.webViewClient)
                deadStillAttached.set(dead.parent != null)
            }
            assertEquals("DEAD_WEBVIEW_STILL_ON_SCREEN", false, deadStillAttached.get())
            // A trava de origem acompanha o WebView novo — nunca um cliente frouxo.
            assertTrue(
                "RECOVERED_WEBVIEW_LOST_THE_ORIGIN_LOCK",
                client.get() is OriginLockedClient,
            )
            // A ponte crua continua lá, e continua recusando quem não tem a chave.
            assertEquals("\"object\"", eval(scenario, "typeof window.EntregasNativeRaw"))
        }
    }

    /** O renderizador QUEBROU (`didCrash() == true`). */
    @Test fun crashedRendererDoesNotTakeTheAppDown() =
        survivesAndRecovers { it.loadUrl("chrome://crash") }

    /**
     * O renderizador foi MORTO (`didCrash() == false`) — o mesmo caminho de
     * quando o sistema o mata por falta de memória.
     */
    @SdkSuppress(minSdkVersion = Build.VERSION_CODES.Q)
    @Test fun killedRendererDoesNotTakeTheAppDown() = survivesAndRecovers { web ->
        val renderer = web.webViewRenderProcess
            ?: throw AssertionError("RENDERER_PROCESS_NOT_AVAILABLE")
        assertTrue("RENDERER_TERMINATE_REFUSED", renderer.terminate())
    }
}
