/**
 * C3.6 — A ESPINHA NOS PROCESSOS REAIS, CONTRA POSTGRESQL REAL.
 *
 * Tudo que veio antes rodou dentro de um processo de teste, com repositórios
 * em memória. Isso prova a lógica e não prova o BINÁRIO: `tsc` não copia `.js`,
 * `deploy/Dockerfile.platform` leva para a imagem só `dist/`, `node_modules/` e
 * `package.json`, e a espinha vem desligada — então uma montagem que funciona
 * aqui e falta no `dist/` passaria por todos os gates anteriores e só quebraria
 * no dia em que alguém ligasse a flag em produção.
 *
 * Por isso esta suíte não importa nada do runtime. Ela **sobe os binários
 * compilados** com `node dist/…`, contra um PostgreSQL de verdade, e lê o que
 * eles escrevem no stdout.
 *
 * Exige `DELIVERYOS_PG_URL`. Sem banco, PULA EM VOZ ALTA — banco ausente nunca
 * vira verde silencioso (CLAUDE.md §10).
 */

import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";

import { bancoIsolado } from "./banco-isolado";

const raiz = process.cwd();
/**
 * O SERVIDOR, não o banco. A suíte cria um banco próprio nele (ver
 * `banco-isolado.ts`): depois da Q-016 o worker reconstrói a projeção do
 * event log no boot, e um fato de outra suíte no log compartilhado virava um
 * escopo a mais — o P5 caía. Reproduzido: banco limpo 7/7, o mesmo banco com
 * um fato alheio 6/7.
 */
const URL_SERVIDOR = (process.env.DELIVERYOS_PG_URL ?? "").trim();
/** O banco ISOLADO desta execução. Atribuído antes de qualquer `sql()`. */
let URL_PG = "";

console.log("=== C3.6 — espinha nos processos reais (PostgreSQL real) ===\n");

if (!URL_SERVIDOR) {
  console.log("PULADO: DELIVERYOS_PG_URL não definida — nenhum processo real foi exercitado.");
  console.log("Para rodar:  DELIVERYOS_PG_URL=postgres://user@host:porta/base");
  process.exit(0);
}

const BIN_ASSINCRONO = join(raiz, "dist/src/platform/bin/async-runtime.js");
const BIN_CRITICO = join(raiz, "dist/src/platform/bin/critical.js");
const MODULOS_NO_DIST = join(raiz, "dist/src/conference-brain");

let passaram = 0;
const falhas: string[] = [];
/** Tentativas registradas numa passada com a espinha SÃ. Referência do P3. */
let attemptsSaudavel = "";
/** Linhas do event_log antes de qualquer processo subir. Referência do P6. */
let eventLogAntes = "";
/** Linhas de entregas.trip antes. MEDIDO, nunca presumido zero: outras suítes
 *  deixam linha, e um baseline inventado dá falso vermelho. */
let tripAntes = "";

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

function sql(comando: string): string {
  return execFileSync("psql", [URL_PG, "-At", "-c", comando], { encoding: "utf8" }).trim();
}

const ambienteBase = {
  ...process.env,
  DELIVERYOS_ENV: "local",
  DELIVERYOS_DATABASE_URL: URL_PG,
  DELIVERYOS_MIGRATE_ON_BOOT: "false",
  DELIVERYOS_TICK_MS: "200",
  DELIVERYOS_DEVICE_TOKEN_SECRET: "s".repeat(48),
};

interface Processo {
  filho: ChildProcess;
  saida(): string;
  fim(): Promise<void>;
}

/** Sobe um binário compilado e acumula a saída dele. */
function subir(bin: string, env: NodeJS.ProcessEnv): Processo {
  const filho = spawn(process.execPath, [bin], { cwd: raiz, env, stdio: ["ignore", "pipe", "pipe"] });
  let buffer = "";
  filho.stdout?.on("data", (d: Buffer) => (buffer += d.toString()));
  filho.stderr?.on("data", (d: Buffer) => (buffer += d.toString()));
  return {
    filho,
    saida: () => buffer,
    fim: () =>
      new Promise<void>((r) => {
        if (filho.exitCode !== null || filho.signalCode !== null) return r();
        filho.once("exit", () => r());
        filho.kill("SIGTERM");
        // Encerramento gracioso tem prazo; passado ele, SIGKILL. Um teste que
        // espera para sempre é um teste que trava a suíte inteira.
        setTimeout(() => filho.kill("SIGKILL"), 4000).unref();
      }),
  };
}

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Espera a saída casar, ou desiste com o que viu — nunca em silêncio. */
async function ate(p: Processo, padrao: RegExp, limiteMs = 15000): Promise<boolean> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (padrao.test(p.saida())) return true;
    if (p.filho.exitCode !== null) return padrao.test(p.saida());
    await esperar(150);
  }
  return false;
}

