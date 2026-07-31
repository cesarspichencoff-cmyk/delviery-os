/**
 * Bloco 4B5 — integração final e gate adversarial do Conference Brain.
 *
 * Prova a cadeia inteira contra a arquitetura ATUAL:
 *
 *   Operação Viva -> adapter semântico -> observer -> núcleo multidimensional -> store
 *
 * O que este arquivo não faz: importar painel HTTP, Playwright ou mapping mode
 * para alcançar os 309/309 e o 12/12 históricos. Aquele patrimônio é usado como
 * REFERÊNCIA DE COMPORTAMENTO — os riscos que ele cobre estão provados aqui
 * contra o código que este repositório realmente tem.
 *
 * ## O controle positivo é a parte mais importante deste arquivo
 *
 * Metade do gate afirma ZERO: zero pedidos, zero eventos de relógio, zero
 * observação sem identidade. Um zero é a asserção mais fácil de falsificar por
 * acidente que existe — cano entupido devolve zero igualzinho a recusa
 * deliberada. Por isso toda afirmação de zero vindo da Operação Viva tem, ao
 * lado, a MESMA cadeia alimentada por uma fonte legítima de pedido, exigindo
 * que ela produza um. Sem esse par, o gate inteiro passaria com o observador
 * quebrado.
 */

import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { projetar, JANELAS, mesmoEstadoLogico } from "./projections/operacao-viva";
import type { Projecao } from "./projections/operacao-viva";
import type { EventEnvelope, EventType, SourceMode } from "./contracts/event-catalog";

const req = createRequire(join(process.cwd(), "package.json"));
const CB = (m: string): Record<string, unknown> =>
  req(join(process.cwd(), "src", "conference-brain", m)) as Record<string, unknown>;

let passed = 0;
const failures: string[] = [];
const pend: Promise<void>[] = [];
function teste(nome: string, fn: () => Promise<void> | void): void {
  pend.push(
    Promise.resolve().then(fn).then(
      () => {
        passed += 1;
      },
      (e: unknown) => {
        failures.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
      },
    ),
  );
}

/* ------------------------------------------------------------------ *
 * Superfícies
 * ------------------------------------------------------------------ */

interface Registro {
  [k: string]: unknown;
}
interface Store {
  put: (t: string, r: Registro) => { ok: boolean; errors?: string[] };
  all: (t: string) => Registro[];
  count: (t: string) => number;
  load: (t: string) => number;
  health: () => {
    corrupted_lines: Registro[];
    invalid_lines: { errors: string[] }[];
    io_failures: Registro[];
    entities: { entity: string; records: number }[];
  };
  fileFor: (t: string) => string;
}
interface Observer {
  runCycle: () => Promise<Registro>;
  loadOrderState: (id: string) => { observations: Registro[]; clockEvents: Registro[] };
  getReconciledDimension: (id: string) => Registro | null;
}
interface Adaptado {
  escopo: { unit_id: string; source_mode: string } | null;
  orders: unknown[];
  orders_ausentes_porque: string;
  signals: { ordersFound: number; criticalFieldsMissing: readonly string[]; operacao_viva: Registro };
  health: { state: string; reason: string; reasons: readonly string[] };
  contexto: {
    janelas: Record<string, number> | null;
    dimensoes: Record<string, { valor: unknown; classificacao: string }>;
    viagens: {
      identidade: { trip_id: string | null; unit_id: string | null };
      observado: Record<string, unknown>;
      inferido: { frescor: string | null; expira_em: string | null; expirado: boolean | null };
      evidencia: { event_ids: string[] };
    }[];
  } | null;
  procedencia: Registro | null;
  recusas: { pii: readonly string[]; identidade_de_pedido: readonly string[] };
}

const { createStore } = CB("storage/store") as { createStore: (o: { dir: string }) => Store };
const { createLiveObserver } = CB("live/observer") as {
  createLiveObserver: (o: Registro) => Observer;
};
const { LIVE_SOURCE_HEALTH } = CB("contracts/live-states") as {
  LIVE_SOURCE_HEALTH: Record<string, string>;
};
const { mayAffirmOperationalLoad } = CB("live/health") as {
  mayAffirmOperationalLoad: (s: string) => boolean;
};
const Rec = CB("live/reconciliation") as {
  reconcileField: (f: string, obs: Registro[]) => { value: unknown; confidence: unknown; history: unknown[] };
  reconcileScalarDimension: (
    obs: Registro[],
    k: string,
    v?: string,
  ) => { value: string; changed_at: string | null; history: unknown[] };
  reconcileMultidimensional: (id: string, dims: Registro[]) => Registro;
};
const { buildOrderObservation } = CB("live/multidimensional-observation") as {
  buildOrderObservation: (r: Registro) => Registro;
};
const A = CB("ingestion/operacao-viva-adapter") as {
  ADAPTER_VERSION: string;
  CLASSIFICACAO: Record<string, string>;
  MAPA_SEMANTICO: readonly { campo: string; classificacao: string; destino: string | null }[];
  CAMPOS_CRITICOS_AUSENTES: readonly string[];
  adaptarProjecao: (p: unknown, o: Registro) => Adaptado;
  criarFetchOrders: (o: Registro) => () => Promise<Adaptado>;
  runIdDe: (u: string, m: string) => string;
};

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const UNIDADE = "u-tata-centro";
const LIDO_EM = "2026-07-31T12:01:00.000Z";
const TARDE = "2026-07-31T13:00:00.000Z";

