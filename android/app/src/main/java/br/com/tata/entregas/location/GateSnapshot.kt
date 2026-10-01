package br.com.tata.entregas.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import br.com.tata.entregas.data.DeviceStateEntity
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.sync.LocalRetentionPolicy
import java.util.UUID

/**
 * Monta o estado real do aparelho e roda o portão.
 *
 * Lê o termo do Room (não da tela) e a permissão do sistema (não do que o app
 * acha que pediu). Se o aparelho revogar a permissão enquanto o app estava
 * fechado, aqui é onde isso aparece.
 */
object GateSnapshot {

    suspend fun evaluate(
        context: Context,
        db: EntregasDatabase,
        tripId: String?,
    ): GateDecision {
        val riderId = db.deviceState().get(EntregasDatabase.KEY_RIDER_ID)
        val termHash = PolicyStore.currentTermHash(db)
        val termPublishable = PolicyStore.termPublishable(db)

        val term = if (riderId == null || termHash == null) {
            TermState(
                publishable = termPublishable,
                acknowledgedForCurrentHash = false,
                acknowledgedOlderVersion = false,
                declinedCurrentMaterialVersion = false,
            )
        } else {
            val accepted = db.termAcks().findAccepted(riderId, termHash)
            val history = db.termAcks().history(riderId)
            val materialVersion = PolicyStore.currentTermMaterialVersion(db)
            TermState(
                publishable = termPublishable,
                acknowledgedForCurrentHash = accepted != null,
                acknowledgedOlderVersion = history.any { it.status == "accepted" },
                declinedCurrentMaterialVersion = history.any {
                    it.status == "declined" && it.termMaterialVersion == materialVersion
                },
            )
        }

        return CaptureGate.evaluate(
            GateInput(
                captureEnabled = PolicyStore.captureEnabled(db),
                activeTripId = tripId,
                term = term,
                permission = readPermission(context),
                locationServicesEnabled = locationServicesEnabled(context),
            ),
        )
    }

    /**
     * Lê a permissão do sistema operacional agora. `GRANTED_APPROXIMATE`
     * quando só a coarse foi concedida — o app sinaliza, não contorna.
     */
    fun readPermission(context: Context): PermissionState {
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        return when {
            fine -> PermissionState.GRANTED_PRECISE
            coarse -> PermissionState.GRANTED_APPROXIMATE
            else -> PermissionState.DENIED
        }
    }
}

/**
 * Identificador do aparelho — pseudônimo gerado localmente.
 *
 * Nunca IMEI, MAC, número de telefone ou ANDROID_ID. É um UUID criado na
 * primeira execução e guardado no Room: identifica o aparelho para a
 * operação sem identificar a pessoa nem seguir ela para fora do produto.
 */
object DeviceId {
    suspend fun ensure(db: EntregasDatabase): String {
        db.deviceState().get(EntregasDatabase.KEY_DEVICE_ID)?.let { return it }
        val id = "dev-" + UUID.randomUUID().toString().replace("-", "").take(16)
        db.deviceState().put(
            DeviceStateEntity(
                key = EntregasDatabase.KEY_DEVICE_ID,
                value = id,
                updatedAtMs = System.currentTimeMillis(),
            ),
        )
        return id
    }
}

/**
 * Políticas e flags vindas do servidor, guardadas localmente para o app
 * funcionar offline. Defaults SEGUROS: na dúvida, tudo desligado.
 */
object PolicyStore {
    private const val KEY_CAPTURE_ENABLED = "flag_gps_capture_enabled"
    private const val KEY_TERM_HASH = "term_hash"
    private const val KEY_TERM_MATERIAL_VERSION = "term_material_version"
    private const val KEY_TERM_PUBLISHABLE = "term_publishable"
    private const val KEY_ADAPTIVE_POLICY = "adaptive_policy"
    private const val KEY_LOCAL_RETENTION_DAYS = "local_gps_retention_days"
    private const val KEY_LOCAL_RETENTION_TERM_HASH = "local_gps_retention_term_hash"

    /** Default seguro: sem confirmação do servidor, não captura. */
    suspend fun captureEnabled(db: EntregasDatabase): Boolean =
        db.deviceState().get(KEY_CAPTURE_ENABLED) == "true"

    suspend fun termPublishable(db: EntregasDatabase): Boolean =
        db.deviceState().get(KEY_TERM_PUBLISHABLE) == "true"

    suspend fun currentTermHash(db: EntregasDatabase): String? = db.deviceState().get(KEY_TERM_HASH)

    suspend fun currentTermMaterialVersion(db: EntregasDatabase): String? =
        db.deviceState().get(KEY_TERM_MATERIAL_VERSION)

