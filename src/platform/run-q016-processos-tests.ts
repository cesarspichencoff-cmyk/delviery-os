/**
 * Q-016 — O REPLAY NOS PROCESSOS REAIS, CONTRA POSTGRESQL REAL.
 * ============================================================================
 * `run-q016-replay-tests.ts` prova o contrato durável e a porta de leitura
 * dentro de um processo de teste. Isto aqui não importa o runtime: SOBE os
 * binários compilados (`node dist/…`) e lê o que eles escrevem, como o
 * `spine:processos` faz. Uma reconstrução que funciona no teste e falta no
 * `dist/` passaria por tudo antes e só quebraria no primeiro reinício real.
 *
 *   A. O BOOT — ordem, identidade, recusa e degradação
 *   B. OS EFEITOS — replay não reemite nada
 *   C. O RESTART — matar, subir outro do zero, e provar equivalência
 *
 * Cada caso tem banco ISOLADO. Exige `DELIVERYOS_PG_URL`; sem ela, PULA EM VOZ
 * ALTA (CLAUDE.md §10).
 */

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { EventEnvelope, SourceMode } from "./contracts/event-catalog";
import { alcanca, alcancaveis, especificadoresExternos } from "./grafo-de-imports";
import { ingerir } from "./ingest/ingest-service";
import { PgTransactionalWriter } from "./persistence/pg-repositories";
import { bancoIsolado as bancoIsoladoDe, type BancoIsolado } from "./q016-suporte";

const URL_PG = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const raiz = process.cwd();
const BIN_ASSINCRONO = join(raiz, "dist/src/platform/bin/async-runtime.js");

console.log("\n=== Q-016 — REPLAY NOS PROCESSOS REAIS (PostgreSQL real, binarios de dist/) ===\n");

if (!URL_PG) {
  console.log("PULADO: DELIVERYOS_PG_URL não definida — nenhum processo real foi exercitado.");
  process.exit(0);
}

let passaram = 0;
const falhas: string[] = [];

async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

const bancoIsolado = (ate?: string) => bancoIsoladoDe(URL_PG, ate);

/* ------------------------------------------------------------------ *
 * Processos
 * ------------------------------------------------------------------ */

interface Processo {
  filho: ChildProcess;
  saida(): string;
  fim(sinal?: NodeJS.Signals): Promise<number | null>;
  codigo(): Promise<number | null>;
}

