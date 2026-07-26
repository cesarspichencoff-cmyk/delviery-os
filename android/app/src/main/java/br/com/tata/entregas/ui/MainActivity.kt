package br.com.tata.entregas.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import br.com.tata.entregas.BuildConfig
import br.com.tata.entregas.bridge.Bridge
import br.com.tata.entregas.bridge.EntregasJsBridge
import br.com.tata.entregas.data.DeviceStateEntity
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.TermAckEntity
import br.com.tata.entregas.location.DeviceId
import br.com.tata.entregas.location.GateSnapshot
import br.com.tata.entregas.location.PermissionState
import br.com.tata.entregas.location.TripLocationService
import br.com.tata.entregas.location.locationServicesEnabled
import br.com.tata.entregas.notify.TripNotification
import br.com.tata.entregas.sync.SyncScheduler
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.json.JSONObject

/**
 * Única tela do aplicativo: hospeda a interface web que já existe.
 *
 * A escolha de container está no ADR. O ponto prático: a tela do motoboy, a
 * tela do termo e o status de GPS já foram construídos e testados em
 * JavaScript. Reescrevê-los em Kotlin criaria uma segunda verdade sobre as
 * mesmas regras — e é exatamente isso que o adendo proíbe.
 */
class MainActivity : AppCompatActivity(), EntregasJsBridge.NativeActions {

    private lateinit var webView: WebView
    private lateinit var db: EntregasDatabase

