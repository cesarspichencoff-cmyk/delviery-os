/**
 * FIXTURE da leitura de Entregas — ESTE ARQUIVO E FIXTURE.
 *
 * Uma `RealidadeDeEntregas` deterministica, no formato exato que a porta
 * `src/platform/leitura/realidade-de-entregas.ts` devolve. Todo fato e
 * `simulated`: nada aqui aconteceu na rua, e a tela tem de dizer isso.
 *
 * As viagens NAO sao escritas a mao: os envelopes passam pela MESMA
 * `projetar()` da Operacao Viva. Uma fixture que inventasse estado ou frescor
 * provaria a fixture, nao o produto.
 *
 * Cenario (AGORA = 2026-10-09T12:43:00Z = 09h43 em Sao Paulo):
 *   ITAIM
 *     dev-a  T-101 em rota, posicao ha 40 s .................. sinal cheio
 *     dev-b  T-102 em rota, posicao ha 9 min; fila 37+2 ha 52 min
 *     dev-c  T-103 retornando, posicao ha 3 min; fila 5 ha 35 min
 *     dev-d  cadastro incompleto (sem pre-vinculo)
 *     dev-e  vinculado, nunca mandou lote
 *     dev-f  revogado; T-099 encerrada ontem
 *     dev-h  T-301 so por GPS (ciclo desconhecido), posicao ha 30 s
 *            T-302 so por GPS, ultima posicao ha 2 h
 *     ---    T-104 criada, aguardando saida (sem aparelho)
 *   VILA-LAB
 *     dev-g  T-201 em rota; relogio do aparelho 9 min a frente
 */

import type { EventEnvelope, EventType } from "../../src/platform/contracts/event-catalog";
import { projetar } from "../../src/platform/projections/operacao-viva";
import { relogioEfetivo } from "../../src/platform/contracts/relogio";
import type {
  AparelhoReal,
  RealidadeDeEntregas,
  UltimoLote,
} from "../../src/platform/leitura/realidade-de-entregas";

export const AGORA_FIXTURE = "2026-10-09T12:43:00.000Z";
const T0 = Date.parse(AGORA_FIXTURE);
export const ha = (s: number): string => new Date(T0 - s * 1000).toISOString();

let seq = 0;
function fato(
  unit_id: string,
  trip_id: string,
  event_type: EventType,
  ocorreuHa: number,
  recebeuHa: number,
  device_id?: string,
): EventEnvelope {
  seq += 1;
  const occurred_at = ha(ocorreuHa);
  const received_at = ha(recebeuHa);
  return {
    event_id: `ev-${trip_id}-${event_type}-${ocorreuHa}`,
    event_type,
    event_version: `${event_type}@1.0.0`,
    unit_id,
    trip_id,
    device_id,
    occurred_at,
    received_at,
    clock_trust: relogioEfetivo({ occurred_at, received_at, clock_trust: "trusted" }),
    origin: "device",
    source_mode: "simulated",
    sequence: seq,
    idempotency_key: `k-${trip_id}-${event_type}-${ocorreuHa}`,
    payload: {},
  };
}

function eventos(): EventEnvelope[] {
  seq = 0;
  const e: EventEnvelope[] = [];
  // ITAIM
  e.push(fato("ITAIM", "T-101", "trip_created", 1500, 1500, "dev-a"));
  e.push(fato("ITAIM", "T-101", "trip_started", 1400, 1400, "dev-a"));
  for (const s of [900, 600, 300, 120, 40]) e.push(fato("ITAIM", "T-101", "gps_batch_received", s, s - 5, "dev-a"));
  e.push(fato("ITAIM", "T-102", "trip_created", 2400, 2400, "dev-b"));
  e.push(fato("ITAIM", "T-102", "trip_started", 2300, 2300, "dev-b"));
  for (const s of [1500, 1100, 540]) e.push(fato("ITAIM", "T-102", "gps_batch_received", s, s - 3, "dev-b"));
  e.push(fato("ITAIM", "T-103", "trip_created", 3000, 3000, "dev-c"));
  e.push(fato("ITAIM", "T-103", "trip_started", 2900, 2900, "dev-c"));
  e.push(fato("ITAIM", "T-103", "delivery_confirmed", 900, 890, "dev-c"));
  e.push(fato("ITAIM", "T-103", "trip_return_started", 600, 595, "dev-c"));
  for (const s of [500, 180]) e.push(fato("ITAIM", "T-103", "gps_batch_received", s, s - 2, "dev-c"));
  e.push(fato("ITAIM", "T-104", "trip_created", 120, 120));
  e.push(fato("ITAIM", "T-099", "trip_created", 95000, 95000, "dev-f"));
  e.push(fato("ITAIM", "T-099", "gps_batch_received", 94000, 93990, "dev-f"));
  e.push(fato("ITAIM", "T-099", "trip_closed", 92000, 92000, "dev-f"));
  e.push(fato("ITAIM", "T-302", "gps_batch_received", 7200, 7190, "dev-h"));
  e.push(fato("ITAIM", "T-301", "gps_batch_received", 30, 28, "dev-h"));
  // VILA-LAB: o aparelho diz 12:52 (9 min a frente); o servidor recebeu ha 60 s.
  e.push(fato("VILA-LAB", "T-201", "trip_created", 800, 800, "dev-g"));
  e.push(fato("VILA-LAB", "T-201", "trip_started", 700, 700, "dev-g"));
  e.push(fato("VILA-LAB", "T-201", "gps_batch_received", -540, 60, "dev-g"));
  return e;
}

