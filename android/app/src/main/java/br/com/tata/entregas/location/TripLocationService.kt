package br.com.tata.entregas.location

import android.Manifest
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import br.com.tata.entregas.BuildConfig
import br.com.tata.entregas.bridge.Bridge
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.GpsPointEntity
import br.com.tata.entregas.notify.TripNotification
import br.com.tata.entregas.sync.ApiResult
import br.com.tata.entregas.sync.DeviceSession
import br.com.tata.entregas.sync.EntregasApi
import br.com.tata.entregas.sync.SyncScheduler
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationAvailability
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Serviço de localização da viagem.
 *
 * É AQUI que mora a trava estrutural de privacidade no Android: o serviço só
 * sobe com `trip_id`, e antes de qualquer `requestLocationUpdates` ele passa
 * pelo `CaptureGate`. Sem viagem, sem termo, sem permissão ou com a flag
 * desligada, ele **não inicia** — e se já estava rodando, se desliga sozinho.
 *
 * Fora de uma viagem ativa este serviço não existe. Não há caminho no código
 * que ligue o Fused Location Provider sem `trip_id`.
 */
class TripLocationService : Service() {

    companion object {
        const val ACTION_START = "br.com.tata.entregas.START_TRIP_CAPTURE"
        const val ACTION_STOP = "br.com.tata.entregas.STOP_TRIP_CAPTURE"
        const val EXTRA_TRIP_ID = "trip_id"
        private const val CAPTURE_CONTROL_INTERVAL_MS = 15_000L
        private const val CAPTURE_CONTROL_TIMEOUT_MS = 5_000

        /** Só existe um caminho para ligar, e ele exige trip_id. */
        fun start(context: Context, tripId: String) {
            require(tripId.isNotBlank()) { "serviço de localização exige viagem ativa" }
            val intent = Intent(context, TripLocationService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_TRIP_ID, tripId)
            }
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            context.startService(
                Intent(context, TripLocationService::class.java).apply { action = ACTION_STOP },
            )
        }
    }

    private lateinit var fused: FusedLocationProviderClient
    private lateinit var db: EntregasDatabase
    // Lifecycle, callbacks e conclusões de Tasks compartilham o main thread.
    // Room suspende sem bloquear; apenas o HTTP bloqueante vai para IO.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val persistMutex = Mutex()
    private val sessions = CaptureSessionLifecycle()

    private val tripId: String? get() = sessions.current?.tripId
    private var deviceId: String = ""
    private var policy: AdaptivePolicy = AdaptivePolicy.FALLBACK
    private var currentDecision: CaptureDecision? = null
    private var lastAccuracyM: Double? = null
    private var freshness: String = "unknown"
    private var pendingSync: Int = 0
    private var recoveredAfterRestart: Boolean = false
    private var captureControlJob: Job? = null

    private var callback: LocationCallback? = null

    private fun createCallback(registration: CaptureSessionLifecycle.Registration) = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            if (!sessions.isCurrent(registration)) return
            val session = registration.session
            // Lote: o Fused pode entregar várias de uma vez quando agrupa.
            result.locations.forEach { location ->
                val point = CanonicalPoint.fromLocation(
                    location = location,
                    tripId = session.tripId,
                    deviceId = deviceId,
                    capturedOffline = !NetworkState.isOnline(this@TripLocationService),
                )
                persist(point, session)
                Bridge.publishLocation(point, location.time)
            }
            reevaluateCadence()
        }

        override fun onLocationAvailability(availability: LocationAvailability) {
            if (!sessions.isCurrent(registration)) return
            freshness = if (availability.isLocationAvailable) "current" else "unavailable"
            Bridge.publishServiceState(serviceStateJson())
            updateNotification()
        }
    }

    override fun onCreate() {
        super.onCreate()
        fused = LocationServices.getFusedLocationProviderClient(this)
        db = EntregasDatabase.get(this)
        TripNotification.ensureChannel(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopBecause("encerramento solicitado")
                return START_NOT_STICKY
            }
            ACTION_START -> {
                val trip = intent.getStringExtra(EXTRA_TRIP_ID)
                if (trip.isNullOrBlank()) {
                    stopBecause("intent sem trip_id")
                    return START_NOT_STICKY
                }
                beginTrip(trip)
            }
            null -> {
                // Processo recriado pelo sistema. Recupera a viagem do Room —
                // e se não houver viagem ativa, NÃO volta a rastrear.
                recoveredAfterRestart = true
                val stored = runBlocking { db.deviceState().get(EntregasDatabase.KEY_ACTIVE_TRIP) }
                if (stored.isNullOrBlank()) {
                    stopBecause("recriado sem viagem ativa")
                    return START_NOT_STICKY
                }
                beginTrip(stored)
            }
        }
        // START_REDELIVER_INTENT: se o sistema matar, volta com o mesmo
        // trip_id — nunca com um estado inventado.
        return START_REDELIVER_INTENT
    }

    private fun beginTrip(trip: String) {
        // Sobe em primeiro plano antes de qualquer coisa: o Android exige, e
        // o motoboy precisa ver que a captura começou.
        startInForeground()

        val gate = runBlocking { GateSnapshot.evaluate(this@TripLocationService, db, trip) }
        if (!gate.allowed) {
            // Falha fechada: portão bloqueado não vira captura silenciosa.
            Bridge.publishGateBlocked(gate)
            stopBecause(gate.primaryBlock?.code ?: "portao_bloqueado")
            return
        }

        captureControlJob?.cancel()
        // Não há startup solto em IO. START só devolve depois da escrita local;
        // STOP é serializado com ela e não pode ser desfeito por uma continuação.
        val session = sessions.begin(trip) {
            runBlocking {
                deviceId = db.deviceState().get(EntregasDatabase.KEY_DEVICE_ID) ?: DeviceId.ensure(db)
                policy = PolicyStore.load(db)
                db.deviceState().put(
                    br.com.tata.entregas.data.DeviceStateEntity(
                        key = EntregasDatabase.KEY_ACTIVE_TRIP,
                        value = trip,
                        updatedAtMs = System.currentTimeMillis(),
                    ),
                )
            }
        }
        currentDecision = null
        lastAccuracyM = null
        freshness = "unknown"
        requestUpdates(decideNow())
        if (!sessions.isCurrent(session)) return
        Bridge.publishServiceState(serviceStateJson())
        startCaptureControlLoop(session)
        SyncScheduler.ensurePeriodic(this)
    }

    /**
     * Continua funcionando com WebView e processo da UI ausentes.
     *
     * A rede nunca decide que a viagem acabou: timeout/5xx/credencial renovável
     * preservam a captura. Só uma resposta autoritativa do piloto ou uma
     * revogação terminal encerram o foreground service.
     */
    private fun startCaptureControlLoop(session: CaptureSessionLifecycle.Session) {
        captureControlJob?.cancel()
        captureControlJob = scope.launch {
            while (isActive && sessions.isCurrent(session)) {
                verifyCaptureState(session)
                if (!sessions.isCurrent(session)) break
                delay(CAPTURE_CONTROL_INTERVAL_MS)
            }
        }
    }

    private suspend fun verifyCaptureState(captureSession: CaptureSessionLifecycle.Session) {
        // O portão local não vale só no início. Permissão revogada, localização
        // desligada, flag atualizada ou termo local invalidado durante a viagem
        // precisam derrubar a captura mesmo sem callback do Fused ou WebView.
        val localGate = GateSnapshot.evaluate(this@TripLocationService, db, captureSession.tripId)
        if (!sessions.isCurrent(captureSession)) return
        if (!localGate.allowed) {
            Bridge.publishGateBlocked(localGate)
            stopBecause(localGate.primaryBlock?.code ?: "portao_bloqueado", captureSession)
            return
        }

        if (!NetworkState.isOnline(this@TripLocationService)) return

        val session = DeviceSession.sessaoAtual(db)
        if (!sessions.isCurrent(captureSession)) return
        if (session == null) {
            SyncScheduler.requestNow(this@TripLocationService)
            return
        }

        val pilot = EntregasApi(
            BuildConfig.ENTREGAS_BASE_URL,
            { session.token },
            CAPTURE_CONTROL_TIMEOUT_MS,
        )
        val result = withContext(Dispatchers.IO) { pilot.captureState(captureSession.tripId) }
        if (!sessions.isCurrent(captureSession)) return
        val action = when (result) {
            is ApiResult.Ok -> RemoteCaptureControl.success(
                hasCapture = result.value.has("capture"),
                capture = result.value.optBoolean("capture", true),
            )
            is ApiResult.Unauthorized -> RemoteCaptureControl.unauthorized()
            is ApiResult.Rejected -> RemoteCaptureControl.rejected(result.status)
            is ApiResult.Retryable -> RemoteCaptureControl.retryable()
        }

        when (action) {
            is RemoteCaptureAction.Keep -> {
                // Rede/5xx/4xx não terminal/200 incompleto: UNKNOWN nunca vira fim.
            }
            is RemoteCaptureAction.RenewCredential -> {
                DeviceSession.limparCredencial(db)
                SyncScheduler.requestNow(this@TripLocationService)
            }
            is RemoteCaptureAction.Stop -> {
                stopBecause(action.reason, captureSession)
            }
        }
    }

    private fun startInForeground() {
        val notification = TripNotification.build(
            this,
            TripNotification.statusLine(pendingSync, freshness),
        )
        ServiceCompat.startForeground(
            this,
            TripNotification.NOTIFICATION_ID,
            notification,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            } else {
                0
            },
        )
    }

    private fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    private fun requestUpdates(decision: CaptureDecision) {
        val session = sessions.current ?: return
        if (!hasLocationPermission()) {
            stopBecause("permissao_revogada", session)
            return
        }

        val previous = callback
        val registration = sessions.register(session) ?: return
        // Cada inscrição tem callback próprio: remover A depois de iniciar B
        // jamais remove B, inclusive numa simples troca de cadência.
        val callback = createCallback(registration)
        this.callback = callback
        currentDecision = decision

        fun register() {
            if (!sessions.isCurrent(registration)) return
            try {
                // A Task é assíncrona. Só tratamos a inscrição como válida
                // depois do sucesso; falha não pode deixar um FGS "ativo"
                // sem callback registrado no Fused Location Provider.
                fused.requestLocationUpdates(
                    CapturePolicy.buildRequest(decision),
                    callback,
                    mainLooper,
                ).addOnSuccessListener {
                    if (sessions.isCurrent(registration)) {
                        Bridge.publishServiceState(serviceStateJson())
                        updateNotification()
                    } else {
                        // STOP pode ter ocorrido enquanto a Task estava pendente.
                        fused.removeLocationUpdates(callback)
                    }
                }.addOnFailureListener {
                    if (sessions.isCurrent(registration)) stopBecause("falha_inscricao_localizacao", session)
                }
            } catch (e: SecurityException) {
                stopBecause("permissao_revogada", session)
            }
        }

        if (previous == null) {
            // Primeira inscrição: remover antes cria uma corrida assíncrona em
            // que o remove pode concluir DEPOIS do request e apagar a inscrição.
            register()
        } else {
            // Mudança de cadência: só registra a nova política depois que a
            // remoção anterior terminou de verdade.
            fused.removeLocationUpdates(previous).addOnCompleteListener { removed ->
                if (sessions.isCurrent(registration)) {
                    if (removed.isSuccessful) register()
                    else stopBecause("falha_remocao_localizacao", session)
                }
            }
        }
    }

    private fun decideNow(): CaptureDecision {
        val power = getSystemService(PowerManager::class.java)
        val battery = getSystemService(BatteryManager::class.java)
        val level = battery?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            ?.takeIf { it in 0..100 }?.let { it / 100f }
        return CapturePolicy.decide(
            policy = policy,
            batterySaverActive = power?.isPowerSaveMode == true,
            batteryLevel = level,
            lastAccuracyM = lastAccuracyM,
            stillForS = null,
            nearUnit = false,
            nearStop = false,
            returning = false,
            moving = true,
        )
    }

    /** Recalcula a cadência; só reprograma quando o contexto realmente mudou. */
    private fun reevaluateCadence() {
        val next = decideNow()
        if (next.context != currentDecision?.context) requestUpdates(next)
    }

    private fun persist(point: CanonicalGpsPoint, session: CaptureSessionLifecycle.Session) {
        // O callback chega no mainLooper em ordem. UNDISPATCHED entra na fila
        // do mutex nessa mesma ordem antes de devolver o controle ao callback.
        // O mutex preserva a ordem observada; o Room, por sua vez, reserva a
        // sequência e grava o ponto na mesma transação, sobrevivendo a restart
        // e a futuro expurgo de linhas antigas.
        scope.launch(start = CoroutineStart.UNDISPATCHED) {
            persistMutex.withLock {
                val nowMs = System.currentTimeMillis()
                val inserted = db.insertGpsSequenced(
                    GpsPointEntity(
                        pointId = point.pointId,
                        idempotencyKey = point.idempotencyKey,
                        tripId = point.tripId,
                        deviceId = point.deviceId,
                        latitude = point.latitude,
                        longitude = point.longitude,
                        accuracyM = point.accuracyM,
                        speedMps = point.speedMps,
                        headingDeg = point.headingDeg,
                        altitudeM = point.altitudeM,
                        occurredAt = point.occurredAt,
                        elapsedRealtimeNanos = point.elapsedRealtimeNanos,
                        provider = point.provider,
                        isMock = point.isMock,
                        capturedOffline = point.capturedOffline,
                        sequenceLocal = 0L,
                        syncState = "pending",
                        attempts = 0,
                        lastError = null,
                        createdAtMs = nowMs,
                    ),
                    nowMs,
                )
                // IGNORE de pointId repetido não consome número da sequência.
                if (inserted == -1L) return@withLock
                val pending = db.gpsPoints().pendingCount()
                // Pontos já observados continuam duráveis após STOP, mas sua
                // conclusão não pode ressuscitar notificação nem alterar B.
                if (sessions.isCurrent(session)) {
                    lastAccuracyM = point.accuracyM
                    pendingSync = pending
                    updateNotification()
                }
                SyncScheduler.requestNow(this@TripLocationService)
            }
        }
    }

    private fun updateNotification() {
        val manager = getSystemService(android.app.NotificationManager::class.java) ?: return
        manager.notify(
            TripNotification.NOTIFICATION_ID,
            TripNotification.build(this, TripNotification.statusLine(pendingSync, freshness)),
        )
    }

    private fun serviceStateJson() = org.json.JSONObject().apply {
        put("type", "service_state")
        put("foreground_service_running", tripId != null)
        put("notification_visible", tripId != null)
        put("bound_trip_id", tripId)
        put("battery_saver_active", getSystemService(PowerManager::class.java)?.isPowerSaveMode == true)
        put("recovered_after_restart", recoveredAfterRestart)
        put("location_services_enabled", locationServicesEnabled(this@TripLocationService))
        currentDecision?.let {
            put("capture_context", it.context.key)
            put("capture_interval_s", it.intervalS)
            put("capture_degraded", it.degraded)
            put("capture_reason", it.reason)
            put("policy_version", it.policyVersion)
        }
    }

    /**
     * Para de verdade: remove o callback do Fused, limpa a viagem ativa do
     * Room e derruba o serviço. Depois disto nenhum ponto novo é possível.
     */
    private fun stopBecause(reason: String, expected: CaptureSessionLifecycle.Session? = null) {
        if (!sessions.stop(expected) {
            runBlocking { db.deviceState().clear(EntregasDatabase.KEY_ACTIVE_TRIP) }
        }) return
        captureControlJob?.cancel()
        captureControlJob = null
        callback?.let { fused.removeLocationUpdates(it) }
        callback = null
        currentDecision = null
        Bridge.publishStopped(reason)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        sessions.invalidate()
        callback?.let { fused.removeLocationUpdates(it) }
        callback = null
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

/** Estado do serviço de localização do sistema — desligado é motivo de bloqueio. */
internal fun locationServicesEnabled(context: Context): Boolean {
    val lm = context.getSystemService(LocationManager::class.java) ?: return false
    return lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
        lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
}
