/**
 * Feature flags do GPS — fonte ÚNICA e central.
 *
 * Antes desta implementação, `gps_production: false` estava repetido e
 * hardcoded em 4 lugares (module-manifest, pilot-config, run-pilot-gate-tests,
 * entregas_pilot_server). Aqui a configuração é uma só, validada, com default
 * seguro e rollback sem alterar código (Adendo GPS §5/§9).
 */

export interface GpsFeatureFlags {
  /** Captura de pontos durante viagem ativa. */
  gps_capture_enabled: boolean;
  /** Só pode ser true se o provider provar suporte — validado abaixo. */
  gps_background_enabled: boolean;
  /** Mapa e rota no console de despacho. */
  gps_map_enabled: boolean;
  /** Retorno automático por evidência real de GPS. */
  gps_return_detection_enabled: boolean;
  /** Fila offline persistente no dispositivo. */
  offline_queue_enabled: boolean;
  /** Outbox sobrevive a reinício. */
  persistent_outbox_enabled: boolean;
}

/** Default seguro: tudo desligado. Ativação é decisão explícita. */
export const SAFE_DEFAULT_FLAGS: GpsFeatureFlags = {
  gps_capture_enabled: false,
  gps_background_enabled: false,
  gps_map_enabled: false,
  gps_return_detection_enabled: false,
  offline_queue_enabled: false,
  persistent_outbox_enabled: false,
};

export interface FlagValidationIssue {
  flag: keyof GpsFeatureFlags;
  message: string;
}

/**
 * Valida coerência entre flags e capacidade real do runtime.
 * Regra dura: `gps_background_enabled` NUNCA pode ficar ligada se o provider
 * não sustenta background — isso é o P1 "background declarado sem prova".
 */
export function validateFlags(
  flags: GpsFeatureFlags,
  providerSupportsBackground: boolean,
): { ok: boolean; issues: FlagValidationIssue[]; effective: GpsFeatureFlags } {
  const issues: FlagValidationIssue[] = [];
  const effective: GpsFeatureFlags = { ...flags };

  if (flags.gps_background_enabled && !providerSupportsBackground) {
    issues.push({
      flag: "gps_background_enabled",
      message:
        "runtime atual não sustenta captura em segundo plano — flag rebaixada para false",
    });
    effective.gps_background_enabled = false; // falha fechada
  }

  if (flags.gps_return_detection_enabled && !flags.gps_capture_enabled) {
    issues.push({
      flag: "gps_return_detection_enabled",
      message:
        "retorno automático exige captura ligada — sem pontos não há evidência real",
    });
    effective.gps_return_detection_enabled = false;
  }

  if (flags.gps_map_enabled && !flags.gps_capture_enabled) {
    issues.push({
      flag: "gps_map_enabled",
      message: "mapa sem captura mostraria apenas posição vazia",
    });
    effective.gps_map_enabled = false;
  }

  return { ok: issues.length === 0, issues, effective };
}

/** Carrega flags de um objeto de config, preenchendo ausentes com o default seguro. */
export function loadFlags(raw: Partial<GpsFeatureFlags> | undefined): GpsFeatureFlags {
  return { ...SAFE_DEFAULT_FLAGS, ...(raw ?? {}) };
}
