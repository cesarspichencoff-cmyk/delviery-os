package br.com.tata.entregas.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import android.view.ViewGroup
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import br.com.tata.entregas.BuildConfig
import br.com.tata.entregas.bridge.Bridge
import br.com.tata.entregas.bridge.EntregasJsBridge
import br.com.tata.entregas.bridge.OriginBoundNativeBridge
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.TermAckEntity
import br.com.tata.entregas.location.DeviceId
import br.com.tata.entregas.location.GateSnapshot
import br.com.tata.entregas.location.PermissionState
import br.com.tata.entregas.location.PolicyStore
import br.com.tata.entregas.location.TripLocationService
import br.com.tata.entregas.location.locationServicesEnabled
import br.com.tata.entregas.notify.TripNotification
import br.com.tata.entregas.sync.DeviceSession
import br.com.tata.entregas.sync.OperationalEventRecorder
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
class MainActivity : AppCompatActivity(), EntregasJsBridge.NativeActions, RendererGoneHost {

    private companion object {
        const val APARELHO_DIVERGENTE = "aparelho_divergente"
    }

    private lateinit var webView: WebView
    private lateinit var db: EntregasDatabase
    private val rendererReload = RendererReloadBackoff()

    /** A única página que este aplicativo abre por conta própria. */
    private val riderUrl get() = "${BuildConfig.ENTREGAS_BASE_URL}/rider-mobile/"

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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        db = EntregasDatabase.get(this)
        TripNotification.ensureChannel(this)

