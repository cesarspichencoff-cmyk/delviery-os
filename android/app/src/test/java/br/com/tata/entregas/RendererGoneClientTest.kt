package br.com.tata.entregas

import android.content.Context
import android.content.ContextWrapper
import android.webkit.WebView
import br.com.tata.entregas.ui.OriginLockedClient
import br.com.tata.entregas.ui.RendererGoneHost
import br.com.tata.entregas.ui.RendererReloadBackoff
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * A regra, sem aparelho: a morte do renderizador é SEMPRE tratada pelo
 * cliente travado, e quem hospeda o WebView recebe o morto e o mesmo cliente.
 * A prova de que o processo sobrevive é instrumentada
 * (`RendererGoneRecoveryInstrumentedTest`) — Robolectric não tem renderizador.
 */
@RunWith(RobolectricTestRunner::class)
class RendererGoneClientTest {

    private fun app(): Context = RuntimeEnvironment.getApplication()

    private class Host(base: Context) : ContextWrapper(base), RendererGoneHost {
        var dead: WebView? = null
        var client: OriginLockedClient? = null
        var calls = 0
        override fun onRendererGone(dead: WebView, client: OriginLockedClient) {
            this.dead = dead; this.client = client; calls++
        }
    }

    @Test fun rendererDeathIsHandledEvenWithoutAHost() {
        val client = OriginLockedClient("https://pilot.example")
        assertTrue(client.onRenderProcessGone(null, null))
        val orphan = WebView(app())
        assertTrue(client.onRenderProcessGone(orphan, null))
    }

    @Test fun hostReceivesTheDeadWebViewAndTheSameLockedClient() {
        val host = Host(app())
        val client = OriginLockedClient("https://pilot.example")
        val web = WebView(host)
        assertTrue(client.onRenderProcessGone(web, null))
        assertEquals(1, host.calls)
        assertSame(web, host.dead)
        assertSame(client, host.client)
    }

    @Test fun labClientInheritsTheHandlingAndCannotReplaceIt() {
        val host = Host(app())
        val lab = object : OriginLockedClient("https://10.0.2.2:5193") {}
        assertTrue(lab.onRenderProcessGone(WebView(host), null))
        assertSame(lab, host.client)
        val handler = OriginLockedClient::class.java.getMethod(
            "onRenderProcessGone", WebView::class.java,
            android.webkit.RenderProcessGoneDetail::class.java,
        )
        assertTrue(java.lang.reflect.Modifier.isFinal(handler.modifiers))
    }

    @Test fun aSingleDeathReloadsAtOnceAndAStreakBacksOffUpToACeiling() {
        val backoff = RendererReloadBackoff(quietMs = 60_000L)
        assertEquals(0L, backoff.nextDelayMs(1_000L))
        assertEquals(2_000L, backoff.nextDelayMs(2_000L))
        assertEquals(5_000L, backoff.nextDelayMs(10_000L))
        assertEquals(15_000L, backoff.nextDelayMs(20_000L))
        assertEquals(15_000L, backoff.nextDelayMs(30_000L))
        // Um minuto inteiro sem morrer zera a contagem.
        assertEquals(0L, backoff.nextDelayMs(90_000L))
    }
}