    /**
     * Só devolve prazo quando ele veio do MESMO termo que está publicável.
     * Um valor antigo, um default ou uma resposta parcial preservam os dados.
     */
    suspend fun localRetentionDays(db: EntregasDatabase): Int? {
        if (!termPublishable(db)) return null
        val hash = currentTermHash(db)?.takeIf { it.isNotBlank() } ?: return null
        if (db.deviceState().get(KEY_LOCAL_RETENTION_TERM_HASH) != hash) return null

        // Publicar não substitui ciência: a exclusão local só é autorizada
        // depois que o termo vigente foi aceito neste mesmo aparelho.
        val riderId = db.deviceState().get(EntregasDatabase.KEY_RIDER_ID) ?: return null
        val deviceId = db.deviceState().get(EntregasDatabase.KEY_DEVICE_ID) ?: return null
        db.termAcks().findAcceptedOnDevice(riderId, hash, deviceId) ?: return null

        val days = db.deviceState().get(KEY_LOCAL_RETENTION_DAYS)?.toIntOrNull() ?: return null
        return days.takeIf { it in 1..LocalRetentionPolicy.MAX_DAYS }
    }

    suspend fun load(db: EntregasDatabase): AdaptivePolicy {
        val raw = db.deviceState().get(KEY_ADAPTIVE_POLICY) ?: return AdaptivePolicy.FALLBACK
        return runCatching { parse(raw) }.getOrDefault(AdaptivePolicy.FALLBACK)
    }

    suspend fun store(db: EntregasDatabase, key: String, value: String) {
        db.deviceState().put(
            DeviceStateEntity(key = key, value = value, updatedAtMs = System.currentTimeMillis()),
        )
    }

    /** Guarda o que veio de `/api/policies`. */
    suspend fun applyServerPolicies(db: EntregasDatabase, json: org.json.JSONObject) {
        json.optJSONObject("flags")?.let {
            store(db, KEY_CAPTURE_ENABLED, it.optBoolean("gps_capture_enabled", false).toString())
        }

        val term = json.optJSONObject("term")
        if (term != null) {
            val hash = term.optString("hash", "")
            val publishable = term.optBoolean("publishable", false)
            store(db, KEY_TERM_HASH, hash)
            store(db, KEY_TERM_MATERIAL_VERSION, term.optString("material_version", ""))
            store(db, KEY_TERM_PUBLISHABLE, publishable.toString())

            val retention = term.optJSONObject("retention")
            val days = retention?.optInt("detailed_point_days", -1) ?: -1
            if (publishable && hash.isNotBlank() && days in 1..LocalRetentionPolicy.MAX_DAYS) {
                store(db, KEY_LOCAL_RETENTION_DAYS, days.toString())
                store(db, KEY_LOCAL_RETENTION_TERM_HASH, hash)
            } else {
                db.deviceState().clear(KEY_LOCAL_RETENTION_DAYS)
                db.deviceState().clear(KEY_LOCAL_RETENTION_TERM_HASH)
            }
        } else {
            // Resposta parcial nunca mantém autorização antiga de exclusão.
            db.deviceState().clear(KEY_LOCAL_RETENTION_DAYS)
            db.deviceState().clear(KEY_LOCAL_RETENTION_TERM_HASH)
        }

        json.optJSONObject("capture_policy")?.let { store(db, KEY_ADAPTIVE_POLICY, it.toString()) }
    }

    private fun parse(raw: String): AdaptivePolicy {
        val o = org.json.JSONObject(raw)
        val intervals = mutableMapOf<String, Int>()
        val accuracies = mutableMapOf<String, String>()
        o.optJSONObject("interval_s")?.let { js ->
            js.keys().forEach { k -> intervals[k] = js.getInt(k) }
        }
        o.optJSONObject("accuracy")?.let { js ->
            js.keys().forEach { k -> accuracies[k] = js.getString(k) }
        }
        return AdaptivePolicy(
            version = o.optString("version", AdaptivePolicy.FALLBACK.version),
            intervalS = intervals.ifEmpty { AdaptivePolicy.FALLBACK.intervalS },
            accuracy = accuracies.ifEmpty { AdaptivePolicy.FALLBACK.accuracy },
            maxIntervalS = o.optInt("max_interval_s", AdaptivePolicy.FALLBACK.maxIntervalS),
        )
    }
}

/** Estado de rede — usado só para marcar `captured_offline`, nunca para bloquear. */
object NetworkState {
    fun isOnline(context: Context): Boolean {
        val cm = context.getSystemService(android.net.ConnectivityManager::class.java) ?: return false
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        return caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