        webView = newRiderWebView(OriginLockedClient(BuildConfig.ENTREGAS_BASE_URL))
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
            webView.loadUrl(riderUrl)
        }
    }

    /**
     * O WebView do motoboy, com TODAS as travas — a única definição.
     *
     * Serve à criação da tela e à troca depois que o renderizador morre: um
     * WebView recriado por outro caminho nasceria sem alguma destas linhas, e
     * a diferença só apareceria em campo.
     */
    @SuppressLint("SetJavaScriptEnabled")
    private fun newRiderWebView(client: OriginLockedClient): WebView {
        // Fresh 256-bit capability per WebView instance. This is NOT a
        // device credential or session token, and never goes to a server.
        val bridgeCapability = OriginBoundNativeBridge.newCapability()
        val web = WebView(this).apply {
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
            webViewClient = client
            // A página confirma a saída e a entrega por confirm(). Sem um
            // WebChromeClient, o WebView cancela o diálogo em silêncio e a página
            // recebe false: a saída nunca chegaria ao domínio. É o cliente
            // padrão, sem override — ele recusa permissão, arquivo e janela.
            webChromeClient = WebChromeClient()
            // Sem downloads: nada que a página ofereça deve virar arquivo no
            // aparelho do motoboy. Um PDF de pedido salvo na pasta pública
            // sobreviveria ao encerramento da viagem.
            setDownloadListener { _, _, _, _, _ -> }
            // Raw Java bridge remains visible to every iframe by Android
            // design, but NONE of its methods work without the capability.
            addJavascriptInterface(
                EntregasJsBridge(this@MainActivity, bridgeCapability),
                Bridge.RAW_JS_INTERFACE_NAME,
            )
            // Before loading any page, inject a PUBLIC compatibility facade
            // only in trusted /rider-mobile/ top documents. Unsupported
            // WebViews get NO facade and remain blocked by compatibilityHold.
            OriginBoundNativeBridge.install(
                this, BuildConfig.ENTREGAS_BASE_URL, bridgeCapability,
            )
        }
        // Cookies de terceiros não têm uso aqui — só falamos com o piloto.
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(web, false)
        return web
    }

    /**
     * O renderizador do WebView morreu: quebrou, ou o sistema o matou por
     * falta de memória. Ele é outro processo; a viagem não é.
     *
     * Sem este tratamento o WebView derruba o processo do aplicativo — e com
     * ele o serviço de captura, que vive aqui. Agora só a TELA é trocada: o
     * WebView morto sai e é destruído, um novo nasce com as mesmas travas e
     * com uma chave de ponte nova, e volta para a página do motoboy — nunca
     * para onde o morto estava. Serviço de localização, fila Room e
     * WorkManager não passam por aqui: não dependem de WebView vivo.
     *
     * A página recarregada reconcilia sozinha, como ao reabrir o aplicativo.
     */
    override fun onRendererGone(dead: WebView, client: OriginLockedClient) {
        val wasTheScreen = ::webView.isInitialized && dead === webView
        (dead.parent as? ViewGroup)?.removeView(dead)
        dead.destroy()
        if (!wasTheScreen || isFinishing || isDestroyed) return

        val fresh = newRiderWebView(client)
        webView = fresh
        setContentView(fresh)
        Bridge.attach(fresh)
        // Uma página que mata o renderizador a cada carga não pode virar um
        // laço: a primeira volta é imediata, as seguintes esperam.
        fresh.postDelayed(
            { if (webView === fresh && !isDestroyed) fresh.loadUrl(riderUrl) },
            rendererReload.nextDelayMs(SystemClock.elapsedRealtime()),
        )
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
        // O pseudônimo do aparelho (nunca o segredo). A página o leva ao aceite
        // do termo, que o servidor monta; quem o gera e guarda é este lado.
        put("device_id", runBlocking { DeviceId.ensure(db) })
        // Hash público para o vínculo humano. O segredo bruto nunca cruza a ponte.
        put("device_proof_sha256", runBlocking { DeviceSession.provaDeVinculo(db, System.currentTimeMillis()) })
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
            // Incluso em pending_points: nenhuma localizacao desaparece da fila
            // so por ter sido retida para revisao. Contagem sem coordenadas.
            put("gps_review_required_points", db.gpsPoints().reviewRequiredCount())
            put("rejected_points", db.gpsPoints().rejectedCount())
            put("pending_events", db.outbox().pendingCount())
            put("rejected_events", db.outbox().rejectedCount())
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
            // O aceite é DESTE aparelho. Registro com outro device_id não entra —
            // e não vira o motoboy deste aparelho em KEY_RIDER_ID.
            require(o.getString("device_id") == DeviceId.ensure(db)) { APARELHO_DIVERGENTE }
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
            // O aceite registra a intenção, mas não autentica um motoboy.
            // Apenas a sessão validada pela plataforma define KEY_RIDER_ID.
            o.getString("acknowledgement_id")
        }
        SyncScheduler.requestNow(this@MainActivity)
        result.fold(
            onSuccess = { JSONObject().put("ok", true).put("acknowledgement_id", it).toString() },
            onFailure = {
                val motivo = if (it.message == APARELHO_DIVERGENTE) APARELHO_DIVERGENTE else "registro_invalido"
                JSONObject().put("ok", false).put("error", motivo).toString()
            },
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

    /**
     * Políticas de `/api/policies`, repassadas pela página (Q-018).
     *
     * O piloto só responde políticas com sessão, e a sessão é do motoboy, na
     * página — o SyncWorker não tem (nem deve ter) credencial humana. A página
     * repassa o corpo como o servidor deu; aqui se guarda pelo mesmo
     * `PolicyStore.applyServerPolicies`, com os mesmos defaults seguros.
     * Corpo ilegível não muda nada.
     */
    override fun applyServerPoliciesJson(json: String): String = runBlocking {
        runCatching { PolicyStore.applyServerPolicies(db, JSONObject(json)) }.fold(
            onSuccess = { JSONObject().put("ok", true).toString() },
            onFailure = { JSONObject().put("ok", false).put("error", "politica_invalida").toString() },
        )
    }

    /**
     * Fila do aparelho (C5): grava a intenção no Room e pede envio. Sem rede, o
     * WorkManager espera a conexão; a intenção já está salva no aparelho.
     */
    override fun recordOperationalEventJson(json: String): String = runBlocking {
        val r = OperationalEventRecorder.record(db, json, System.currentTimeMillis())
        if (r is OperationalEventRecorder.Result.Recorded) SyncScheduler.requestNow(this@MainActivity)
        OperationalEventRecorder.toJson(r)
    }

    override fun operationalEventsJson(): String = runBlocking {
        OperationalEventRecorder.recentJson(db)
    }

    override fun onDestroy() {
        Bridge.detach()
        super.onDestroy()
    }
}

