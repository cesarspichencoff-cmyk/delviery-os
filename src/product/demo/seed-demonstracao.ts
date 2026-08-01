/**
 * DeliveryOS — Product System · FIXTURE DE DEMONSTRACAO
 * ============================================================================
 * ESTE ARQUIVO E FIXTURE. Ele nao pode ser importado por nenhum runtime de
 * producao, e o teste "fixture: a demonstracao nao entra em runtime de
 * producao" prova isso lendo `critical.ts` e `async-runtime.ts`.
 *
 * O que e DEMONSTRACAO aqui: os eventos de entrada e o diretorio temporario do
 * store. So isso.
 *
 * O que e REAL aqui: `projetar`, `adaptarProjecao`, `createLiveObserver`,
 * `extrairConclusoes`, `recomendarDeConclusoes`, `createStore` e as regras que
 * eles carregam. A cadeia executada e a mesma cadeia provada nas Unidades 4 e 5.
 *
 * Por isso a superficie pode dizer, sem mentir, que a LOGICA e real e que os
 * DADOS sao de exercicio — e por isso ela carrega `somente_demonstracao` em vez
 * de `real` em todo cabecalho.
 * ==========================================================================*/

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { UiApplicationFacade } from "../../entregas/ui/adapters/UiApplicationFacade";

import { projetar, JANELAS } from "../../platform/projections/operacao-viva";
import type { Projecao } from "../../platform/projections/operacao-viva";
import type {
  EventEnvelope,
  EventType,
  SourceMode,
} from "../../platform/contracts/event-catalog";
import {
  recomendarDeConclusoes,
  type Conclusao,
  type ResultadoShadow,
} from "../../platform/copiloto/conference-bridge";
import type {
  ConclusaoLida,
  LeituraConferenceBrain,
  LinhaInvalidaLida,
} from "../viewmodels/conference-vm";

const req = createRequire(join(process.cwd(), "package.json"));
const CB = (m: string): Record<string, unknown> =>
  req(join(process.cwd(), "src", "conference-brain", m)) as Record<string, unknown>;

interface Registro {
  [k: string]: unknown;
}
interface Store {
  put: (t: string, r: Registro) => { ok: boolean; errors?: string[] };
  all: (t: string) => Registro[];
  count: (t: string) => number;
  health: () => {
    memory_only: boolean;
    entities: { entity: string; records: number }[];
    io_failures: unknown[];
    corrupted_lines: unknown[];
    invalid_lines: {
      entity?: string;
      line_number?: number;
      errors?: string[];
      length?: number;
      sha256?: string;
    }[];
  };
}
interface Observer {
  runCycle: () => Promise<Registro>;
  loadOrderState: (id: string) => { observations: Registro[]; clockEvents: Registro[] };
  getReconciledDimension: (id: string) => Registro | null;
}

const { createStore } = CB("storage/store") as {
  createStore: (o: { dir: string }) => Store;
};
const { createLiveObserver } = CB("live/observer") as {
  createLiveObserver: (o: Registro) => Observer;
};
const { LIVE_SOURCE_HEALTH } = CB("contracts/live-states") as {
  LIVE_SOURCE_HEALTH: Record<string, string>;
};
const A = CB("ingestion/operacao-viva-adapter") as {
  ADAPTER_VERSION: string;
  criarFetchOrders: (o: Registro) => () => Promise<Registro>;
  runIdDe: (u: string, m: string) => string;
};
const Conc = CB("copiloto/conclusoes") as {
  /**
   * Assinatura de UM objeto — `store` viaja dentro dele. Chamar posicionalmente
   * `(store, opts)` nao lanca: a funcao apenas cai no ramo `escopo_incompleto` e
   * devolve zero conclusoes, que e indistinguivel de "nao havia o que concluir".
   * Foi exatamente o que aconteceu na primeira montagem desta cadeia.
   */
  extrairConclusoes: (o: Registro) => {
    conclusoes: Conclusao[];
    recusadas: { motivo: string; conclusion_ref: string | null }[];
  };
};

/* ------------------------------------------------------------------ *
 * Eventos de demonstracao
 * ------------------------------------------------------------------ */

export const UNIDADE_DEMO = "demo-unit";
/** Relogio congelado: a demonstracao precisa ser a mesma toda vez que abrir. */
export const AGORA_DEMO = "2026-08-01T19:20:00.000Z";

