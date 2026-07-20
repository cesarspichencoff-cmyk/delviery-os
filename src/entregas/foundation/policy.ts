/**
 * Políticas de piloto — valores configuráveis, não hardcoded no schema de domínio.
 * COR: parâmetros numéricos de GPS/retorno são piloto; max_stops vem das decisões César.
 */

export interface PilotPolicy {
  policy_bundle_id: string;
  /** Limite de paradas no piloto (default 5). Domínio aceita N; policy limita. */
  max_stops: number;
  /** COR: padrão false — exige trip_return_started antes de return auto de em_rota */
  allow_return_from_em_rota: boolean;
  /** COR §13 — usado no fechamento automático, NÃO em trip_return_started */
  require_all_active_stops_resolved: boolean;
  unconfirmed_timeout_s: number;
}

export const DEFAULT_PILOT_POLICY: PilotPolicy = {
  policy_bundle_id: "pilot-entregas-v1-default",
  max_stops: 5,
  allow_return_from_em_rota: false,
  require_all_active_stops_resolved: true,
  unconfirmed_timeout_s: 900,
};

export function createPilotPolicy(
  overrides: Partial<PilotPolicy> = {},
): PilotPolicy {
  const p = { ...DEFAULT_PILOT_POLICY, ...overrides };
  if (p.max_stops < 1) {
    throw new Error("max_stops deve ser >= 1");
  }
  return p;
}