    private val locationPermission = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { granted ->
        val precise = granted[Manifest.permission.ACCESS_FINE_LOCATION] == true
        val coarse = granted[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        // Nunca insiste em silêncio: o resultado vai para a interface, que
        // explica a consequência e deixa o motoboy decidir.
        pushPermissionState(
            when {
                precise -> PermissionState.GRANTED_PRECISE
                coarse -> PermissionState.GRANTED_APPROXIMATE
                else -> PermissionState.DENIED
            },
        )
    }

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* negar a notificação não impede a viagem; o serviço ainda exige a sua */ }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        db = EntregasDatabase.get(this)
        TripNotification.ensureChannel(this)

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            // Trancado de propósito: a interface é servida pelo servidor do
            // piloto, não do sistema de arquivos, e não abre conteúdo misto.
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mediaPlaybackRequiresUserGesture = true
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.setGeolocationEnabled(false) // quem captura é o serviço nativo
            settings.allowFileAccessFromFileURLs = false
            settings.allowUniversalAccessFromFileURLs = false
            settings.databaseEnabled = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.saveFormData = false
            webViewClient = OriginLockedClient(BuildConfig.ENTREGAS_BASE_URL)
            // Sem downloads: nada que a página ofereça deve virar arquivo no
            // aparelho do motoboy. Um PDF de pedido salvo na pasta pública
            // sobreviveria ao encerramento da viagem.
            setDownloadListener { _, _, _, _, _ -> }
            addJavascriptInterface(EntregasJsBridge(this@MainActivity), Bridge.JS_INTERFACE_NAME)
        }
        // Cookies de terceiros não têm uso aqui — só falamos com o piloto.
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)
        // Inspeção remota SOMENTE no build de debug. Em release, um aparelho
        // conectado por USB poderia ler a tela e chamar a ponte nativa.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        setContentView(webView)
        Bridge.attach(webView)

        lifecycleScope.launch {
            DeviceId.ensure(db)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
            SyncScheduler.ensurePeriodic(this@MainActivity)
            webView.loadUrl("${BuildConfig.ENTREGAS_BASE_URL}/rider-mobile/")
        }
    }

    override fun onResume() {
        super.onResume()
        // A permissão pode ter sido revogada nas configurações enquanto o app
        // estava fechado. Reler sempre, nunca confiar no que achamos que era.
        pushPermissionState(GateSnapshot.readPermission(this))
    }

    private fun pushPermissionState(state: PermissionState) {
        Bridge.publishServiceState(
            JSONObject().apply {
                put("type", "service_state")
                put("foreground_service_running", false)
                put("notification_visible", false)
                put("bound_trip_id", JSONObject.NULL)
                put("permission_state", state.name.lowercase())
                put("location_services_enabled", locationServicesEnabled(this@MainActivity))
            },
        )
    }

    /* --------------------------- NativeActions --------------------------- */

    override fun startTripCapture(tripId: String) {
        TripLocationService.start(this, tripId)
    }

    override fun stopTripCapture() {
        TripLocationService.stop(this)
    }

    override fun capabilitiesJson(): String = JSONObject().apply {
        put("runtime", "android")
        put("app_version", BuildConfig.VERSION_NAME)
        put("foreground_service", true)
        put("native_geofencing", true)
        put("activity_recognition", false) // atrás de flag; não habilitado no piloto
        put("sdk_int", Build.VERSION.SDK_INT)
    }.toString()

    override fun statusJson(): String = runBlocking {
        val trip = db.deviceState().get(EntregasDatabase.KEY_ACTIVE_TRIP)
        val gate = GateSnapshot.evaluate(this@MainActivity, db, trip)
        JSONObject().apply {
            put("active_trip_id", trip ?: JSONObject.NULL)
            put("allowed", gate.allowed)
            put("message", gate.message)
            put("blocks", gate.blocks.joinToString(",") { it.code })
            put("approximate_only", gate.approximateOnly)
            put("term_ok", gate.termOk)
            put("pending_points", db.gpsPoints().pendingCount())
            put("pending_events", db.outbox().pendingCount())
        }.toString()
    }

    override fun requestLocationPermission() {
        locationPermission.launch(
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
        )
    }

    /**
     * Caminho para quem marcou "não perguntar novamente": o sistema não deixa
     * pedir de novo, então a única saída honesta é levar às configurações.
     */
    override fun openAppSettings() {
        startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", packageName, null)
            },
        )
    }

    /**
     * Grava o aceite. O termo e o hash vêm do servidor; o Kotlin não constrói
     * termo nem decide se é válido — só registra o que foi apresentado.
     */
    override fun recordTermAcknowledgement(json: String): String = runBlocking {
        val result = runCatching {
            val o = JSONObject(json)
            db.termAcks().insert(
                TermAckEntity(
                    acknowledgementId = o.getString("acknowledgement_id"),
                    riderId = o.getString("rider_id"),
                    unitId = o.getString("unit_id"),
                    termVersion = o.getString("term_version"),
                    termMaterialVersion = o.getString("term_material_version"),
                    termHash = o.getString("term_hash"),
                    status = o.getString("status"),
                    acceptedAt = o.getString("accepted_at"),
                    deviceId = o.getString("device_id"),
                    appVersion = o.optString("app_version", BuildConfig.VERSION_NAME),
                    language = o.optString("language", "pt-BR"),
                    origin = o.optString("origin", "rider_app"),
                    correlationId = o.optString("correlation_id", ""),
                    schemaVersion = o.optString("schema_version", "consent@1.0.0"),
                    syncState = "pending",
                ),
            )
            db.deviceState().put(
                DeviceStateEntity(
                    key = EntregasDatabase.KEY_RIDER_ID,
                    value = o.getString("rider_id"),
                    updatedAtMs = System.currentTimeMillis(),
                ),
            )
            o.getString("acknowledgement_id")
        }
        SyncScheduler.requestNow(this@MainActivity)
        result.fold(
            onSuccess = { JSONObject().put("ok", true).put("acknowledgement_id", it).toString() },
            onFailure = { JSONObject().put("ok", false).put("error", "registro_invalido").toString() },
        )
    }

    override fun receiptJson(acknowledgementId: String): String = runBlocking {
        val ack = db.termAcks().byId(acknowledgementId)
            ?: return@runBlocking JSONObject().put("ok", false).toString()
        JSONObject().apply {
            put("ok", true)
            put("recibo", ack.acknowledgementId)
            put("unidade", ack.unitId)
            put("versao_do_termo", ack.termVersion)
            put("impressao_do_texto", ack.termHash)
            put("aceito_em", ack.acceptedAt)
            put("situacao", if (ack.status == "accepted") "aceito" else "recusado")
            put("aparelho", ack.deviceId)
            put("aplicativo", ack.appVersion)
        }.toString()
    }

    override fun requestSyncNow() = SyncScheduler.requestNow(this)

    override fun onDestroy() {
        Bridge.detach()
        super.onDestroy()
    }
}

/**
 * Só carrega a origem do piloto. Qualquer outro endereço sai para o navegador
 * do sistema — assim uma página injetada nunca roda com acesso à ponte nativa.
 */
class OriginLockedClient(baseUrl: String) : WebViewClient() {
    private val allowedHost = Uri.parse(baseUrl).host

    override fun shouldOverrideUrlLoading(
        view: WebView?,
        request: android.webkit.WebResourceRequest?,
    ): Boolean {
        val host = request?.url?.host ?: return true
        return host != allowedHost
    }

    /**
     * Certificado inválido derruba o carregamento, sempre.
     *
     * O default do WebView já cancela, mas o método é sobrescrito aqui de
     * propósito: é a linha que um desenvolvedor apressado troca por
     * `handler.proceed()` quando o certificado local não está instalado no
     * aparelho. Deixá-la explícita, com este comentário, torna a troca uma
     * decisão visível no diff em vez de um detalhe esquecido.
     *
     * Se der erro de certificado, a saída é instalar a CA no aparelho — não
     * aceitar qualquer certificado.
     */
    override fun onReceivedSslError(
        view: WebView?,
        handler: android.webkit.SslErrorHandler?,
        error: android.net.http.SslError?,
    ) {
        handler?.cancel()
    }
}