let seq = 0;
function ev(tipo: EventType, trip: string, em: string, modo: SourceMode = "real"): EventEnvelope {
  seq += 1;
  return {
    event_id: `e-${String(seq).padStart(3, "0")}`,
    event_type: tipo,
    event_version: "entregas@1.0.0",
    unit_id: UNIDADE,
    trip_id: trip,
    device_id: "dev-9",
    occurred_at: em,
    origin: "device",
    source_mode: modo,
    idempotency_key: `k-${String(seq).padStart(3, "0")}`,
    payload: {},
  };
}

function eventosBase(modo: SourceMode = "real"): EventEnvelope[] {
  seq = 0;
  return [
    ev("trip_created", "t-alfa", "2026-07-31T11:58:00.000Z", modo),
    ev("trip_started", "t-alfa", "2026-07-31T11:59:00.000Z", modo),
    ev("gps_batch_received", "t-alfa", "2026-07-31T12:00:30.000Z", modo),
    ev("occurrence_created", "t-alfa", "2026-07-31T12:00:40.000Z", modo),
    ev("trip_created", "t-beta", "2026-07-31T11:59:30.000Z", modo),
  ];
}

function projecaoDe(eventos: EventEnvelope[], agora: string, modo: SourceMode = "real"): Projecao {
  return projetar(eventos, { agora: new Date(agora), unit_id: UNIDADE, source_mode: modo });
}

/** A cadeia inteira, montada como ela roda de verdade. */
function montarCadeia(dir: string, agora: string, modo: SourceMode = "real"): { store: Store; observer: Observer } {
  const store = createStore({ dir });
  const observer = createLiveObserver({
    store,
    fetchOrders: A.criarFetchOrders({
      lerProjecao: () => projecaoDe(eventosBase(modo), agora, modo),
      source_mode: modo,
      janelas: JANELAS,
      now: () => agora,
    }),
    runId: A.runIdDe(UNIDADE, modo),
    collectorVersion: A.ADAPTER_VERSION,
    now: () => agora,
  });
  return { store, observer };
}

/** Fonte LEGÍTIMA de pedido — o controle positivo que dá sentido a todo zero. */
function montarCadeiaLegitima(
  dir: string,
  agora: string,
  pedidos: () => Registro[],
): { store: Store; observer: Observer } {
  const store = createStore({ dir });
  const observer = createLiveObserver({
    store,
    fetchOrders: async () => ({
      orders: pedidos(),
      health: { state: LIVE_SOURCE_HEALTH.AVAILABLE, reason: "leitura_completa", reasons: ["leitura_completa"] },
    }),
    runId: "controle-positivo",
    collectorVersion: "fonte-legitima-de-teste",
    now: () => agora,
  });
  return { store, observer };
}

function comDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "cb4b5-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
async function comDirAsync(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "cb4b5-"));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function semComentarios(caminho: string): string {
  return readFileSync(join(process.cwd(), caminho), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
}

/**
 * Código sem comentários E sem literais de texto.
 *
 * Uma guarda estrutural que casa dentro de string acusa o próprio documento:
 * o adapter carrega motivos escritos como "NUNCA vira external_id", e uma
 * varredura ingênua leria a proibição como se fosse a infração. Vale para o
 * mesmo motivo de L11 (comentário entra na medição) — só que um nível
 * adiante, porque aqui a documentação da regra mora em `motivo`, que é dado.
 */
function soCodigo(caminho: string): string {
  return semComentarios(caminho).replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
}

/* ================================================================== *
 * 1 — sinais válidos da Operação Viva chegam ao adapter
 * ================================================================== */

teste("1 · o sinal sai de projetar() de verdade e chega ao adapter com conteúdo", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const r = A.adaptarProjecao(p, { lidoEm: LIDO_EM, source_mode: "real", janelas: JANELAS });

  assert.equal(r.escopo?.unit_id, UNIDADE);
  assert.equal(r.contexto?.viagens.length, 2, "as duas viagens do log não chegaram");
  assert.equal(r.contexto?.dimensoes.carga.valor, p.dimensoes.carga);
  assert.ok((r.contexto?.dimensoes.carga.valor as number) > 0, "carga chegou vazia — o sinal não é vivo");

  const alfa = r.contexto?.viagens.find((v) => v.identidade.trip_id === "t-alfa");
  assert.equal(alfa?.evidencia.event_ids.length, 4, "a proveniência dos quatro eventos não chegou");
  assert.equal(alfa?.observado.ocorrencias_abertas, 1, "a ocorrência real não atravessou");
});

/* ================================================================== *
 * 2 — o adapter classifica cada natureza
 * ================================================================== */

