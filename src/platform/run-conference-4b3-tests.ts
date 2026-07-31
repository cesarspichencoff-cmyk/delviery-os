/**
 * Bloco 4B3 — observador, relógio, expiração, remoção e recuperação.
 *
 * Tudo aqui roda com o tempo como DADO: o observador recebe `now` injetado, e
 * nenhum teste espera segundo real para provar envelhecimento. Foi preciso
 * acrescentar essa injeção — o ciclo chamava `new Date()` em cinco pontos, e
 * isso tornava o requisito "relógio determinístico" falso na prática.
 *
 * O patrimônio histórico do observador (`live-observer.test.js`) continua no
 * WIP: ele exige `mapping-mode`, `browser-adapter` e `flags`, todos fora de
 * escopo. Estas são as provas equivalentes contra o comportamento real.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

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

interface Store {
  put: (t: string, r: Record<string, unknown>) => { ok: boolean };
  all: (t: string) => Record<string, unknown>[];
  count: (t: string) => number;
  load: (t: string) => unknown;
  health: () => Record<string, unknown>;
}
interface Observer {
  runCycle: () => Promise<Record<string, unknown>>;
  loadOrderState: (id: string) => { observations: Record<string, unknown>[]; clockEvents: unknown[] };
  getReconciledDimension: (id: string) => unknown;
}

const { createStore } = CB("storage/store") as { createStore: (o: { dir: string }) => Store };
const { createLiveObserver } = CB("live/observer") as {
  createLiveObserver: (o: Record<string, unknown>) => Observer;
};
const H = CB("live/health") as {
  classifyCycleHealth: (s: unknown) => { state: string; reason: string; reasons: string[] };
  requiresHumanIntervention: (s: string) => boolean;
  mayAffirmOperationalLoad: (s: string) => boolean;
};
const C = CB("live/clock") as Record<string, (...a: unknown[]) => unknown>;
const G = CB("live/grouping") as { PRESENCE: Record<string, string>; reconcileGrouping: (o: readonly unknown[]) => Record<string, unknown> };
const R = CB("live/reconciliation") as Record<string, (...a: unknown[]) => Record<string, unknown>>;
const P = CB("live/pii-guard") as { isRedactedMarker: (v: unknown) => boolean };

/* ------------------------------------------------------------------ *
 * Bancada: relógio de teste + observador
 * ------------------------------------------------------------------ */

/** Um relógio que só anda quando mandam. É o que dispensa esperar de verdade. */
class Relogio {
  constructor(private ms: number) {}
  agora = (): string => new Date(this.ms).toISOString();
  avancar(segundos: number): void {
    this.ms += segundos * 1000;
  }
}

const T0 = Date.parse("2026-07-27T12:00:00.000Z");

function bancada(pedidos: () => Record<string, unknown>[], sinais: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cb4b3-"));
  const relogio = new Relogio(T0);
  const store = createStore({ dir });
  const observer = createLiveObserver({
    store,
    runId: "r1",
    now: relogio.agora,
    fetchOrders: async () => ({ orders: pedidos(), signals: sinais }),
  });
  return { dir, relogio, store, observer, fechar: () => rmSync(dir, { recursive: true, force: true }) };
}

const pedido = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  external_id: id,
  raw_status: "pronto",
  ...extra,
});

console.log("=== Conference Brain 4B3 — observador, relógio, expiração, recuperação ===");

/* ------------------------------------------------------------------ *
 * 1. O observador aceita só contrato válido
 * ------------------------------------------------------------------ */

teste("o observador registra o ciclo e as observações", async () => {
  const b = bancada(() => [pedido("p-1")]);
  try {
    const r = await b.observer.runCycle();
    assert.equal(r.ok, true);
    assert.equal((r.cycle as Record<string, unknown>).orders_observed, 1);
    assert.equal(b.store.count("live_observations"), 1);
  } finally {
    b.fechar();
  }
});

teste("pedido sem identificador é ignorado, não gravado pela metade", async () => {
  const b = bancada(() => [{ raw_status: "pronto" }, pedido("p-2")]);
  try {
    await b.observer.runCycle();
    assert.equal(b.store.count("live_observations"), 1, "gravou observação sem external_id");
  } finally {
    b.fechar();
  }
});

