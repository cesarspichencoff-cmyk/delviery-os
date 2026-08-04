/**
 * Unidade 5 — Conference Brain -> Copiloto shadow.
 *
 * A cadeia autorizada, provada inteira:
 *
 *   Operação Viva -> adapter -> observer -> conclusões versionadas -> Copiloto
 *
 * O que este gate NÃO reprova: `exigirConfianca`, o id determinístico do
 * `recomendar` e as políticas sobre projeção já têm gate próprio em
 * `run-bridge-tests`. Aqui se prova a entrada NOVA — conclusões do Brain — e a
 * fronteira semântica que ela obriga.
 *
 * ## O controle positivo, de novo, é o que dá sentido aos zeros
 *
 * A cadeia real de hoje não gera recomendação de pedido, e não gera por um
 * motivo estrutural: o adapter não emite pedido (D29), então o Brain não tem
 * observação de pedido vinda dali, então nenhuma conclusão de pedido nasce.
 * "Não gerou" e "não funciona" produzem exatamente o mesmo vazio. Por isso a
 * MESMA ponte recebe uma conclusão sintética legítima de pedido e é obrigada a
 * gerar — senão o gate inteiro estaria medindo um cano entupido (L26).
 */

import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { projetar, JANELAS } from "./projections/operacao-viva";
import type { EventEnvelope, EventType, SourceMode } from "./contracts/event-catalog";
import {
  BRIDGE_VERSION,
  CONCLUSION_VERSION_SUPORTADA,
  recomendarDeConclusoes,
  ativas,
  retirar,
  paraRegistro,
  deRegistro,
} from "./copiloto/conference-bridge";
import type { Conclusao, RecomendacaoShadow, ResultadoShadow } from "./copiloto/conference-bridge";

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
 * Superfícies do Brain
 * ------------------------------------------------------------------ */

interface Registro {
  [k: string]: unknown;
}
interface Store {
  put: (t: string, r: Registro) => { ok: boolean; errors?: string[] };
  all: (t: string) => Registro[];
  count: (t: string) => number;
  load: (t: string) => number;
  health: () => { invalid_lines: { errors: string[] }[] };
  fileFor: (t: string) => string;
}
interface Observer {
  runCycle: () => Promise<Registro>;
  loadOrderState: (id: string) => { observations: Registro[]; clockEvents: Registro[] };
  getReconciledDimension: (id: string) => Registro | null;
}

const { createStore } = CB("storage/store") as { createStore: (o: { dir: string }) => Store };
const { createLiveObserver } = CB("live/observer") as { createLiveObserver: (o: Registro) => Observer };
const { LIVE_SOURCE_HEALTH } = CB("contracts/live-states") as {
  LIVE_SOURCE_HEALTH: Record<string, string>;
};
const A = CB("ingestion/operacao-viva-adapter") as {
  ADAPTER_VERSION: string;
  criarFetchOrders: (o: Registro) => () => Promise<unknown>;
  runIdDe: (u: string, m: string) => string;
};
const Conclusoes = CB("copiloto/conclusoes") as {
  CONCLUSION_VERSION: string;
  extrairConclusoes: (o: Registro) => { conclusoes: Conclusao[]; recusadas: Registro[] };
};

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const UNIDADE = "u-tata-centro";
const AGORA = new Date("2026-07-31T12:01:00.000Z");
const LIDO_EM = "2026-07-31T12:01:00.000Z";
const TARDE = new Date("2026-07-31T13:00:00.000Z");

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
    ev("trip_created", "t-beta", "2026-07-31T11:59:30.000Z", modo),
  ];
}

async function comDirAsync(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "u5-"));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A cadeia REAL: Operação Viva -> adapter -> observer -> conclusões. */
async function cadeiaReal(
  dir: string,
  modo: SourceMode = "real",
): Promise<{ store: Store; observer: Observer; conclusoes: Conclusao[] }> {
  const store = createStore({ dir });
  const runId = A.runIdDe(UNIDADE, modo);
  const observer = createLiveObserver({
    store,
    fetchOrders: A.criarFetchOrders({
      lerProjecao: () => projetar(eventosBase(modo), { agora: AGORA, unit_id: UNIDADE, source_mode: modo }),
      source_mode: modo,
      janelas: JANELAS,
      now: () => LIDO_EM,
    }),
    runId,
    collectorVersion: A.ADAPTER_VERSION,
    now: () => LIDO_EM,
  });
  await observer.runCycle();
  const { conclusoes } = Conclusoes.extrairConclusoes({
    store,
    observer,
    unit_id: UNIDADE,
    source_mode: modo,
    run_id: runId,
  });
  return { store, observer, conclusoes };
}

/** A cadeia LEGÍTIMA de pedido — o controle positivo. */
async function cadeiaLegitima(
  dir: string,
  pedidos: () => Registro[],
  modo: SourceMode = "real",
): Promise<{ store: Store; observer: Observer; conclusoes: Conclusao[] }> {
  const store = createStore({ dir });
  const runId = `controle-positivo:${modo}`;
  const observer = createLiveObserver({
    store,
    fetchOrders: async () => ({
      orders: pedidos(),
      health: { state: LIVE_SOURCE_HEALTH.AVAILABLE, reason: "leitura_completa", reasons: ["leitura_completa"] },
    }),
    runId,
    collectorVersion: "fonte-legitima-de-teste",
    now: () => LIDO_EM,
  });
  await observer.runCycle();
  const { conclusoes } = Conclusoes.extrairConclusoes({
    store,
    observer,
    unit_id: UNIDADE,
    source_mode: modo,
    run_id: runId,
  });
  return { store, observer, conclusoes };
}