teste("2 · as cinco naturezas aparecem, cada uma na sua gaveta", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const r = A.adaptarProjecao(p, { lidoEm: LIDO_EM, source_mode: "real", janelas: JANELAS });
  const v = r.contexto!.viagens[0];

  // observação direta e evidência: gavetas separadas na estrutura
  assert.ok("ultimo_fato_em" in v.observado && "event_ids" in v.evidencia);
  // inferência: nunca em `observado`
  assert.ok("frescor" in v.inferido && !("frescor" in v.observado));
  // contexto: rotulado
  assert.equal(r.contexto?.dimensoes.carga.classificacao, A.CLASSIFICACAO.CONTEXTO_OPERACIONAL);
  assert.equal(r.contexto?.dimensoes.atraso.classificacao, A.CLASSIFICACAO.INFERENCIA);
  // ausência: declarada, com os dez campos que esta fonte não fornece
  assert.equal(r.signals.criticalFieldsMissing.length, 10);

  // e as cinco classes estão todas representadas no mapa
  const classes = new Set(A.MAPA_SEMANTICO.map((m) => m.classificacao));
  for (const c of Object.values(A.CLASSIFICACAO)) {
    assert.ok(classes.has(c), `nenhum campo classificado como ${c}`);
  }
});

/* ================================================================== *
 * 3 — o observer registra a saúde parcial da fonte
 * ================================================================== */

teste("3 · o ciclo grava saúde parcial e a ausência declarada no registro durável", async () => {
  await comDirAsync(async (dir) => {
    const { store, observer } = montarCadeia(dir, LIDO_EM);
    const r = (await observer.runCycle()) as { ok: boolean; cycle: Registro };
    assert.equal(r.ok, true);
    assert.equal(r.cycle.source_health, LIVE_SOURCE_HEALTH.PARTIAL);
    assert.equal(r.cycle.orders_observed, 0);
    assert.deepEqual(r.cycle.fields_missing, [...A.CAMPOS_CRITICOS_AUSENTES]);
    assert.equal(store.count("live_cycle_runs"), 1, "o ciclo não foi persistido");
    assert.deepEqual(r.cycle.errors, [], "o ciclo reportou erro onde não há erro");
  });
});

/* ================================================================== *
 * 4 e 5 — nada de pedido nem de relógio sem identidade,
 *          E a cadeia está viva (controle positivo)
 * ================================================================== */

teste("4/5 · CONTROLE POSITIVO: fonte legítima produz observação e relógio", async () => {
  await comDirAsync(async (dir) => {
    const { store, observer } = montarCadeiaLegitima(dir, LIDO_EM, () => [
      { external_id: "PED-1", raw_status: "Pronto" },
    ]);
    await observer.runCycle();
    assert.equal(store.count("live_observations"), 1, "a cadeia está morta — o resto do gate não vale nada");
    assert.equal(store.count("conference_clock_events"), 1, "nenhum ready_observed com pedido pronto legítimo");
    const evento = store.all("conference_clock_events")[0];
    assert.equal(evento.order_id, "PED-1");
    assert.equal(evento.event_type, "ready_observed");
  });
});

teste("4 · a MESMA cadeia, alimentada pela Operação Viva, não cria observação de pedido", async () => {
  await comDirAsync(async (dir) => {
    const { store, observer } = montarCadeia(dir, LIDO_EM);
    await observer.runCycle();
    await observer.runCycle();
    assert.equal(store.count("live_observations"), 0, "viagem virou observação de pedido");
    assert.equal(store.count("live_cycle_runs"), 2, "os ciclos não foram gravados — zero por cano entupido");
  });
});

teste("5 · nenhum conference_clock_event nasce sem observação legítima", async () => {
  await comDirAsync(async (dir) => {
    const { store, observer } = montarCadeia(dir, LIDO_EM);
    await observer.runCycle();
    assert.equal(store.count("conference_clock_events"), 0, "abriu relógio de Conferência para uma viagem");
    // e o relógio continua zerado mesmo com a viagem em estado que "parece" pronto
    const tardio = projecaoDe(eventosBase(), TARDE);
    assert.ok(tardio.viagens.some((v) => v.estado === "em_rota"));
    assert.equal(store.count("conference_clock_events"), 0);
  });
});

/* ================================================================== *
 * 6 — duplicação é idempotente
 * ================================================================== */

teste("6 · dez ciclos sobre a mesma projeção não acumulam estado", async () => {
  await comDirAsync(async (dir) => {
    const { store, observer } = montarCadeia(dir, LIDO_EM);
    for (let i = 0; i < 10; i += 1) await observer.runCycle();
    assert.equal(store.count("live_observations"), 0);
    assert.equal(store.count("conference_clock_events"), 0);
    // `live_cycle_runs` cresce de propósito: cada ciclo é um fato distinto.
    assert.equal(store.count("live_cycle_runs"), 10);
    const modos = new Set(store.all("live_cycle_runs").map((c) => c.source_health));
    assert.deepEqual([...modos], [LIVE_SOURCE_HEALTH.PARTIAL], "a saúde oscilou entre ciclos idênticos");
  });
});

