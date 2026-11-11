package br.com.tata.entregas.bridge

import android.net.Uri
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.security.SecureRandom

/**
 * One WebView instance, one random 256-bit native capability.
 *
 * Android addJavascriptInterface is exposed in every frame, including opaque
 * sandboxed and cross-origin iframes. The raw Java interface never accepts
 * calls without this capability. Only an exact-origin TOP-LEVEL document can
 * obtain the public facade via document-start injection.
 *
 * No fallback to the unsafe global bridge if document-start is unavailable.
 * An unsupported WebView stays on the rider compatibility HOLD.
 */
internal object OriginBoundNativeBridge {

    fun newCapability(): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }

    /** Exact origin, no wildcard, user info or alternate port. */
    internal fun expectedOrigin(baseUrl: String): String? {
        val uri = Uri.parse(baseUrl)
        val scheme = uri.scheme?.lowercase() ?: return null
        val host = uri.host?.lowercase() ?: return null
        if (scheme !in setOf("http", "https") || host.isBlank() || uri.userInfo != null) return null
        val defaultPort = if (scheme == "https") 443 else 80
        val port = if (uri.port >= 0) uri.port else defaultPort
        if (port !in 1..65535) return null
        return "$scheme://$host" + (if (port == defaultPort) "" else ":$port")
    }

    /**
     * Native -> JavaScript messages may include location or session state.
     * A same-origin /console page is NOT the rider UI. Check the top-level
     * WebView URL at dispatch time (not when message was queued) so navigation
     * cannot carry rider updates into another document.
     *
     * Only the two exact rider HTML entry paths are eligible; encoded and
     * traversal paths fail closed, even when they share the allowed origin.
     */
    internal fun isAuthorizedRiderDocument(url: String?, baseUrl: String): Boolean {
        if (url.isNullOrBlank()) return false
        val origin = expectedOrigin(baseUrl) ?: return false
        if (expectedOrigin(url) != origin) return false
        val path = runCatching { Uri.parse(url).encodedPath }.getOrNull() ?: return false
        return path == "/rider-mobile/" || path == "/rider-mobile/index.html"
    }

    /**
     * Injected before the document's own JavaScript.
     * Only /rider-mobile/ TOP-LEVEL HTML is authorized; foreign frames,
     * about:blank, data: and other paths get no privileged facade.
     * The capability is closure-local, never a global property.
     */
    internal fun documentStartScript(origin: String, capability: String): String {
        val expectedOrigin = JSONObject.quote(origin)
        val quotedCapability = JSONObject.quote(capability)
        return """
            (function () {
              "use strict";
              if (window !== window.top || location.origin !== $expectedOrigin ||
                  location.pathname.indexOf("/rider-mobile/") !== 0) return;
              var raw = window.EntregasNativeRaw;
              if (!raw || typeof raw.version !== "function") return;
              var secret = $quotedCapability;
              var facade = {
                version: function () { return raw.version(secret); },
                startTripCapture: function (id) { return raw.startTripCapture(secret, String(id)); },
                stopTripCapture: function () { return raw.stopTripCapture(secret); },
                capabilities: function () { return raw.capabilities(secret); },
                status: function () { return raw.status(secret); },
                requestLocationPermission: function () { return raw.requestLocationPermission(secret); },
                openAppSettings: function () { return raw.openAppSettings(secret); },
                recordTermAcknowledgement: function (json) {
                  return raw.recordTermAcknowledgement(secret, String(json));
                },
                receipt: function (id) { return raw.receipt(secret, String(id)); },
                syncNow: function () { return raw.syncNow(secret); },
                applyServerPolicies: function (json) {
                  return raw.applyServerPolicies(secret, String(json));
                },
                recordOperationalEvent: function (json) {
                  return raw.recordOperationalEvent(secret, String(json));
                },
                operationalEvents: function () { return raw.operationalEvents(secret); }
              };
              Object.defineProperty(window, "EntregasNative", {
                value: Object.freeze(facade),
                enumerable: false,
                writable: false,
                configurable: false
              });
            })();
        """.trimIndent()
    }

    /** Call on UI thread before navigation. Unsupported => public API absent. */
    fun install(web: WebView, baseUrl: String, capability: String): Boolean {
        val origin = expectedOrigin(baseUrl) ?: return false
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return false
        return try {
            WebViewCompat.addDocumentStartJavaScript(
                web,
                documentStartScript(origin, capability),
                setOf(origin),
            )
            true
        } catch (_: UnsupportedOperationException) {
            false
        }
    }
}
