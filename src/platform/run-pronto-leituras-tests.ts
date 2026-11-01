/**
 * Duas leituras do pronto, independentes.
 *
 *  - ESTADO ATUAL: o que está esperando AGORA. Pedidos ainda na fila (evidência:
 *    a própria fila) e pedidos já numa viagem que não saiu (evidência: fatos
 *    duráveis). Cada pedido conta uma vez; fonte ausente é ausência, não zero.
 *  - TRAJETÓRIA: registro → associação à entrega → saída, só com fatos duráveis
 *    e vínculos provados (mesma viagem, mesma entrega).
 *
 * O `delivery_ready` é gravado QUANDO o pedido entra na viagem e preserva, para
 * trás, o instante original do registro. Ele reconstrói a trajetória; sozinho,
 * não enxerga o pedido que continua na fila. Esta suíte prova a diferença.
 *
 * Também prova que o fato da entrega entra na plataforma sem mexer no estado da
 * viagem, que o consumidor assíncrono o reconhece sem dead-letter, e o fluxo
 * inteiro num PostgreSQL isolado (DELIVERYOS_PG_URL; sem ele, PULADO em voz alta).
 */
import assert from "node:assert/strict";
import { join } from "node:path";

import type { EntregasPublicEvent } from "../entregas/contracts/events/types";
import { adaptarEventoPublicoEntregas } from "./ingest/entregas-shadow-adapter";
import { checkEvent, type EventEnvelope } from "./contracts/event-catalog";
import { tiposComContrato, validarPayload } from "./contracts/event-schema";
import { projetar } from "./projections/operacao-viva";
import { TIPOS_DA_OPERACAO_VIVA } from "./runtime/handler-operacao-viva";

const UNIT = "ITAIM";
let passed = 0;
const failures: string[] = [];