let seq = 0;
function ev(
  tipo: EventType,
  trip: string,
  em: string,
  modo: SourceMode = "simulated",
): EventEnvelope {
  seq += 1;
  return {
    event_id: `demo-e-${String(seq).padStart(3, "0")}`,
    event_type: tipo,
    event_version: "entregas@1.0.0",
    unit_id: UNIDADE_DEMO,
    trip_id: trip,
    device_id: "demo-dev-1",
    occurred_at: em,
    origin: "device",
    source_mode: modo,
    idempotency_key: `demo-k-${String(seq).padStart(3, "0")}`,
    payload: {},
  };
}

/**
 * Uma janela pensada para que a tela mostre estados DIFERENTES ao mesmo tempo:
 * uma viagem recente, uma envelhecendo, uma sem posicao nenhuma e uma parada
 * ha muito tempo. Estado unico numa tela de estados prova pouco.
 */
export function eventosDemo(): EventEnvelope[] {
  seq = 0;
  return [
    // t-alfa: viva e recente
    ev("trip_created", "t-alfa", "2026-08-01T19:10:00.000Z"),
    ev("trip_started", "t-alfa", "2026-08-01T19:11:00.000Z"),
    ev("gps_batch_received", "t-alfa", "2026-08-01T19:19:30.000Z"),
    // t-beta: envelhecendo, com ocorrencia aberta
    ev("trip_created", "t-beta", "2026-08-01T19:05:00.000Z"),
    ev("trip_started", "t-beta", "2026-08-01T19:06:00.000Z"),
    ev("gps_batch_received", "t-beta", "2026-08-01T19:16:30.000Z"),
    ev("occurrence_created", "t-beta", "2026-08-01T19:17:00.000Z"),
    // t-gama: criada e nunca reportou posicao — ausencia, nao parada
    ev("trip_created", "t-gama", "2026-08-01T19:14:00.000Z"),
    // t-delta: sumiu ha muito tempo
    ev("trip_created", "t-delta", "2026-08-01T18:40:00.000Z"),
    ev("trip_started", "t-delta", "2026-08-01T18:41:00.000Z"),
    ev("gps_batch_received", "t-delta", "2026-08-01T18:45:00.000Z"),
  ];
}

export function projecaoDemo(): Projecao {
  return projetar(eventosDemo(), {
    agora: new Date(AGORA_DEMO),
    unit_id: UNIDADE_DEMO,
    source_mode: "simulated",
  });
}

/* ------------------------------------------------------------------ *
 * Entregas: viagens montadas pelo ApplicationService REAL
 * ------------------------------------------------------------------ */

/**
 * O facade nasce vazio: `seedDemo()` so semeia pedidos prontos, e viagem so
 * existe depois de um comando. Montamos as viagens aqui, no fixture, passando
 * pelo `EntregasApplicationService` de verdade — inclusive a politica de limite
 * de paradas, que continua recusando o que tem de recusar.
 *
 * Sao COMANDOS, e por isso moram nesta fixture e nao no servidor: a superficie
 * de apresentacao nao executa comando nenhum.
 */
