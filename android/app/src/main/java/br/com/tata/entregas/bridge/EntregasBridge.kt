package br.com.tata.entregas.bridge

import android.webkit.JavascriptInterface
import android.webkit.WebView
import br.com.tata.entregas.location.GateDecision
import br.com.tata.entregas.location.CanonicalGpsPoint
import org.json.JSONObject
import java.lang.ref.WeakReference

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
 * Superfície `@JavascriptInterface`.
 *
 * Só métodos que a interface realmente precisa. Cada um é uma AÇÃO do
 * aparelho — nunca uma regra de negócio. Isto é deliberado: `addJavascriptInterface`
 * é uma superfície de ataque, e quanto menor, melhor.
 */
class EntregasJsBridge(
    private val handler: NativeActions,
) {
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
    }

    @JavascriptInterface
    fun version(): String = Bridge.BRIDGE_VERSION

    /** Sem `trip_id`, não liga. A trava é aqui e também no serviço. */
    @JavascriptInterface
    fun startTripCapture(tripId: String?) {
        if (tripId.isNullOrBlank()) return
        handler.startTripCapture(tripId)
    }

    @JavascriptInterface
    fun stopTripCapture() = handler.stopTripCapture()

    @JavascriptInterface
    fun capabilities(): String = handler.capabilitiesJson()

    @JavascriptInterface
    fun status(): String = handler.statusJson()

    @JavascriptInterface
    fun requestLocationPermission() = handler.requestLocationPermission()

    @JavascriptInterface
    fun openAppSettings() = handler.openAppSettings()

    @JavascriptInterface
    fun recordTermAcknowledgement(json: String?): String =
        handler.recordTermAcknowledgement(json.orEmpty())

    @JavascriptInterface
    fun receipt(acknowledgementId: String?): String =
        handler.receiptJson(acknowledgementId.orEmpty())

    @JavascriptInterface
    fun syncNow() = handler.requestSyncNow()
}