teste("6b · na cadeia legítima, o mesmo pedido observado 10× deixa uma linha", async () => {
  await comDirAsync(async (dir) => {
    const { store, observer } = montarCadeiaLegitima(dir, LIDO_EM, () => [
      { external_id: "PED-1", raw_status: "Pronto" },
    ]);
    for (let i = 0; i < 10; i += 1) await observer.runCycle();
    // chave natural [run_id, cycle_id, external_id]: o relógio é que não duplica
    assert.equal(store.count("conference_clock_events"), 1, "ready_observed duplicou");
  });
});

teste("6c · a idempotência do STORE, exercitada na cadeia real", async () => {
  // O controle adversarial pegou este buraco: 6 e 6b provavam a guarda do
  // RELÓGIO (o observador só emite `ready_observed` uma vez), e nenhum dos
  // dois tocava a chave natural do store. Removê-la deixava a suíte verde —
  // a garantia estava sendo reivindicada sem ser exercitada.
  await comDirAsync(async (dir) => {
    const { store, observer } = montarCadeiaLegitima(dir, LIDO_EM, () => [
      { external_id: "PED-1", raw_status: "Pronto" },
    ]);
    await observer.runCycle();
    const registro = store.all("live_observations")[0];
    assert.ok(registro, "a cadeia não produziu o registro que este teste precisa reprocessar");

    for (let i = 0; i < 50; i += 1) {
      const r = store.put("live_observations", registro);
      assert.equal(r.ok, true, `reprocessamento ${i} foi recusado`);
    }
    assert.equal(store.count("live_observations"), 1, "o mesmo fato virou 50 registros");

    // append-only continua valendo: o histórico no disco cresce, a verdade não.
    const linhas = readFileSync(store.fileFor("live_observations"), "utf8")
      .split("\n")
      .filter((l) => l.trim()).length;
    assert.equal(linhas, 51, "o histórico append-only foi reescrito em vez de acrescentado");

    // e o reinício reconstrói UMA linha, não cinquenta e uma
    const novo = createStore({ dir });
    novo.load("live_observations");
    assert.equal(novo.count("live_observations"), 1, "a carga do disco multiplicou o fato");
  });
});

/* ================================================================== *
 * 7 — real, simulado e controle permanecem separados
 * ================================================================== */

teste("7 · três modos, três run_id, nenhum ciclo misturado", async () => {
  await comDirAsync(async (dir) => {
    const store = createStore({ dir });
    for (const modo of ["real", "simulated", "control"] as SourceMode[]) {
      const observer = createLiveObserver({
        store,
        fetchOrders: A.criarFetchOrders({
          lerProjecao: () => projecaoDe(eventosBase(modo), LIDO_EM, modo),
          source_mode: modo,
          janelas: JANELAS,
          now: () => LIDO_EM,
        }),
        runId: A.runIdDe(UNIDADE, modo),
        collectorVersion: A.ADAPTER_VERSION,
        now: () => LIDO_EM,
      });
      await observer.runCycle();
    }
    const runs = store.all("live_cycle_runs");
    assert.equal(runs.length, 3, "dois modos colidiram na mesma linha do store");
    assert.equal(new Set(runs.map((r) => r.run_id)).size, 3);
    for (const modo of ["real", "simulated", "control"]) {
      assert.equal(runs.filter((r) => String(r.run_id).includes(modo)).length, 1, `${modo} sumiu ou duplicou`);
    }
  });
});

teste("7b · projeção de modo divergente não empresta um único número à cadeia", () => {
  const p = projecaoDe(eventosBase("simulated"), LIDO_EM, "simulated");
  const r = A.adaptarProjecao(p, { lidoEm: LIDO_EM, source_mode: "real", janelas: JANELAS });
  assert.equal(r.contexto, null);
  assert.equal(r.health.state, LIVE_SOURCE_HEALTH.UNAVAILABLE);
});

/* ================================================================== *
 * 8 — dado stale não vira observação atual
 * ================================================================== */

teste("8 · sinal vencido chega ao ciclo como `stale`, e não vira pedido", async () => {
  await comDirAsync(async (dir) => {
    const { store, observer } = montarCadeia(dir, TARDE);
    const r = (await observer.runCycle()) as { cycle: Registro };
    assert.equal(r.cycle.source_health, LIVE_SOURCE_HEALTH.STALE);
    assert.equal(store.count("live_observations"), 0);
    assert.equal(mayAffirmOperationalLoad(String(r.cycle.source_health)), false);
  });
});

/* ================================================================== *
 * 9 — remoção e expiração retiram estado derivado
 * ================================================================== */

teste("9 · pedido que some da tela é MARCADO, e a saída nunca é presumida", async () => {
  await comDirAsync(async (dir) => {
    let pedidos: Registro[] = [{ external_id: "PED-1", raw_status: "Pronto" }];
    const { store, observer } = montarCadeiaLegitima(dir, LIDO_EM, () => pedidos);
    await observer.runCycle();
    assert.equal(store.count("live_observations"), 1);

    pedidos = [];
    await observer.runCycle();
    const obs = store.all("live_observations");
    assert.ok(
      obs.some((o) => o.missing_from_view === true),
      "o sumiço não foi registrado",
    );
    // A garantia central: sumir da tela NUNCA vira saída observada.
    assert.ok(
      !store.all("conference_clock_events").some((e) => e.event_type === "departed_observed"),
      "sumiço virou saída presumida",
    );
  });
});