export async function montarEntregasDemo(): Promise<UiApplicationFacade> {
  const f = new UiApplicationFacade();
  f.seedDemo();
  const em = "2026-08-01T19:12:00.000Z";

  await f.execute({
    type: "CreateTrip",
    command_id: "demo-c1",
    occurred_at: em,
    unit_id: UNIDADE_DEMO,
    trip_id: "V-2081",
    courier_actor_id: f.asRider("rid-joao"),
    deliveries: [
      { delivery_id: "D-1", order_ref: "P-101" },
      { delivery_id: "D-2", order_ref: "P-102" },
      { delivery_id: "D-3", order_ref: "P-103" },
    ],
  });
  await f.execute({
    type: "ConfirmTripDeparture",
    command_id: "demo-c2",
    occurred_at: em,
    unit_id: UNIDADE_DEMO,
    trip_id: "V-2081",
    actor: { actor_id: "rid-joao", role: "motoboy_interno" },
  });

  await f.execute({
    type: "CreateTrip",
    command_id: "demo-c3",
    occurred_at: em,
    unit_id: UNIDADE_DEMO,
    trip_id: "V-2082",
    courier_actor_id: f.asRider("rid-marta"),
    deliveries: [{ delivery_id: "D-4", order_ref: "P-104" }],
  });

  // Uma parada removida — para a tela mostrar que remocao PRESERVA historico
  // em vez de apagar a parada.
  await f.execute({
    type: "RemoveDeliveryFromTrip",
    command_id: "demo-c4",
    occurred_at: em,
    unit_id: UNIDADE_DEMO,
    trip_id: "V-2081",
    delivery_id: "D-3",
    reason: "cliente remarcou",
  });

  // A ocorrencia e registrada SEM rede. O facade contabiliza a pendencia, e e
  // assim que a fila desta demonstracao nasce — em vez de ser um numero escrito
  // a mao para a tela ter o que mostrar.
  f.setConnection("offline");
  await f.execute({
    type: "CreateOccurrence",
    command_id: "demo-c5",
    occurred_at: em,
    unit_id: UNIDADE_DEMO,
    occurrence_id: "OC-77",
    occurrence_type: "moto_quebrada",
    report: "Moto do entregador parou na Rebouças; entrega redistribuida a pe.",
    blocks_availability: true,
    related_trip_id: "V-2081",
  });

  // A rede volta com a fila ainda cheia: e exatamente o estado que prova que
  // `sincronizando` nao e o mesmo que `offline`.
  f.setConnection("syncing");
  return f;
}

/* ------------------------------------------------------------------ *
 * A cadeia real, sobre os eventos de demonstracao
 * ------------------------------------------------------------------ */

function linhasInvalidas(
  h: ReturnType<Store["health"]>,
): readonly LinhaInvalidaLida[] {
  // Codigo, tamanho e hash. O conteudo do registro recusado nao e copiado —
  // nem existe campo para ele no tipo de destino (D31).
  return h.invalid_lines.map((l) => ({
    entity: String(l.entity ?? "?"),
    line_number: Number(l.line_number ?? 0),
    codigos: Array.isArray(l.errors) ? l.errors.map(String) : [],
    tamanho: Number(l.length ?? 0),
    hash: String(l.sha256 ?? ""),
  }));
}

function conclusoesLidas(cs: readonly Conclusao[]): readonly ConclusaoLida[] {
  return cs.map((c) => ({
    conclusion_ref: c.conclusion_ref,
    conclusion_kind: c.conclusion_kind,
    conclusion_version: c.conclusion_version,
    observed_at: c.observed_at,
    source_health: c.source_health ?? null,
    pode_afirmar: c.pode_afirmar,
    orders_observed: c.orders_observed ?? null,
    evidencias: c.evidence.map((e) => ({
      tipo: e.tipo,
      referencia: e.ref,
      observado_em: c.observed_at ?? AGORA_DEMO,
    })),
    limitacoes: c.limitacoes,
  }));
}

export interface CadeiaDemo {
  readonly projecao: Projecao;
  readonly leituraBrain: LeituraConferenceBrain;
  readonly leituraControlePositivo: LeituraConferenceBrain;
  readonly resultadoCopiloto: ResultadoShadow;
}

/**
 * Roda a cadeia inteira duas vezes:
 *
 *  1. pela Operacao Viva real — que NAO emite pedido, e por isso devolve zero
 *     observacoes de pedido;
 *  2. por uma fonte sintetica legitima de pedido — o controle positivo, que
 *     devolve UMA observacao pelo mesmo cano.
 *
 * O par existe porque um cano entupido devolve o mesmo zero que a recusa
 * deliberada. Sem o controle ao lado, a tela mostraria um zero que ninguem
 * consegue distinguir de defeito (D32, L26).
 */