function subir(url: string, extra: NodeJS.ProcessEnv = {}): Processo {
  const filho = spawn(process.execPath, [BIN_ASSINCRONO], {
    cwd: raiz,
    env: {
      ...process.env,
      DELIVERYOS_ENV: "local",
      DELIVERYOS_DATABASE_URL: url,
      DELIVERYOS_MIGRATE_ON_BOOT: "false",
      DELIVERYOS_TICK_MS: "200",
      ...extra,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let buffer = "";
  filho.stdout?.on("data", (d: Buffer) => (buffer += d.toString()));
  filho.stderr?.on("data", (d: Buffer) => (buffer += d.toString()));
  const saiu = new Promise<number | null>((r) => filho.once("exit", (c) => r(c)));
  return {
    filho,
    saida: () => buffer,
    codigo: () => saiu,
    fim: (sinal = "SIGTERM") => {
      if (filho.exitCode === null && filho.signalCode === null) {
        filho.kill(sinal);
        setTimeout(() => filho.kill("SIGKILL"), 5000).unref();
      }
      return saiu;
    },
  };
}

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function ate(p: Processo, padrao: RegExp, limiteMs = 20000): Promise<boolean> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (padrao.test(p.saida())) return true;
    if (p.filho.exitCode !== null) return padrao.test(p.saida());
    await esperar(100);
  }
  return false;
}

/** O JSON da ÚLTIMA linha que começa com o rótulo dado. */
function ultimaLinha<T = Record<string, unknown>>(p: Processo, rotulo: string): T | null {
  const linhas = p.saida().split("\n").filter((l) => l.startsWith(rotulo));
  if (!linhas.length) return null;
  const l = linhas[linhas.length - 1];
  return JSON.parse(l.slice(l.indexOf("{"))) as T;
}

interface Escopo {
  unit_id: string;
  source_mode: string;
  fatos: number;
  digest: string;
  viagens: number;
  frescor: Record<string, number>;
}
interface Replay {
  estado: string;
  lidas: number;
  aptos: number;
  sem_modo_unknown: number;
  corrompidas: number;
  corrompidas_citadas: { event_id: string; motivo: string }[];
  aplicados: number;
  duplicados: number;
  escopos: Escopo[];
}
interface Vivo {
  aplicados: number;
  duplicados: number;
  fatos_em_memoria: number;
  escopos: Escopo[];
}

const porEscopo = (xs: Escopo[]) =>
  Object.fromEntries(xs.map((e) => [`${e.unit_id}|${e.source_mode}`, { fatos: e.fatos, digest: e.digest }]));

/* ------------------------------------------------------------------ *
 * Fatos — sintéticos, declarados
 * ------------------------------------------------------------------ */

let seq = 0;
function fato(o: {
  modo: SourceMode;
  unidade: string;
  viagem: string;
  tipo?: EventEnvelope["event_type"];
  ocorreu: string;
  chave?: string;
  sequencia?: number;
}): EventEnvelope {
  seq += 1;
  const id = o.chave ?? `q016p-${process.pid}-${seq}`;
  const tipo = o.tipo ?? "trip_created";
  return {
    event_id: `ev-${id}`,
    event_type: tipo,
    event_version: `${tipo}@1.0.0`,
    unit_id: o.unidade,
    trip_id: o.viagem,
    device_id: tipo === "gps_batch_received" ? "dev-q016" : undefined,
    occurred_at: o.ocorreu,
    origin: tipo === "gps_batch_received" ? "device" : "system",
    source_mode: o.modo,
    sequence: o.sequencia,
    idempotency_key: `k-${id}`,
    payload: tipo === "gps_batch_received" ? { latitude: -23.58, longitude: -46.68, accuracy_m: 8 } : {},
  };
}

async function gravar(b: BancoIsolado, fatos: EventEnvelope[]): Promise<void> {
  const r = await ingerir(fatos, { escritor: new PgTransactionalWriter(b.cliente), recebido_em: new Date() });
  assert.equal(r.aceito, true, `ingestão recusou: ${JSON.stringify(r.recusados)}`);
}

async function estadoDasTabelas(b: BancoIsolado): Promise<string> {
  const r = await b.cliente.query(
    `SELECT (SELECT count(*) FROM platform.event_log) AS log,
            (SELECT count(*) FROM platform.outbox) AS outbox,
            (SELECT count(*) FROM platform.job) AS job,
            (SELECT count(*) FROM platform.inbox) AS inbox,
            (SELECT string_agg(outbox_id || ':' || state || ':' || attempts, ',' ORDER BY outbox_id)
               FROM platform.outbox) AS mensagens`,
  );
  return JSON.stringify(r[0]);
}

const agoraMenos = (s: number) => new Date(Date.now() - s * 1000).toISOString();

/* ================================================================== */

void (async () => {
  assert.ok(existsSync(BIN_ASSINCRONO), `${BIN_ASSINCRONO} não existe — rode npm run build:platform`);

  /* ================================================================ *
   * A. O BOOT
   * ================================================================ */
  console.log("A. O BOOT — ordem, identidade, recusa e degradacao");

  await teste("A0 o crítico NÃO alcança o replay; o assíncrono alcança; o replay só alcança o driver e hash puro", async () => {
    const critico = alcancaveis("src/platform/bin/critical.ts");
    const assincrono = alcancaveis("src/platform/bin/async-runtime.ts");
    for (const m of ["src/platform/runtime/replay-no-boot.ts", "src/platform/projections/replay-do-event-log.ts"]) {
      assert.equal(alcanca(critico, m), false, `o caminho crítico alcança ${m} — L1`);
      assert.equal(alcanca(assincrono, m), true, `controle: o assíncrono não alcança ${m}`);
    }
    // LISTA PERMITIDA, não lista de proibidos: dependência nova que apareça
    // no fecho do replay reprova até alguém decidir, com nome, que ela pode.
    //   pg          — o canal de leitura do log, travado em READ ONLY;
    //   node:crypto — o digest da memória: computação pura, sem efeito.
    const externos = [...especificadoresExternos(alcancaveis("src/platform/runtime/replay-no-boot.ts"))].sort();
    assert.deepEqual(externos, ["node:crypto", "pg"], `o fecho do replay mudou de dependências: ${externos.join(",")}`);
  });

  {
    const b = await bancoIsolado();
    const p0 = [
      fato({ modo: "real", unidade: "U-1", viagem: "t-1", ocorreu: agoraMenos(600) }),
      fato({ modo: "simulated", unidade: "U-1", viagem: "t-1", ocorreu: agoraMenos(600) }),
      fato({ modo: "control", unidade: "U-2", viagem: "t-9", ocorreu: agoraMenos(600) }),
      fato({ modo: "real", unidade: "U-2", viagem: "t-8", tipo: "trip_started", ocorreu: agoraMenos(590) }),
    ];
    let w: Processo | null = null;
    try {
      // Fatos no log e mensagens PENDENTES: nenhum worker rodou ainda. É o
      // estado de um processo que morreu antes de consumir a fila.
      await gravar(b, p0);
      w = subir(b.url);

      await teste("A1 o replay roda ANTES do laço: a linha dele vem antes de qualquer passada", async () => {
        assert.ok(await ate(w!, /\[assincrono\] passada/), `a fila não foi consumida:\n${w!.saida().slice(-800)}`);
        const s = w!.saida();
        const iReplay = s.indexOf("[assincrono] replay ");
        const iPassada = s.indexOf("[assincrono] passada");
        assert.ok(iReplay >= 0, `o boot não registrou o replay:\n${s.slice(-800)}`);
        assert.ok(iReplay < iPassada, "a fila foi consumida antes do replay");
        const r = ultimaLinha<Replay>(w!, "[assincrono] replay ")!;
        assert.equal(r.estado, "completo");
        assert.equal(r.aptos, p0.length);
        // Quatro pares unidade×modo por construção da fixture:
        // U-1|real, U-1|simulated, U-2|control, U-2|real.
        assert.deepEqual(
          r.escopos.map((e) => `${e.unit_id}|${e.source_mode}`).sort(),
          ["U-1|real", "U-1|simulated", "U-2|control", "U-2|real"],
        );
      });

      await teste("A2 as mensagens pendentes de fatos já relidos são DUPLICATAS, não fatos novos", async () => {
        // A prova de identidade entre as duas reconstruções: se o envelope
        // relido tivesse outra chave ou outro escopo, a mensagem seria
        // aplicada de novo e a memória teria o fato duas vezes.
        assert.ok(await ate(w!, /"duplicados":4/), `não chegou a 4 duplicatas:\n${w!.saida().slice(-800)}`);
        const v = ultimaLinha<Vivo>(w!, "[assincrono] operacao-viva")!;
        assert.equal(v.aplicados, 0, "mensagem de fato já relido foi aplicada como nova");
        assert.equal(v.duplicados, p0.length);
        assert.equal(v.fatos_em_memoria, p0.length);
        const r = ultimaLinha<Replay>(w!, "[assincrono] replay ")!;
        assert.deepEqual(porEscopo(v.escopos), porEscopo(r.escopos), "o consumo mudou a memória que o replay montou");
      });
    } finally {
      if (w) await w.fim();
      await b.descartar();
    }
  }

  await teste("A3 log ilegível RECUSA o boot (78) e não consome nem altera a fila", async () => {
    // Banco parado na 0002: o replay não consegue ler `source_mode`. Subir e
    // consumir mostraria projeção feita só do que chegar depois.
    const b = await bancoIsolado("0002_event_log_contexto_dispositivo");
    try {
      await b.cliente.query(
        `INSERT INTO platform.outbox (outbox_id, stream, kind, payload, idempotency_key)
         VALUES ('ob-a3','entregas','trip_created','{"event_id":"e","event_type":"trip_created","unit_id":"U","occurred_at":"2026-09-23T12:00:00Z","source_mode":"real"}'::jsonb,'k-a3')`,
      );
      const antes = await estadoDasTabelas(b);
      const w = subir(b.url);
      const codigo = await Promise.race([w.codigo(), esperar(20000).then(() => "demorou")]);
      if (codigo === "demorou") await w.fim("SIGKILL");
      assert.equal(codigo, 78, `esperava 78, veio ${String(codigo)}:\n${w.saida().slice(-600)}`);
      assert.match(w.saida(), /replay impossível, boot recusado/);
      assert.doesNotMatch(w.saida(), /\[assincrono\] passada/, "consumiu a fila antes de recusar");
      assert.equal(await estadoDasTabelas(b), antes, "a recusa alterou a fila ou o log");
    } finally {
      await b.descartar();
    }
  });

  await teste("A4 linha corrompida sobe DEGRADADO, declarado, e o consumo segue", async () => {
    const b = await bancoIsolado();
    let w: Processo | null = null;
    try {
      await b.cliente.query(`ALTER TABLE platform.event_log DROP CONSTRAINT event_log_source_mode_obrigatorio`);
      await b.cliente.query(
        `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type,
            payload, occurred_at, origin, idempotency_key, contract_version, source_mode)
         VALUES ('ev-podre','U-1','trip','t-1','trip_created','{}'::jsonb, now(),'system','k-podre','x@1','REAL')`,
      );
      await gravar(b, [fato({ modo: "real", unidade: "U-1", viagem: "t-1", ocorreu: agoraMenos(30) })]);
      const logAntes = (await b.cliente.query(`SELECT count(*) AS n FROM platform.event_log`))[0].n;
      w = subir(b.url);
      assert.ok(await ate(w, /replay DEGRADADO/), `não declarou degradação:\n${w.saida().slice(-600)}`);
      const r = ultimaLinha<Replay>(w, "[assincrono] replay DEGRADADO")!;
      assert.equal(r.estado, "degradado");
      assert.equal(r.corrompidas, 1);
      assert.match(r.corrompidas_citadas[0].motivo, /fora do contrato/);
      assert.equal(r.aptos, 1, "o fato válido não foi reconstruído");
      // Segue vivo e consumindo: a mensagem pendente do fato válido é duplicata.
      assert.ok(await ate(w, /"duplicados":1/), `o worker degradado não consumiu:\n${w.saida().slice(-600)}`);
      assert.equal(w.filho.exitCode, null, "o worker degradado morreu");
      assert.equal(
        (await b.cliente.query(`SELECT count(*) AS n FROM platform.event_log`))[0].n,
        logAntes,
        "o replay degradado mexeu nos fatos",
      );
    } finally {
      if (w) await w.fim();
      await b.descartar();
    }
  });

  await teste("A5 histórico sem modo NÃO é falha: estado completo, UNKNOWN contado, nada inventado", async () => {
    const b = await bancoIsolado("0002_event_log_contexto_dispositivo");
    let w: Processo | null = null;
    try {
      await b.cliente.query(
        `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type,
            payload, occurred_at, origin, idempotency_key, contract_version)
         VALUES ('ev-h1','U-H','trip','t-h','trip_created','{}'::jsonb,'2026-08-01T10:00:00Z','system','k-h1','trip_created@1.0.0'),
                ('ev-h2','U-H','trip','t-h','trip_started','{}'::jsonb,'2026-08-01T10:01:00Z','system','k-h2','trip_started@1.0.0')`,
      );
      await b.migrarTudo();
      w = subir(b.url);
      assert.ok(await ate(w, /\[assincrono\] replay \{/), `não registrou o replay:\n${w.saida().slice(-600)}`);
      const r = ultimaLinha<Replay>(w, "[assincrono] replay ")!;
      assert.equal(r.estado, "completo");
      assert.equal(r.sem_modo_unknown, 2);
      assert.equal(r.aptos, 0);
      assert.deepEqual(r.escopos, [], "histórico sem modo virou escopo — modo inventado");
    } finally {
      if (w) await w.fim();
      await b.descartar();
    }
  });

  /* ================================================================ *
   * B. OS EFEITOS
   * ================================================================ */
  console.log("\nB. OS EFEITOS — replay e reconstrucao de estado DERIVADO, nao reemissao");

  await teste("B1 o replay não grava log, não cria mensagem nem job, e não toca tentativa ou estado", async () => {
    const b = await bancoIsolado();
    let w: Processo | null = null;
    try {
      const fs = [
        fato({ modo: "real", unidade: "U-1", viagem: "t-1", ocorreu: agoraMenos(60) }),
        fato({ modo: "simulated", unidade: "U-1", viagem: "t-2", ocorreu: agoraMenos(60) }),
      ];
      await gravar(b, fs);
      // Fila já resolvida: uma mensagem `done` e outra `dead` com tentativas.
      // O replay não pode reviver a morta nem recontar a feita.
      await b.cliente.query(
        `UPDATE platform.outbox SET state = 'done', processed_at = now() WHERE idempotency_key = $1`,
        [fs[0].idempotency_key],
      );
      await b.cliente.query(
        `UPDATE platform.outbox SET state = 'dead', attempts = 5, last_error = 'x' WHERE idempotency_key = $1`,
        [fs[1].idempotency_key],
      );
      const antes = await estadoDasTabelas(b);
      w = subir(b.url);
      assert.ok(await ate(w, /\[assincrono\] replay \{/), `não registrou o replay:\n${w.saida().slice(-600)}`);
      await esperar(1500); // várias passadas vazias
      const r = ultimaLinha<Replay>(w, "[assincrono] replay ")!;
      assert.equal(r.aptos, 2, "o replay não reconstruiu os dois fatos");
      assert.equal(await estadoDasTabelas(b), antes, "o replay alterou log, fila, job ou inbox");
      assert.doesNotMatch(w.saida(), /\[assincrono\] operacao-viva/, "um handler rodou sem mensagem pendente");
    } finally {
      if (w) await w.fim();
      await b.descartar();
    }
  });

  /* ================================================================ *
   * C. O RESTART
   * ================================================================ */
  console.log("\nC. O RESTART — matar o assincrono, subir outro do zero");

  {
    const b = await bancoIsolado();
    let w1: Processo | null = null;
    let w2: Processo | null = null;
    let w3: Processo | null = null;
    try {
      // Sequência: três modos, duas unidades, duplicata, fora de ordem, e um
      // GPS a 115 s — fresco agora, envelhecido depois do desligamento.
      const criado = fato({ modo: "real", unidade: "U-1", viagem: "t-1", ocorreu: agoraMenos(300) });
      const iniciado = fato({ modo: "real", unidade: "U-1", viagem: "t-1", tipo: "trip_started", ocorreu: agoraMenos(200) });
      const gpsBorda = fato({ modo: "real", unidade: "U-1", viagem: "t-1", tipo: "gps_batch_received", ocorreu: agoraMenos(115), sequencia: 1 });
      const sim = fato({ modo: "simulated", unidade: "U-1", viagem: "t-1", ocorreu: agoraMenos(300) });
      const ctl = fato({ modo: "control", unidade: "U-2", viagem: "t-5", ocorreu: agoraMenos(300) });
      const outraUnidade = fato({ modo: "real", unidade: "U-2", viagem: "t-6", ocorreu: agoraMenos(250) });

      w1 = subir(b.url);
      assert.ok(await ate(w1, /\[assincrono\] replay \{/), `w1 não subiu:\n${w1.saida().slice(-600)}`);
      // FORA DE ORDEM: o início chega antes da criação.
      await gravar(b, [iniciado]);
      await gravar(b, [criado, gpsBorda, sim, ctl, outraUnidade]);
      // DUPLICATA: o mesmo fato de novo — a ingestão reconhece pela chave.
      await gravar(b, [criado]);
      const N = 6;

      await teste("C1 o primeiro processo consome tudo, sem duplicar", async () => {
        assert.ok(await ate(w1!, new RegExp(`"fatos_em_memoria":${N}`)), `w1 não chegou a ${N}:\n${w1!.saida().slice(-800)}`);
        const v = ultimaLinha<Vivo>(w1!, "[assincrono] operacao-viva")!;
        assert.equal(v.aplicados, N);
        assert.equal(v.duplicados, 0, "a duplicata chegou à fila — a ingestão devia tê-la barrado");
        assert.equal(v.escopos.length, 4, `escopos: ${JSON.stringify(v.escopos.map((e) => `${e.unit_id}|${e.source_mode}`))}`);
        const real = v.escopos.find((e) => e.unit_id === "U-1" && e.source_mode === "real")!;
        assert.equal(real.frescor.fresh, 1, `o GPS a 115 s não estava fresco no primeiro processo: ${JSON.stringify(real.frescor)}`);
      });
      const antesDoDesligamento = ultimaLinha<Vivo>(w1, "[assincrono] operacao-viva")!;
      assert.equal(await w1.fim(), 0, "w1 não encerrou graciosamente");
      w1 = null;

      // Deixa o GPS cruzar a janela de 120 s enquanto NINGUÉM está rodando.
      const idadeGps = () => (Date.now() - Date.parse(gpsBorda.occurred_at)) / 1000;
      while (idadeGps() < 126) await esperar(250);

      w2 = subir(b.url);
      assert.ok(await ate(w2, /\[assincrono\] replay \{/), `w2 não subiu:\n${w2.saida().slice(-600)}`);
      const reconstruido = ultimaLinha<Replay>(w2, "[assincrono] replay ")!;

      await teste("C2 do zero, ANTES de qualquer fato novo, a memória reconstruída é a mesma", async () => {
        assert.doesNotMatch(w2!.saida(), /\[assincrono\] passada/, "w2 consumiu algo antes da comparação");
        assert.equal(reconstruido.aptos, N);
        assert.deepEqual(
          porEscopo(reconstruido.escopos),
          porEscopo(antesDoDesligamento.escopos),
          "a memória reconstruída diverge da que existia antes do desligamento",
        );
      });

      await teste("C3 o sinal que envelheceu desligado chega ENVELHECIDO — frescor contra o relógio de agora", async () => {
        const real = reconstruido.escopos.find((e) => e.unit_id === "U-1" && e.source_mode === "real")!;
        assert.equal(real.frescor.fresh, 0, `o frescor ficou congelado no estado antigo: ${JSON.stringify(real.frescor)}`);
        assert.equal(real.frescor.aging, 1, `esperava 'aging' a ${idadeGps().toFixed(0)} s: ${JSON.stringify(real.frescor)}`);
      });

      await teste("C4 modos e unidades continuam separados depois do reinício", async () => {
        assert.deepEqual(
          reconstruido.escopos.map((e) => `${e.unit_id}|${e.source_mode}`).sort(),
          ["U-1|real", "U-1|simulated", "U-2|control", "U-2|real"],
        );
      });

      await teste("C5 depois do replay, fato novo segue o fluxo normal: aplicado uma vez, só no seu escopo", async () => {
        const novo = fato({ modo: "control", unidade: "U-2", viagem: "t-5", tipo: "trip_started", ocorreu: agoraMenos(5) });
        await gravar(b, [novo]);
        assert.ok(await ate(w2!, /"aplicados":1/), `w2 não aplicou o fato novo:\n${w2!.saida().slice(-800)}`);
        const v = ultimaLinha<Vivo>(w2!, "[assincrono] operacao-viva")!;
        assert.equal(v.duplicados, 0);
        assert.equal(v.fatos_em_memoria, N + 1);
        const antes = porEscopo(reconstruido.escopos);
        const depois = porEscopo(v.escopos);
        for (const k of Object.keys(antes)) {
          if (k === "U-2|control") assert.notDeepEqual(depois[k], antes[k], "o escopo do fato novo não mudou");
          else assert.deepEqual(depois[k], antes[k], `o fato novo vazou para ${k}`);
        }
      });
      const depoisDoNovo = ultimaLinha<Vivo>(w2, "[assincrono] operacao-viva")!;
      assert.equal(await w2.fim(), 0);
      w2 = null;

      await teste("C6 um terceiro boot reconstrói o que o segundo tinha — o replay é idempotente", async () => {
        w3 = subir(b.url);
        assert.ok(await ate(w3!, /\[assincrono\] replay \{/), `w3 não subiu:\n${w3!.saida().slice(-600)}`);
        const r = ultimaLinha<Replay>(w3!, "[assincrono] replay ")!;
        assert.equal(r.aptos, N + 1);
        assert.deepEqual(porEscopo(r.escopos), porEscopo(depoisDoNovo.escopos));
      });
    } finally {
      for (const w of [w1, w2, w3]) if (w) await w.fim();
      await b.descartar();
    }
  }

  const total = passaram + falhas.length;
  console.log(`\n${passaram}/${total} provas com processo real`);
  for (const f of falhas) console.log(`  XX ${f}`);
  if (falhas.length) {
    console.error("\nQ016_PROCESSOS_RED");
    process.exit(1);
  }
  console.log("\nQ016_PROCESSOS_GREEN");
})().catch((e: unknown) => {
  console.error("falha ao executar a suíte de processos Q-016:", e);
  process.exit(1);
});