teste("9b · expiração é derivada e vence sozinha, sem ninguém tocar no dado", () => {
  const p = projecaoDe(eventosBase(), TARDE);
  const r = A.adaptarProjecao(p, { lidoEm: TARDE, source_mode: "real", janelas: JANELAS });
  const alfa = r.contexto?.viagens.find((v) => v.identidade.trip_id === "t-alfa");
  assert.equal(alfa?.inferido.expirado, true);
  assert.equal(alfa?.inferido.frescor, "stale");
  // e o mesmo fato, lido cedo, não está expirado — o dado não mudou, o relógio sim
  const cedo = A.adaptarProjecao(projecaoDe(eventosBase(), LIDO_EM), {
    lidoEm: LIDO_EM,
    source_mode: "real",
    janelas: JANELAS,
  });
  assert.equal(cedo.contexto?.viagens.find((v) => v.identidade.trip_id === "t-alfa")?.inferido.expirado, false);
});

/* ================================================================== *
 * 10 — replay é determinístico
 * ================================================================== */

teste("10 · duas execuções independentes reconstroem o mesmo estado lógico", async () => {
  const executar = async (dir: string): Promise<Registro[]> => {
    const { store, observer } = montarCadeia(dir, LIDO_EM);
    await observer.runCycle();
    await observer.runCycle();
    // `cycle_id` é aleatório por construção — é identidade de execução, não
    // estado. O que precisa ser idêntico é todo o resto.
    return store.all("live_cycle_runs").map((c) => {
      const { cycle_id, ...resto } = c;
      void cycle_id;
      return resto;
    });
  };
  const a = await new Promise<Registro[]>((res) => {
    void comDirAsync(async (d) => {
      res(await executar(d));
    });
  });
  const b = await new Promise<Registro[]>((res) => {
    void comDirAsync(async (d) => {
      res(await executar(d));
    });
  });
  assert.deepEqual(a, b, "duas execuções do mesmo log divergiram");
});

teste("10b · a projeção de origem também é determinística (replay da Operação Viva)", () => {
  const p1 = projecaoDe(eventosBase(), LIDO_EM);
  const p2 = projecaoDe([...eventosBase()].reverse(), LIDO_EM);
  assert.ok(mesmoEstadoLogico(p1, p2), "a ordem de chegada mudou a projeção");
  assert.equal(
    JSON.stringify(A.adaptarProjecao(p1, { lidoEm: LIDO_EM, source_mode: "real", janelas: JANELAS })),
    JSON.stringify(A.adaptarProjecao(p2, { lidoEm: LIDO_EM, source_mode: "real", janelas: JANELAS })),
  );
});

teste("10c · a reconciliação é recalculada do histórico, nunca guardada", async () => {
  await comDirAsync(async (dir) => {
    const { store, observer } = montarCadeiaLegitima(dir, LIDO_EM, () => [
      { external_id: "PED-1", raw_status: "Pronto" },
    ]);
    await observer.runCycle();
    const d1 = observer.getReconciledDimension("PED-1");
    // um store novo, carregado do disco, produz a MESMA reconciliação
    const store2 = createStore({ dir });
    store2.load("live_observations");
    store2.load("conference_clock_events");
    const observer2 = createLiveObserver({ store: store2, fetchOrders: async () => ({ orders: [] }), now: () => LIDO_EM });
    assert.deepEqual(observer2.getReconciledDimension("PED-1"), d1, "a reconciliação não sobreviveu ao reinício");
    assert.ok(!store.all("live_observations").some((o) => "reconciled" in o), "a reconciliação foi persistida");
  });
});

/* ================================================================== *
 * 11 — reinício não ressuscita estado inválido
 * ================================================================== */

teste("11 · registro proibido no disco NÃO volta no reinício — é quarentenado e contado", async () => {
  await comDirAsync(async (dir) => {
    const { store, observer } = montarCadeiaLegitima(dir, LIDO_EM, () => [
      { external_id: "PED-1", raw_status: "Pronto" },
    ]);
    await observer.runCycle();

    // O arquivo é editável por fora: correção manual, restauração de backup
    // ruim, versão antiga do código. "Só o put grava" nunca foi garantia do
    // que está no disco.
    const f = store.fileFor("live_observations");
    appendFileSync(f, "{isto nao e json\n");
    appendFileSync(
      f,
      JSON.stringify({
        run_id: "r9",
        cycle_id: "c9",
        external_id: "PED-X",
        observed_at: LIDO_EM,
        raw_status: "Pronto",
        source_health: "available",
        confidence: "alta",
        customer_name: "Joao da Silva",
      }) + "\n",
    );

    const novo = createStore({ dir });
    novo.load("live_observations");
    assert.equal(novo.count("live_observations"), 1, "o registro proibido ressuscitou");
    assert.ok(!novo.all("live_observations").some((o) => o.external_id === "PED-X"));

    const h = novo.health();
    assert.equal(h.corrupted_lines.length, 1, "a linha ilegível não foi contada");
    assert.equal(h.invalid_lines.length, 1, "a linha proibida não foi contada");
    assert.ok(h.invalid_lines[0].errors.includes("campo_proibido_pii:customer_name"));
  });
});