export async function montarCadeiaDemo(): Promise<CadeiaDemo> {
  const projecao = projecaoDemo();

  // --- 1. cadeia real -------------------------------------------------
  const dirReal = mkdtempSync(join(tmpdir(), "deliveryos-ps-real-"));
  const storeReal = createStore({ dir: dirReal });
  const runId = A.runIdDe(UNIDADE_DEMO, "simulated");
  const obsReal = createLiveObserver({
    store: storeReal,
    fetchOrders: A.criarFetchOrders({
      lerProjecao: () => projecao,
      source_mode: "simulated",
      janelas: JANELAS,
      now: () => AGORA_DEMO,
    }),
    runId,
    collectorVersion: A.ADAPTER_VERSION,
    now: () => AGORA_DEMO,
  });
  await obsReal.runCycle();
  await obsReal.runCycle();

  const extraidoReal = Conc.extrairConclusoes({
    store: storeReal,
    unit_id: UNIDADE_DEMO,
    source_mode: "simulated",
    run_id: runId,
    observer: obsReal,
  });

  const ciclosReais = storeReal
    .all("live_cycle_runs")
    .filter((c) => c.run_id === runId);

  const leituraBrain: LeituraConferenceBrain = {
    unit_id: UNIDADE_DEMO,
    source_mode: "simulated",
    procedencia: "simulado",
    ciclos: ciclosReais.map((c) => ({
      run_id: String(c.run_id),
      cycle_id: String(c.cycle_id),
      started_at: String(c.started_at),
      finished_at: c.finished_at === undefined ? null : String(c.finished_at),
      source_health: String(c.source_health ?? ""),
      orders_observed:
        typeof c.orders_observed === "number" ? c.orders_observed : null,
      fields_missing: Array.isArray(c.fields_missing)
        ? c.fields_missing.map(String)
        : [],
      notes: c.notes === undefined ? null : String(c.notes),
    })),
    saude_do_store: (() => {
      const h = storeReal.health();
      return {
        memory_only: h.memory_only,
        entidades: h.entities,
        falhas_de_io: h.io_failures.length,
        linhas_corrompidas: h.corrupted_lines.length,
        linhas_invalidas: linhasInvalidas(h),
      };
    })(),
    observacoes_de_pedido: storeReal.count("live_observations"),
    conclusoes: conclusoesLidas(extraidoReal.conclusoes),
  };

  // --- 2. controle positivo sintetico ---------------------------------
  const dirCtrl = mkdtempSync(join(tmpdir(), "deliveryos-ps-ctrl-"));
  const storeCtrl = createStore({ dir: dirCtrl });
  const runIdCtrl = "controle-positivo-demonstracao";
  const obsCtrl = createLiveObserver({
    store: storeCtrl,
    fetchOrders: async () => ({
      orders: [
        {
          external_id: "CTRL-PED-1",
          raw_status: "ready",
          readiness: { state: "ready" },
        },
      ],
      health: {
        state: LIVE_SOURCE_HEALTH.AVAILABLE,
        reason: "leitura_completa",
        reasons: ["leitura_completa"],
      },
    }),
    runId: runIdCtrl,
    collectorVersion: "fonte-legitima-de-controle",
    now: () => AGORA_DEMO,
  });
  await obsCtrl.runCycle();

  const extraidoCtrl = Conc.extrairConclusoes({
    store: storeCtrl,
    unit_id: UNIDADE_DEMO,
    source_mode: "simulated",
    run_id: runIdCtrl,
    observer: obsCtrl,
  });

  const leituraControlePositivo: LeituraConferenceBrain = {
    unit_id: UNIDADE_DEMO,
    source_mode: "simulated",
    procedencia: "controle_positivo_sintetico",
    ciclos: storeCtrl
      .all("live_cycle_runs")
      .filter((c) => c.run_id === runIdCtrl)
      .map((c) => ({
        run_id: String(c.run_id),
        cycle_id: String(c.cycle_id),
        started_at: String(c.started_at),
        finished_at: c.finished_at === undefined ? null : String(c.finished_at),
        source_health: String(c.source_health ?? ""),
        orders_observed:
          typeof c.orders_observed === "number" ? c.orders_observed : null,
        fields_missing: [],
        notes: null,
      })),
    saude_do_store: (() => {
      const h = storeCtrl.health();
      return {
        memory_only: h.memory_only,
        entidades: h.entities,
        falhas_de_io: h.io_failures.length,
        linhas_corrompidas: h.corrupted_lines.length,
        linhas_invalidas: linhasInvalidas(h),
      };
    })(),
    observacoes_de_pedido: storeCtrl.count("live_observations"),
    conclusoes: conclusoesLidas(extraidoCtrl.conclusoes),
  };

  // --- 3. Copiloto, sobre as conclusoes da cadeia REAL -----------------
  const resultadoCopiloto = recomendarDeConclusoes(extraidoReal.conclusoes, {
    agora: new Date(AGORA_DEMO),
    unit_id: UNIDADE_DEMO,
    source_mode: "simulated",
  });

  return {
    projecao,
    leituraBrain,
    leituraControlePositivo,
    resultadoCopiloto,
  };
}
