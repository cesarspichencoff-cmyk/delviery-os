/**
 * Q-015 — retenção, durabilidade, backup e restore da Intelligence Spine.
 */

import assert from "node:assert/strict";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadPlatformConfig, ConfigError } from "./config/platform-config";
import {
  deRegistro,
  paraRegistro,
  recomendarDeConclusoes,
  retirar,
  type Conclusao,
  type RecomendacaoShadow,
} from "./copiloto/conference-bridge";
import { montarEspinhaDeInteligencia } from "./runtime/intelligence-spine";
import {
  aplicarRetencaoDaInteligencia,
  INTELLIGENCE_RETENTION,
  INTELLIGENCE_SPINE_INTERVAL_MS,
} from "./runtime/intelligence-retention";
import {
  criarSnapshot,
  restaurarSnapshot,
  verificarSnapshot,
} from "./runtime/intelligence-backup";

type Registro = Record<string, unknown>;

interface Store {
  put(entity: string, record: Registro): { ok: boolean; action: string; errors?: string[] };
  all(entity: string): Registro[];
  load(entity: string): number;
  rewrite(entity: string, records: Registro[]): { ok: boolean; action: string };
  count(entity: string): number;
  fileFor(entity: string): string;
}

const requireCJS = createRequire(join(process.cwd(), "package.json"));
const { createStore } = requireCJS(
  join(process.cwd(), "src", "conference-brain", "storage", "store"),
) as { createStore: (o: { dir: string; memoryOnly?: boolean }) => Store };

let passed = 0;
const failures: string[] = [];

