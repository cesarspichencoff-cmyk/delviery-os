package br.com.tata.entregas.bridge

import android.webkit.JavascriptInterface
import android.webkit.WebView
import br.com.tata.entregas.location.GateDecision
import br.com.tata.entregas.location.CanonicalGpsPoint
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.security.MessageDigest

/**
 * Ponte Kotlin <-> interface.
 *
 * Do lado JavaScript, quem consome isto é o `AndroidBridgeProvider` que já
 * existe em `src/entregas/gps/android-bridge.ts`. As mensagens saem exatamente
 * no formato `AndroidBridgeMessage` — o contrato não é reinventado aqui.
 *
 * O que a ponte NÃO faz, e é o ponto principal: ela não decide nada de
 * domínio. Não valida transição, não confirma entrega, não fecha viagem. A
 * interface pede, o Kotlin captura e persiste, e quem julga é o servidor.
 */
object Bridge {

    const val JS_INTERFACE_NAME = "EntregasNative"
    const val RAW_JS_INTERFACE_NAME = "EntregasNativeRaw"
    const val BRIDGE_VERSION = "android-bridge@1.0.0"

    private var webViewRef: WeakReference<WebView>? = null

    fun attach(webView: WebView) {
        webViewRef = WeakReference(webView)
    }

    fun detach() {
        webViewRef = null
    }

    /** Entrega a mensagem ao JS na thread da interface. */
    private fun post(message: JSONObject) {
        val web = webViewRef?.get() ?: return
        val payload = message.toString().replace("\\", "\\\\").replace("'", "\\'")
        web.post {
            web.evaluateJavascript(
                "window.__entregasNativeMessage && window.__entregasNativeMessage('$payload')",
                null,
            )
        }
    }

    fun publishLocation(point: CanonicalGpsPoint, timeMs: Long) {
        post(point.toBridgeMessage(timeMs))
    }

    fun publishServiceState(state: JSONObject) {
        post(state)
    }

    fun publishStopped(reason: String) {
        post(
            JSONObject().apply {
                put("type", "service_state")
                put("foreground_service_running", false)
                put("notification_visible", false)
                put("bound_trip_id", JSONObject.NULL)
                put("stop_reason", reason)
            },
        )
    }

    /**
     * Portão bloqueado. Vai como erro estruturado com o motivo canônico —
     * a interface mostra a frase, não inventa uma.
     */
    fun publishGateBlocked(decision: GateDecision) {
        post(
            JSONObject().apply {
                put("type", "error")
                put(
                    "error",
                    when (decision.primaryBlock?.code) {
                        "permission_denied", "permission_missing", "permission_revoked" -> "permission_denied"
                        "no_active_trip" -> "no_active_trip"
                        "capture_disabled" -> "capture_disabled"
                        else -> "not_supported"
                    },
                )
                put("detail", decision.message)
                put("block", decision.primaryBlock?.code ?: "desconhecido")
                put("blocks", decision.blocks.joinToString(",") { it.code })
            },
        )
    }
}

/**
 * Raw JNI interface is visible to EVERY iframe by Android design. Therefore
 * EVERY @JavascriptInterface method must verify the caller's ephemeral
 * 256-bit capability before performing actions or disclosing data.
 *
 * Only the top-level exact-origin document obtains the public facade through
 * an AndroidX WebKit document-start script. No unguarded legacy fallback.
 */
class EntregasJsBridge(
    private val handler: NativeActions,
    capability: String,
) {
    private val expected = capability.toByteArray(Charsets.UTF_8)

    interface NativeActions {
        fun startTripCapture(tripId: String)
        fun stopTripCapture()
        fun capabilitiesJson(): String
        fun statusJson(): String
        fun requestLocationPermission()
        fun openAppSettings()
        fun recordTermAcknowledgement(json: String): String
        fun receiptJson(acknowledgementId: String): String
        fun requestSyncNow()
        fun applyServerPoliciesJson(json: String): String
        fun recordOperationalEventJson(json: String): String
        fun operationalEventsJson(): String
    }

    private fun authorized(proof: String?): Boolean =
        proof != null && MessageDigest.isEqual(expected, proof.toByteArray(Charsets.UTF_8))

    private fun deniedJson(): String = """{"ok":false,"error":"native_origin_denied"}"""

    @JavascriptInterface
    fun version(proof: String?): String =
        if (authorized(proof)) Bridge.BRIDGE_VERSION else "native_origin_denied"

    @JavascriptInterface
    fun startTripCapture(proof: String?, tripId: String?) {
        if (!authorized(proof) || tripId.isNullOrBlank()) return
        handler.startTripCapture(tripId)
    }

    @JavascriptInterface
    fun stopTripCapture(proof: String?) {
        if (authorized(proof)) handler.stopTripCapture()
    }

    @JavascriptInterface
    fun capabilities(proof: String?): String =
        if (authorized(proof)) handler.capabilitiesJson() else deniedJson()

    @JavascriptInterface
    fun status(proof: String?): String =
        if (authorized(proof)) handler.statusJson() else deniedJson()

    @JavascriptInterface
    fun requestLocationPermission(proof: String?) {
        if (authorized(proof)) handler.requestLocationPermission()
    }

    @JavascriptInterface
    fun openAppSettings(proof: String?) {
        if (authorized(proof)) handler.openAppSettings()
    }

    @JavascriptInterface
    fun recordTermAcknowledgement(proof: String?, json: String?): String =
        if (authorized(proof)) handler.recordTermAcknowledgement(json.orEmpty()) else deniedJson()

    @JavascriptInterface
    fun receipt(proof: String?, acknowledgementId: String?): String =
        if (authorized(proof)) handler.receiptJson(acknowledgementId.orEmpty()) else deniedJson()

    @JavascriptInterface
    fun syncNow(proof: String?) {
        if (authorized(proof)) handler.requestSyncNow()
    }

    @JavascriptInterface
    fun applyServerPolicies(proof: String?, json: String?): String =
        if (authorized(proof)) handler.applyServerPoliciesJson(json.orEmpty()) else deniedJson()

    @JavascriptInterface
    fun recordOperationalEvent(proof: String?, json: String?): String =
        if (authorized(proof)) handler.recordOperationalEventJson(json.orEmpty()) else deniedJson()

    @JavascriptInterface
    fun operationalEvents(proof: String?): String =
        if (authorized(proof)) handler.operationalEventsJson() else deniedJson()
}
