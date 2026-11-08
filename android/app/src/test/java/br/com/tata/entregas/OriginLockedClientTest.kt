package br.com.tata.entregas

import android.net.Uri
import android.webkit.WebResourceRequest
import br.com.tata.entregas.ui.OriginLockedClient
import io.mockk.every
import io.mockk.mockk
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Security regression in a disposable Robolectric process.
 * No Android device, WebView page, credentials or pilot connection is opened.
 * The native JS bridge must never follow a navigation to another origin.
 */
@RunWith(RobolectricTestRunner::class)
class OriginLockedClientTest {
    private fun wouldBlock(client: OriginLockedClient, url: String): Boolean {
        val request = mockk<WebResourceRequest>()
        every { request.url } returns Uri.parse(url)
        return client.shouldOverrideUrlLoading(null, request)
    }

    @Test fun sameHttpsOriginAllowsPageAndApiPaths() {
        val client = OriginLockedClient("https://pilot.example")
        assertFalse(wouldBlock(client, "https://pilot.example/rider-mobile/"))
        assertFalse(wouldBlock(client, "https://PILOT.EXAMPLE/api/session?test=lab"))
        assertFalse(wouldBlock(client, "https://pilot.example:443/rider-mobile/"))
    }

    @Test fun changedProtocolIsBlockedEvenWithSameHost() {
        val client = OriginLockedClient("https://pilot.example")
        assertTrue(wouldBlock(client, "http://pilot.example/rider-mobile/"))
        assertTrue(wouldBlock(client, "javascript:alert(1)"))
        assertTrue(wouldBlock(client, "file:///android_asset/index.html"))
    }

    @Test fun changedPortIsBlockedEvenWithSameHost() {
        val client = OriginLockedClient("https://pilot.example")
        assertTrue(wouldBlock(client, "https://pilot.example:444/rider-mobile/"))
        assertTrue(wouldBlock(client, "https://pilot.example:8080/rider-mobile/"))
    }

    @Test fun otherHostAndLookalikeHostAreBlocked() {
        val client = OriginLockedClient("https://pilot.example")
        assertTrue(wouldBlock(client, "https://pilot.example.evil.test/rider-mobile/"))
        assertTrue(wouldBlock(client, "https://evil.test/rider-mobile/"))
        assertTrue(wouldBlock(client, "https://pilot.example@evil.test/rider-mobile/"))
    }

    @Test fun userInfoAndMissingRequestAreBlocked() {
        val client = OriginLockedClient("https://pilot.example")
        assertTrue(wouldBlock(client, "https://user@pilot.example/rider-mobile/"))
        assertTrue(client.shouldOverrideUrlLoading(null, null))
    }

    @Test fun explicitPilotPortKeepsOnlyThatOrigin() {
        val client = OriginLockedClient("https://pilot.example:8443")
        assertFalse(wouldBlock(client, "https://pilot.example:8443/rider-mobile/"))
        assertTrue(wouldBlock(client, "https://pilot.example/rider-mobile/"))
        assertTrue(wouldBlock(client, "https://pilot.example:443/rider-mobile/"))
    }

    @Test fun debugHttpIsRestrictedToItsExactConfiguredOrigin() {
        val client = OriginLockedClient("http://10.0.2.2:5193")
        assertFalse(wouldBlock(client, "http://10.0.2.2:5193/rider-mobile/"))
        assertTrue(wouldBlock(client, "https://10.0.2.2:5193/rider-mobile/"))
        assertTrue(wouldBlock(client, "http://10.0.2.2:5194/rider-mobile/"))
    }
}