/**
 * Espera a MENSAGEM DESTE TESTE chegar ao estado pedido.
 *
 * A versão anterior lia `state` logo depois de casar `[assincrono] passada` no
 * stdout — e essa linha é impressa quando o tick move QUALQUER mensagem, não a
 * deste teste. `claim` pega `ORDER BY created_at, outbox_id LIMIT batch_size`,
 * e `batch_size` é 25: com 25 pendentes mais velhas de outra suíte no banco, o
 * primeiro lote não continha a mensagem daqui. O gate lia `pending` e reprovava
 * o PRODUTO por um fato do AMBIENTE — foi o que aconteceu em 2026-09-22 09:14,
 * e foi reproduzido de propósito plantando o backlog, com as duas falhas
 * voltando idênticas.
 *
 * Esperar não enfraquece a prova: o prazo continua finito, a falha continua
 * dizendo o estado observado, e agora também diz o tamanho da fila alheia —
 * que é o que explica a demora sem precisar adivinhar.
 */
async function ateEstado(id: string, esperado: string, limiteMs = 15000): Promise<void> {
  const fim = Date.now() + limiteMs;
  let visto = "";
  while (Date.now() < fim) {
    visto = sql(`SELECT state FROM platform.outbox WHERE outbox_id = '${id}'`);
    if (visto === esperado) return;
    await esperar(150);
  }
  const fila = sql(
    "SELECT count(*) FROM platform.outbox WHERE state = 'pending' AND correlation_id <> 'c3-6'",
  );
  assert.fail(
    `${id} ficou em '${visto || "<sem linha>"}' e nao chegou a '${esperado}' em ${limiteMs} ms` +
      ` — havia ${fila} mensagem(ns) pendente(s) de outras suites na frente`,
  );
}