teste("11b · o reinício preserva o que É válido", async () => {
  await comDirAsync(async (dir) => {
    const { store, observer } = montarCadeiaLegitima(dir, LIDO_EM, () => [
      { external_id: "PED-1", raw_status: "Pronto" },
    ]);
    await observer.runCycle();
    const antes = store.count("live_observations");
    const novo = createStore({ dir });
    novo.load("live_observations");
    novo.load("conference_clock_events");
    assert.equal(novo.count("live_observations"), antes, "a carga perdeu registro legítimo");
    assert.equal(novo.count("conference_clock_events"), 1);
  });
});

/* ================================================================== *
 * 12 — PII continua protegida
 * ================================================================== */

teste("12 · PII não aparece em erro, saúde nem registro de ciclo", async () => {
  await comDirAsync(async (dir) => {
    const store = createStore({ dir });
    const observer = createLiveObserver({
      store,
      runId: "r-erro",
      collectorVersion: "teste",
      now: () => LIDO_EM,
      fetchOrders: async () => {
        throw new Error("falha lendo pedido de Joao da Silva, tel 11988887777, rua das Flores 42");
      },
    });
    const r = (await observer.runCycle()) as { ok: boolean; cycle: Registro };
    assert.equal(r.ok, false);
    const bruto = JSON.stringify(r.cycle) + JSON.stringify(store.health()) + JSON.stringify(store.all("live_cycle_runs"));
    for (const segredo of ["Joao", "Silva", "11988887777", "Flores"]) {
      assert.ok(!bruto.includes(segredo), `"${segredo}" vazou pelo caminho de erro`);
    }
  });
});

teste("12b · o adapter não deixa a mensagem da exceção atravessar", async () => {
  const fetch = A.criarFetchOrders({
    lerProjecao: () => {
      throw new Error("cliente Maria, cpf 12345678900");
    },
    source_mode: "real",
    janelas: JANELAS,
    now: () => LIDO_EM,
  });
  const bruto = JSON.stringify(await fetch());
  assert.ok(!bruto.includes("Maria") && !bruto.includes("12345678900"));
  assert.ok(bruto.includes("erro:Error"), "a classe do erro deveria atravessar");
});

teste("12c · texto livre desconhecido nunca é persistido bruto", async () => {
  await comDirAsync(async (dir) => {
    const { store, observer } = montarCadeiaLegitima(dir, LIDO_EM, () => [
      { external_id: "PED-1", raw_status: "Pronto para Joao da Silva" },
    ]);
    await observer.runCycle();
    const bruto = JSON.stringify(store.all("live_observations"));
    assert.ok(!bruto.includes("Joao"), "nome sobreviveu no raw_status");
    assert.ok(bruto.includes("[token-suprimido]"), "a supressão por token não rodou");
  });
});

/* ================================================================== *
 * 13 — confiança continua vinculada a evidência
 * ================================================================== */

teste("13 · sem evidência não há confiança — é null, nunca um padrão", () => {
  const vazio = Rec.reconcileField("ready_at", []);
  assert.equal(vazio.value, null);
  assert.equal(vazio.confidence, null, "confiança apareceu sem uma única observação");
  assert.deepEqual(vazio.history, []);

  // e com evidência, a confiança acompanha a evidência que venceu
  const comEvidencia = Rec.reconcileField("ready_at", [
    { ready_at: "2026-07-31T12:00:00.000Z", observed_at: LIDO_EM, confidence: "alta" },
  ]);
  assert.equal(comEvidencia.confidence, "alta");
  assert.equal(comEvidencia.history.length, 1, "a confiança não veio acompanhada da evidência");
});

teste("13b · dimensão sem observação cai no vocabulário de vazio, não num valor confiante", () => {
  const obs = buildOrderObservation({ externalId: "P1", observedAt: LIDO_EM, orderStateText: "Pronto" });
  const d = Rec.reconcileMultidimensional("P1", [obs]);
  // ninguém observou entregador nem despacho: o valor é o declarado-vazio
  assert.equal(d.courier_state, "not_applicable");
  assert.equal(d.dispatch_state, "not_applicable");
  // e o que FOI observado tem histórico por trás
  const prov = d.dimension_provenance as Record<string, { history: unknown[] }>;
  assert.equal(d.order_state, "ready");
  assert.ok(prov.order_state.history.length >= 1, "o valor afirmado não tem evidência por trás");
});

/* ================================================================== *
 * 14 — ausência não vira valor neutro
 * ================================================================== */

teste("14 · ausência atravessa como null e como ausência declarada", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const r = A.adaptarProjecao(p, { lidoEm: LIDO_EM, source_mode: "real", janelas: JANELAS });
  const beta = r.contexto?.viagens.find((v) => v.identidade.trip_id === "t-beta");
  assert.equal(beta?.observado.ultima_posicao_em, null);
  assert.equal(beta?.inferido.expirado, null, "nunca observado virou 'não expirado'");
  assert.notEqual(beta?.inferido.expirado, false);
  assert.equal(r.contexto?.dimensoes.capacidade_operacional.valor, "desconhecida");
  assert.equal(r.signals.criticalFieldsMissing.length, 10, "a ausência deixou de ser declarada");
});