function lote(e: EventEnvelope): UltimoLote {
  return {
    occurred_at: e.occurred_at,
    recorded_at: e.received_at!,
    relogio: relogioEfetivo({ occurred_at: e.occurred_at, received_at: e.received_at, clock_trust: e.clock_trust }),
    trip_id: e.trip_id ?? null,
    source_mode: e.source_mode,
    correlation_id: null,
  };
}

function ultimoLoteDe(todos: EventEnvelope[], device: string): UltimoLote | null {
  const lotes = todos
    .filter((e) => e.device_id === device && e.event_type === "gps_batch_received")
    .sort((x, y) => Date.parse(y.received_at!) - Date.parse(x.received_at!));
  return lotes[0] ? lote(lotes[0]) : null;
}

function contagem(todos: EventEnvelope[], device: string): AparelhoReal["fatos_por_modo"] {
  const n = todos.filter((e) => e.device_id === device && e.event_type === "gps_batch_received").length;
  return { real: 0, simulated: n, control: 0 };
}

export interface OpcoesFixture {
  /** Remove a unidade VILA-LAB inteira (cadastro e fatos). */
  soItaim?: boolean;
}

export function realidadeFixture(o: OpcoesFixture = {}): RealidadeDeEntregas {
  const todos = eventos().filter((e) => !(o.soItaim && e.unit_id === "VILA-LAB"));
  const ap = (
    device_id: string,
    unit_id: string,
    label: string,
    extra: Partial<AparelhoReal>,
  ): AparelhoReal => ({
    device_id,
    unit_id,
    actor_id: `rider-${device_id.slice(-1)}`,
    label,
    autorizado_em: ha(200000),
    credencial_vinculada_em: ha(86400),
    ultima_sessao_em: ha(600),
    app_version: "1.4.2",
    revogado_em: null,
    fila_offline: null,
    fatos_por_modo: contagem(todos, device_id),
    ultimo_lote: ultimoLoteDe(todos, device_id),
    ...extra,
  });
  const aparelhos: AparelhoReal[] = [
    ap("dev-a", "ITAIM", "Moto 01 · celular A", { ultima_sessao_em: ha(180), fila_offline: { pending_points: 0, pending_events: 0, reportada_em: ha(240) } }),
    ap("dev-b", "ITAIM", "Moto 02 · celular B", { ultima_sessao_em: ha(3300), fila_offline: { pending_points: 37, pending_events: 2, reportada_em: ha(3120) } }),
    ap("dev-c", "ITAIM", "Moto 03 · celular C", { app_version: "1.4.1", fila_offline: { pending_points: 5, pending_events: 0, reportada_em: ha(2100) } }),
    ap("dev-d", "ITAIM", "Moto 04 · celular D", { credencial_vinculada_em: null, ultima_sessao_em: null, app_version: null }),
    ap("dev-e", "ITAIM", "Moto 05 · celular E", { ultima_sessao_em: ha(7000) }),
    ap("dev-f", "ITAIM", "Moto 06 · celular F", { ultima_sessao_em: ha(90000), app_version: "1.3.9", revogado_em: ha(7200), fila_offline: { pending_points: 3, pending_events: 1, reportada_em: ha(90000) } }),
    ap("dev-h", "ITAIM", "Moto 08 · celular H", { ultima_sessao_em: ha(100) }),
    ...(o.soItaim
      ? []
      : [ap("dev-g", "VILA-LAB", "Moto 07 · celular G", { ultima_sessao_em: ha(120), fila_offline: { pending_points: 1, pending_events: 0, reportada_em: ha(300) } })]),
  ];
  const unidades = [...new Set(todos.map((e) => e.unit_id))].sort();
  return {
    versao: "fixture-entregas-leitura-da-rua",
    fonte: "postgresql",
    lida_em: AGORA_FIXTURE,
    aparelhos,
    projecoes: unidades.map((unit_id) => ({
      unit_id,
      source_mode: "simulated" as const,
      viagens: projetar(todos, { agora: new Date(AGORA_FIXTURE), unit_id, source_mode: "simulated" }).viagens,
    })),
    historico_sem_modo: 2,
  };
}