function enfileirar(id: string, modo: string, unidade = "ITAIM"): void {
  const payload = JSON.stringify({
    event_id: `e-${id}`,
    event_type: "trip_created",
    unit_id: unidade,
    occurred_at: new Date().toISOString(),
    source_mode: modo,
    trip_id: `t-${id}`,
  }).replace(/'/g, "''");
  sql(
    `INSERT INTO platform.outbox (outbox_id, stream, kind, payload, idempotency_key, correlation_id)
     VALUES ('${id}', 'entregas', 'trip_created', '${payload}'::jsonb, 'k-${id}', 'c3-6')`,
  );
}

/** As sete provas. Rodam no banco isolado que o bloco abaixo cria e apaga. */
async function provas(): Promise<void> {
  /* ---------------------------------------------------------------- *
   * P0 — precondições
   * ---------------------------------------------------------------- */
  await teste("P0 os binários compilados existem e o dist carrega o Conference Brain", async () => {
    assert.ok(existsSync(BIN_ASSINCRONO), `${BIN_ASSINCRONO} não existe — rode npm run build:platform`);
    assert.ok(existsSync(BIN_CRITICO), `${BIN_CRITICO} não existe`);
    assert.ok(
      existsSync(MODULOS_NO_DIST),
      "dist/src/conference-brain ausente — a imagem subiria sem os módulos da espinha",
    );
  });

  sql("DELETE FROM platform.outbox WHERE correlation_id = 'c3-6'");
  eventLogAntes = sql("SELECT count(*) FROM platform.event_log");
  tripAntes = sql("SELECT count(*) FROM entregas.trip");

  /* ---------------------------------------------------------------- *
   * P1 — o worker real consome a outbox com a espinha LIGADA
   * ---------------------------------------------------------------- */
  await teste("P1 worker real com espinha LIGADA consome a outbox e roda a espinha", async () => {
    enfileirar("c36-a", "real");
    const w = subir(BIN_ASSINCRONO, { ...ambienteBase, DELIVERYOS_INTELLIGENCE_SPINE: "true" });
    try {
      assert.ok(
        await ate(w, /espinha de inteligência LIGADA/),
        `o worker não anunciou a espinha:\n${w.saida().slice(-500)}`,
      );
      assert.ok(
        await ate(w, /\[assincrono\] passada/),
        `a outbox não foi consumida:\n${w.saida().slice(-500)}`,
      );
      assert.ok(
        await ate(w, /\[assincrono\] espinha \{/),
        `a espinha não relatou passada:\n${w.saida().slice(-800)}`,
      );
      assert.doesNotMatch(
        w.saida(),
        /espinha falhou/,
        `a espinha falhou no processo real:\n${w.saida().slice(-800)}`,
      );
      await ateEstado("c36-a", "done");
      // Guardado para o P3 comparar: o que a espinha quebrada faz com a
      // mensagem precisa ser medido contra a passada SAUDÁVEL, não contra um
      // número que eu tenha achado que devia ser.
      attemptsSaudavel = sql("SELECT attempts FROM platform.outbox WHERE outbox_id = 'c36-a'");
    } finally {
      await w.fim();
    }
  });

  /* ---------------------------------------------------------------- *
   * P2 — desligada por padrão, no binário real
   * ---------------------------------------------------------------- */
  await teste("P2 sem a flag, o binário real NÃO roda a espinha e consome igual", async () => {
    enfileirar("c36-b", "real");
    const w = subir(BIN_ASSINCRONO, { ...ambienteBase });
    try {
      assert.ok(await ate(w, /\[assincrono\] passada/), "a outbox não foi consumida sem a espinha");
      await esperar(1200); // tempo de sobra para várias passadas
      // A linha de boot SEMPRE cita a espinha (`describe` publica a flag), e
      // é bom que cite. O que não pode aparecer é EXECUÇÃO. Medir a palavra
      // aqui daria falso vermelho — foi o que aconteceu na primeira versão.
      assert.match(w.saida(), /"espinha":false/, "o boot não declarou a espinha desligada");
      assert.doesNotMatch(w.saida(), /espinha de inteligência LIGADA/, "a espinha foi montada sem a flag");
      assert.doesNotMatch(w.saida(), /\[assincrono\] espinha \{/, "a espinha rodou sem a flag");
      assert.doesNotMatch(w.saida(), /espinha falhou/, "a espinha tentou rodar sem a flag");
      assert.equal(sql("SELECT state FROM platform.outbox WHERE outbox_id = 'c36-b'"), "done");
    } finally {
      await w.fim();
    }
  });

  /* ---------------------------------------------------------------- *
   * P3 — espinha QUEBRADA no processo real não impede o consumo
   * ---------------------------------------------------------------- */
  await teste("P3 espinha quebrada (módulos fora do dist) NÃO impede a outbox de ser consumida", async () => {
    // Esta é a reprodução direta da classe D3: a imagem sem o artefato que o
    // código precisa. Aqui ela é provocada de propósito, e o que se mede é
    // que a rua não sente.
    const escondido = `${MODULOS_NO_DIST}__escondido`;
    enfileirar("c36-c", "real");
    renameSync(MODULOS_NO_DIST, escondido);
    const w = subir(BIN_ASSINCRONO, { ...ambienteBase, DELIVERYOS_INTELLIGENCE_SPINE: "true" });
    try {
      assert.ok(
        await ate(w, /\[assincrono\] passada/),
        `a outbox parou de ser consumida com a espinha quebrada:\n${w.saida().slice(-600)}`,
      );
      assert.ok(
        await ate(w, /espinha falhou \(contida\)/),
        `a falha da espinha não ficou observável:\n${w.saida().slice(-600)}`,
      );
      // Se cair aqui em 'dead' ou 'pending', o fato foi reclassificado por causa
      // da espinha — que é exatamente o que o P3 proíbe.
      await ateEstado("c36-c", "done");
      // A referência vem do P1. Sem ela não há comparação possível, e comparar
      // contra string vazia esconderia que o P3 só caiu por cascata.
      assert.notEqual(
        attemptsSaudavel,
        "",
        "referencia do P1 ausente — o P3 nao tem contra o que comparar (cascata, nao defeito proprio)",
      );
      assert.equal(
        sql("SELECT attempts FROM platform.outbox WHERE outbox_id = 'c36-c'"),
        attemptsSaudavel,
        `a mensagem ganhou tentativa por erro da inteligência (saudável: ${attemptsSaudavel})`,
      );
    } finally {
      await w.fim();
      renameSync(escondido, MODULOS_NO_DIST);
    }
  });

  /* ---------------------------------------------------------------- *
   * P4 — o crítico sobe e o /ready não depende da espinha
   * ---------------------------------------------------------------- */
  await teste("P4 o crítico real sobe e /ready responde 200 com a espinha quebrada", async () => {
    const escondido = `${MODULOS_NO_DIST}__escondido`;
    renameSync(MODULOS_NO_DIST, escondido);
    const porta = 8123;
    // Modo declarado só aqui, no crítico — o assíncrono não lê a variável
    // (Q-017). `simulated`: este processo não recebe nada da rua.
    const c = subir(BIN_CRITICO, {
      ...ambienteBase,
      DELIVERYOS_PORT: String(porta),
      DELIVERYOS_SOURCE_MODE: "simulated",
    });
    try {
      assert.ok(await ate(c, /escutando|iniciando/i), `o crítico não subiu:\n${c.saida().slice(-600)}`);
      await esperar(700);
      const r = await fetch(`http://127.0.0.1:${porta}/ready`).catch((e: Error) => e);
      assert.ok(r instanceof Response, `/ready não respondeu: ${String(r)}`);
      assert.equal(r.status, 200, `/ready não é 200 com a espinha quebrada: ${r.status}`);
    } finally {
      await c.fim();
      renameSync(escondido, MODULOS_NO_DIST);
    }
  });

  /* ---------------------------------------------------------------- *
   * P5 — modos convivem no processo real sem se misturar
   * ---------------------------------------------------------------- */
  await teste("P5 real e simulated convivem no processo real sem cruzar modos", async () => {
    enfileirar("c36-d", "real");
    enfileirar("c36-e", "simulated");
    const w = subir(BIN_ASSINCRONO, { ...ambienteBase, DELIVERYOS_INTELLIGENCE_SPINE: "true" });
    try {
      assert.ok(await ate(w, /\[assincrono\] espinha \{/), "a espinha não relatou passada");
      // Espera uma passada que já tenha visto os dois escopos.
      const viuDois = await ate(w, /"escopos":2/, 8000);
      assert.ok(viuDois, `a espinha não enxergou os dois escopos:\n${w.saida().slice(-800)}`);
      assert.doesNotMatch(w.saida(), /espinha falhou/, "a espinha falhou com dois modos");
      for (const id of ["c36-d", "c36-e"]) {
        await ateEstado(id, "done");
      }
    } finally {
      await w.fim();
    }
  });

  /* ---------------------------------------------------------------- *
   * P6 — a espinha não cria tabela nem grava fato
   * ---------------------------------------------------------------- */
  await teste("P6 a espinha não criou tabela nem escreveu em entregas/event_log", async () => {
    const tabelas = sql(
      `SELECT count(*) FROM information_schema.tables
       WHERE table_schema NOT IN ('pg_catalog','information_schema')
         AND (table_name ILIKE '%spine%' OR table_name ILIKE '%espinha%'
              OR table_name ILIKE '%conclus%' OR table_name ILIKE '%recomend%')`,
    );
    assert.equal(tabelas, "0", "a espinha criou tabela — o C3 proíbe tabela nova");
    // `platform.event_log` não tem coluna `source_mode` — o modo viaja no
    // envelope. A propriedade que importa aqui é outra, e é a do limite L8:
    // projeção é derivada e NÃO grava fato. Então o que se mede é a contagem.
    assert.equal(
      sql("SELECT count(*) FROM platform.event_log"),
      eventLogAntes,
      "a espinha escreveu no event_log — projeção não grava fato",
    );
    assert.equal(
      sql("SELECT count(*) FROM entregas.trip"),
      tripAntes,
      "a espinha escreveu em entregas.trip — Copiloto não escreve em entregas.*",
    );
  });

}

void (async () => {
  const banco = await bancoIsolado(URL_SERVIDOR, undefined, "espinha");
  URL_PG = banco.url;
  ambienteBase.DELIVERYOS_DATABASE_URL = banco.url;
  try {
    await provas();
  } finally {
    // Com banco próprio, não há o que limpar na fila de ninguém: o banco inteiro
    // vai embora. A limpeza por `correlation_id` que existia aqui era o
    // remendo de quem dividia o banco com outras suítes.
    await banco.descartar();
  }

  console.log(`\n${passaram}/${passaram + falhas.length} provas com processo real`);
  for (const f of falhas) console.log(`  XX ${f}`);
  if (falhas.length) {
    console.error("\nSPINE_PROCESS_RED");
    process.exit(1);
  }
  console.log("\nSPINE_PROCESS_GREEN");
})();