/**
 * A ponte JavaScript nativa pertence exclusivamente à origem do piloto.
 * A navegação fora dessa origem é BLOQUEADA na WebView (não é aberta
 * automaticamente no navegador do sistema).
 *
 * Host isolado é insuficiente: protocolo e porta diferentes são origens
 * diferentes e não podem ganhar acesso à ponte do aparelho.
 */
open class OriginLockedClient(baseUrl: String) : WebViewClient() {
    private val allowedOrigin = Uri.parse(baseUrl)

    private fun effectivePort(uri: Uri): Int = when {
        uri.port >= 0 -> uri.port
        uri.scheme.equals("https", ignoreCase = true) -> 443
        uri.scheme.equals("http", ignoreCase = true) -> 80
        else -> -1
    }

    internal fun isAllowedNavigation(target: Uri?): Boolean {
        if (target == null) return false
        val allowedScheme = allowedOrigin.scheme?.lowercase() ?: return false
        val targetScheme = target.scheme?.lowercase() ?: return false
        val allowedHost = allowedOrigin.host?.lowercase() ?: return false
        val targetHost = target.host?.lowercase() ?: return false
        if (allowedScheme != "https" && allowedScheme != "http") return false
        return targetScheme == allowedScheme &&
            targetHost == allowedHost &&
            target.userInfo == null &&
            allowedOrigin.userInfo == null &&
            effectivePort(target) == effectivePort(allowedOrigin)
    }

    override fun shouldOverrideUrlLoading(
        view: WebView?,
        request: android.webkit.WebResourceRequest?,
    ): Boolean = !isAllowedNavigation(request?.url)

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
    final override fun onReceivedSslError(
        view: WebView?,
        handler: android.webkit.SslErrorHandler?,
        error: android.net.http.SslError?,
    ) {
        handler?.cancel()
    }

    /**
     * A morte do renderizador nunca derruba o aplicativo.
     *
     * Devolver `false` (o default) faz o WebView encerrar o processo inteiro:
     * aborta se o renderizador quebrou, e se mata por SIGKILL — sem exceção
     * Java e sem tombstone — se o sistema o matou. `true` SEMPRE, inclusive
     * sem hospedeiro: um WebView morto na tela é ruim, um serviço de captura
     * morto no meio da viagem é pior.
     *
     * `final`, como a recusa de certificado: um cliente de laboratório herda
     * este comportamento e não consegue trocá-lo.
     */
    final override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
        if (view != null) rendererGoneHostOf(view)?.onRendererGone(view, this)
        return true
    }

    private fun rendererGoneHostOf(view: WebView): RendererGoneHost? {
        var context: android.content.Context? = view.context
        while (context != null) {
            if (context is RendererGoneHost) return context
            context = (context as? android.content.ContextWrapper)?.baseContext
        }
        return null
    }
}

/**
 * Quem hospeda o WebView e sabe trocá-lo. Recebe o cliente que estava
 * instalado — sempre um [OriginLockedClient], então a trava de origem
 * acompanha o WebView novo por construção.
 */
interface RendererGoneHost {
    fun onRendererGone(dead: WebView, client: OriginLockedClient)
}

/**
 * Espera antes de recarregar depois de mortes seguidas do renderizador.
 *
 * Uma morte isolada recarrega na hora. Mortes em sequência (a página que
 * estoura a memória a cada carga) esperam cada vez mais, até um teto — o
 * aparelho do motoboy não fica criando processo em laço. Um minuto sem
 * morrer zera a contagem.
 */
internal class RendererReloadBackoff(private val quietMs: Long = 60_000L) {
    private var lastDeathMs: Long? = null
    private var streak = 0

    fun nextDelayMs(nowMs: Long): Long {
        val last = lastDeathMs
        streak = if (last != null && nowMs - last < quietMs) streak + 1 else 0
        lastDeathMs = nowMs
        return DELAYS_MS[minOf(streak, DELAYS_MS.lastIndex)]
    }

    private companion object {
        val DELAYS_MS = longArrayOf(0L, 2_000L, 5_000L, 15_000L)
    }
}
