package br.com.tata.entregas.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import br.com.tata.entregas.BuildConfig
import br.com.tata.entregas.data.EntregasDatabase
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Sincronização em lote.
 *
 * Regras que este worker respeita, e que existem porque a alternativa perde
 * dado ou duplica evento:
 *  - só marca `sent` quando o servidor confirmou. Falha deixa em `failed`,
 *    que volta ao lote na próxima tentativa;
 *  - recusa definitiva (4xx) não vira retentativa infinita — o item fica
 *    visível com o erro, para alguém olhar;
 *  - o lote é ordenado por `sequenceLocal`, então o servidor recebe na ordem
 *    em que o aparelho observou, mesmo que a rede tenha ido e voltado;
 *  - reenviar o mesmo lote é seguro: a chave de idempotência é a mesma.
 *
 * Nenhuma coordenada entra em log.
 */
class SyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    companion object {
        const val UNIQUE_PERIODIC = "entregas-sync-periodic"
        const val UNIQUE_NOW = "entregas-sync-now"
        private const val BATCH_SIZE = 100
    }

    override suspend fun doWork(): Result {
        val db = EntregasDatabase.get(applicationContext)
        val token = db.deviceState().get(EntregasDatabase.KEY_SESSION_TOKEN)
        val api = EntregasApi(BuildConfig.ENTREGAS_BASE_URL, { token })
        val correlationId = "sync-${System.currentTimeMillis()}"

        var retryable = false

        // 1. Aceites do termo primeiro: são a autorização de tudo o mais.
        val acks = db.termAcks().pending()
        for (ack in acks) {
            when (val r = api.sendTermAcknowledgement(ackJson(ack))) {
                is ApiResult.Ok -> db.termAcks().markSent(listOf(ack.acknowledgementId))
                is ApiResult.Retryable -> retryable = true
                is ApiResult.Rejected -> Unit // fica visível; não insiste
            }
        }

        // 2. Eventos operacionais.
        val events = db.outbox().nextBatch(BATCH_SIZE)
        if (events.isNotEmpty()) {
            val ids = events.map { it.eventId }
            val payloads = events.map { e ->
                JSONObject().apply {
                    put("event_id", e.eventId)
                    put("idempotency_key", e.idempotencyKey)
                    put("kind", e.kind)
                    put("occurred_at", e.occurredAt)
                    put("sequence_local", e.sequenceLocal)
                    put("command", JSONObject(e.payload))
                }
            }
            when (val r = api.sendEvents(payloads, correlationId)) {
                is ApiResult.Ok -> db.outbox().markSent(ids)
                is ApiResult.Retryable -> {
                    db.outbox().markFailed(ids, r.reason)
                    retryable = true
                }
                is ApiResult.Rejected -> db.outbox().markFailed(ids, r.reason)
            }
        }

        // 3. Pontos de GPS.
        val points = db.gpsPoints().nextBatch(BATCH_SIZE)
        if (points.isNotEmpty()) {
            val ids = points.map { it.pointId }
            val payloads = points.map { p ->
                JSONObject().apply {
                    put("point_id", p.pointId)
                    put("idempotency_key", p.idempotencyKey)
                    put("trip_id", p.tripId)
                    put("device_id", p.deviceId)
                    put("latitude", p.latitude)
                    put("longitude", p.longitude)
                    put("accuracy_m", p.accuracyM)
                    p.speedMps?.let { put("speed_mps", it) }
                    p.headingDeg?.let { put("heading_deg", it) }
                    p.altitudeM?.let { put("altitude_m", it) }
                    put("occurred_at", p.occurredAt)
                    put("elapsed_realtime_ns", p.elapsedRealtimeNanos)
                    put("provider", p.provider)
                    put("is_mock", p.isMock)
                    put("captured_offline", p.capturedOffline)
                    put("sequence_local", p.sequenceLocal)
                    put("source", "device")
                }
            }
            when (val r = api.sendPoints(payloads, correlationId)) {
                is ApiResult.Ok -> db.gpsPoints().markSent(ids)
                is ApiResult.Retryable -> {
                    db.gpsPoints().markFailed(ids, r.reason)
                    retryable = true
                }
                is ApiResult.Rejected -> db.gpsPoints().markFailed(ids, r.reason)
            }
        }

        // 4. Políticas e flags — aproveita a janela de rede aberta.
        when (val r = api.policies()) {
            is ApiResult.Ok -> br.com.tata.entregas.location.PolicyStore
                .applyServerPolicies(db, r.value)
            else -> Unit
        }

        return if (retryable) Result.retry() else Result.success()
    }

    private fun ackJson(ack: br.com.tata.entregas.data.TermAckEntity) = JSONObject().apply {
        put("acknowledgement_id", ack.acknowledgementId)
        put("rider_id", ack.riderId)
        put("unit_id", ack.unitId)
        put("term_version", ack.termVersion)
        put("term_material_version", ack.termMaterialVersion)
        put("term_hash", ack.termHash)
        put("status", ack.status)
        put("accepted_at", ack.acceptedAt)
        put("device_id", ack.deviceId)
        put("app_version", ack.appVersion)
        put("language", ack.language)
        put("origin", ack.origin)
        put("correlation_id", ack.correlationId)
        put("schema_version", ack.schemaVersion)
    }
}

object SyncScheduler {

    private val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    /**
     * Sincronização periódica de segurança. 15 min é o mínimo do WorkManager;
     * o caminho normal é `requestNow`, disparado quando o ponto é gravado.
     * Este aqui existe para o caso do app ficar fechado com fila pendente.
     */
    fun ensurePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            SyncWorker.UNIQUE_PERIODIC,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }

    /**
     * Tentativa imediata assim que houver rede. `KEEP` evita empilhar um
     * trabalho por ponto capturado — um lote pendente já cobre todos.
     */
    fun requestNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            SyncWorker.UNIQUE_NOW,
            ExistingWorkPolicy.KEEP,
            request,
        )
    }
}
