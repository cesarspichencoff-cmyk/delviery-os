/**
 * Concessão de captura para bancadas e testes — o papel do piloto, sem o piloto.
 *
 * Segredo fixo e sintético, que só existe em teste. Em produção o segredo vem
 * do ambiente do piloto e do crítico, nunca deste arquivo.
 */
import { emitTripCaptureGrant } from "../entregas/foundation/trip-capture-grant";

export const SEGREDO_DE_CONCESSAO_DE_TESTE = "concessao-de-viagem-sintetica-de-teste-0123456789";

/** Mapa unidade → segredo, como o crítico carrega do ambiente. */
export function segredosDeConcessaoDeTeste(...unidades: string[]): ReadonlyMap<string, string> {
  return new Map((unidades.length ? unidades : ["ITAIM"]).map((u) => [u, SEGREDO_DE_CONCESSAO_DE_TESTE]));
}

/** Valor de DELIVERYOS_PILOT_TRIP_GRANT_SECRETS para processos de bancada. */
export function ambienteDeConcessaoDeTeste(...unidades: string[]): string {
  return JSON.stringify(Object.fromEntries((unidades.length ? unidades : ["ITAIM"]).map((u) => [u, SEGREDO_DE_CONCESSAO_DE_TESTE])));
}

/** Concessão como o piloto emitiria para este motoboy, neste aparelho, nesta viagem. */
export function concessaoDeTeste(o: {
  unit_id?: string;
  actor_id: string;
  device_id: string;
  trip_id: string;
  agora: Date;
  /** Início da viagem; padrão: uma hora antes de `agora`. */
  inicio?: Date;
  /** Encerramento; ausente = viagem aberta. */
  fim?: Date | null;
}): string {
  return emitTripCaptureGrant({
    unit_id: o.unit_id ?? "ITAIM", actor_id: o.actor_id, device_id: o.device_id, trip_id: o.trip_id,
    started_at: o.inicio ?? new Date(o.agora.getTime() - 60 * 60_000), closed_at: o.fim ?? null,
    now: o.agora, secret: SEGREDO_DE_CONCESSAO_DE_TESTE,
  });
}

/*
 * A bancada faz o papel do piloto: guarda qual motoboy o humano vinculou a cada
 * aparelho e emite a concessão de qualquer viagem que esse aparelho capture.
 * Nas bancadas de cadeia a viagem não existe no piloto; o que se prova lá é a
 * plataforma. A decisão do piloto (viagem deste motoboy?) é provada à parte.
 */
const vinculosDaBancada = new Map<string, { unit_id: string; actor_id: string }>();
const donosDasViagens = new Map<string, { unit_id: string; actor_id: string }>();

/** A atribuição viagem → motoboy, que no sistema real é do piloto. */
export function registrarViagemDeTeste(trip_id: string, unit_id: string, actor_id: string): void {
  donosDasViagens.set(trip_id, { unit_id, actor_id });
}

export function registrarVinculoDeTeste(device_id: string, unit_id: string, actor_id: string): void {
  vinculosDaBancada.set(device_id, { unit_id, actor_id });
}

export function esquecerVinculoDeTeste(device_id: string): void {
  vinculosDaBancada.delete(device_id);
}

export const concessaoDaBancada = (tripId: string, deviceId: string): string | null => {
  const v = vinculosDaBancada.get(deviceId);
  const dono = donosDasViagens.get(tripId);
  // Como o piloto: só concede a viagem do motoboy vinculado a este aparelho.
  if (!v || !dono || dono.actor_id !== v.actor_id || dono.unit_id !== v.unit_id) return null;
  return v ? concessaoDeTeste({ unit_id: v.unit_id, actor_id: v.actor_id, device_id: deviceId, trip_id: tripId, agora: new Date() }) : null;
};