async function teste(nome: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  OK   ${nome}`);
  } catch (e) {
    failures.push(nome);
    console.error(`  FAIL ${nome}\n       ${(e as Error).message.split("\n").slice(0, 6).join("\n       ")}`);
  }
}

/** O módulo das leituras: ausente antes da integração (o vermelho diz isso). */
async function leituras(): Promise<typeof import("./leitura/prontos-de-entregas")> {
  try {
    return await import(join(__dirname, "leitura", "prontos-de-entregas"));
  } catch (e) {
    throw new Error(`módulo de leituras do pronto ausente: ${(e as Error).message.split("\n")[0]}`);
  }
}

async function consumidor(): Promise<typeof import("./runtime/handler-trajetoria-pronto")> {
  try {
    return await import(join(__dirname, "runtime", "handler-trajetoria-pronto"));
  } catch (e) {
    throw new Error(`consumidor da trajetória do pronto ausente: ${(e as Error).message.split("\n")[0]}`);
  }
}

/* ------------------------------------------------------------------ *
 * Fatos sintéticos, no formato que a plataforma guarda                 *
 * ------------------------------------------------------------------ */

type Modo = "real" | "simulated" | "control";
interface Fato {
  event_id: string;
  event_type: string;
  unit_id: string;
  trip_id: string | null;
  occurred_at: string;
  idempotency_key: string;
  source_mode: Modo | null;
  payload: Record<string, unknown>;
}

const H = (hhmm: string) => `2026-11-01T${hhmm}:00.000Z`;

function pronto(o: { id: string; trip: string; entrega: string; pedido: string; registro: string; associacao: string; modo?: Modo; unidade?: string }): Fato {
  return {
    event_id: `ev-pronto-${o.id}`,
    event_type: "delivery_ready",
    unit_id: o.unidade ?? UNIT,
    trip_id: o.trip,
    occurred_at: H(o.registro),
    idempotency_key: `entregas-public:delivery_ready:${o.unidade ?? UNIT}:${o.pedido}:${H(o.registro)}`,
    source_mode: o.modo === undefined ? "simulated" : o.modo,
    payload: {
      source_event_type: "delivery_ready",
      public_recorded_at: H(o.associacao),
      delivery_id: o.entrega,
      order_ref: o.pedido,
      ready_kind: "registro_expedicao",
    },
  };
}

function saida(o: { id: string; trip: string; quando: string; registrado?: string; modo?: Modo }): Fato {
  return {
    event_id: `ev-saida-${o.id}`,
    event_type: "trip_started",
    unit_id: UNIT,
    trip_id: o.trip,
    occurred_at: H(o.quando),
    idempotency_key: `entregas-public:trip_started:${o.trip}`,
    source_mode: o.modo ?? "simulated",
    payload: { source_event_type: "trip_started", public_recorded_at: H(o.registrado ?? o.quando) },
  };
}

function retirada(o: { id: string; trip: string; entrega: string; pedido: string; quando: string; modo?: Modo }): Fato {
  return {
    event_id: `ev-retirada-${o.id}`,
    event_type: "delivery_removed",
    unit_id: UNIT,
    trip_id: o.trip,
    occurred_at: H(o.quando),
    idempotency_key: `entregas-public:delivery_removed:${o.entrega}:${H(o.quando)}`,
    source_mode: o.modo ?? "simulated",
    payload: { source_event_type: "delivery_removed", public_recorded_at: H(o.quando), delivery_id: o.entrega, order_ref: o.pedido },
  };
}

const fila = (linhas: Array<[string, string]>) => ({
  disponivel: true as const,
  linhas: linhas.map(([order_ref, hhmm]) => ({ order_ref, registered_at: H(hhmm), channel: "proprio" })),
});
const eventos = (fatos: Fato[]) => ({ disponivel: true as const, eventos: fatos });

function grupo<T extends { source_mode: string }>(grupos: readonly T[], modo: string): T | undefined {
  return grupos.find((g) => g.source_mode === modo);
}

/* ------------------------------------------------------------------ *
 * Evento público como a outbox do piloto entrega                       *
 * ------------------------------------------------------------------ */

function publico(tipo: string, extra: Partial<EntregasPublicEvent> & { payload?: Record<string, unknown> } = {}): EntregasPublicEvent {
  return {
    event_id: `pub-${tipo}-1`,
    event_type: tipo,
    schema_version: "1.0.0",
    occurred_at: H("10:01"),
    recorded_at: H("10:05"),
    idempotency_key: `${tipo}:${UNIT}:P-1:${H("10:01")}`,
    source: "entregas",
    source_health: "ok",
    confidence: "observed",
    unit_id: UNIT,
    source_mode: "simulated",
    trip_id: "T1",
    delivery_id: "D1",
    correlation_id: "T1",
    contract_version: "entregas-contract@1",
    payload: {},
    ...extra,
  } as EntregasPublicEvent;
}

async function main(): Promise<void> {
  console.log("PRONTO — estado atual (fila) e trajetória (fatos), independentes");

  /* ---------------- leituras puras ---------------- */

  await teste("R1 a diferença: 3 prontos esperando, só 1 delivery_ready — a fila conta 2, a viagem que não saiu conta 1", async () => {
    const L = await leituras();
    const fatos = [pronto({ id: "A", trip: "T1", entrega: "DA", pedido: "A", registro: "10:01", associacao: "10:05" })];
    const atual = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"), fila: fila([["B", "10:02"], ["C", "10:03"]]), eventos: eventos(fatos) });
    assert.equal(atual.na_fila.estado, "observado");
    // A linha sem modo declarado fica no grupo `nao_declarado`: nunca vira real.
    assert.deepEqual(atual.na_fila.grupos.map((g) => g.source_mode), ["nao_declarado"], "a fila sem modo virou outro modo");
    assert.equal(grupo(atual.na_fila.grupos, "nao_declarado")?.total, 2);
    assert.deepEqual(grupo(atual.na_fila.grupos, "nao_declarado")?.pedidos.map((p) => p.order_ref), ["B", "C"]);
    const g = grupo(atual.aguardando_saida.grupos, "simulated");
    assert.equal(g?.total, 1);
    assert.equal(g?.entregas[0]?.order_ref, "A");
    assert.equal(g?.entregas[0]?.registrado_em, H("10:01"));
    const traj = L.lerTrajetoriaDoPronto({ unit_id: UNIT, eventos: eventos(fatos) });
    const t = grupo(traj.grupos, "simulated")!.entregas;
    assert.equal(t.length, 1, "a trajetória só conhece o que entrou em viagem");
    assert.equal(t[0]!.situacao, "aguardando_saida");
    assert.equal(t[0]!.registro_ate_associacao_s, 240);
    assert.equal(t[0]!.saiu_em, null);
  });

  await teste("R2 sem dupla contagem: linha velha da fila com o MESMO registro de um fato conta só uma vez", async () => {
    const L = await leituras();
    const fatos = [pronto({ id: "A", trip: "T1", entrega: "DA", pedido: "A", registro: "10:01", associacao: "10:05" })];
    const atual = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"),
      fila: fila([["A", "10:01"], ["B", "10:02"]]), eventos: eventos(fatos) });
    assert.deepEqual(grupo(atual.na_fila.grupos, "nao_declarado")?.pedidos.map((p) => p.order_ref), ["B"]);
    assert.equal(atual.fila_velha, 1);
    assert.equal(grupo(atual.aguardando_saida.grupos, "simulated")?.total, 1);
  });

  await teste("R3 ausência não é zero: fila ou fatos indisponíveis ficam null; fila lida e vazia é zero observado", async () => {
    const L = await leituras();
    const semFila = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"),
      fila: { disponivel: false, motivo: "fila_indisponivel_no_modo_arquivo" }, eventos: eventos([]) });
    assert.equal(semFila.na_fila.estado, "indisponivel");
    assert.deepEqual(semFila.na_fila.grupos, [], "fila indisponível ganhou grupo (zero inventado)");
    assert.equal(semFila.fila_velha, null);
    const semFatos = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"),
      fila: fila([]), eventos: { disponivel: false, motivo: "event_log_indisponivel" } });
    // Fila lida e vazia: observada, sem grupos — zero OBSERVADO.
    assert.equal(semFatos.na_fila.estado, "observado");
    assert.deepEqual(semFatos.na_fila.grupos, []);
    assert.equal(semFatos.aguardando_saida.estado, "indisponivel");
    assert.deepEqual(semFatos.aguardando_saida.grupos, []);
    const traj = L.lerTrajetoriaDoPronto({ unit_id: UNIT, eventos: { disponivel: false, motivo: "event_log_indisponivel" } });
    assert.equal(traj.estado, "indisponivel");
    assert.deepEqual(traj.grupos, []);
  });

  await teste("R4 trajetória completa: registro → associação → saída, com os três intervalos", async () => {
    const L = await leituras();
    const traj = L.lerTrajetoriaDoPronto({ unit_id: UNIT, eventos: eventos([
      pronto({ id: "A", trip: "T1", entrega: "DA", pedido: "A", registro: "10:01", associacao: "10:05" }),
      saida({ id: "1", trip: "T1", quando: "10:09" }),
    ]) });
    const a = grupo(traj.grupos, "simulated")!.entregas[0]!;
    assert.equal(a.situacao, "saiu");
    assert.equal(a.saiu_em, H("10:09"));
    assert.equal(a.registro_ate_associacao_s, 240);
    assert.equal(a.associacao_ate_saida_s, 240);
    assert.equal(a.registro_ate_saida_s, 480);
  });

  await teste("R5 retirado antes da saída: não herda a saída da viagem, nem fica 'aguardando'", async () => {
    const L = await leituras();
    const fatos = [
      pronto({ id: "D", trip: "T1", entrega: "DD", pedido: "D", registro: "10:02", associacao: "10:05" }),
      retirada({ id: "D", trip: "T1", entrega: "DD", pedido: "D", quando: "10:07" }),
      saida({ id: "1", trip: "T1", quando: "10:09" }),
    ];
    const d = grupo(L.lerTrajetoriaDoPronto({ unit_id: UNIT, eventos: eventos(fatos) }).grupos, "simulated")!.entregas[0]!;
    assert.equal(d.situacao, "retirado_antes_da_saida");
    assert.equal(d.saiu_em, null);
    assert.equal(d.retirado_em, H("10:07"));
    assert.equal(d.registro_ate_saida_s, null);
    assert.equal(d.associacao_ate_saida_s, null);
    const atual = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"), fila: fila([]), eventos: eventos(fatos) });
    assert.equal(grupo(atual.aguardando_saida.grupos, "simulated")?.total ?? 0, 0);
    assert.equal(grupo(atual.retirados_sem_novo_registro.grupos, "simulated")?.total, 1);
  });

  await teste("R6 acrescentado depois da saída: a saída da viagem não é a dele (fica desconhecida)", async () => {
    const L = await leituras();
    const e = grupo(L.lerTrajetoriaDoPronto({ unit_id: UNIT, eventos: eventos([
      saida({ id: "1", trip: "T1", quando: "10:09" }),
      pronto({ id: "E", trip: "T1", entrega: "DE", pedido: "E", registro: "10:04", associacao: "10:12" }),
    ]) }).grupos, "simulated")!.entregas[0]!;
    assert.equal(e.situacao, "associado_depois_da_saida");
    assert.equal(e.saiu_em, null);
    assert.equal(e.registro_ate_associacao_s, 480);
    assert.equal(e.associacao_ate_saida_s, null);
  });

  await teste("R7 acrescentado antes da saída: o intervalo começa na associação DELE, não na criação da viagem", async () => {
    const L = await leituras();
    const f = grupo(L.lerTrajetoriaDoPronto({ unit_id: UNIT, eventos: eventos([
      pronto({ id: "F", trip: "T1", entrega: "DF", pedido: "F", registro: "10:03", associacao: "10:08" }),
      saida({ id: "1", trip: "T1", quando: "10:09" }),
    ]) }).grupos, "simulated")!.entregas[0]!;
    assert.equal(f.situacao, "saiu");
    assert.equal(f.associacao_ate_saida_s, 60);
    assert.equal(f.registro_ate_saida_s, 360);
  });

  await teste("R8 fora de ordem: qualquer ordem de chegada dá a mesma trajetória e o mesmo estado", async () => {
    const L = await leituras();
    const base = [
      pronto({ id: "A", trip: "T1", entrega: "DA", pedido: "A", registro: "10:01", associacao: "10:05" }),
      pronto({ id: "D", trip: "T1", entrega: "DD", pedido: "D", registro: "10:02", associacao: "10:05" }),
      retirada({ id: "D", trip: "T1", entrega: "DD", pedido: "D", quando: "10:07" }),
      saida({ id: "1", trip: "T1", quando: "10:09" }),
    ];
    const ref = JSON.stringify(L.lerTrajetoriaDoPronto({ unit_id: UNIT, eventos: eventos(base) }));
    const refAtual = JSON.stringify(L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"), fila: fila([["B", "10:02"]]), eventos: eventos(base) }));
    for (const ordem of [[3, 2, 1, 0], [2, 0, 3, 1], [1, 3, 0, 2]]) {
      const emb = ordem.map((i) => base[i]!);
      assert.equal(JSON.stringify(L.lerTrajetoriaDoPronto({ unit_id: UNIT, eventos: eventos(emb) })), ref, `ordem ${ordem}`);
      assert.equal(JSON.stringify(L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"), fila: fila([["B", "10:02"]]), eventos: eventos(emb) })), refAtual);
    }
  });

  await teste("R9 idempotência: fato repetido conta uma vez; dois registros diferentes para a mesma entrega viram conflito", async () => {
    const L = await leituras();
    const a = pronto({ id: "A", trip: "T1", entrega: "DA", pedido: "A", registro: "10:01", associacao: "10:05" });
    const traj = L.lerTrajetoriaDoPronto({ unit_id: UNIT, eventos: eventos([a, { ...a }, { ...a, event_id: "ev-pronto-A-reenvio" }]) });
    assert.equal(grupo(traj.grupos, "simulated")!.entregas.length, 1);
    const outro = pronto({ id: "A2", trip: "T1", entrega: "DA", pedido: "A", registro: "10:03", associacao: "10:05" });
    const conflito = L.lerTrajetoriaDoPronto({ unit_id: UNIT, eventos: eventos([a, outro]) });
    const e = grupo(conflito.grupos, "simulated")!.entregas;
    assert.equal(e.length, 1);
    assert.equal(e[0]!.situacao, "inconsistente");
    assert.ok(conflito.conflitos.some((c) => c.delivery_id === "DA"));
  });

  await teste("R10 modo: real e simulado nunca se somam; fato sem modo fica fora e é contado", async () => {
    const L = await leituras();
    const fatos = [
      pronto({ id: "A", trip: "T1", entrega: "DA", pedido: "A", registro: "10:01", associacao: "10:05", modo: "simulated" }),
      pronto({ id: "R", trip: "TR", entrega: "DR", pedido: "R", registro: "10:01", associacao: "10:05", modo: "real" }),
      { ...pronto({ id: "N", trip: "TN", entrega: "DN", pedido: "N", registro: "10:01", associacao: "10:05" }), source_mode: null },
    ];
    const traj = L.lerTrajetoriaDoPronto({ unit_id: UNIT, eventos: eventos(fatos) });
    assert.equal(grupo(traj.grupos, "simulated")!.entregas.length, 1);
    assert.equal(grupo(traj.grupos, "real")!.entregas.length, 1);
    assert.equal(traj.sem_modo, 1);
    const atual = L.lerEstadoAtualDoPronto({ unit_id: UNIT, agora: H("10:10"), fila: fila([]), eventos: eventos(fatos) });
    assert.equal(grupo(atual.aguardando_saida.grupos, "simulated")?.total, 1);
    assert.equal(grupo(atual.aguardando_saida.grupos, "real")?.total, 1);
  });

  await teste("R11 unidade: fato de outra loja não entra", async () => {
    const L = await leituras();
    const traj = L.lerTrajetoriaDoPronto({ unit_id: UNIT, eventos: eventos([
      pronto({ id: "X", trip: "TX", entrega: "DX", pedido: "X", registro: "10:01", associacao: "10:05", unidade: "MOOCA" }),
    ]) });
    assert.equal(traj.grupos.reduce((n, g) => n + g.entregas.length, 0), 0);
  });

  await teste("R12 relógio: saída declarada antes da associação, mas registrada depois no servidor — inconsistente, sem intervalo inventado", async () => {
    const L = await leituras();
    const a = grupo(L.lerTrajetoriaDoPronto({ unit_id: UNIT, eventos: eventos([
      pronto({ id: "A", trip: "T1", entrega: "DA", pedido: "A", registro: "10:01", associacao: "10:05" }),
      saida({ id: "1", trip: "T1", quando: "10:04", registrado: "10:09" }),
    ]) }).grupos, "simulated")!.entregas[0]!;
    assert.equal(a.situacao, "inconsistente");
    assert.equal(a.associacao_ate_saida_s, null);
    assert.equal(a.registro_ate_saida_s, null);
    assert.equal(a.registro_ate_associacao_s, 240, "o trecho com relógio do servidor continua medido");
  });

  /* ---------------- adaptador e contrato ---------------- */

  await teste("A1 delivery_ready entra na plataforma como fato DA ENTREGA, com vínculo, modo, chave e só campos permitidos", () => {
    const r = adaptarEventoPublicoEntregas(publico("delivery_ready", {
      payload: { trip_id: "T1", order_ref: "P-1", channel: "proprio", ready_kind: "registro_expedicao",
        production_completed_at: null, prepared_by: null, label: "Rua Sintética 9", actor_id: "ops-1" } as Record<string, unknown>,
    }));
    assert.equal(r.ok, true, `recusado: ${JSON.stringify(r)}`);
    if (!r.ok) return;
    assert.equal(r.evento.event_type, "delivery_ready");
    assert.equal(r.evento.trip_id, "T1");
    assert.equal(r.evento.occurred_at, H("10:01"), "o instante do registro atravessa intacto");
    assert.equal(r.evento.source_mode, "simulated");
    assert.equal(r.evento.idempotency_key, `entregas-public:delivery_ready:${UNIT}:P-1:${H("10:01")}`);
    assert.deepEqual(Object.keys(r.evento.payload).sort(),
      ["channel", "delivery_id", "entregas_contract_version", "order_ref", "public_recorded_at", "ready_kind", "source_event_type"]);
    assert.equal(r.evento.payload.delivery_id, "D1");
    assert.equal(r.evento.payload.public_recorded_at, H("10:05"));
    assert.equal(JSON.stringify(r.evento).includes("Rua Sintética"), false);
    assert.equal(JSON.stringify(r.evento).includes("ops-1"), false);
  });

  await teste("A2 delivery_removed entra como fato da entrega, sem motivo livre nem autor", () => {
    const r = adaptarEventoPublicoEntregas(publico("delivery_removed", {
      idempotency_key: "delivery_removed:D1:x",
      payload: { trip_id: "T1", order_ref: "P-1", reason: "cliente ligou: Rua Sintética 9", removed_by: "ops-1", active: false },
    }));
    assert.equal(r.ok, true, `recusado: ${JSON.stringify(r)}`);
    if (!r.ok) return;
    assert.equal(r.evento.event_type, "delivery_removed");
    assert.deepEqual(Object.keys(r.evento.payload).sort(),
      ["delivery_id", "entregas_contract_version", "order_ref", "public_recorded_at", "source_event_type"]);
    assert.equal(JSON.stringify(r.evento).includes("Rua Sintética"), false);
    assert.equal(JSON.stringify(r.evento).includes("ops-1"), false);
  });

  await teste("A3 sem entrega ou sem pedido, o fato não entra (não se inventa vínculo)", () => {
    const semEntrega = adaptarEventoPublicoEntregas(publico("delivery_ready", { delivery_id: undefined, payload: { order_ref: "P-1" } }));
    assert.equal(semEntrega.ok, false);
    const semPedido = adaptarEventoPublicoEntregas(publico("delivery_ready", { payload: {} }));
    assert.equal(semPedido.ok, false);
  });

  await teste("A4 eventos de viagem continuam com o mesmo mapeamento", () => {
    const r = adaptarEventoPublicoEntregas(publico("trip_started", { idempotency_key: "trip_started:T1" }));
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.evento.event_type, "trip_started");
  });

  await teste("A5 sinal delivery_ready solto, sem a semântica de registro, continua sem equivalência segura (contrato dos LAB do CI)", () => {
    for (const payload of [{ lab_only: true }, { order_ref: "P-1" }, { order_ref: "P-1", ready_kind: "producao_concluida" }]) {
      const r = adaptarEventoPublicoEntregas(publico("delivery_ready", { delivery_id: undefined, payload }));
      assert.equal(r.ok, false, JSON.stringify(payload));
      if (!r.ok) assert.equal(r.motivo, "tipo_sem_equivalencia_segura", JSON.stringify(payload));
    }
    const comSemantica = adaptarEventoPublicoEntregas(publico("delivery_ready", { delivery_id: undefined,
      payload: { order_ref: "P-1", ready_kind: "registro_expedicao" } }));
    assert.equal(comSemantica.ok, false);
    if (!comSemantica.ok) assert.equal(comSemantica.motivo, "delivery_id_ausente");
  });

  await teste("K1 contrato: os dois tipos têm contrato, o envelope adaptado passa no portão e o payload no schema", () => {
    const com = tiposComContrato();
    assert.ok(com.includes("delivery_ready"), "delivery_ready sem contrato na plataforma");
    assert.ok(com.includes("delivery_removed"), "delivery_removed sem contrato na plataforma");
    const r = adaptarEventoPublicoEntregas(publico("delivery_ready", { payload: { order_ref: "P-1", ready_kind: "registro_expedicao" } }));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const c = checkEvent(r.evento);
    assert.equal(c.ok, true, JSON.stringify(c));
    const v = validarPayload(r.evento.event_type, r.evento.payload);
    assert.equal(v.ok, true, `payload fora do schema: ${JSON.stringify(v)}`);
    const semEntrega = { ...r.evento.payload } as Record<string, unknown>;
    delete semEntrega.delivery_id;
    assert.equal(validarPayload("delivery_ready", semEntrega).ok, false, "payload sem delivery_id passou no schema");
  });

  await teste("V1 a viagem não muda: a projeção com os fatos da entrega é idêntica à projeção sem eles", () => {
    const viagem: EventEnvelope[] = [
      { event_id: "v1", event_type: "trip_created", event_version: "trip_created@1.0.0", unit_id: UNIT, trip_id: "T1",
        occurred_at: H("10:05"), origin: "source", source_mode: "simulated", idempotency_key: "k-v1", payload: {} } as EventEnvelope,
      { event_id: "v2", event_type: "trip_started", event_version: "trip_started@1.0.0", unit_id: UNIT, trip_id: "T1",
        occurred_at: H("10:09"), origin: "source", source_mode: "simulated", idempotency_key: "k-v2", payload: {} } as EventEnvelope,
    ];
    const entrega: EventEnvelope[] = [
      { event_id: "e1", event_type: "delivery_ready", event_version: "delivery_ready@1.0.0", unit_id: UNIT, trip_id: "T1",
        occurred_at: H("09:00"), origin: "source", source_mode: "simulated", idempotency_key: "k-e1", payload: {} } as unknown as EventEnvelope,
      { event_id: "e2", event_type: "delivery_removed", event_version: "delivery_removed@1.0.0", unit_id: UNIT, trip_id: "T1",
        occurred_at: H("11:00"), origin: "source", source_mode: "simulated", idempotency_key: "k-e2", payload: {} } as unknown as EventEnvelope,
    ];
    assert.equal(TIPOS_DA_OPERACAO_VIVA.includes("delivery_ready"), false, "a Operação Viva passaria a consumir o fato da entrega");
    assert.equal(TIPOS_DA_OPERACAO_VIVA.includes("delivery_removed"), false);
    const opcoes = { agora: new Date(H("10:30")), unit_id: UNIT, source_mode: "simulated" as const };
    const so = projetar(viagem, opcoes);
    const filtrado = [...viagem, ...entrega].filter((e) => TIPOS_DA_OPERACAO_VIVA.includes(e.event_type));
    assert.deepEqual(projetar(filtrado, opcoes), so);
  });

  await teste("H1 consumidor assíncrono reconhece os dois tipos sem projetar viagem", async () => {
    const C = await consumidor();
    const handlers = C.montarHandlersDaTrajetoriaDoPronto();
    assert.deepEqual(Object.keys(handlers).sort(), ["delivery_ready", "delivery_removed"]);
    for (const k of Object.keys(handlers)) {
      await handlers[k]!({ outbox_id: "o1", stream: "entregas", kind: k, idempotency_key: "x", payload: { event_id: "e", event_type: k } } as never);
    }
    await assert.rejects(async () => handlers["delivery_ready"]!({ outbox_id: "o2", stream: "entregas", kind: "trip_started",
      idempotency_key: "y", payload: { event_id: "e", event_type: "trip_started" } } as never));
  });

  await teste("H2 o runtime assíncrono de verdade liga o consumidor (sem ele, as mensagens iriam para dead-letter)", async () => {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync(join(__dirname, "bin", "async-runtime.ts"), "utf8")
      .split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");
    const bloco = /const OUTBOX_HANDLERS[^=]*=\s*\{([\s\S]*?)\};/.exec(fonte)?.[1] ?? "";
    assert.match(bloco, /\.\.\.ponteOperacaoViva\.handlers/, "a Operação Viva saiu do runtime");
    assert.match(bloco, /\.\.\.montarHandlersDaTrajetoriaDoPronto\(\)/, "o consumidor dos fatos da entrega não está ligado");
  });

  await fluxoIsolado();

  const total = passed + failures.length;
  console.log(`PRONTO_LEITURAS: ${passed}/${total} PASS`);
  if (failures.length) {
    console.log(`PRONTO_LEITURAS_RED: ${failures.map((f) => f.split(" ")[0]).join(" ")}`);
    process.exit(1);
  }
  console.log("PRONTO_LEITURAS_GREEN");
}

/* ------------------------------------------------------------------ *
 * Fluxo completo em PostgreSQL isolado                                *
 * ------------------------------------------------------------------ */

async function fluxoIsolado(): Promise<void> {
  const url = process.env.DELIVERYOS_PG_URL?.trim();
  if (!url) {
    console.log("  PULADO fluxo PostgreSQL: DELIVERYOS_PG_URL ausente — W1-W5 NAO rodaram");
    return;
  }
  const { bancoIsolado } = await import("./banco-isolado");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { PgEntregasUnitOfWork } = await import("../entregas/persistence/pg-uow");
  const { PgPilotReadyOrderStore } = await import("../entregas/pilot/ready-orders");
  const { PilotApplicationFacade } = await import("../entregas/pilot/pilot-facade");
  const { createPilotLogger } = await import("../entregas/pilot/pilot-log");
  const { asInternalRiderActorId } = await import("../entregas/foundation/brands");
  const { CommittedOutboxEntregasEventFeed } = await import("../entregas/integration/durable-event-feed");
  const { PgTransactionalWriter, PgOutboxRepository, PgJobRepository } = await import("./persistence/pg-repositories");
  const { EntregasLiveConsumer } = await import("./runtime/entregas-live-consumer");
  const { lerRealidadeDeEntregas } = await import("./leitura/realidade-de-entregas");
  const { montarPonteDaOperacaoViva } = await import("./runtime/handler-operacao-viva");
  const { AsyncRuntime } = await import("./runtime/async-worker");

  const db = await bancoIsolado(url, undefined, "pronto_leituras");
  const dir = mkdtempSync(join(tmpdir(), "pronto-leituras-"));
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    await db.cliente.query(`INSERT INTO identity.unit(unit_id,display_name) VALUES ($1,'Teste'),('MOOCA','Outra')`, [UNIT]);
    const cfg = {
      mode: "pilot", unit_id: UNIT, unit_name: "T", timezone: "America/Sao_Paulo", port: 5199, bind: "127.0.0.1",
      data_dir: dir, max_stops: 5, banner: "PILOTO {unit_name}", source_mode: "simulated",
      users: [
        { actor_id: "ops-1", role: "operador_expedicao", label: "Ops", token: "tok-ops" },
        { actor_id: "rid-1", role: "motoboy_interno", label: "Rider", token: "tok-rider" },
      ],
      features: { demo_seed: false, demo_controls: false, map_poc: false, gps_production: false, auto_assignment: false, copiloto: false, shell: false },
    } as never;
    const fila = new PgPilotReadyOrderStore(db.cliente, UNIT);
    const piloto = new PilotApplicationFacade(cfg, createPilotLogger(dir),
      { kind: "external", open: () => new PgEntregasUnitOfWork(db.cliente, UNIT) }, fila,
      { internalRiders: () => new Set(["rid-1"]) });
    const ops = { actor_id: "ops-1", role: "operador_expedicao" as const };
    const rid = { actor_id: "rid-1", role: "motoboy_interno" as const };
    const registrar = async (ref: string) => {
      piloto.login("tok-ops");
      const r = await piloto.registerReadyOrder(ref, `Pedido ${ref} · Rua Sintética 9`, "proprio");
      assert.equal(r.ok, true, r.human);
      await sleep(5);
    };
    for (const ref of ["A", "D", "F", "B", "C"]) await registrar(ref);
    const instante = new Map((await fila.list()).map((o) => [o.order_ref, o.created_at]));
    const cmd = (c: Record<string, unknown>, ator: typeof ops | typeof rid) =>
      piloto.executeAs(ator, { ...c, unit_id: UNIT, occurred_at: new Date().toISOString(), actor: ator });
    assert.equal((await cmd({ type: "CreateTrip", command_id: "w-ct", trip_id: "T1", courier_actor_id: asInternalRiderActorId("rid-1"),
      deliveries: [{ delivery_id: "DA", order_ref: "A" }, { delivery_id: "DD", order_ref: "D" }] }, ops)).ok, true);
    await sleep(1100); // trecho de F mensuravel em segundos
    assert.equal((await cmd({ type: "AddDeliveryToTrip", command_id: "w-add", trip_id: "T1", delivery_id: "DF",
      order_ref: "F", planned_stop_order: 3 }, ops)).ok, true);
    await sleep(20);
    assert.equal((await cmd({ type: "RemoveDeliveryFromTrip", command_id: "w-rem", trip_id: "T1", delivery_id: "DD",
      reason: "teste sintético" }, ops)).ok, true);
    await sleep(20);
    assert.equal((await cmd({ type: "ConfirmTripDeparture", command_id: "w-dep", trip_id: "T1" }, rid)).ok, true);

    const feed = new CommittedOutboxEntregasEventFeed(() => new PgEntregasUnitOfWork(db.cliente, UNIT).outbox);
    let ponto = { version: 1, checkpoint: null, isolated_count: 0, updated_at: null } as never;
    const consumer = new EntregasLiveConsumer({
      enabled: true, feed, writer: new PgTransactionalWriter(db.cliente),
      control: { async canRun() { return true; } },
      state: { async load() { return structuredClone(ponto); }, async save(v: never) { ponto = structuredClone(v); } },
      now: () => new Date(),
    });
    const tick = await consumer.tick();

    await teste("W1 fluxo isolado: o fato da entrega e a retirada entram na plataforma, simulados, uma vez cada", async () => {
      assert.equal(tick.status, "worked", JSON.stringify(tick));
      const linhas = await db.cliente.query<{ event_type: string; n: string; modo: string }>(
        `SELECT event_type, source_mode AS modo, count(*)::text AS n FROM platform.event_log WHERE unit_id=$1 GROUP BY 1,2 ORDER BY 1`, [UNIT]);
      const por = new Map(linhas.map((l) => [l.event_type, l]));
      assert.equal(por.get("delivery_ready")?.n, "3", `delivery_ready na plataforma: ${JSON.stringify(linhas)}`);
      assert.equal(por.get("delivery_removed")?.n, "1");
      assert.ok(linhas.every((l) => l.modo === "simulated"), "algum fato perdeu o modo");
      const pay = await db.cliente.query<{ payload: Record<string, unknown> }>(
        `SELECT payload FROM platform.event_log WHERE unit_id=$1 AND event_type IN ('delivery_ready','delivery_removed')`, [UNIT]);
      assert.equal(JSON.stringify(pay).includes("Rua Sintética"), false, "rótulo com endereço chegou à plataforma");
      assert.equal(JSON.stringify(pay).includes("ops-1"), false, "operador chegou ao payload da plataforma");
    });

    const L = await leituras().catch(() => null);
    await teste("W2 leituras sobre o banco isolado: fila = B e C; nada aguardando saída; D retirado; A e F com trajetória", async () => {
      assert.ok(L, "módulo de leituras ausente");
      // Este piloto roda em PostgreSQL: a tabela é a autoridade, e isso é DECLARADO.
      const r = await L!.lerProntosDeEntregas(db.cliente, { agora: new Date(), unit_id: UNIT, fila: { origem: "postgres" } });
      const nd = grupo(r.estado_atual.na_fila.grupos, "nao_declarado");
      assert.deepEqual(nd?.pedidos.map((p) => p.order_ref).sort(), ["B", "C"]);
      assert.equal(nd?.total, 2);
      assert.equal(grupo(r.estado_atual.aguardando_saida.grupos, "simulated")?.total ?? 0, 0);
      assert.equal(grupo(r.estado_atual.retirados_sem_novo_registro.grupos, "simulated")?.total, 1);
      const t = grupo(r.trajetoria.grupos, "simulated")!.entregas;
      const por = new Map(t.map((x) => [x.order_ref, x]));
      assert.equal(por.get("A")?.situacao, "saiu");
      assert.equal(por.get("A")?.registrado_em, instante.get("A"), "o instante original do registro mudou no caminho");
      assert.ok((por.get("A")?.associacao_ate_saida_s ?? -1) >= 0);
      assert.equal(por.get("F")?.situacao, "saiu");
      assert.ok(Date.parse(por.get("F")!.associado_em) > Date.parse(por.get("A")!.associado_em), "F foi associado depois de A");
      assert.equal(por.get("F")?.saiu_em, por.get("A")?.saiu_em, "A e F saíram na mesma viagem");
      assert.ok((por.get("F")?.associacao_ate_saida_s ?? -1) < (por.get("A")?.associacao_ate_saida_s ?? -1),
        "F foi acrescentado depois: seu trecho associação → saída é menor que o de A");
      assert.equal(por.get("D")?.situacao, "retirado_antes_da_saida");
      assert.equal(por.get("D")?.saiu_em, null);
    });

    await teste("W3 a viagem na plataforma não muda com os fatos da entrega (estado e eventos só da viagem)", async () => {
      const real = await lerRealidadeDeEntregas(db.cliente, { agora: new Date(), unit_id: UNIT });
      const g = real.projecoes.find((p) => p.unit_id === UNIT && p.source_mode === "simulated");
      const v = g?.viagens.find((x) => x.trip_id === "T1");
      assert.ok(v, "a viagem sumiu da projeção");
      assert.equal(v!.estado, "em_rota");
      const ids = await db.cliente.query<{ event_id: string; event_type: string }>(
        `SELECT event_id, event_type FROM platform.event_log WHERE unit_id=$1`, [UNIT]);
      const daEntrega = new Set(ids.filter((x) => x.event_type.startsWith("delivery_")).map((x) => x.event_id));
      assert.equal(v!.eventos.some((id) => daEntrega.has(id)), false, "fato da entrega entrou na projeção da viagem");
    });

    await teste("W4 consumidor assíncrono drena as mensagens novas sem dead-letter", async () => {
      const C = await consumidor();
      const ponte = montarPonteDaOperacaoViva();
      const worker = new AsyncRuntime({
        identity: { version: "teste", commit: "teste", instance_id: "teste" } as never,
        outbox: new PgOutboxRepository(db.cliente), jobs: new PgJobRepository(db.cliente),
        outboxHandlers: { ...ponte.handlers, ...C.montarHandlersDaTrajetoriaDoPronto() }, jobHandlers: {},
        worker_id: "teste-pronto",
      });
      for (let i = 0; i < 5; i++) await worker.tick();
      const st = await db.cliente.query<{ state: string; kind: string; n: string }>(
        `SELECT state, kind, count(*)::text AS n FROM platform.outbox GROUP BY 1,2 ORDER BY 1,2`);
      assert.equal(st.some((s) => s.state === "dead"), false, `dead-letter: ${JSON.stringify(st)}`);
      const daEntrega = st.filter((s) => s.kind.startsWith("delivery_"));
      assert.ok(daEntrega.length > 0, `nenhuma mensagem da entrega na outbox: ${JSON.stringify(st)}`);
      assert.ok(daEntrega.every((s) => s.state === "done"), `mensagens da entrega não processadas: ${JSON.stringify(st)}`);
    });

    await teste("W5 segunda leitura do feed é ociosa: nada duplica na plataforma", async () => {
      const t2 = await consumer.tick();
      assert.equal(t2.ingested, 0, JSON.stringify(t2));
      const n = await db.cliente.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM platform.event_log WHERE unit_id=$1 AND event_type='delivery_ready'`, [UNIT]);
      assert.equal(n[0]!.n, "3");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await db.descartar();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