/* ================================================================== *
 * 15 — falha do Brain não afeta Entregas, ingestão, outbox ou Operação Viva
 * ================================================================== */

teste("15 · Brain explodindo não muda um byte da projeção da Operação Viva", async () => {
  const antes = projecaoDe(eventosBase(), LIDO_EM);
  await comDirAsync(async (dir) => {
    const real = createStore({ dir });
    const explosivo: Store = {
      ...real,
      put: () => {
        throw new Error("Brain em pane");
      },
    };
    const observer = createLiveObserver({
      store: explosivo,
      fetchOrders: A.criarFetchOrders({
        lerProjecao: () => projecaoDe(eventosBase(), LIDO_EM),
        source_mode: "real",
        janelas: JANELAS,
        now: () => LIDO_EM,
      }),
      runId: A.runIdDe(UNIDADE, "real"),
      now: () => LIDO_EM,
    });
    // A pane é do Brain e fica no Brain: quem chama decide o que fazer com ela.
    await assert.rejects(() => observer.runCycle(), /Brain em pane/);
  });
  const depois = projecaoDe(eventosBase(), LIDO_EM);
  assert.ok(mesmoEstadoLogico(antes, depois), "a pane do Brain alcançou a Operação Viva");
  assert.equal(JSON.stringify(antes), JSON.stringify(depois));
});

teste("15b · nenhum módulo do caminho crítico conhece o Conference Brain", () => {
  for (const arquivo of [
    "src/platform/bin/critical.ts",
    "src/platform/bin/async-runtime.ts",
    "src/platform/runtime/rota-ingestao.ts",
    "src/platform/runtime/handler-operacao-viva.ts",
    "src/platform/runtime/async-worker.ts",
    "src/platform/ingest/ingest-service.ts",
    "src/platform/projections/operacao-viva.ts",
    "src/platform/projections/consumidor.ts",
    "src/platform/contracts/event-catalog.ts",
  ]) {
    assert.ok(
      !semComentarios(arquivo).includes("conference-brain"),
      `${arquivo} passou a depender do Conference Brain`,
    );
  }
});

/* ================================================================== *
 * 16 — as regressões dos blocos anteriores continuam disponíveis
 * ================================================================== */

teste("16 · os quatro gates anteriores continuam existindo e ligados ao package.json", () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  for (const bloco of ["4b1", "4b2", "4b3", "4b4", "4b5"]) {
    const script = pkg.scripts[`test:platform:cb${bloco}`];
    assert.ok(script, `o gate cb${bloco} não está no package.json`);
    const arquivo = script.split(" ").pop() as string;
    assert.ok(readFileSync(join(process.cwd(), arquivo), "utf8").length > 0, `${arquivo} vazio`);
  }
});

/* ================================================================== *
 * GUARDAS ESTRUTURAIS — impedem a regressão, não a detectam depois
 * ================================================================== */

teste("G1 · trip_id nunca é usado como external_id", () => {
  const adapter = soCodigo("src/conference-brain/ingestion/operacao-viva-adapter.js");
  assert.ok(!/external_id/.test(adapter), "o adapter menciona external_id em CÓDIGO, não só em prosa");
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const r = A.adaptarProjecao(p, { lidoEm: LIDO_EM, source_mode: "real", janelas: JANELAS });
  assert.deepEqual(r.orders, []);
  const bruto = JSON.stringify({ escopo: r.escopo, contexto: r.contexto, procedencia: r.procedencia });
  assert.ok(!bruto.includes("external_id"));
});

teste("G2 · a viagem inteira nunca é copiada para o Brain", () => {
  const adapter = semComentarios("src/conference-brain/ingestion/operacao-viva-adapter.js");
  assert.ok(!/\.\.\.v\b/.test(adapter), "o adapter espalha a viagem inteira (`...v`)");
  assert.ok(!/Object\.assign\(\s*\{\s*\}\s*,\s*v\s*\)/.test(adapter), "o adapter copia a viagem por Object.assign");

  const p = projecaoDe(eventosBase(), LIDO_EM);
  const contaminada = { ...p, viagens: p.viagens.map((v) => ({ ...v, campo_novo_qualquer: "x" })) };
  const r = A.adaptarProjecao(contaminada, { lidoEm: LIDO_EM, source_mode: "real", janelas: JANELAS });
  assert.ok(!JSON.stringify(r).includes("campo_novo_qualquer"), "campo desconhecido atravessou a fronteira");
});

teste("G3 · `available` não pode ser emitido sem observação de pedido", () => {
  const adapter = semComentarios("src/conference-brain/ingestion/operacao-viva-adapter.js");
  assert.ok(
    !/LIVE_SOURCE_HEALTH\.AVAILABLE\s*,\s*reason/.test(adapter),
    "o adapter passou a poder emitir available",
  );
  for (const integridade of ["fresh", "aging", "stale", "unknown", "coisa-que-nao-existe"]) {
    const p = { ...projecaoDe(eventosBase(), LIDO_EM), dimensoes: { integridade_sinal: integridade } };
    const r = A.adaptarProjecao(p, { lidoEm: LIDO_EM, source_mode: "real", janelas: JANELAS });
    assert.notEqual(r.health.state, LIVE_SOURCE_HEALTH.AVAILABLE, `${integridade} produziu available`);
    assert.equal(mayAffirmOperationalLoad(r.health.state), false);
  }
});