async function teste(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const AGORA = new Date("2026-09-30T12:00:00.000Z");
const DIA = 24 * 60 * 60 * 1000;
function isoDiasAtras(dias: number): string {
  return new Date(AGORA.getTime() - dias * DIA).toISOString();
}

function ciclo(id: string, dias: number): Registro {
  const at = isoDiasAtras(dias);
  return {
    run_id: "run-q015",
    cycle_id: id,
    started_at: at,
    finished_at: at,
    collector_version: "q015-test",
    source_health: "available",
  };
}

function observacao(order: string, status: string, dias: number, cycle: string): Registro {
  return {
    run_id: "run-q015",
    cycle_id: cycle,
    external_id: order,
    observed_at: isoDiasAtras(dias),
    raw_status: status,
    source_health: "available",
    confidence: 0.9,
    status,
  };
}

function eventoRelogio(order: string, id: string, dias: number): Registro {
  return {
    event_id: id,
    order_id: order,
    event_type: "ready_observed",
    event_time: isoDiasAtras(dias),
    observed_at: isoDiasAtras(dias),
    origin: "ifood_screen",
    confidence: 0.9,
    collector_version: "q015-test",
  };
}

function conclusao(ref = "source_health:run-q015:stable"): Conclusao {
  return {
    conclusion_version: "conference-brain-conclusion@1.0.0",
    conclusion_kind: "source_health",
    conclusion_ref: ref,
    unit_id: "ITAIM",
    source_mode: "real",
    shadow: true,
    observed_at: AGORA.toISOString(),
    source_health: "stale",
    pode_afirmar: false,
    evidence: [{ tipo: "live_cycle_run", ref: "run-q015|stable" }],
    limitacoes: [],
    notas: [],
  };
}

function recomendacaoBase(): RecomendacaoShadow {
  const r = recomendarDeConclusoes([conclusao()], {
    agora: AGORA,
    unit_id: "ITAIM",
    source_mode: "real",
  }).recomendacoes[0];
  assert.ok(r, "fixture não gerou recomendação");
  return r;
}

function comDir<T>(prefixo: string, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefixo));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function comDirAsync<T>(
  prefixo: string,
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), prefixo));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
async function main(): Promise<void> {
await teste("Q015-1 política aprovada está codificada literalmente", () => {
  assert.equal(INTELLIGENCE_SPINE_INTERVAL_MS, 60_000);
  assert.equal(INTELLIGENCE_RETENTION.live_cycle_runs_ms, 7 * DIA);
  assert.equal(INTELLIGENCE_RETENTION.terminal_order_ms, 30 * DIA);
  assert.equal(INTELLIGENCE_RETENTION.terminal_recommendation_ms, 90 * DIA);
});

await teste("Q015-2 Spine ligada exige diretório e só é permitida em local", () => {
  assert.throws(
    () =>
      loadPlatformConfig({
        DELIVERYOS_ENV: "local",
        DELIVERYOS_DATABASE_URL: "postgres://localhost:5432/x",
        DELIVERYOS_INTELLIGENCE_SPINE: "true",
      } as NodeJS.ProcessEnv),
    (e: unknown) => e instanceof ConfigError && e.variavel === "DELIVERYOS_INTELLIGENCE_DIR",
  );

  assert.throws(
    () =>
      loadPlatformConfig({
        DELIVERYOS_ENV: "pilot",
        DELIVERYOS_COMMIT: "abcdef1234",
        DELIVERYOS_DATABASE_URL: "postgres://localhost:5432/x",
        DELIVERYOS_INTELLIGENCE_SPINE: "true",
        DELIVERYOS_INTELLIGENCE_DIR: "/var/lib/deliveryos/intelligence",
      } as NodeJS.ProcessEnv),
    (e: unknown) => e instanceof ConfigError && e.variavel === "DELIVERYOS_INTELLIGENCE_SPINE",
  );
});
await teste("Q015-3 rewrite compacta histórico por chave e recarrega do disco", () =>
  comDir("q015-rewrite-", (dir) => {
    const store = createStore({ dir });
    assert.equal(store.put("live_cycle_runs", ciclo("c1", 1)).ok, true);
    assert.equal(store.put("live_cycle_runs", { ...ciclo("c1", 1), notes: "segunda" }).ok, true);

    const antes = readFileSync(store.fileFor("live_cycle_runs"), "utf8").trim().split("\n");
    assert.equal(antes.length, 2, "fixture não produziu duas linhas append-only");

    const r = store.rewrite("live_cycle_runs", store.all("live_cycle_runs"));
    assert.equal(r.ok, true);
    const depois = readFileSync(store.fileFor("live_cycle_runs"), "utf8").trim().split("\n");
    assert.equal(depois.length, 1, "compactação não removeu versão antiga");

    const novo = createStore({ dir });
    novo.load("live_cycle_runs");
    assert.equal(novo.count("live_cycle_runs"), 1);
    assert.equal(novo.all("live_cycle_runs")[0]?.["notes"], "segunda");
  }),
);

await teste("Q015-4 ciclos guardam exatamente a janela de 7 dias", () =>
  comDir("q015-cycle-", (dir) => {
    const store = createStore({ dir });
    store.put("live_cycle_runs", ciclo("antigo", 8));
    store.put("live_cycle_runs", ciclo("limite", 7));
    store.put("live_cycle_runs", ciclo("recente", 1));

    const s = aplicarRetencaoDaInteligencia(store, AGORA);
    assert.deepEqual(s.live_cycle_runs, { antes: 3, depois: 2 });
    assert.deepEqual(
      store.all("live_cycle_runs").map((x) => x["cycle_id"]).sort(),
      ["limite", "recente"],
    );
  }),
);
await teste("Q015-5 pedido ativo nunca é apagado por idade; terminal usa 30 dias", () =>
  comDir("q015-order-", (dir) => {
    const store = createStore({ dir });

    for (const r of [
      observacao("ATIVO-ANTIGO", "preparing", 60, "a1"),
      observacao("TERMINAL-ANTIGO", "completed", 31, "t1"),
      observacao("TERMINAL-RECENTE", "cancelled", 29, "t2"),
    ]) {
      assert.equal(store.put("live_observations", r).ok, true);
    }

    for (const e of [
      eventoRelogio("ATIVO-ANTIGO", "e-a", 60),
      eventoRelogio("TERMINAL-ANTIGO", "e-t1", 31),
      eventoRelogio("TERMINAL-RECENTE", "e-t2", 29),
    ]) {
      assert.equal(store.put("conference_clock_events", e).ok, true);
    }

    aplicarRetencaoDaInteligencia(store, AGORA);

    assert.deepEqual(
      store.all("live_observations").map((x) => x["external_id"]).sort(),
      ["ATIVO-ANTIGO", "TERMINAL-RECENTE"],
    );
    assert.deepEqual(
      store.all("conference_clock_events").map((x) => x["order_id"]).sort(),
      ["ATIVO-ANTIGO", "TERMINAL-RECENTE"],
    );
  }),
);
await teste("Q015-6 recomendação proposta fica; terminal usa 90 dias; legado sem carimbo fica", () =>
  comDir("q015-rec-", (dir) => {
    const store = createStore({ dir });
    const base = recomendacaoBase();

    const proposta = { ...base, recommendation_id: "rec-proposta" };
    const velha = {
      ...base,
      recommendation_id: "rec-velha",
      status: "dismissed" as const,
      motivo_de_saida: "teste",
      terminal_at: isoDiasAtras(91),
    };
    const recente = {
      ...base,
      recommendation_id: "rec-recente",
      status: "invalidated" as const,
      motivo_de_saida: "teste",
      terminal_at: isoDiasAtras(89),
    };
    const legado = {
      ...base,
      recommendation_id: "rec-legado",
      status: "expired" as const,
      motivo_de_saida: "legado",
      terminal_at: undefined,
    };

    for (const r of [proposta, velha, recente, legado]) {
      assert.equal(store.put("copilot_recommendations", paraRegistro(r)).ok, true);
    }

    aplicarRetencaoDaInteligencia(store, AGORA);
    assert.deepEqual(
      store.all("copilot_recommendations").map((x) => x["recommendation_id"]).sort(),
      ["rec-legado", "rec-proposta", "rec-recente"],
    );
  }),
);
await teste("Q015-7 backup e restore reproduzem os mesmos bytes", () =>
  comDir("q015-backup-", (root) => {
    const source = join(root, "source");
    const backups = join(root, "backups");
    const restore = join(root, "restore");
    const scope = join(source, "real-ITAIM");
    const file = join(scope, "copilot_recommendations.runtime.jsonl");

    require("node:fs").mkdirSync(scope, { recursive: true });
    writeFileSync(file, "{\"recommendation_id\":\"x\"}\n", "utf8");

    const snapshot = criarSnapshot(source, backups, AGORA, 14);
    const manifest = verificarSnapshot(snapshot);
    assert.equal(manifest.files.length, 1);

    restaurarSnapshot(snapshot, restore);
    assert.equal(
      readFileSync(join(restore, "real-ITAIM", "copilot_recommendations.runtime.jsonl"), "utf8"),
      readFileSync(file, "utf8"),
    );
  }),
);

await teste("Q015-8 snapshot corrompido é recusado antes do restore", () =>
  comDir("q015-corrupt-", (root) => {
    const source = join(root, "source");
    const backups = join(root, "backups");
    const restore = join(root, "restore");
    require("node:fs").mkdirSync(source, { recursive: true });
    writeFileSync(join(source, "x.runtime.jsonl"), "linha-original\n", "utf8");

    const snapshot = criarSnapshot(source, backups, AGORA, 14);
    appendFileSync(join(snapshot, "x.runtime.jsonl"), "corrupcao\n", "utf8");

    assert.throws(() => restaurarSnapshot(snapshot, restore), /intelligence_backup_hash_mismatch/);
    assert.equal(existsSync(restore), false);
  }),
);
function modulosDeRestart() {
  return {
    adapter: {
      runIdDe: (u: string, m: string) => `q015:${u}:${m}`,
      criarFetchOrders: () => async () => ({
        orders: [],
        health: { state: "stale", reason: "q015" },
      }),
    },
    store: {
      createStore: (o: Record<string, unknown>) =>
        createStore(o as { dir: string; memoryOnly?: boolean }),
    },
    observer: {
      createLiveObserver: (o: Record<string, unknown>) => ({
        runCycle: async () => {
          const store = o.store as Store;
          const now = o.now as () => string;
          store.put("live_cycle_runs", {
            run_id: String(o.runId),
            cycle_id: "stable",
            started_at: now(),
            finished_at: now(),
            collector_version: "q015-test",
            source_health: "stale",
          });
        },
      }),
    },
    conclusoes: {
      extrairConclusoes: (o: Record<string, unknown>) => {
        const store = o.store as Store;
        const runId = String(o.run_id);
        const conclusoes = store
          .all("live_cycle_runs")
          .filter((x) => x["run_id"] === runId)
          .map((x) => ({
            ...conclusao(`source_health:${runId}:${String(x["cycle_id"])}`),
            unit_id: String(o.unit_id),
            source_mode: String(o.source_mode) as "real",
            evidence: [{ tipo: "live_cycle_run", ref: `${runId}|${String(x["cycle_id"])}` }],
          }));
        return { conclusoes, recusadas: [] };
      },
    },
  };
}

const ponteFake = {
  memoria: {
    escopos: () => [{ unit_id: "ITAIM", source_mode: "real" as const }],
  },
  projecao: () => ({}),
};

await teste("Q015-9 retirada sobrevive ao restart da Spine e não ressuscita", async () =>
  comDirAsync("q015-restart-", async (dir) => {
    const primeira = montarEspinhaDeInteligencia({
      ponte: ponteFake as never,
      agora: () => AGORA,
      store_dir: dir,
      modulos: modulosDeRestart(),
    });
    const s1 = await primeira.executar();
    assert.equal(s1.falhas, 0, JSON.stringify(s1.ultimo_erro));
    assert.equal(s1.recomendacoes_ativas, 1);

    const escopos = readdirSync(dir).filter((n) => !n.startsWith("."));
    assert.equal(escopos.length, 1, "a Spine não criou exatamente um diretório de escopo");

    const scopeDir = join(dir, escopos[0]!);
    const store = createStore({ dir: scopeDir });
    store.load("copilot_recommendations");
    const atual = store.all("copilot_recommendations")[0];
    assert.ok(atual, "recomendação não foi persistida");

    const retirada = retirar(
      deRegistro(atual),
      "operador_conferiu_q015",
      AGORA,
    );
    assert.equal(
      store.rewrite("copilot_recommendations", [paraRegistro(retirada)]).ok,
      true,
    );

    const depois = new Date(AGORA.getTime() + 60_000);
    const segunda = montarEspinhaDeInteligencia({
      ponte: ponteFake as never,
      agora: () => depois,
      store_dir: dir,
      modulos: modulosDeRestart(),
    });
    const s2 = await segunda.executar();

    assert.equal(s2.falhas, 0, JSON.stringify(s2.ultimo_erro));
    assert.equal(s2.recomendacoes_ativas, 0, "retirada ressuscitou após restart");
    const conferido = createStore({ dir: scopeDir });
    conferido.load("copilot_recommendations");
    const persistida = conferido.all("copilot_recommendations")[0];
    assert.equal(persistida?.["status"], "dismissed");
    assert.equal(persistida?.["motivo_de_saida"], "operador_conferiu_q015");
    assert.equal(persistida?.["terminal_at"], AGORA.toISOString());
  }),
);

await teste("Q015-10 backup restaurado preserva decisão terminal e impede ressurreição", () =>
  comDir("q015-terminal-restore-", (root) => {
    const source = join(root, "source");
    const backups = join(root, "backups");
    const restore = join(root, "restore");
    const scope = join(source, "real-ITAIM");
    const store = createStore({ dir: scope });

    const base = recomendacaoBase();
    const retirada = retirar(base, "decisao_humana_q015", AGORA);
    assert.equal(
      store.put("copilot_recommendations", paraRegistro(retirada)).ok,
      true,
    );

    const snapshot = criarSnapshot(source, backups, AGORA, 14);
    restaurarSnapshot(snapshot, restore);

    const restaurado = createStore({ dir: join(restore, "real-ITAIM") });
    restaurado.load("copilot_recommendations");
    const anterior = deRegistro(restaurado.all("copilot_recommendations")[0]!);

    const reavaliado = recomendarDeConclusoes([conclusao()], {
      agora: new Date(AGORA.getTime() + 60_000),
      unit_id: "ITAIM",
      source_mode: "real",
      anteriores: [anterior],
    });
    const mesmo = reavaliado.recomendacoes.find(
      (x) => x.recommendation_id === base.recommendation_id,
    );
    assert.equal(mesmo?.status, "dismissed");
    assert.equal(
      reavaliado.recomendacoes.some(
        (x) => x.recommendation_id === base.recommendation_id && x.status === "proposed",
      ),
      false,
    );
  }),
);

await teste("Q015-11 compose separa estado, backup e restore sem rede", () => {
  const compose = readFileSync("deploy/compose.platform.yaml", "utf8");
  const dockerfile = readFileSync("deploy/Dockerfile.platform", "utf8");

  assert.match(compose, /DELIVERYOS_INTELLIGENCE_SPINE:\s*\$\{DELIVERYOS_INTELLIGENCE_SPINE:-false\}/);
  assert.match(compose, /DELIVERYOS_INTELLIGENCE_DIR:\s*\/var\/lib\/deliveryos\/intelligence/);
  assert.match(compose, /intelligence-data:\/var\/lib\/deliveryos\/intelligence/);
  assert.match(compose, /deliveryos-intelligence-backup:/);
  assert.match(compose, /profiles:\s*\["intelligence"\]/);
  assert.match(compose, /deliveryos-intelligence-restore:/);
  assert.match(compose, /profiles:\s*\["maintenance"\]/);
  assert.match(compose, /network_mode:\s*"none"/);
  assert.match(compose, /deliveryos-platform-intelligence-data/);
  assert.match(compose, /deliveryos-platform-intelligence-backups/);
  assert.match(dockerfile, /chown -R node:node \/var\/lib\/deliveryos/);
});

await teste("Q015-12 recomendação retida fixa toda evidência que referencia", () =>
  comDir("q015-pin-", (dir) => {
    const store = createStore({ dir });
    store.put("live_cycle_runs", ciclo("c-fonte", 20));
    store.put("live_cycle_runs", ciclo("c-pedido", 40));
    store.put("live_observations", observacao("PED-PIN", "completed", 40, "c-pedido"));
    store.put("conference_clock_events", eventoRelogio("PED-PIN", "evt-pin", 40));

    const rec = {
      ...recomendacaoBase(),
      recommendation_id: "rec-pin",
      status: "dismissed" as const,
      motivo_de_saida: "decisao_auditavel",
      terminal_at: isoDiasAtras(10),
      evidencias: [
        { tipo: "live_cycle_run", ref: "run-q015|c-fonte" },
        { tipo: "live_observation", ref: "run-q015|c-pedido|PED-PIN" },
        { tipo: "conference_clock_event", ref: "evt-pin" },
      ],
    };
    assert.equal(store.put("copilot_recommendations", paraRegistro(rec)).ok, true);

    aplicarRetencaoDaInteligencia(store, AGORA);
    assert.deepEqual(
      store.all("live_cycle_runs").map((x) => x["cycle_id"]).sort(),
      ["c-fonte", "c-pedido"],
    );
    assert.equal(store.all("live_observations").length, 1);
    assert.equal(store.all("conference_clock_events").length, 1);
  }),
);

await teste("Q015-13 compactação recusa apagar quarentena", () =>
  comDir("q015-quarentena-", (dir) => {
    const escritor = createStore({ dir });
    escritor.put("live_cycle_runs", ciclo("valido", 1));
    const file = escritor.fileFor("live_cycle_runs");
    appendFileSync(file, "{linha-corrompida\n", "utf8");

    const leitor = createStore({ dir });
    leitor.load("live_cycle_runs");
    const antes = readFileSync(file, "utf8");
    const r = leitor.rewrite("live_cycle_runs", leitor.all("live_cycle_runs"));
    assert.equal(r.ok, false);
    assert.equal(r.action, "quarantine_present");
    assert.equal(readFileSync(file, "utf8"), antes, "quarentena foi apagada pela compactação");
  }),
);

console.log(`\nQ-015: ${passed} passaram, ${failures.length} falharam`);
for (const f of failures) console.log(`  ✗ ${f}`);
if (failures.length) process.exit(1);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
