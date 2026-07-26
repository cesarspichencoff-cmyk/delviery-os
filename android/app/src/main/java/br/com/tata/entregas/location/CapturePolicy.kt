package br.com.tata.entregas.location

import com.google.android.gms.location.Granularity
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.Priority

/**
 * Política de captura adaptativa — porta Kotlin de
 * `src/entregas/gps/adaptive-capture.ts`.
 *
 * Os números NÃO são redefinidos aqui: a política chega do servidor
 * (`/api/policies`) e este arquivo apenas a traduz para `LocationRequest`.
 * Os valores abaixo são fallback para o caso de o app subir antes de
 * conseguir falar com o servidor, e são os mesmos do default de lá.
 */
enum class CaptureContext(val key: String) {
    EM_MOVIMENTO("em_movimento"),
    PARADO("parado"),
    PROXIMO_DA_PARADA("proximo_da_parada"),
    RETORNANDO_A_LOJA("retornando_a_loja"),
    PROXIMO_DA_LOJA("proximo_da_loja"),
    SEM_MOVIMENTO_PROLONGADO("sem_movimento_prolongado"),
    BATERIA_CRITICA("bateria_critica"),
    SINAL_IMPRECISO("sinal_impreciso"),
}

enum class CaptureAccuracy(val key: String) { HIGH("high"), BALANCED("balanced"), LOW("low"), PASSIVE("passive") }

data class CaptureDecision(
    val context: CaptureContext,
    val intervalS: Int,
    val accuracy: CaptureAccuracy,
    /** true quando a cadência caiu por limitação, não por escolha. */
    val degraded: Boolean,
    val reason: String,
    val policyVersion: String,
)

data class AdaptivePolicy(
    val version: String,
    val intervalS: Map<String, Int>,
    val accuracy: Map<String, String>,
    val maxIntervalS: Int,
) {
    companion object {
        /** Fallback idêntico ao `DEFAULT_ADAPTIVE_POLICY` do TypeScript. */
        val FALLBACK = AdaptivePolicy(
            version = "adaptive@1.0.0-piloto",
            intervalS = mapOf(
                "em_movimento" to 15,
                "parado" to 45,
                "proximo_da_parada" to 10,
                "retornando_a_loja" to 20,
                "proximo_da_loja" to 10,
                "sem_movimento_prolongado" to 120,
                "bateria_critica" to 90,
                "sinal_impreciso" to 30,
            ),
            accuracy = mapOf(
                "em_movimento" to "balanced",
                "parado" to "low",
                "proximo_da_parada" to "high",
                "retornando_a_loja" to "balanced",
                "proximo_da_loja" to "high",
                "sem_movimento_prolongado" to "low",
                "bateria_critica" to "low",
                "sinal_impreciso" to "balanced",
            ),
            maxIntervalS = 180,
        )
    }

    fun intervalFor(ctx: CaptureContext): Int =
        minOf(intervalS[ctx.key] ?: FALLBACK.intervalS.getValue(ctx.key), maxIntervalS)

    fun accuracyFor(ctx: CaptureContext): CaptureAccuracy =
        when (accuracy[ctx.key] ?: FALLBACK.accuracy.getValue(ctx.key)) {
            "high" -> CaptureAccuracy.HIGH
            "low" -> CaptureAccuracy.LOW
            "passive" -> CaptureAccuracy.PASSIVE
            else -> CaptureAccuracy.BALANCED
        }
}

object CapturePolicy {

    /**
     * Traduz a decisão para o `LocationRequest` do Fused Location Provider.
     *
     * `setGranularity(PERMISSION_LEVEL)` é deliberado: se o motoboy concedeu
     * apenas localização aproximada, o sistema devolve aproximada — o app não
     * tenta contornar a escolha dele.
     */
    fun buildRequest(decision: CaptureDecision): LocationRequest {
        val intervalMs = decision.intervalS * 1000L
        val priority = when (decision.accuracy) {
            CaptureAccuracy.HIGH -> Priority.PRIORITY_HIGH_ACCURACY
            CaptureAccuracy.BALANCED -> Priority.PRIORITY_BALANCED_POWER_ACCURACY
            CaptureAccuracy.LOW -> Priority.PRIORITY_LOW_POWER
            CaptureAccuracy.PASSIVE -> Priority.PRIORITY_PASSIVE
        }
        return LocationRequest.Builder(priority, intervalMs)
            // Nunca mais rápido que metade do intervalo: economiza bateria sem
            // descartar uma atualização boa que chegou adiantada.
            .setMinUpdateIntervalMillis(intervalMs / 2)
            // Teto de espera antes de entregar em lote — o Fused agrupa e
            // gasta menos rádio.
            .setMaxUpdateDelayMillis(intervalMs * 2)
            .setGranularity(Granularity.GRANULARITY_PERMISSION_LEVEL)
            .setWaitForAccurateLocation(decision.accuracy == CaptureAccuracy.HIGH)
            .build()
    }

    /**
     * Decide o contexto. Precedência igual à do TypeScript: limitações antes
     * de oportunidades, para que bateria crítica perto da parada continue
     * sendo bateria crítica.
     */
    fun decide(
        policy: AdaptivePolicy,
        batterySaverActive: Boolean,
        batteryLevel: Float?,
        criticalBattery: Float = 0.15f,
        lastAccuracyM: Double?,
        poorAccuracyM: Double = 100.0,
        stillForS: Long?,
        prolongedStillS: Long = 300,
        nearUnit: Boolean,
        nearStop: Boolean,
        returning: Boolean,
        moving: Boolean,
    ): CaptureDecision {
        fun build(ctx: CaptureContext, degraded: Boolean, reason: String) = CaptureDecision(
            context = ctx,
            intervalS = policy.intervalFor(ctx),
            accuracy = policy.accuracyFor(ctx),
            degraded = degraded,
            reason = reason,
            policyVersion = policy.version,
        )

        if (batterySaverActive || (batteryLevel != null && batteryLevel <= criticalBattery)) {
            return build(
                CaptureContext.BATERIA_CRITICA,
                true,
                if (batterySaverActive) "economia de bateria ativa no aparelho: cadência reduzida pelo sistema"
                else "bateria crítica: cadência reduzida para o aparelho durar a viagem",
            )
        }
        if (lastAccuracyM != null && lastAccuracyM > poorAccuracyM) {
            return build(
                CaptureContext.SINAL_IMPRECISO,
                true,
                "precisão acima do limite utilizável: amostrar mais não melhora o ponto",
            )
        }
        if (stillForS != null && stillForS >= prolongedStillS) {
            return build(CaptureContext.SEM_MOVIMENTO_PROLONGADO, false, "sem deslocamento relevante há bastante tempo: cadência longa")
        }
        if (nearUnit) {
            return build(CaptureContext.PROXIMO_DA_LOJA, false, "próximo da unidade: precisão suficiente para geofence e permanência")
        }
        if (nearStop) {
            return build(CaptureContext.PROXIMO_DA_PARADA, false, "próximo da parada: precisão temporária alta")
        }
        if (returning) {
            return build(CaptureContext.RETORNANDO_A_LOJA, false, "em retorno: cadência de rota")
        }
        return if (moving) {
            build(CaptureContext.EM_MOVIMENTO, false, "em deslocamento: cadência normal de rota")
        } else {
            build(CaptureContext.PARADO, false, "sem deslocamento relevante: cadência reduzida")
        }
    }
}
