package br.com.tata.entregas

import android.webkit.JavascriptInterface
import br.com.tata.entregas.bridge.Bridge
import br.com.tata.entregas.bridge.EntregasJsBridge
import br.com.tata.entregas.bridge.OriginBoundNativeBridge
import org.json.JSONObject
import org.json.JSONTokener
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Native bridge security regression, with NO WebView network activity.
 * E2E hostile-frame behavior is independently tested on the real emulator.
 */
@RunWith(RobolectricTestRunner::class)
class OriginBoundNativeBridgeTest {
    private class Recorder : EntregasJsBridge.NativeActions {
        var effects = 0
        override fun startTripCapture(tripId: String) { effects++ }
        override fun stopTripCapture() { effects++ }
        override fun capabilitiesJson(): String { effects++; return """{"ok":true}""" }
        override fun statusJson(): String { effects++; return """{"ok":true}""" }
        override fun requestLocationPermission() { effects++ }
        override fun openAppSettings() { effects++ }
        override fun recordTermAcknowledgement(json: String): String {
            effects++; return """{"ok":true}"""
        }
        override fun receiptJson(acknowledgementId: String): String {
            effects++; return """{"ok":true}"""
        }
        override fun requestSyncNow() { effects++ }
        override fun applyServerPoliciesJson(json: String): String {
            effects++; return """{"ok":true}"""
        }
        override fun recordOperationalEventJson(json: String): String {
            effects++; return """{"ok":true}"""
        }
        override fun operationalEventsJson(): String {
            effects++; return """{"ok":true}"""
        }
    }

    @Test fun originRulesAllowOnlyExactConfiguredSchemeHostAndPort() {
        assertEquals("https://pilot.example", OriginBoundNativeBridge.expectedOrigin("https://PILOT.EXAMPLE"))
        assertEquals("https://pilot.example", OriginBoundNativeBridge.expectedOrigin("https://pilot.example:443/"))
        assertEquals("https://10.0.2.2:5193", OriginBoundNativeBridge.expectedOrigin("https://10.0.2.2:5193"))
        assertEquals("http://10.0.2.2:5193", OriginBoundNativeBridge.expectedOrigin("http://10.0.2.2:5193"))
        assertEquals(null, OriginBoundNativeBridge.expectedOrigin("file:///tmp/page.html"))
        assertEquals(null, OriginBoundNativeBridge.expectedOrigin("https://alice@pilot.example"))
    }

    @Test fun randomCapabilityIsPerInstanceAndDoesNotUseFieldIdentity() {
        val a = OriginBoundNativeBridge.newCapability()
        val b = OriginBoundNativeBridge.newCapability()
        assertTrue(a.matches(Regex("[0-9a-f]{64}")))
        assertTrue(b.matches(Regex("[0-9a-f]{64}")))
        assertNotEquals(a, b)
    }

    @Test fun allAnnotatedMethodsRequireCapabilityBeforeAnyNativeEffect() {
        val calls = EntregasJsBridge::class.java.declaredMethods
            .filter { it.getAnnotation(JavascriptInterface::class.java) != null }
        val expectedNames = setOf(
            "version", "startTripCapture", "stopTripCapture", "capabilities",
            "status", "requestLocationPermission", "openAppSettings",
            "recordTermAcknowledgement", "receipt", "syncNow",
            "applyServerPolicies", "recordOperationalEvent", "operationalEvents",
        )
        assertEquals(expectedNames, calls.map { it.name }.toSet())
        assertEquals(expectedNames.size, calls.size)
        assertTrue(calls.all { it.parameterTypes.firstOrNull() == String::class.java })

        val recorder = Recorder()
        val secret = OriginBoundNativeBridge.newCapability()
        val raw = EntregasJsBridge(recorder, secret)
        assertEquals("native_origin_denied", raw.version("spoof"))
        raw.startTripCapture("spoof", "LAB_TRIP")
        raw.stopTripCapture(null)
        assertTrue(raw.capabilities("spoof").contains("native_origin_denied"))
        assertTrue(raw.status(null).contains("native_origin_denied"))
        raw.requestLocationPermission("spoof")
        raw.openAppSettings("spoof")
        assertTrue(raw.recordTermAcknowledgement("spoof", "{}").contains("native_origin_denied"))
        assertTrue(raw.receipt("spoof", "LAB_ACK").contains("native_origin_denied"))
        raw.syncNow(null)
        assertTrue(raw.applyServerPolicies("spoof", "{}").contains("native_origin_denied"))
        assertTrue(raw.recordOperationalEvent("spoof", "{}").contains("native_origin_denied"))
        assertTrue(raw.operationalEvents("spoof").contains("native_origin_denied"))
        assertEquals(0, recorder.effects)

        assertEquals("android-bridge@1.0.0", raw.version(secret))
        assertEquals("""{"ok":true}""", raw.recordOperationalEvent(secret, "{}"))
        assertEquals(1, recorder.effects)
    }

    @Test fun nativeMessageUsesOneCompleteQuotedLiteralEvenWithRepeatedHostileCharacters() {
        // Synthetic only. These characters must remain DATA in a JSON string,
        // never terminate the WebView evaluateJavascript() call.
        val detail = "primeira ' segunda ' \\\\ e \\\\ duplo \\" \nlinha"
        val message = JSONObject().put("type", "error").put("detail", detail)
        val script = Bridge.messageDispatchScript(message)
        val prefix = "window.__entregasNativeMessage && window.__entregasNativeMessage("
        assertTrue(script.startsWith(prefix))
        assertTrue(script.endsWith(")"))
        val literal = script.removePrefix(prefix).dropLast(1)
        assertTrue(literal.startsWith("\\""))
        assertTrue(literal.endsWith("\\""))
        assertEquals(message.toString(), JSONTokener(literal).nextValue())
        // Control: two apostrophes and repeated backslashes survive decoding.
        val restored = JSONObject(JSONTokener(literal).nextValue() as String)
        assertEquals(detail, restored.getString("detail"))
    }

    @Test fun bootstrapCannotExposeCapabilityAsAWindowGlobalOrToChildFrames() {
        val script = OriginBoundNativeBridge.documentStartScript(
            "https://pilot.example", "LAB_64_CHARS_NONPUBLIC_RANDOM_CAPABILITY",
        )
        assertTrue(script.contains("window !== window.top"))
        // Android JSON quoting may escape forward slashes as \\/; the
        // contract is the literal exact-origin/path comparison, not spelling.
        assertTrue(script.contains("location.origin !== "))
        assertTrue(script.contains("pilot.example"))
        assertTrue(script.contains("location.pathname.indexOf("))
        assertTrue(script.contains("rider-mobile"))
        assertTrue(script.contains("Object.defineProperty(window, \"EntregasNative\""))
        assertTrue(script.contains("var secret ="))
        assertFalse(script.contains("window.secret"))
        assertFalse(script.contains("window.__nativeToken"))
        assertFalse(script.contains("eval("))
    }
}