teste("G4 · order_id que apareça sem contrato é registrado, nunca consumido", () => {
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const r = A.adaptarProjecao(
    { ...p, viagens: p.viagens.map((v) => ({ ...v, order_id: "PED-SURPRESA" })) },
    { lidoEm: LIDO_EM, source_mode: "real", janelas: JANELAS },
  );
  assert.deepEqual(r.orders, [], "order_id inesperado virou pedido");
  assert.equal(r.recusas.identidade_de_pedido.length, 2);
  assert.ok(!JSON.stringify(r).includes("PED-SURPRESA"));
  // e a projeção de hoje continua sem order_id — se isso mudar, o bloco reabre
  assert.ok(!Object.keys(p.viagens[0]).includes("order_id"));
});

teste("G5 · o adapter não chama a projeção crítica — recebe um objeto simples", () => {
  const adapter = semComentarios("src/conference-brain/ingestion/operacao-viva-adapter.js");
  const requires = [...adapter.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(requires, [
    "../contracts/live-states",
    "../contracts/rule-version",
    "../contracts/schemas",
  ]);
  assert.ok(!adapter.includes("projetar"), "o adapter invoca projetar()");
  assert.ok(!adapter.includes("platform"), "o adapter alcança a plataforma");
});

teste("G6 · nada do Conference Brain entra no runtime crítico", () => {
  const { readdirSync, statSync } = req("node:fs") as typeof import("node:fs");
  const raiz = join(process.cwd(), "src", "conference-brain");
  const externos = new Set<string>();
  const andar = (d: string): void => {
    for (const nome of readdirSync(d)) {
      const p = join(d, nome);
      if (statSync(p).isDirectory()) {
        andar(p);
        continue;
      }
      if (!p.endsWith(".js")) continue;
      for (const m of readFileSync(p, "utf8").matchAll(/require\("([^".][^"]*)"\)/g)) externos.add(m[1]);
    }
  };
  andar(raiz);
  assert.deepEqual([...externos].sort(), ["crypto", "fs", "path"], "o Brain ganhou dependência externa");
  for (const fora of ["browser-adapter.js", "playwright-preflight.js", "mapping-mode.js"]) {
    assert.ok(
      !readdirSync(join(raiz, "live")).includes(fora),
      `${fora} entrou — patrimônio histórico não se importa para ficar verde`,
    );
  }
});

teste("G7 · o diagnóstico de linha inválida guarda código e hash, nunca conteúdo", () => {
  const store = semComentarios("src/conference-brain/storage/store.js");
  assert.ok(store.includes("erroSeguro"), "a sanitização dos códigos de erro sumiu");
  assert.ok(store.includes("excerpt_hash"), "o diagnóstico deixou de guardar hash");
  comDir((dir) => {
    const s = createStore({ dir });
    s.put("live_cycle_runs", {
      run_id: "r1",
      cycle_id: "c1",
      started_at: LIDO_EM,
      collector_version: "t",
      source_health: "partial",
    });
    appendFileSync(
      s.fileFor("live_cycle_runs"),
      JSON.stringify({
        run_id: "r2",
        cycle_id: "c2",
        started_at: LIDO_EM,
        collector_version: "t",
        source_health: "estado-secreto-do-cliente",
      }) + "\n",
    );
    const novo = createStore({ dir });
    novo.load("live_cycle_runs");
    const h = JSON.stringify(novo.health());
    assert.ok(h.includes("source_health_invalido"), "o código do erro sumiu");
    assert.ok(!h.includes("estado-secreto-do-cliente"), "o VALOR recusado vazou para a saúde");
  });
});

teste("G8 · informação ausente não é convertida em valor neutro", () => {
  const adapter = semComentarios("src/conference-brain/ingestion/operacao-viva-adapter.js");
  assert.ok(/\?\s*null\s*:\s*v/.test(adapter), "`ouNulo` deixou de devolver null para ausência");
  const p = projecaoDe(eventosBase(), LIDO_EM);
  const vazia = { ...p, dimensoes: {}, viagens: [{ trip_id: "t-x", unit_id: UNIDADE }] };
  const r = A.adaptarProjecao(vazia, { lidoEm: LIDO_EM, source_mode: "real", janelas: JANELAS });
  const v = r.contexto!.viagens[0];
  for (const campo of ["ultimo_fato_em", "ultima_posicao_em", "ocorrencias_abertas", "source_mode"]) {
    assert.equal(v.observado[campo], null, `${campo} ausente virou valor neutro`);
  }
  assert.equal(v.inferido.frescor, null);
  assert.equal(v.inferido.expirado, null);
  for (const d of Object.values(r.contexto!.dimensoes)) assert.equal(d.valor, null);
});

void Promise.all(pend).then(() => {
  if (failures.length) {
    console.error(`\n=== ${failures.length} FALHA(S) ===`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} conference-4b5 tests OK ===`);
});