const OPC = { agora: AGORA, unit_id: UNIDADE, source_mode: "real" as SourceMode };

function soCodigo(caminho: string): string {
  return readFileSync(join(process.cwd(), caminho), "utf8")
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
}
function semComentarios(caminho: string): string {
  return readFileSync(join(process.cwd(), caminho), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
}

const BRIDGE = "src/platform/copiloto/conference-bridge.ts";

/* ================================================================== *
 * 1 e 2 — CONTROLE POSITIVO e evidência real
 * ================================================================== */

teste("1 · CONTROLE POSITIVO: conclusão legítima de pedido gera recomendação shadow", async () => {
  await comDirAsync(async (dir) => {
    const { conclusoes } = await cadeiaLegitima(dir, () => [{ external_id: "PED-1", raw_status: "Pronto" }]);
    const pedido = conclusoes.filter((c) => c.conclusion_kind === "order_dimension");
    assert.equal(pedido.length, 1, "a cadeia não produziu conclusão de pedido — o resto do gate não vale nada");

    const r = recomendarDeConclusoes(conclusoes, OPC);
    const dePedido = r.recomendacoes.filter((x) => x.escopo === "pedido");
    assert.equal(dePedido.length, 1, "a ponte está morta: conclusão legítima não gerou recomendação");
    assert.equal(dePedido[0].policy_id, "pedido-pronto-sem-saida");
    assert.equal(dePedido[0].external_id, "PED-1");
    assert.equal(dePedido[0].status, "proposed");
    assert.equal(dePedido[0].shadow, true);
    assert.equal(dePedido[0].requires_human, true);
  });
});

teste("2 · a recomendação referencia evidências que existem de verdade no store", async () => {
  await comDirAsync(async (dir) => {
    const { store, conclusoes } = await cadeiaLegitima(dir, () => [
      { external_id: "PED-1", raw_status: "Pronto" },
    ]);
    const rec = recomendarDeConclusoes(conclusoes, OPC).recomendacoes.find((x) => x.escopo === "pedido");
    assert.ok(rec && rec.evidencias.length > 0, "recomendação sem evidência");

    const observacoes = new Set(
      store.all("live_observations").map((o) => `${o.run_id}|${o.cycle_id}|${o.external_id}`),
    );
    const relogio = new Set(store.all("conference_clock_events").map((e) => String(e.event_id)));
    for (const e of rec.evidencias) {
      const existe = e.tipo === "live_observation" ? observacoes.has(e.ref) : relogio.has(e.ref);
      assert.ok(existe, `evidência ${e.tipo}:${e.ref} não existe no store — referência inventada`);
    }
    assert.deepEqual([...rec.input_event_ids], rec.evidencias.map((e) => e.ref));
  });
});

/* ================================================================== *
 * 3 e 4 — confiança sem evidência, e ausência de conclusão
 * ================================================================== */

teste("3 · conclusão sem evidência rastreável não vira recomendação — vira recusa", () => {
  const c: Conclusao = {
    conclusion_version: CONCLUSION_VERSION_SUPORTADA,
    conclusion_kind: "source_health",
    conclusion_ref: "source_health:r|c",
    unit_id: UNIDADE,
    source_mode: "real",
    shadow: true,
    observed_at: LIDO_EM,
    source_health: "stale",
    pode_afirmar: false,
    evidence: [],
    limitacoes: [],
  };
  const r = recomendarDeConclusoes([c], OPC);
  assert.equal(r.recomendacoes.length, 0, "confiança apareceu sem uma única evidência");
  assert.equal(r.recusas.length, 1);
  assert.equal(r.recusas[0].estado, "insufficient_evidence");
  assert.equal(r.recusas[0].motivo, "conclusao_sem_evidencia_rastreavel");
});

teste("3b · o store recusa persistir recomendação sem evidência ou com confiança inválida", async () => {
  await comDirAsync(async (dir) => {
    const store = createStore({ dir });
    const { conclusoes } = await cadeiaLegitima(dir, () => [{ external_id: "PED-1", raw_status: "Pronto" }]);
    const rec = recomendarDeConclusoes(conclusoes, OPC).recomendacoes.find((x) => x.escopo === "pedido");
    const base = paraRegistro(rec as RecomendacaoShadow);

    assert.equal(store.put("copilot_recommendations", base).ok, true, "registro legítimo foi recusado");

    const semEvidencia = store.put("copilot_recommendations", { ...base, recommendation_id: "x1", evidencias: [] });
    assert.equal(semEvidencia.ok, false);
    assert.ok(semEvidencia.errors?.includes("confianca_sem_evidencia_rastreavel"));

    const confRuim = store.put("copilot_recommendations", { ...base, recommendation_id: "x2", confidence: 1.5 });
    assert.equal(confRuim.ok, false);
    assert.ok(confRuim.errors?.includes("confianca_invalida"));
  });
});

teste("4 · ausência de conclusão não gera recomendação artificial", () => {
  for (const entrada of [[], [null], [undefined], ["texto"]] as unknown[][]) {
    const r = recomendarDeConclusoes(entrada as Conclusao[], OPC);
    assert.equal(r.recomendacoes.length, 0, "recomendação nasceu do nada");
    assert.equal(r.shadow, true);
  }
  // e fonte saudável não gera recomendação nenhuma — calado é uma resposta
  const saudavel: Conclusao = {
    conclusion_version: CONCLUSION_VERSION_SUPORTADA,
    conclusion_kind: "source_health",
    conclusion_ref: "source_health:ok",
    unit_id: UNIDADE,
    source_mode: "real",
    shadow: true,
    observed_at: LIDO_EM,
    source_health: "available",
    pode_afirmar: true,
    evidence: [{ tipo: "live_cycle_run", ref: "r|c" }],
    limitacoes: [],
  };
  assert.equal(recomendarDeConclusoes([saudavel], OPC).recomendacoes.length, 0);
});

/* ================================================================== *
 * 5 e 6 — a fronteira semântica herdada da Unidade 4
 * ================================================================== */

teste("5 · a cadeia REAL gera recomendação de FONTE e nenhuma de pedido", async () => {
  await comDirAsync(async (dir) => {
    const { conclusoes } = await cadeiaReal(dir);
    assert.ok(conclusoes.length > 0, "a cadeia real não produziu conclusão — cano entupido");
    assert.equal(
      conclusoes.filter((c) => c.conclusion_kind === "order_dimension").length,
      0,
      "contexto de viagem virou conclusão de pedido",
    );

    const r = recomendarDeConclusoes(conclusoes, OPC);
    assert.ok(r.recomendacoes.length > 0, "a cadeia real não gerou nem a recomendação de fonte");
    for (const rec of r.recomendacoes) {
      assert.equal(rec.escopo, "fonte", "contexto de viagem gerou recomendação de pedido");
      assert.equal(rec.external_id, null);
    }
  });
});

teste("6 · trip_id nunca vira identidade de pedido em nenhum ponto da cadeia", async () => {
  await comDirAsync(async (dir) => {
    const { conclusoes } = await cadeiaReal(dir);
    const r = recomendarDeConclusoes(conclusoes, OPC);
    const bruto = JSON.stringify({ conclusoes, resultado: r });
    for (const trip of ["t-alfa", "t-beta"]) {
      assert.ok(!bruto.includes(trip), `${trip} atravessou até o Copiloto`);
    }
    for (const rec of r.recomendacoes) assert.equal(rec.external_id, null);
  });
});

teste("6b · conclusão de fonte com external_id colado à força não vira recomendação de pedido", () => {
  // A fixture é adversarial de propósito: traz TUDO o que uma conclusão de
  // pedido traria — identidade, `order_state: ready`, evidência — e mente só na
  // espécie. `source_health: "stale"` é escolhido para que a evidência seja
  // graduada e o caso não morra antes na trava de evidência: o que precisa
  // barrar aqui é a ESPÉCIE da conclusão, e nada mais.
  //
  // A garantia tem duas aplicações independentes (a política declara a que
  // espécie serve, e o laço impede que uma política futura esqueça). Nenhuma
  // das duas sozinha é observável de fora — por isso o controle adversarial
  // remove as duas juntas.
  const forjada = {
    conclusion_version: CONCLUSION_VERSION_SUPORTADA,
    conclusion_kind: "source_health",
    conclusion_ref: "source_health:forjada",
    unit_id: UNIDADE,
    source_mode: "real",
    shadow: true,
    observed_at: LIDO_EM,
    source_health: "stale",
    pode_afirmar: true,
    evidence: [{ tipo: "live_cycle_run", ref: "r|c" }],
    limitacoes: [],
    external_id: "t-alfa",
    order_state: "ready",
  } as unknown as Conclusao;
  const r = recomendarDeConclusoes([forjada], OPC);
  assert.equal(r.recomendacoes.filter((x) => x.escopo === "pedido").length, 0, "a trava de espécie cedeu");
  assert.ok(r.recomendacoes.length > 0, "nem a recomendação de fonte saiu — o caso morreu antes da trava");
  for (const rec of r.recomendacoes) {
    assert.equal(rec.escopo, "fonte");
    assert.equal(rec.external_id, null, "o trip_id disfarçado atravessou como identidade de pedido");
  }
});

/* ================================================================== *
 * 7, 8, 9 — duplicação, atualização e ordem
 * ================================================================== */

teste("7 · a mesma conclusão avaliada 50× produz uma recomendação, sempre a mesma", async () => {
  await comDirAsync(async (dir) => {
    const { conclusoes } = await cadeiaLegitima(dir, () => [{ external_id: "PED-1", raw_status: "Pronto" }]);
    const primeiro = JSON.stringify(recomendarDeConclusoes(conclusoes, OPC));
    for (let i = 0; i < 50; i += 1) {
      assert.equal(JSON.stringify(recomendarDeConclusoes(conclusoes, OPC)), primeiro, `divergiu em ${i}`);
    }
    // conclusão duplicada na entrada também não duplica na saída
    const dobrada = recomendarDeConclusoes([...conclusoes, ...conclusoes], OPC);
    assert.equal(dobrada.recomendacoes.length, recomendarDeConclusoes(conclusoes, OPC).recomendacoes.length);
  });
});

teste("8 · conclusão atualizada gera recomendação nova e marca a anterior como superada", async () => {
  await comDirAsync(async (dir) => {
    let pedidos: Registro[] = [{ external_id: "PED-1", raw_status: "Pronto" }];
    const { observer, store } = await cadeiaLegitima(dir, () => pedidos);
    const runId = "controle-positivo:real";
    const ler = (): Conclusao[] =>
      Conclusoes.extrairConclusoes({ store, observer, unit_id: UNIDADE, source_mode: "real", run_id: runId })
        .conclusoes;

    const antes = recomendarDeConclusoes(ler(), OPC).recomendacoes;
    const idAntes = antes.find((x) => x.escopo === "pedido")?.recommendation_id;

    // segunda observação do mesmo pedido: a conclusão passa a ter outra base
    await observer.runCycle();
    const depois = recomendarDeConclusoes(ler(), { ...OPC, anteriores: antes });
    const dePedido = depois.recomendacoes.filter((x) => x.escopo === "pedido");

    const nova = dePedido.find((x) => x.recommendation_id !== idAntes);
    const velha = dePedido.find((x) => x.recommendation_id === idAntes);
    assert.ok(nova, "a atualização não produziu recomendação nova");
    assert.equal(nova.status, "proposed");
    assert.equal(velha?.status, "invalidated", "a anterior continuou proposta depois de superada");
    assert.equal(velha?.motivo_de_saida, "evidencia_deixou_de_existir");
  });
});

teste("9 · a ordem de chegada das conclusões não muda a saída", async () => {
  await comDirAsync(async (dir) => {
    const { conclusoes } = await cadeiaLegitima(dir, () => [
      { external_id: "PED-1", raw_status: "Pronto" },
      { external_id: "PED-2", raw_status: "Pronto" },
    ]);
    assert.ok(conclusoes.length >= 3, "o fixture não tem conclusões suficientes para embaralhar");
    const direto = JSON.stringify(recomendarDeConclusoes(conclusoes, OPC).recomendacoes);
    const invertido = JSON.stringify(recomendarDeConclusoes([...conclusoes].reverse(), OPC).recomendacoes);
    assert.equal(invertido, direto, "a saída depende da ordem de chegada");
  });
});

/* ================================================================== *
 * 10, 11, 12 — expiração, retirada e remoção da evidência
 * ================================================================== */

teste("10 · recomendação vencida deixa de aparecer como ativa", async () => {
  await comDirAsync(async (dir) => {
    const { conclusoes } = await cadeiaLegitima(dir, () => [{ external_id: "PED-1", raw_status: "Pronto" }]);
    const r1 = recomendarDeConclusoes(conclusoes, OPC);
    assert.equal(ativas(r1).length, r1.recomendacoes.length, "nada estava ativo no início");

    // uma hora depois: a validade de 900 s já passou
    const r2 = recomendarDeConclusoes([], { ...OPC, agora: TARDE, anteriores: r1.recomendacoes });
    const expiradas = r2.recomendacoes.filter((x) => x.status === "expired" || x.status === "invalidated");
    assert.ok(expiradas.length > 0, "nada saiu do ar depois da validade");
    assert.equal(ativas(r2).length, 0, "recomendação vencida continuou ativa");
    for (const e of expiradas) assert.ok(e.motivo_de_saida, "saiu do ar sem dizer por quê");
  });
});

teste("10b · a validade vence mesmo com a conclusão ainda presente", async () => {
  // O controle adversarial pegou este buraco: o teste 10 remove as conclusões,
  // então a recomendação sai por INVALIDAÇÃO (a base sumiu) e nunca por
  // expiração. Estender a validade para um ano deixava a suíte verde. Aqui a
  // conclusão continua exatamente a mesma e só o relógio anda.
  await comDirAsync(async (dir) => {
    const { conclusoes } = await cadeiaLegitima(dir, () => [{ external_id: "PED-1", raw_status: "Pronto" }]);
    const r1 = recomendarDeConclusoes(conclusoes, OPC);
    assert.ok(ativas(r1).length > 0, "nada estava ativo no início");

    const r2 = recomendarDeConclusoes(conclusoes, { ...OPC, agora: TARDE, anteriores: r1.recomendacoes });
    assert.equal(ativas(r2).length, 0, "a validade não venceu com a conclusão ainda presente");
    for (const rec of r2.recomendacoes) {
      assert.equal(rec.status, "expired", "saiu do ar por outro motivo que não a validade");
      assert.equal(rec.motivo_de_saida, "validade_vencida");
      // e a leitura velha NÃO volta a ser proposta só porque foi lida de novo
      assert.ok(Date.parse(rec.expires_at) < TARDE.getTime());
    }
  });
});

teste("11 · retirada elimina a recomendação ativa e é registro, não execução", async () => {
  await comDirAsync(async (dir) => {
    const { conclusoes } = await cadeiaLegitima(dir, () => [{ external_id: "PED-1", raw_status: "Pronto" }]);
    const r1 = recomendarDeConclusoes(conclusoes, OPC);
    const alvo = r1.recomendacoes.find((x) => x.escopo === "pedido") as RecomendacaoShadow;
    const retirada = retirar(alvo, "operador_conferiu_pessoalmente");
    assert.equal(retirada.status, "dismissed");
    assert.equal(retirada.motivo_de_saida, "operador_conferiu_pessoalmente");
    assert.equal(retirada.shadow, true);
    assert.equal(retirada.requires_human, true);

    const r2 = recomendarDeConclusoes(conclusoes, { ...OPC, anteriores: [retirada] });
    assert.ok(!ativas(r2).some((x) => x.recommendation_id === alvo.recommendation_id), "a retirada voltou ao ar");
  });
});

teste("12 · evidência que deixa de existir retira a recomendação", async () => {
  await comDirAsync(async (dir) => {
    const { conclusoes } = await cadeiaLegitima(dir, () => [{ external_id: "PED-1", raw_status: "Pronto" }]);
    const r1 = recomendarDeConclusoes(conclusoes, OPC);
    // a conclusão some (pedido saiu da tela, ciclo não reobservou)
    const r2 = recomendarDeConclusoes([], { ...OPC, anteriores: r1.recomendacoes });
    for (const rec of r2.recomendacoes) {
      assert.notEqual(rec.status, "proposed", "recomendação sobreviveu à evidência que a sustentava");
      assert.equal(rec.motivo_de_saida, "evidencia_deixou_de_existir");
    }
  });
});

teste("12b · conclusão degradada gera recomendação DEGRADADA, não silêncio nem certeza", async () => {
  await comDirAsync(async (dir) => {
    const { conclusoes } = await cadeiaReal(dir);
    const r = recomendarDeConclusoes(conclusoes, OPC);
    const fonte = r.recomendacoes.find((x) => x.escopo === "fonte") as RecomendacaoShadow;
    assert.ok(fonte, "a fonte degradada não gerou nem recomendação limitada");
    assert.ok(["degradada", "stale", "sustentada"].includes(fonte.evidence_grade));
    assert.ok(fonte.limitacoes.length > 0, "a recomendação não carregou as limitações declaradas");
  });
});

/* ================================================================== *
 * 13, 14, 15 — replay, reinício e ressurreição
 * ================================================================== */

teste("13 · replay repetido produz exatamente o mesmo resultado", async () => {
  await comDirAsync(async (dirA) => {
    await comDirAsync(async (dirB) => {
      const a = await cadeiaLegitima(dirA, () => [{ external_id: "PED-1", raw_status: "Pronto" }]);
      const b = await cadeiaLegitima(dirB, () => [{ external_id: "PED-1", raw_status: "Pronto" }]);
      const ra = recomendarDeConclusoes(a.conclusoes, OPC);
      const rb = recomendarDeConclusoes(b.conclusoes, OPC);
      // `cycle_id` é aleatório por construção e entra nas referências; o que
      // precisa ser idêntico é a decisão: política, escopo, confiança, estado.
      const essencia = (r: ResultadoShadow): unknown =>
        r.recomendacoes.map((x) => ({
          policy_id: x.policy_id,
          escopo: x.escopo,
          external_id: x.external_id,
          // So a DECISAO de confianca entra na essencia. As `evidencias` da
          // confianca sao as mesmas refs que carregam `cycle_id` — aleatorio por
          // construcao, como o proprio comentario acima diz. Comparar as refs
          // faria o teste medir o gerador de id em vez da decisao.
          confianca:
            x.confianca.estado === "apurada"
              ? { estado: x.confianca.estado, valor: x.confianca.valor }
              : { estado: x.confianca.estado },
          risk_level: x.risk_level,
          evidence_grade: x.evidence_grade,
          status: x.status,
          shadow: x.shadow,
          expires_at: x.expires_at,
        }));
      assert.deepEqual(essencia(ra), essencia(rb), "duas execuções idênticas decidiram diferente");
    });
  });
});

teste("14 · reinício recupera apenas recomendações válidas", async () => {
  await comDirAsync(async (dir) => {
    const { store, conclusoes } = await cadeiaLegitima(dir, () => [
      { external_id: "PED-1", raw_status: "Pronto" },
    ]);
    const r = recomendarDeConclusoes(conclusoes, OPC);
    for (const rec of r.recomendacoes) {
      assert.equal(store.put("copilot_recommendations", paraRegistro(rec)).ok, true);
    }
    const validas = store.count("copilot_recommendations");
    assert.ok(validas > 0);

    // alguém escreve no arquivo por fora: uma linha fora do modo sombra
    appendFileSync(
      store.fileFor("copilot_recommendations"),
      JSON.stringify({
        ...paraRegistro(r.recomendacoes[0]),
        recommendation_id: "rec-forjada",
        shadow: false,
      }) + "\n",
    );

    const novo = createStore({ dir });
    novo.load("copilot_recommendations");
    assert.equal(novo.count("copilot_recommendations"), validas, "a recomendação forjada ressuscitou");
    assert.ok(!novo.all("copilot_recommendations").some((x) => x.recommendation_id === "rec-forjada"));
    assert.ok(
      novo.health().invalid_lines.some((l) => l.errors.includes("recomendacao_fora_do_modo_sombra")),
      "a linha fora de sombra não foi contada",
    );
  });
});

teste("15 · estado expirado ou retirado não ressuscita quando a conclusão reaparece", async () => {
  await comDirAsync(async (dir) => {
    const { conclusoes } = await cadeiaLegitima(dir, () => [{ external_id: "PED-1", raw_status: "Pronto" }]);
    const r1 = recomendarDeConclusoes(conclusoes, OPC);
    const alvo = r1.recomendacoes.find((x) => x.escopo === "pedido") as RecomendacaoShadow;

    for (const terminal of ["dismissed", "expired", "invalidated"] as const) {
      const anterior = { ...alvo, status: terminal, motivo_de_saida: "motivo" };
      // a MESMA conclusão volta a ser lida — id determinístico, mesmo id
      const r2 = recomendarDeConclusoes(conclusoes, { ...OPC, anteriores: [anterior] });
      const voltou = r2.recomendacoes.find((x) => x.recommendation_id === alvo.recommendation_id);
      assert.equal(voltou?.status, terminal, `${terminal} voltou a ser proposta`);
      assert.equal(ativas(r2).some((x) => x.recommendation_id === alvo.recommendation_id), false);
    }
  });
});

teste("15b · o registro sobrevive à ida e volta do store sem mudar de estado", async () => {
  await comDirAsync(async (dir) => {
    const { store, conclusoes } = await cadeiaLegitima(dir, () => [
      { external_id: "PED-1", raw_status: "Pronto" },
    ]);
    const rec = recomendarDeConclusoes(conclusoes, OPC).recomendacoes.find(
      (x) => x.escopo === "pedido",
    ) as RecomendacaoShadow;
    const retirada = retirar(rec, "operador_conferiu");
    store.put("copilot_recommendations", paraRegistro(retirada));

    const novo = createStore({ dir });
    novo.load("copilot_recommendations");
    const volta = deRegistro(novo.all("copilot_recommendations")[0] as Record<string, unknown>);
    assert.equal(volta.status, "dismissed");
    assert.equal(volta.motivo_de_saida, "operador_conferiu");
    assert.equal(volta.shadow, true);
    assert.deepEqual(volta.evidencias, rec.evidencias);
  });
});

/* ================================================================== *
 * 16 — origens separadas
 * ================================================================== */

teste("16 · real, simulado e controle não se misturam", async () => {
  await comDirAsync(async (dir) => {
    const real = await cadeiaReal(dir, "real");
    assert.ok(real.conclusoes.every((c) => c.source_mode === "real"));

    const forjada = { ...real.conclusoes[0], source_mode: "simulated" as SourceMode };
    const r = recomendarDeConclusoes([...real.conclusoes, forjada], OPC);
    assert.equal(r.recusas.filter((x) => x.estado === "escopo_divergente").length, 1);
    for (const rec of r.recomendacoes) assert.equal(rec.source_mode, "real");
  });
});

teste("16b · o mesmo fato em modos diferentes produz recomendações distintas", async () => {
  await comDirAsync(async (dirA) => {
    await comDirAsync(async (dirB) => {
      const real = await cadeiaReal(dirA, "real");
      const sim = await cadeiaReal(dirB, "simulated");
      const ra = recomendarDeConclusoes(real.conclusoes, OPC);
      const rb = recomendarDeConclusoes(sim.conclusoes, { ...OPC, source_mode: "simulated" });
      const ids = new Set([
        ...ra.recomendacoes.map((x) => x.recommendation_id),
        ...rb.recomendacoes.map((x) => x.recommendation_id),
      ]);
      assert.equal(
        ids.size,
        ra.recomendacoes.length + rb.recomendacoes.length,
        "real e simulado colidiram no mesmo id",
      );
    });
  });
});

/* ================================================================== *
 * 17, 18, 19, 20
 * ================================================================== */

teste("17 · PII não aparece em recomendação, evidência, recusa nem no store", async () => {
  await comDirAsync(async (dir) => {
    const { store, conclusoes } = await cadeiaLegitima(dir, () => [
      { external_id: "PED-1", raw_status: "Pronto para Joao da Silva, tel 11988887777" },
    ]);
    const r = recomendarDeConclusoes(conclusoes, OPC);
    for (const rec of r.recomendacoes) store.put("copilot_recommendations", paraRegistro(rec));

    const bruto =
      JSON.stringify(conclusoes) +
      JSON.stringify(r) +
      JSON.stringify(store.all("copilot_recommendations")) +
      JSON.stringify(store.health());
    for (const segredo of ["Joao", "Silva", "11988887777"]) {
      assert.ok(!bruto.includes(segredo), `"${segredo}" vazou até o Copiloto`);
    }
    assert.ok(JSON.stringify(conclusoes).includes("[token-suprimido]"), "o guard de PII não rodou na conclusão");
  });
});

teste("17b · o guard de PII da CONCLUSÃO é exercitado, não o do observador", async () => {
  // Outro buraco que o controle adversarial encontrou: o teste 17 passava
  // mesmo sem o guard aqui, porque o observador já sanitiza `raw_status` antes
  // de persistir. O teste media a camada do vizinho (L27). Este exercita ESTA
  // camada: um ciclo escrito direto no store, com texto que nunca passou pelo
  // observador — o caminho de quem grava por fora.
  await comDirAsync(async (dir) => {
    const store = createStore({ dir });
    const runId = "run-direto";
    store.put("live_cycle_runs", {
      run_id: runId,
      cycle_id: "c1",
      started_at: LIDO_EM,
      finished_at: LIDO_EM,
      collector_version: "teste",
      source_health: LIVE_SOURCE_HEALTH.PARTIAL,
      errors: ["falha lendo pedido de Joao da Silva, tel 11988887777"],
    });
    const { conclusoes } = Conclusoes.extrairConclusoes({
      store,
      unit_id: UNIDADE,
      source_mode: "real",
      run_id: runId,
    });
    assert.equal(conclusoes.length, 1, "a conclusão de saúde não foi extraída");
    const bruto = JSON.stringify(conclusoes);
    for (const segredo of ["Joao", "Silva", "11988887777"]) {
      assert.ok(!bruto.includes(segredo), `"${segredo}" atravessou o guard da conclusão`);
    }
    assert.ok(bruto.includes("[token-suprimido]"), "o guard de PII não rodou nesta camada");
  });
});

teste("18 · Copiloto não afeta Entregas, ingestão, outbox, Operação Viva nem Conference Brain", () => {
  for (const arquivo of [
    "src/platform/bin/critical.ts",
    "src/platform/bin/async-runtime.ts",
    "src/platform/runtime/rota-ingestao.ts",
    "src/platform/runtime/handler-operacao-viva.ts",
    "src/platform/runtime/async-worker.ts",
    "src/platform/ingest/ingest-service.ts",
    "src/platform/projections/operacao-viva.ts",
    "src/platform/projections/consumidor.ts",
  ]) {
    const t = semComentarios(arquivo);
    assert.ok(!t.includes("copiloto"), `${arquivo} passou a depender do Copiloto`);
    assert.ok(!t.includes("conference-brain"), `${arquivo} passou a depender do Conference Brain`);
  }
  // E a ponte não IMPORTA o Brain: a seta não existe em nenhuma direção. A
  // varredura é por declaração de import — a string
  // "conference-brain-conclusion@1.0.0" é o nome de um CONTRATO que as duas
  // pontas combinaram, e citar o contrato é o oposto de depender do código.
  const imports = [...semComentarios(BRIDGE).matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  for (const i of imports) {
    assert.ok(!i.includes("conference-brain"), `a ponte importa ${i}`);
  }
  assert.deepEqual(imports.sort(), ["../contracts/event-catalog", "./shadow", "./shadow", "node:crypto"]);
});

teste("18b · conclusão malformada vira recusa declarada, nunca exceção", () => {
  const lixo = [
    { conclusion_version: "outra@9.0.0", conclusion_ref: "x" },
    { conclusion_version: CONCLUSION_VERSION_SUPORTADA },
    42,
    null,
  ] as unknown as Conclusao[];
  const r = recomendarDeConclusoes(lixo, OPC);
  assert.equal(r.recomendacoes.length, 0);
  assert.ok(r.recusas.length >= 3, "entrada malformada não foi declarada");
  assert.ok(r.recusas.some((x) => x.estado === "versao_incompativel"));
  assert.equal(r.shadow, true);
});

teste("19 · nenhum caminho executor existe", () => {
  const codigo = soCodigo(BRIDGE);
  for (const proibido of ["exec", "spawn", "fetch(", "http", "writeFile", "process.exit", "executar"]) {
    assert.ok(!codigo.includes(proibido), `a ponte contém "${proibido}"`);
  }
  assert.ok(!semComentarios(BRIDGE).includes("executed"), "o estado `executed` apareceu");
  // e nenhuma recomendação pode dispensar humano
  const texto = semComentarios(BRIDGE);
  // No GERADOR o valor é literal; no serializador ele é repassado (`r.x`), que
  // é transporte, não decisão. O que nunca pode existir é a constante oposta.
  // Contagem exata em vez de lookahead: `requires_human` só pode aparecer
  // atribuído em dois lugares — literal `true` no gerador e repasse no
  // serializador. Qualquer terceira atribuição é um caminho novo.
  const atribuicoes = [...texto.matchAll(/requires_human:\s*([^,\n]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(atribuicoes, ["true", "r.requires_human"], `atribuições inesperadas: ${atribuicoes.join(" | ")}`);
  assert.ok(!/requires_human:\s*false/.test(texto), "existe um caminho que dispensa humano");
});

teste("20 · o estado shadow é explícito em TODOS os resultados", async () => {
  await comDirAsync(async (dir) => {
    const { conclusoes } = await cadeiaLegitima(dir, () => [{ external_id: "PED-1", raw_status: "Pronto" }]);
    const r = recomendarDeConclusoes(conclusoes, OPC);
    assert.equal(r.shadow, true, "o resultado não se declara sombra");
    for (const rec of r.recomendacoes) {
      assert.equal(rec.shadow, true, "recomendação sem estado sombra");
      assert.equal(rec.requires_human, true);
    }
    for (const c of conclusoes) assert.equal(c.shadow, true, "conclusão sem estado sombra");
    // até a recusa e o resultado vazio se declaram sombra
    assert.equal(recomendarDeConclusoes([], OPC).shadow, true);
  });
});

/* ================================================================== *
 * GUARDAS ESTRUTURAIS
 * ================================================================== */

teste("G1 · o Copiloto não entra no runtime crítico", () => {
  const critico = semComentarios("src/platform/bin/critical.ts") + semComentarios("src/platform/bin/async-runtime.ts");
  assert.ok(!critico.includes("copiloto"));
  assert.ok(!critico.includes("shadow"));
});

teste("G2 · nenhuma ação operacional é chamada, e nenhuma execução automática existe", () => {
  const codigo = soCodigo(BRIDGE);
  for (const verbo of ["despachar", "cancelar", "notificar", "enviar", "aplicar", "confirmar"]) {
    assert.ok(!codigo.includes(verbo), `a ponte chama a ação "${verbo}"`);
  }
  // `recommended_action` é TEXTO proposto, nunca chamada
  assert.ok(!/recommended_action\s*\(/.test(codigo), "recommended_action virou invocação");
});

teste("G3 · recomendação sem evidência é impossível, no motor e no armazenamento", async () => {
  assert.ok(semComentarios(BRIDGE).includes('grau === "insuficiente"'), "a trava de evidência sumiu do motor");
  const schemas = semComentarios("src/conference-brain/contracts/schemas.js");
  assert.ok(schemas.includes("confianca_sem_evidencia_rastreavel"), "a trava sumiu do armazenamento");
});

teste("G4 · não existe confiança padrão inventada", () => {
  const codigo = semComentarios(BRIDGE);
  assert.ok(codigo.includes("exigirConfianca"), "a validação de confiança sumiu");
  assert.ok(!/confidence:\s*1\b|confidence:\s*0\.5\s*\/\/?\s*padr/.test(codigo));
  // confiança fora de faixa não vira recomendação
  const c: Conclusao = {
    conclusion_version: CONCLUSION_VERSION_SUPORTADA,
    conclusion_kind: "source_health",
    conclusion_ref: "cf",
    unit_id: UNIDADE,
    source_mode: "real",
    shadow: true,
    observed_at: LIDO_EM,
    source_health: "desconhecido-que-nao-tem-confianca",
    pode_afirmar: false,
    evidence: [{ tipo: "live_cycle_run", ref: "r|c" }],
    limitacoes: [],
  };
  assert.equal(recomendarDeConclusoes([c], OPC).recomendacoes.length, 0, "saúde desconhecida gerou confiança");
});

teste("G5 · recomendação de pedido exige pedido observado — motor e armazenamento", async () => {
  const codigo = semComentarios(BRIDGE);
  assert.ok(codigo.includes('c.conclusion_kind !== "order_dimension"'), "a trava de espécie sumiu");
  await comDirAsync(async (dir) => {
    const store = createStore({ dir });
    const { conclusoes } = await cadeiaLegitima(dir, () => [{ external_id: "PED-1", raw_status: "Pronto" }]);
    const rec = recomendarDeConclusoes(conclusoes, OPC).recomendacoes.find(
      (x) => x.escopo === "pedido",
    ) as RecomendacaoShadow;
    const semPedido = store.put("copilot_recommendations", {
      ...paraRegistro(rec),
      recommendation_id: "y1",
      external_id: null,
    });
    assert.equal(semPedido.ok, false);
    assert.ok(semPedido.errors?.includes("recomendacao_de_pedido_sem_identidade_de_pedido"));
  });
});

teste("G6 · o armazenamento recusa recomendação fora do modo sombra", async () => {
  await comDirAsync(async (dir) => {
    const store = createStore({ dir });
    const { conclusoes } = await cadeiaLegitima(dir, () => [{ external_id: "PED-1", raw_status: "Pronto" }]);
    const rec = recomendarDeConclusoes(conclusoes, OPC).recomendacoes[0];
    for (const [campo, valor, erro] of [
      ["shadow", false, "recomendacao_fora_do_modo_sombra"],
      ["requires_human", false, "recomendacao_sem_exigencia_de_humano"],
    ] as [string, boolean, string][]) {
      const r = store.put("copilot_recommendations", {
        ...paraRegistro(rec),
        recommendation_id: `z-${campo}`,
        [campo]: valor,
      });
      assert.equal(r.ok, false, `${campo}=${valor} foi aceito`);
      assert.ok(r.errors?.includes(erro));
    }
  });
});

teste("G7 · não existe store paralelo — o Copiloto usa o do Conference Brain", () => {
  const codigo = soCodigo(BRIDGE);
  for (const proibido of ["createStore", "readFileSync", "appendFileSync", "mkdir"]) {
    assert.ok(!codigo.includes(proibido), `a ponte criou persistência própria (${proibido})`);
  }
  const schemas = semComentarios("src/conference-brain/contracts/schemas.js");
  assert.ok(schemas.includes("copilot_recommendations"), "a entidade não vive no store do Brain");
});

teste("G8 · a ponte não fabrica relógio nem identidade próprios", () => {
  const codigo = soCodigo(BRIDGE);
  assert.ok(!codigo.includes("new Date()"), "a ponte lê o relógio de parede em vez de receber `agora`");
  assert.ok(!codigo.includes("randomBytes") && !codigo.includes("Math.random"), "identidade aleatória");
  assert.ok(semComentarios(BRIDGE).includes("createHash"), "o id determinístico sumiu");
});

teste("G9 · as duas espécies de conclusão não compartilham campo de estado", () => {
  const codigo = semComentarios(BRIDGE);
  // status (ciclo de vida) e evidence_grade (qualidade) são eixos separados
  assert.ok(codigo.includes("evidence_grade"), "o eixo de qualidade da evidência sumiu");
  assert.ok(!/status:\s*["']insuf/.test(codigo), "evidência insuficiente virou status");
  const schemas = semComentarios("src/conference-brain/contracts/schemas.js");
  assert.ok(!schemas.includes('"insuficiente"'), "insuficiente virou atributo de recomendação existente");
});

teste("G10 · o fecho do Brain continua fechado depois da Unidade 5", () => {
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
  // e o extrator não alcança a plataforma
  const conclusoes = soCodigo("src/conference-brain/copiloto/conclusoes.js");
  assert.ok(!conclusoes.includes("platform"), "o extrator alcança a plataforma");
});

teste("G11 · a versão da conclusão é contrato, e major diferente é recusa", () => {
  assert.equal(Conclusoes.CONCLUSION_VERSION, CONCLUSION_VERSION_SUPORTADA, "as duas pontas divergiram de versão");
  assert.ok(BRIDGE_VERSION.startsWith("copiloto-conference-bridge@"));
});

void Promise.all(pend).then(() => {
  if (failures.length) {
    console.error(`\n=== ${failures.length} FALHA(S) ===`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} copiloto-shadow tests OK ===`);
});