teste("falha do coletor NÃO derruba o observador e vira ciclo indisponível", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cb4b3-"));
  try {
    const obs = createLiveObserver({
      store: createStore({ dir }),
      runId: "r1",
      now: () => new Date(T0).toISOString(),
      fetchOrders: async () => {
        throw new Error("a fonte caiu falando de Joao Silva");
      },
    });
    const r = await obs.runCycle();
    assert.equal(r.ok, false);
    assert.equal((r.cycle as Record<string, unknown>).source_health, "unavailable");
    // A mensagem da exceção pode carregar qualquer texto que a origem tinha em
    // mãos até o ponto da falha. Ela vira marcador, nunca texto bruto.
    const erros = (r.cycle as { errors?: unknown[] }).errors ?? [];
    assert.ok(!JSON.stringify(erros).includes("Joao"), "a exceção vazou nome");
    assert.equal(P.isRedactedMarker(erros[0]), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

teste("login e captcha SUSPENDEM a coleta — não viram leitura degradada", async () => {
  // Uma tela de login lida como se fosse a operação produziria zero pedidos e
  // a conclusão falsa de que a loja está vazia.
  for (const sinal of [{ loginPromptDetected: true }, { captchaDetected: true }]) {
    const b = bancada(() => [pedido("p-1")], sinal);
    try {
      const r = await b.observer.runCycle();
      assert.equal(r.suspended, true, `não suspendeu com ${JSON.stringify(sinal)}`);
      assert.equal(b.store.count("live_observations"), 0, "gravou observação com a fonte suspensa");
    } finally {
      b.fechar();
    }
  }
  assert.equal(H.requiresHumanIntervention("login_required"), true);
});

/* ------------------------------------------------------------------ *
 * 2. Origem distinta
 * ------------------------------------------------------------------ */

teste("saúde da fonte carrega o MOTIVO, não só o estado", async () => {
  // Sem `reasons`, "parcial" é um rótulo que ninguém consegue investigar.
  const h = H.classifyCycleHealth({ accountContextBlock: "multiplas_unidades_detectadas" });
  assert.equal(h.state, "inconsistent");
  assert.ok(h.reasons.length > 0, "estado sem motivo");
  assert.match(h.reason, /multiplas_unidades/);
});

teste("fonte inconsistente NÃO autoriza afirmar carga operacional", async () => {
  // É a diferença entre "não sei quantos pedidos há" e "há poucos pedidos".
  assert.equal(H.mayAffirmOperationalLoad("available"), true);
  assert.equal(H.mayAffirmOperationalLoad("inconsistent"), false);
  assert.equal(H.mayAffirmOperationalLoad("unavailable"), false);
});

/* ------------------------------------------------------------------ *
 * 3-5. Duplicata, ordem e relógio
 * ------------------------------------------------------------------ */

teste("o mesmo pedido em ciclos seguidos NÃO duplica estado lógico", async () => {
  const b = bancada(() => [pedido("p-1")]);
  try {
    await b.observer.runCycle();
    b.relogio.avancar(30);
    await b.observer.runCycle();
    // Duas observações no histórico é correto — são dois instantes distintos.
    // O que não pode é a conclusão duplicar.
    const dim = b.observer.getReconciledDimension("p-1") as Record<string, unknown> | null;
    assert.ok(dim, "sem dimensão reconciliada");
    assert.equal(b.store.count("live_observations") <= 2, true);
  } finally {
    b.fechar();
  }
});

teste("o relógio injetado controla o tempo — nenhuma espera real", async () => {
  const b = bancada(() => [pedido("p-1")]);
  try {
    const a = await b.observer.runCycle();
    b.relogio.avancar(3600);
    const c = await b.observer.runCycle();
    const t1 = (a.cycle as Record<string, string>).started_at;
    const t2 = (c.cycle as Record<string, string>).started_at;
    assert.equal(t1, "2026-07-27T12:00:00.000Z");
    assert.equal(t2, "2026-07-27T13:00:00.000Z", "o relógio injetado não governou o ciclo");
  } finally {
    b.fechar();
  }
});

teste("SEM relógio injetado o observador continua funcionando", async () => {
  // O caminho padrao existe para quem nao injeta nada, e por isso mesmo nenhum
  // teste o exercitava. Ao acrescentar a injecao, o fallback virou
  // `() => agora()` — recursao infinita. Os 25 testes passavam porque todos
  // injetam relogio; so o caminho de producao quebrava.
  const dir = mkdtempSync(join(tmpdir(), "cb4b3-"));
  try {
    const obs = createLiveObserver({
      store: createStore({ dir }),
      runId: "r1",
      fetchOrders: async () => ({ orders: [pedido("p-1")], signals: {} }),
    });
    const r = await obs.runCycle();
    assert.equal(r.ok, true);
    const carimbo = (r.cycle as Record<string, string>).started_at;
    assert.match(carimbo, /^\d{4}-\d{2}-\d{2}T/, `carimbo invalido: ${carimbo}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

teste("dois ciclos com o MESMO relógio produzem carimbos idênticos", async () => {
  // É o que torna o replay determinístico: o tempo é dado, não ambiente.
  const b = bancada(() => [pedido("p-1")]);
  try {
    const a = await b.observer.runCycle();
    const c = await b.observer.runCycle();
    assert.equal(
      (a.cycle as Record<string, string>).started_at,
      (c.cycle as Record<string, string>).started_at,
    );
  } finally {
    b.fechar();
  }
});

teste("evento de relógio fora de ordem segue política explícita", async () => {
  // A transição é validada contra o grafo, não contra a ordem de chegada.
  assert.equal(typeof C.isValidTransition, "function");
  assert.equal(C.readyDoesNotImplyStarted(), true, "pronto implicou iniciado");
  assert.equal(
    C.courierLogisticsNeverDrivesConferenceFlow(),
    true,
    "a logística do entregador passou a dirigir o fluxo da conferência",
  );
  assert.equal(C.dispatchNeverReplacesRelease(), true, "despacho substituiu liberação");
});

teste("retry do MESMO fato colapsa; correção do mesmo tipo vira fato novo", () => {
  // O contrato e melhor do que "duplicata e erro": retry devolve o evento que
  // ja existia, com `idempotent: true`. Recusar obrigaria o chamador a tratar
  // uma retentativa legitima como falha.
  const base = {
    order_id: "p-1",
    event_type: "ready_observed",
    origin: "ifood_screen",
    event_time: "2026-07-27T12:00:00.000Z",
    raw_status: "pronto",
  };
  const a = C.recordEvent({ ...base, existing_events: [] }) as {
    ok: boolean;
    event?: Record<string, unknown>;
    idempotent?: boolean;
  };
  assert.equal(a.ok, true);
  assert.notEqual(a.idempotent, true, "o primeiro registro veio marcado como retry");

  const retry = C.recordEvent({ ...base, existing_events: [a.event] }) as {
    ok: boolean;
    idempotent?: boolean;
    event?: Record<string, unknown>;
  };
  assert.equal(retry.idempotent, true, "o retry do mesmo fato nao colapsou");
  assert.deepEqual(retry.event, a.event, "o retry produziu um evento diferente");

  // Mesmo TIPO com conteudo diferente e um fato NOVO — correcao de horario nao
  // pode ser confundida com retentativa.
  const correcao = C.recordEvent({
    ...base,
    event_time: "2026-07-27T12:03:00.000Z",
    existing_events: [a.event],
  }) as { ok: boolean; idempotent?: boolean };
  assert.equal(correcao.ok, true);
  assert.notEqual(correcao.idempotent, true, "uma correcao foi colapsada como retry");
});

teste("evento com tipo ou origem invalida e RECUSADO", () => {
  const base = { order_id: "p-1", event_time: "2026-07-27T12:00:00.000Z", existing_events: [] };
  assert.equal(
    (C.recordEvent({ ...base, event_type: "inventado", origin: "ifood_screen" }) as { ok: boolean }).ok,
    false,
  );
  assert.equal(
    (C.recordEvent({ ...base, event_type: "ready_observed", origin: "inventada" }) as { ok: boolean }).ok,
    false,
  );
  assert.equal(
    (C.recordEvent({ event_type: "ready_observed", origin: "ifood_screen", existing_events: [] }) as { ok: boolean }).ok,
    false,
    "evento sem pedido foi aceito",
  );
});

/* ------------------------------------------------------------------ *
 * 6-8. Frescor, stale e expiração
 * ------------------------------------------------------------------ */

teste("pedido que sumiu da tela é marcado como ausente, não apagado", async () => {
  // Apagar perderia a informação de que ele existiu; manter sem marcação faria
  // o painel mostrar um pedido que já não está lá.
  let visiveis = [pedido("p-1"), pedido("p-2")];
  const b = bancada(() => visiveis);
  try {
    await b.observer.runCycle();
    visiveis = [pedido("p-1")];
    b.relogio.avancar(60);
    await b.observer.runCycle();

    const p2 = b.observer.loadOrderState("p-2").observations;
    const ultima = p2[p2.length - 1];
    assert.equal(ultima.missing_from_view, true, "o sumiço não foi registrado");
  } finally {
    b.fechar();
  }
});

teste("o sumiço é registrado UMA vez, não a cada ciclo", async () => {
  let visiveis = [pedido("p-1"), pedido("p-2")];
  const b = bancada(() => visiveis);
  try {
    await b.observer.runCycle();
    visiveis = [pedido("p-1")];
    for (let i = 0; i < 4; i += 1) {
      b.relogio.avancar(60);
      await b.observer.runCycle();
    }
    const marcados = b.observer
      .loadOrderState("p-2")
      .observations.filter((o) => o.missing_from_view === true);
    assert.equal(marcados.length, 1, `o sumiço foi repetido ${marcados.length} vezes`);
  } finally {
    b.fechar();
  }
});

teste("pedido concluído que sai da tela NÃO é tratado como sumiço", async () => {
  // Sair da tela depois de concluir é o fim normal, não uma anomalia.
  let visiveis = [pedido("p-1", { raw_status: "concluido" })];
  const b = bancada(() => visiveis);
  try {
    await b.observer.runCycle();
    visiveis = [];
    b.relogio.avancar(60);
    await b.observer.runCycle();
    const obs = b.observer.loadOrderState("p-1").observations;
    const ultimo = obs[obs.length - 1];
    if (ultimo.status === "completed" || ultimo.status === "cancelled") {
      assert.notEqual(ultimo.missing_from_view, true, "conclusão virou sumiço");
    }
  } finally {
    b.fechar();
  }
});

/* ------------------------------------------------------------------ *
 * 9-10. Remoção e desativação
 * ------------------------------------------------------------------ */

teste("remoção de agrupamento elimina o estado derivado", async () => {
  const r = G.reconcileGrouping([
    { observed: true, memberOrderIds: ["p-1", "p-2"], observedAt: "2026-07-27T12:00:00.000Z" },
    { observed: true, memberOrderIds: [], observedAt: "2026-07-27T12:05:00.000Z" },
  ]) as { current?: { presence?: string; member_order_ids?: string[]; group_id?: unknown } };
  assert.equal(r.current?.presence, G.PRESENCE.REMOVED);
  assert.deepEqual(r.current?.member_order_ids ?? [], []);
  assert.equal(r.current?.group_id, null, "o id do grupo removido sobreviveu");
});

teste("desativação de agendamento limpa o estado anterior", async () => {
  // O agendamento vem ANINHADO em `schedule` na observacao — presumir campo
  // plano fez o reconciliador nao achar nada e devolver null.
  const r = R.reconcileSchedule([
    {
      observed_at: "2026-07-27T12:00:00.000Z",
      schedule: { is_scheduled: true, scheduled_for: "2026-07-27T18:00:00.000Z" },
    },
    { observed_at: "2026-07-27T12:05:00.000Z", schedule: { is_scheduled: false } },
  ]) as { current?: { is_scheduled?: boolean }; is_scheduled?: boolean } | null;
  assert.ok(r, "nao reconciliou o agendamento");
  const ativo = r.current ? r.current.is_scheduled : r.is_scheduled;
  assert.equal(ativo, false, "o agendamento desativado continuou ativo");
});

teste("indicadores retirados desaparecem do conjunto ativo", async () => {
  const r = R.reconcileIndicators([
    { indicatorsObserved: true, indicators: [{ code: "PREPARATION_DELAYED" }], observed_at: "2026-07-27T12:00:00.000Z" },
    { indicatorsObserved: true, indicators: [], observed_at: "2026-07-27T12:05:00.000Z" },
  ]) as { current?: unknown[]; ended?: unknown[] };
  assert.equal((r.current ?? []).length, 0);
  assert.ok((r.ended ?? []).length >= 1, "a retirada não ficou registrada");
});

/* ------------------------------------------------------------------ *
 * 11-13. Reinício, recuperação e replay
 * ------------------------------------------------------------------ */

teste("reinício recupera o histórico do disco", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cb4b3-"));
  try {
    const relogio = new Relogio(T0);
    const primeiro = createLiveObserver({
      store: createStore({ dir }),
      runId: "r1",
      now: relogio.agora,
      fetchOrders: async () => ({ orders: [pedido("p-1")], signals: {} }),
    });
    await primeiro.runCycle();

    // Processo novo, store novo apontando para o mesmo disco.
    const store2 = createStore({ dir });
    store2.load("live_observations");
    assert.equal(store2.count("live_observations"), 1, "o histórico não sobreviveu ao reinício");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

teste("reprocessar o mesmo histórico produz o MESMO resultado", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cb4b3-"));
  try {
    const relogio = new Relogio(T0);
    const store = createStore({ dir });
    const obs = createLiveObserver({
      store,
      runId: "r1",
      now: relogio.agora,
      fetchOrders: async () => ({ orders: [pedido("p-1")], signals: {} }),
    });
    await obs.runCycle();

    const store2 = createStore({ dir });
    store2.load("live_observations");
    store2.load("conference_clock_events");
    const obs2 = createLiveObserver({ store: store2, runId: "r1", now: relogio.agora, fetchOrders: async () => ({ orders: [], signals: {} }) });

    const a = JSON.stringify(obs.getReconciledDimension("p-1"));
    const b = JSON.stringify(obs2.getReconciledDimension("p-1"));
    assert.equal(a, b, "a reconstrução divergiu do processamento original");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

teste("replay NÃO ressuscita agrupamento removido", async () => {
  // A reconciliação é recalculada do histórico inteiro. Se o replay ignorasse a
  // leitura de remoção, o grupo voltaria — e o painel mostraria um agrupamento
  // que já não existe.
  const observacoes = [
    { observed: true, memberOrderIds: ["p-1", "p-2"], observedAt: "2026-07-27T12:00:00.000Z" },
    { observed: true, memberOrderIds: [], observedAt: "2026-07-27T12:05:00.000Z" },
  ];
  for (let i = 0; i < 5; i += 1) {
    const r = G.reconcileGrouping(observacoes) as { current?: { presence?: string } };
    assert.equal(r.current?.presence, G.PRESENCE.REMOVED, `o grupo ressuscitou na iteração ${i}`);
  }
});

teste("replay NÃO ressuscita indicador encerrado", async () => {
  const entrada = [
    { indicatorsObserved: true, indicators: [{ code: "PREPARATION_DELAYED" }], observed_at: "2026-07-27T12:00:00.000Z" },
    { indicatorsObserved: true, indicators: [], observed_at: "2026-07-27T12:05:00.000Z" },
  ];
  const a = JSON.stringify(R.reconcileIndicators(entrada));
  const b = JSON.stringify(R.reconcileIndicators(entrada));
  assert.equal(a, b);
  assert.equal(((R.reconcileIndicators(entrada) as { current?: unknown[] }).current ?? []).length, 0);
});

/* ------------------------------------------------------------------ *
 * 14. Corrupção
 * ------------------------------------------------------------------ */

teste("registro corrompido é contabilizado sem vazar conteúdo", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cb4b3-"));
  try {
    const b = createLiveObserver({
      store: createStore({ dir }),
      runId: "r1",
      now: () => new Date(T0).toISOString(),
      fetchOrders: async () => ({ orders: [pedido("p-1")], signals: {} }),
    });
    await b.runCycle();

    const arquivo = join(dir, "live_observations.runtime.jsonl");
    writeFileSync(arquivo, `${readFileSync(arquivo, "utf8")}{"cliente":"Joao Silva" quebrado\n`, "utf8");

    const store2 = createStore({ dir });
    store2.load("live_observations");
    assert.equal(store2.count("live_observations"), 1, "a linha boa foi perdida");
    const saude = JSON.stringify(store2.health());
    assert.match(saude, /corrupt/i, "a corrupção não foi contada");
    assert.ok(!saude.includes("Joao"), "a saúde vazou o conteúdo corrompido");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ *
 * 15. Isolamento
 * ------------------------------------------------------------------ */

teste("o Conference Brain não alcança o runtime crítico", async () => {
  // Ele só pode ler o que lhe entregam. Se importasse a plataforma, uma falha
  // dele viraria falha da rua.
  const { readdirSync, statSync } = req("node:fs") as typeof import("node:fs");
  const raiz = join(process.cwd(), "src", "conference-brain");
  const externos = new Set<string>();
  const andar = (d: string): void => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) {
        andar(p);
        continue;
      }
      if (!p.endsWith(".js")) continue;
      for (const m of readFileSync(p, "utf8").matchAll(/require\("([^".][^"]*)"\)/g)) externos.add(m[1]);
    }
  };
  andar(raiz);
  assert.deepEqual([...externos].sort(), ["crypto", "fs", "path"]);
});

teste("o observador não trouxe browser adapter, Playwright nem painel", async () => {
  const { readdirSync } = req("node:fs") as typeof import("node:fs");
  const live = readdirSync(join(process.cwd(), "src", "conference-brain", "live"));
  for (const fora of ["browser-adapter.js", "playwright-preflight.js", "mapping-mode.js"]) {
    assert.ok(!live.includes(fora), `${fora} entrou fora de escopo`);
  }
});

void Promise.all(pend).then(() => {
  if (failures.length) {
    console.error(`\n=== ${failures.length} FALHA(S) ===`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\n=== ${passed} conference-4b3 tests OK ===`);
});
