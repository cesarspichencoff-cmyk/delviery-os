package br.com.tata.entregas.location

import android.location.Location
import android.os.Build
import android.os.SystemClock
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Tradução Android -> ponto canônico do TATÁ Entregas.
 *
 * Este é o ÚNICO lugar do app que conhece `android.location.Location`. Daqui
 * para dentro tudo é o formato que o servidor já valida — o Kotlin não cria
 * um contrato concorrente, ele preenche o que já existe.
 *
 * O par (point_id, idempotency_key) usa exatamente a mesma fórmula de
 * `src/entregas/gps/validate.ts#pointId`. Se ela mudar de um lado e não do
 * outro, a deduplicação no servidor para de funcionar — por isso há teste
 * espelhado nos dois lados.
 */
object CanonicalPoint {

    const val SCHEMA_VERSION = "gps@1.0.0"
    const val BRIDGE_SCHEMA_VERSION = "android-bridge@1.0.0"

    private val ISO: SimpleDateFormat
        get() = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }

    fun iso(millis: Long): String = ISO.format(Date(millis))

    /** `gps:<device>:<trip>:<occurred_at>` — idêntico ao lado TypeScript. */
    fun pointId(deviceId: String, tripId: String, occurredAt: String): String =
        "gps:$deviceId:$tripId:$occurredAt"

    @Suppress("DEPRECATION")
    private fun isMock(location: Location): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) location.isMock else location.isFromMockProvider

    /**
     * Converte uma posição do Fused Location Provider.
     *
     * Campos ausentes ficam ausentes. `hasSpeed()`/`hasBearing()` existem
     * justamente porque o Android nem sempre tem esses valores — preencher
     * com zero seria inventar dado, e o contrato proíbe.
     */
    fun fromLocation(
        location: Location,
        tripId: String,
        deviceId: String,
        capturedOffline: Boolean,
    ): CanonicalGpsPoint {
        val occurredAt = iso(location.time)
        return CanonicalGpsPoint(
            pointId = pointId(deviceId, tripId, occurredAt),
            idempotencyKey = pointId(deviceId, tripId, occurredAt),
            tripId = tripId,
            deviceId = deviceId,
            latitude = location.latitude,
            longitude = location.longitude,
            accuracyM = location.accuracy.toDouble(),
            speedMps = if (location.hasSpeed()) location.speed.toDouble() else null,
            headingDeg = if (location.hasBearing()) location.bearing.toDouble() else null,
            altitudeM = if (location.hasAltitude()) location.altitude else null,
            occurredAt = occurredAt,
            // Relógio monotônico: não salta quando alguém mexe na hora do
            // aparelho. O servidor cruza os dois para detectar ajuste.
            elapsedRealtimeNanos = location.elapsedRealtimeNanos,
            monotonicUptimeMs = SystemClock.elapsedRealtime(),
            provider = location.provider ?: "unknown",
            isMock = isMock(location),
            capturedOffline = capturedOffline,
        )
    }
}

/**
 * Ponto canônico. Espelha `GPSPoint` do TypeScript, mais os campos que só o
 * Android sabe (monotônico, provedor, indicação de simulação).
 */
data class CanonicalGpsPoint(
    val pointId: String,
    val idempotencyKey: String,
    val tripId: String,
    val deviceId: String,
    val latitude: Double,
    val longitude: Double,
    val accuracyM: Double,
    val speedMps: Double?,
    val headingDeg: Double?,
    val altitudeM: Double?,
    val occurredAt: String,
    val elapsedRealtimeNanos: Long,
    val monotonicUptimeMs: Long,
    val provider: String,
    val isMock: Boolean,
    val capturedOffline: Boolean,
) {
    /** Serialização versionada para o servidor. */
    fun toJson(): JSONObject = JSONObject().apply {
        put("schema_version", CanonicalPoint.SCHEMA_VERSION)
        put("bridge_schema_version", CanonicalPoint.BRIDGE_SCHEMA_VERSION)
        put("point_id", pointId)
        put("idempotency_key", idempotencyKey)
        put("trip_id", tripId)
        put("device_id", deviceId)
        put("latitude", latitude)
        put("longitude", longitude)
        put("accuracy_m", accuracyM)
        speedMps?.let { put("speed_mps", it) }
        headingDeg?.let { put("heading_deg", it) }
        altitudeM?.let { put("altitude_m", it) }
        put("occurred_at", occurredAt)
        put("elapsed_realtime_ns", elapsedRealtimeNanos)
        put("provider", provider)
        put("is_mock", isMock)
        put("captured_offline", capturedOffline)
        put("source", "device")
    }

    /**
     * Mensagem para a interface, no formato que `AndroidBridgeProvider` do
     * TypeScript já espera (`AndroidLocationMessage`).
     */
    fun toBridgeMessage(timeMs: Long): JSONObject = JSONObject().apply {
        put("type", "location")
        put("latitude", latitude)
        put("longitude", longitude)
        put("accuracy_m", accuracyM)
        speedMps?.let { put("speed_mps", it) }
        headingDeg?.let { put("bearing_deg", it) }
        altitudeM?.let { put("altitude_m", it) }
        put("time_ms", timeMs)
        put("elapsed_realtime_ns", elapsedRealtimeNanos)
        put("provider", provider)
        put("is_mock", isMock)
    }
}
