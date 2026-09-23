/**
 * Q-017 — NENHUM FATO É REAL POR ESQUECIMENTO.
 * ============================================================================
 * Decisão do César: na ausência de `DELIVERYOS_SOURCE_MODE`, o runtime
 * crítico RECUSA o boot. Não existe default implícito para `real`.
 *
 *   AUSENTE ≠ REAL · UNKNOWN ≠ REAL · DEFAULT ≠ ATESTAÇÃO
 *
 * Um fato só pode ganhar `source_mode = real` porque uma configuração
 * operacional DECLAROU que aquela instância produz fatos do mundo real.
 *
 * `source_mode` descreve a NATUREZA da evidência (real | simulated | control),
 * não o mecanismo que a capturou. Esta suíte não toca em fonte nenhuma: prova
 * só que o rótulo exige declaração, e que a declaração de hoje nunca reescreve
 * a de ontem.
 *
 * ANTES (commit 2364a2d, Fase 1, medido com o binário e PostgreSQL reais):
 * ausente, o crítico subia e gravava `real` no event log e na outbox; vazio,
 * espaços e `REAL` já saíam 78; o modo declarado chegava intacto (não havia
 * defeito de PROPAGAÇÃO, só de DEFAULT); o boot não dizia o modo.
 *
 * O QUE ESTA SUÍTE PROVA, e como:
 *
 *   U  o leitor do modo, como função pura — o contrato sem processo;
 *   A  ausente: exit 78, nenhuma ingestão, nenhum fato, e NENHUM efeito
 *      colateral — a recusa vem antes de conexão e de migration, provado
 *      com controle positivo que mostra o efeito quando o modo existe;
 *   B  vazio e só espaço: exit 78;
 *   C  inválido: exit 78, e um valor fora do lugar não vaza no log;
 *   O  o boot declara o modo, e não expõe senha de banco nem segredo;
 *   D/E/F  real, simulated e control: cada um persiste o seu modo, e o
 *      assíncrono, depois de reinício, reconstrói cada fato no seu modo;
 *   G  troca de modo entre processos: o fato antigo NUNCA é reclassificado —
 *      nem pelo crítico novo (reenvio vira duplicata), nem pelo replay, nem
 *      com a variável vazada de propósito para o assíncrono;
 *   H  histórico sem modo continua UNKNOWN: sem backfill, fora do replay, e
 *      um crítico `real` rodando ao lado não o transforma em real.
 *
 * Tudo sobe os BINÁRIOS compilados (`dist/`), ingere GPS pelo caminho HTTP
 * real — aparelho cadastrado, token assinado — e lê o PostgreSQL. Cada prova
 * usa banco ISOLADO, criado e apagado (`banco-isolado.ts`). Exige
 * `DELIVERYOS_PG_URL` — o SERVIDOR; sem ela, PULA EM VOZ ALTA (CLAUDE.md §10).
 */

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { bancoIsolado as bancoIsoladoDe, urlCom, type BancoIsolado } from "./banco-isolado";
import { emitirToken } from "./auth/device-token";
import { ConfigError } from "./config/platform-config";
import { lerModoDaInstancia, ModoDaInstanciaInvalido, VARIAVEL_DO_MODO } from "./config/modo-da-instancia";

const URL_SERVIDOR = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const raiz = process.cwd();
const BIN_CRITICO = join(raiz, "dist/src/platform/bin/critical.js");
const BIN_ASSINCRONO = join(raiz, "dist/src/platform/bin/async-runtime.js");
/** Fixture declarada. Nunca um segredo real. */
const SEGREDO = "fixture-q017-".padEnd(48, "x");
const MODOS = ["real", "simulated", "control"] as const;

console.log("\n=== Q-017 — NENHUM FATO E REAL POR ESQUECIMENTO ===\n");

let passaram = 0;
const falhas: string[] = [];

async function teste(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const bancoIsolado = (ate?: string) => bancoIsoladoDe(URL_SERVIDOR, ate, "q017");

/* ------------------------------------------------------------------ *
 * Processos reais
 * ------------------------------------------------------------------ */

/** `undefined` = variável AUSENTE do ambiente — inclusive se o shell a tiver. */
type Modo = string | undefined;

interface Processo {
  filho: ChildProcess;
  porta: number;
  saida(): string;
  fim(): Promise<number | null>;
}

function subirBinario(bin: string, url: string, modo: Modo, extra: NodeJS.ProcessEnv = {}): Processo {
  const porta = 8600 + Math.floor(Math.random() * 300);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DELIVERYOS_ENV: "local",
    DELIVERYOS_DATABASE_URL: url,
    DELIVERYOS_MIGRATE_ON_BOOT: "false",
    DELIVERYOS_DEVICE_TOKEN_SECRET: SEGREDO,
    DELIVERYOS_PORT: String(porta),
    DELIVERYOS_TICK_MS: "200",
    ...extra,
  };
  // Apagar ANTES de decidir: o shell de quem roda a suíte pode ter a variável,
  // e herdá-la faria o caso "ausente" medir outra coisa.
  delete env[VARIAVEL_DO_MODO];
  if (modo !== undefined) env[VARIAVEL_DO_MODO] = modo;

  const filho = spawn(process.execPath, [bin], { cwd: raiz, env, stdio: ["ignore", "pipe", "pipe"] });
  let buffer = "";
  filho.stdout?.on("data", (d: Buffer) => (buffer += d.toString()));
  filho.stderr?.on("data", (d: Buffer) => (buffer += d.toString()));
  const saiu = new Promise<number | null>((r) => filho.once("exit", (c) => r(c)));
  return {
    filho,
    porta,
    saida: () => buffer,
    fim() {
      if (filho.exitCode === null && filho.signalCode === null) {
        filho.kill("SIGTERM");
        setTimeout(() => filho.kill("SIGKILL"), 5000).unref();
      }
      return saiu;
    },
  };
}

const subirCritico = (b: BancoIsolado | string, modo: Modo, extra: NodeJS.ProcessEnv = {}) =>
  subirBinario(BIN_CRITICO, typeof b === "string" ? b : b.url, modo, extra);

/** O assíncrono. `modo` só existe para VAZAR a variável de propósito (G, H). */
const subirAssincrono = (b: BancoIsolado, modo: Modo = undefined) => subirBinario(BIN_ASSINCRONO, b.url, modo);

/** Resolve quando o padrão aparece, ou com o código de saída se o processo morrer antes. */
async function ate(p: Processo, padrao: RegExp, limiteMs = 20000): Promise<"visto" | number | null> {
  const limite = Date.now() + limiteMs;
  while (Date.now() < limite) {
    if (padrao.test(p.saida())) return "visto";
    if (p.filho.exitCode !== null) return padrao.test(p.saida()) ? "visto" : p.filho.exitCode;
    await esperar(100);
  }
  return null;
}

/**
 * Espera o processo MORRER SOZINHO — sem sinal nenhum. Mandar SIGTERM aqui
 * mediria o sinal, não a recusa. Passado o prazo, mata e devolve `null`.
 */
async function morte(p: Processo, limiteMs = 20000): Promise<number | null> {
  const r = await ate(p, /(?!)/, limiteMs);
  if (typeof r === "number") return r;
  await p.fim();
  return null;
}

/** O JSON da ÚLTIMA linha que começa com o rótulo dado. */
function ultimaLinha<T>(p: Processo, rotulo: string): T | null {
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
}
interface Replay {
  estado: string;
  lidas: number;
  aptos: number;
  sem_modo_unknown: number;
  corrompidas: number;
  escopos: Escopo[];
}

/** Escopos de UMA unidade, por modo: `{ simulated: 1, real: 1 }`. */
function fatosPorModo(r: Replay, unidade: string): Record<string, number> {
  return Object.fromEntries(
    r.escopos.filter((e) => e.unit_id === unidade).map((e) => [e.source_mode, e.fatos]),
  );
}

/* ------------------------------------------------------------------ *
 * Campo: aparelho, token e GPS pelo caminho HTTP real
 * ------------------------------------------------------------------ */

interface Aparelho {
  unidade: string;
  aparelho: string;
  viagem: string;
  token: string;
  sufixo: string;
}

async function cadastrarAparelho(b: BancoIsolado, unidade?: string): Promise<Aparelho> {
  const sufixo = Math.random().toString(36).slice(2, 8);
  const u = unidade ?? `Q17${sufixo}`.toUpperCase();
  const aparelho = `dev-${sufixo}`;
  await b.cliente.query(`INSERT INTO identity.unit(unit_id, display_name) VALUES ($1, 'Q017') ON CONFLICT DO NOTHING`, [u]);
  await b.cliente.query(
    `INSERT INTO identity.actor(actor_id, unit_id, role, label) VALUES ($1, $2, 'motoboy_interno', 'Q017')`,
    [`a-${sufixo}`, u],
  );
  await b.cliente.query(
    `INSERT INTO identity.device(device_id, unit_id, actor_id, label) VALUES ($1, $2, $3, 'Q017')`,
    [aparelho, u, `a-${sufixo}`],
  );
  const token = emitirToken({ device_id: aparelho, unit_id: u, issued_by: "gerente", agora: new Date(), segredo: SEGREDO }).token;
  return { unidade: u, aparelho, viagem: `t-${sufixo}`, token, sufixo };
}

interface Envio {
  status: number;
  classe: string;
  correlacao: string;
  chave: string;
}

/** Um GPS válido pelo caminho HTTP real. O MESMO `n` reenvia o MESMO ponto. */
async function enviarGps(c: Processo, a: Aparelho, n = 1): Promise<Envio> {
  const correlacao = `q017-${a.sufixo}-${n}`;
  const chave = `gps:${a.aparelho}:${a.viagem}:${n}`;
  const ponto = {
    point_id: `p-${a.sufixo}-${n}`,
    idempotency_key: chave,
    trip_id: a.viagem,
    device_id: a.aparelho,
    latitude: -23.55,
    longitude: -46.63,
    accuracy_m: 12,
    occurred_at: new Date().toISOString(),
    sequence_local: n,
    provider: "fused",
    is_mock: false,
  };
  const r = await fetch(`http://127.0.0.1:${c.porta}/api/gps/batch`, {
    method: "POST",
    headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: a.aparelho, correlation_id: correlacao, points: [ponto] }),
  });
  const corpo = (await r.json().catch(() => ({}))) as { classe?: string };
  return { status: r.status, classe: String(corpo.classe), correlacao, chave };
}

/** O modo que o BANCO guardou — a única resposta que importa. */
async function modoGravado(b: BancoIsolado, correlacao: string): Promise<{ log: string[]; outbox: string[] }> {
  const log = await b.cliente.query<{ m: string | null }>(
    `SELECT source_mode AS m FROM platform.event_log WHERE correlation_id = $1`,
    [correlacao],
  );
  const outbox = await b.cliente.query<{ m: string | null }>(
    `SELECT payload->>'source_mode' AS m FROM platform.outbox WHERE correlation_id = $1`,
    [correlacao],
  );
  return { log: log.map((x) => String(x.m)), outbox: outbox.map((x) => String(x.m)) };
}

/** Linhas do event log de uma unidade, por modo — NULL aparece como "NULL". */
async function logPorModo(b: BancoIsolado, unidade: string): Promise<Record<string, number>> {
  const r = await b.cliente.query<{ m: string; n: string }>(
    `SELECT coalesce(source_mode, 'NULL') AS m, count(*) AS n FROM platform.event_log
      WHERE unit_id = $1 GROUP BY 1 ORDER BY 1`,
    [unidade],
  );
  return Object.fromEntries(r.map((x) => [x.m, Number(x.n)]));
}

async function contar(b: BancoIsolado, sql: string): Promise<number> {
  const r = await b.cliente.query<{ n: string }>(sql);
  return Number(r[0]?.n ?? 0);
}

/** O que existe no banco fora do catálogo do sistema: relações e migrations registradas. */
async function pegada(b: BancoIsolado): Promise<{ relacoes: number; migrations: number }> {
  const relacoes = await contar(
    b,
    `SELECT count(*) AS n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
      WHERE s.nspname NOT IN ('pg_catalog', 'information_schema') AND s.nspname NOT LIKE 'pg_toast%'`,
  );
  const temTabela = await contar(b, `SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'platform' AND tablename = 'schema_migration'`);
  const migrations = temTabela
    ? await contar(b, `SELECT count(*) AS n FROM platform.schema_migration WHERE version NOT LIKE 'probe:%'`)
    : 0;
  return { relacoes, migrations };
}

/* ================================================================== */

void (async () => {
  /* ---------------------------------------------------------------- *
   * U — o leitor, como função pura
   * ---------------------------------------------------------------- */
  console.log("U. O LEITOR DO MODO — contrato sem processo");

  const motivo = (env: NodeJS.ProcessEnv): string => {
    try {
      return `ok:${lerModoDaInstancia(env)}`;
    } catch (e) {
      assert.ok(e instanceof ModoDaInstanciaInvalido, `lançou outra coisa: ${String(e)}`);
      assert.ok(e instanceof ConfigError, "a recusa não é ConfigError — o crítico não a trataria como configuração");
      assert.equal(e.variavel, VARIAVEL_DO_MODO);
      return e.motivo;
    }
  };

  await teste("U1 AUSENTE é recusado — o leitor não tem valor padrão", () => {
    assert.equal(motivo({}), "ausente");
    assert.equal(motivo({ DELIVERYOS_ENV: "production" }), "ausente", "o ambiente virou fonte de modo");
  });

  await teste("U2 vazio e só espaço são recusados como VAZIO, não como real", () => {
    for (const v of ["", " ", "   ", "\t", "\n", " \r\n "]) assert.equal(motivo({ [VARIAVEL_DO_MODO]: v }), "vazio", JSON.stringify(v));
  });

  await teste("U3 fora de real|simulated|control é INVÁLIDO — sem apelido, sem maiúscula, sem lista", () => {
    for (const v of ["REAL", "Real", "SIMULATED", "prod", "production", "true", "1", "yes", "unknown", "UNKNOWN", "null", "undefined", "default", "real,simulated", "real simulated", "reall", "rea", "simulado", "controle"]) {
      assert.equal(motivo({ [VARIAVEL_DO_MODO]: v }), "invalido", JSON.stringify(v));
    }
  });

  await teste("U4 os três declarados são aceitos como declarados; espaço em volta não muda o valor", () => {
    for (const m of MODOS) {
      assert.equal(motivo({ [VARIAVEL_DO_MODO]: m }), `ok:${m}`);
      assert.equal(motivo({ [VARIAVEL_DO_MODO]: ` ${m}\n` }), `ok:${m}`);
    }
  });

  await teste("U5 PROPRIEDADE: só a declaração de `real` produz real — nenhuma outra entrada", () => {
    const corpus: (string | undefined)[] = [undefined, "", " ", "REAL", "Real", "real,", "rea", "prod", "true", "unknown", "simulated", "control", " real ", "real"];
    for (const v of corpus) {
      const r = motivo(v === undefined ? {} : { [VARIAVEL_DO_MODO]: v });
      if (r === "ok:real") assert.equal(v?.trim(), "real", `${JSON.stringify(v)} virou real`);
    }
  });

  await teste("U6 o erro não ecoa valor que pode ser segredo fora do lugar", () => {
    for (const v of ["postgres://u:SENHA-Q017-NAO-VAZA@h:5432/d", SEGREDO, "x".repeat(60)]) {
      try {
        lerModoDaInstancia({ [VARIAVEL_DO_MODO]: v });
        assert.fail("aceitou");
      } catch (e) {
        assert.ok(e instanceof ModoDaInstanciaInvalido);
        assert.ok(!e.message.includes(v) && !e.message.includes("SENHA-Q017"), `ecoou o valor: ${e.message}`);
        assert.match(e.message, /caractere\(s\), não exibido/);
      }
    }
    // E o valor curto e legível CONTINUA ecoado: é o que diagnostica `REAL`.
    try {
      lerModoDaInstancia({ [VARIAVEL_DO_MODO]: "REAL" });
    } catch (e) {
      assert.match((e as Error).message, /"REAL"/);
    }
  });

  if (!URL_SERVIDOR) {
    console.log("\nPULADO: DELIVERYOS_PG_URL não definida — nenhum binário foi exercitado.");
    console.log(`\n${passaram}/${passaram + falhas.length} provas SEM processo`);
    process.exit(falhas.length ? 1 : 0);
  }
  assert.ok(existsSync(BIN_CRITICO), `${BIN_CRITICO} não existe — rode npm run build:platform`);
  assert.ok(existsSync(BIN_ASSINCRONO), `${BIN_ASSINCRONO} não existe — rode npm run build:platform`);

  /* ---------------------------------------------------------------- *
   * A, B, C — a recusa, com o binário real
   * ---------------------------------------------------------------- */
  console.log("\nA/B/C. SEM DECLARACAO VALIDA, O CRITICO NAO SOBE");

  const b = await bancoIsolado();
  try {
    await teste("A1 AUSENTE: exit 78, motivo no log, nunca escuta, nenhum fato", async () => {
      const antes = await contar(b, "SELECT count(*) AS n FROM platform.event_log");
      const c = subirCritico(b, undefined);
      const codigo = await morte(c);
      assert.equal(codigo, 78, `não saiu 78:\n${c.saida()}`);
      assert.match(c.saida(), /configuração recusada: DELIVERYOS_SOURCE_MODE ausente/, `motivo errado:\n${c.saida()}`);
      assert.doesNotMatch(c.saida(), /ouvindo em/, "chegou a escutar");
      assert.doesNotMatch(c.saida(), /\[critico\] iniciando/, "passou da configuração antes de recusar");
      // Nada escuta na porta: nenhuma ingestão é possível.
      const r = await fetch(`http://127.0.0.1:${c.porta}/ready`).then((x) => x.status).catch(() => "recusada");
      assert.equal(r, "recusada", "algo respondeu na porta do crítico recusado");
      assert.equal(await contar(b, "SELECT count(*) AS n FROM platform.event_log"), antes, "um fato apareceu");
    });

    await teste("A2 AUSENTE recusa ANTES de migration — banco vazio fica vazio; CONTROLE: declarado, migra", async () => {
      // Banco sem nenhuma migration aplicada, e MIGRATE_ON_BOOT=true. Se a
      // recusa viesse depois da conexão, o schema inteiro apareceria aqui.
      const vazio = await bancoIsolado("0000");
      try {
        const antes = await pegada(vazio);
        const recusado = subirCritico(vazio, undefined, { DELIVERYOS_MIGRATE_ON_BOOT: "true" });
        assert.equal(await morte(recusado), 78, `não saiu 78:\n${recusado.saida()}`);
        assert.deepEqual(await pegada(vazio), antes, "a recusa deixou pegada no banco");

        // CONTROLE POSITIVO: o mesmo boot, com modo, MEXE no banco. Sem isto,
        // "nada mudou" poderia ser só um boot que nunca migraria.
        const declarado = subirCritico(vazio, "simulated", { DELIVERYOS_MIGRATE_ON_BOOT: "true" });
        try {
          assert.equal(await ate(declarado, /ouvindo em/), "visto", `o controle não subiu:\n${declarado.saida().slice(-500)}`);
          const depois = await pegada(vazio);
          assert.ok(depois.migrations >= 3 && depois.relacoes > antes.relacoes, `o controle não migrou: ${JSON.stringify(depois)}`);
        } finally {
          await declarado.fim();
        }
      } finally {
        await vazio.descartar();
      }
    });

    await teste("A3 AUSENTE recusa ANTES de conectar — banco inalcançável dá 78 do modo; CONTROLE: declarado, falha na conexão", async () => {
      // MIGRATE_ON_BOOT=true nos dois: é o que obriga o boot a tocar o banco
      // (o pool é preguiçoso), e portanto o que torna a ORDEM observável.
      const inalcancavel = urlCom(URL_SERVIDOR.replace(/:\d+\//, ":1/"), "nenhum");
      const migra = { DELIVERYOS_MIGRATE_ON_BOOT: "true" };
      const recusado = subirCritico(inalcancavel, undefined, migra);
      assert.equal(await morte(recusado), 78, `não saiu 78:\n${recusado.saida()}`);
      assert.match(recusado.saida(), /DELIVERYOS_SOURCE_MODE ausente/);
      // CONTROLE: com o modo, o MESMO processo chega à conexão e morre nela.
      const declarado = subirCritico(inalcancavel, "simulated", migra);
      const codigo = await morte(declarado);
      assert.notEqual(codigo, 78, "o controle saiu 78 — então a recusa de A3 não prova ordem nenhuma");
      assert.match(declarado.saida(), /ECONNREFUSED|falha fatal no boot/, `o controle não tentou conectar:\n${declarado.saida()}`);
    });

    await teste("B1 VAZIO e SÓ ESPAÇO: exit 78, motivo vazio", async () => {
      for (const v of ["", "   ", "\t"]) {
        const c = subirCritico(b, v);
        assert.equal(await morte(c), 78, `${JSON.stringify(v)} não saiu 78:\n${c.saida()}`);
        assert.match(c.saida(), /DELIVERYOS_SOURCE_MODE vazio/, `motivo errado para ${JSON.stringify(v)}:\n${c.saida()}`);
        assert.doesNotMatch(c.saida(), /ouvindo em/);
      }
    });

    await teste("C1 INVÁLIDO: exit 78 para maiúscula, apelido, booleano e lista", async () => {
      for (const v of ["REAL", "prod", "true", "unknown", "real,simulated"]) {
        const c = subirCritico(b, v);
        assert.equal(await morte(c), 78, `${v} não saiu 78:\n${c.saida()}`);
        assert.match(c.saida(), /DELIVERYOS_SOURCE_MODE inválido/, `motivo errado para ${v}:\n${c.saida()}`);
        assert.doesNotMatch(c.saida(), /ouvindo em/);
      }
    });

    await teste("C2 INVÁLIDO com cara de credencial: exit 78 e o valor NÃO aparece no log", async () => {
      const marca = "SENHA-Q017-NAO-VAZA";
      const c = subirCritico(b, `postgres://u:${marca}@h:5432/d`);
      assert.equal(await morte(c), 78);
      assert.match(c.saida(), /DELIVERYOS_SOURCE_MODE inválido/);
      assert.ok(!c.saida().includes(marca), `o valor vazou:\n${c.saida()}`);
    });

    /* -------------------------------------------------------------- *
     * O — observabilidade
     * -------------------------------------------------------------- */
    console.log("\nO. O BOOT DIZ O MODO, E SO O MODO");

    await teste("O1 o boot DECLARA o modo da instância, para cada um dos três", async () => {
      for (const m of MODOS) {
        const c = subirCritico(b, m);
        try {
          assert.equal(await ate(c, /ouvindo em/), "visto", `não subiu com ${m}:\n${c.saida().slice(-400)}`);
          const inicio = ultimaLinha<{ source_mode?: string }>(c, "[critico] iniciando");
          assert.ok(inicio, "sem linha de início");
          assert.equal(inicio.source_mode, m, `o boot não declarou ${m}`);
        } finally {
          await c.fim();
        }
      }
    });

    await teste("O2 o log de um boot SAUDÁVEL não expõe senha do banco nem segredo de aparelho", async () => {
      const senha = "SENHA-BANCO-Q017-NAO-VAZA";
      const u = new URL(b.url);
      u.password = senha;
      const c = subirCritico(u.toString(), "simulated");
      try {
        assert.equal(await ate(c, /ouvindo em/), "visto", `não subiu:\n${c.saida().slice(-400)}`);
        const a = await cadastrarAparelho(b);
        assert.equal((await enviarGps(c, a)).status, 200, "o boot com senha na URL não ingere — o teste não mede um boot saudável");
      } finally {
        await c.fim();
      }
      assert.ok(!c.saida().includes(senha), `a senha do banco vazou:\n${c.saida()}`);
      assert.ok(!c.saida().includes(SEGREDO), `o segredo de aparelho vazou:\n${c.saida()}`);
    });

    /* -------------------------------------------------------------- *
     * D/E/F — cada modo declarado persiste, e sobrevive a reinício
     * -------------------------------------------------------------- */
    console.log("\nD/E/F. O MODO DECLARADO PERSISTE E SOBREVIVE A REINICIO");

    const unidades: Record<string, string> = {};
    await teste("D/E/F-1 real, simulated e control: cada fato é gravado com o SEU modo no log e na outbox", async () => {
      for (const m of MODOS) {
        const c = subirCritico(b, m);
        try {
          assert.equal(await ate(c, /ouvindo em/), "visto", `não subiu com ${m}:\n${c.saida().slice(-400)}`);
          const a = await cadastrarAparelho(b);
          unidades[m] = a.unidade;
          const r = await enviarGps(c, a);
          assert.equal(r.status, 200, `GPS recusado com ${m}`);
          assert.deepEqual(await modoGravado(b, r.correlacao), { log: [m], outbox: [m] }, `${m} não chegou intacto`);
        } finally {
          await c.fim();
        }
      }
    });

    await teste("D/E/F-2 reiniciado DUAS vezes, o assíncrono reconstrói cada fato no modo gravado — e só nele", async () => {
      assert.equal(Object.keys(unidades).length, 3, "D/E/F-1 não deixou os três fatos");
      let anterior: Escopo[] | null = null;
      for (const rodada of [1, 2]) {
        const w = subirAssincrono(b);
        try {
          assert.equal(await ate(w, /\[assincrono\] replay \{/), "visto", `rodada ${rodada} sem replay:\n${w.saida().slice(-600)}`);
          const r = ultimaLinha<Replay>(w, "[assincrono] replay ")!;
          assert.equal(r.estado, "completo");
          for (const m of MODOS) {
            assert.deepEqual(fatosPorModo(r, unidades[m]), { [m]: 1 }, `rodada ${rodada}: ${m} reconstruído fora do seu modo`);
          }
          const meus = r.escopos.filter((e) => Object.values(unidades).includes(e.unit_id));
          if (anterior) assert.deepEqual(meus, anterior, "o segundo reinício reconstruiu outra memória");
          anterior = meus;
        } finally {
          await w.fim();
        }
      }
    });
  } finally {
    await b.descartar();
  }

  /* ---------------------------------------------------------------- *
   * G — troca de modo entre processos
   * ---------------------------------------------------------------- */
  console.log("\nG. O MODO DO PROCESSO ATUAL NUNCA RECLASSIFICA O FATO ANTIGO");

  await teste("G1 fato A gravado simulated; o crítico seguinte é real: A continua simulated, B nasce real, reenvio de A é duplicata", async () => {
    const g = await bancoIsolado();
    try {
      const a = await cadastrarAparelho(g);
      const p1 = subirCritico(g, "simulated");
      let envioA: Envio;
      try {
        assert.equal(await ate(p1, /ouvindo em/), "visto", `p1 não subiu:\n${p1.saida().slice(-400)}`);
        envioA = await enviarGps(p1, a, 1);
        assert.equal(envioA.status, 200);
      } finally {
        await p1.fim();
      }

      const p2 = subirCritico(g, "real");
      try {
        assert.equal(await ate(p2, /ouvindo em/), "visto", `p2 não subiu:\n${p2.saida().slice(-400)}`);
        const envioB = await enviarGps(p2, a, 2);
        assert.equal(envioB.status, 200);
        // O MESMO ponto de A, agora num processo `real`.
        const reenvio = await enviarGps(p2, a, 1);
        assert.equal(reenvio.status, 200, "reenvio recusado — o aparelho reenviaria para sempre");
        assert.equal(reenvio.classe, "duplicado", `o reenvio de A não foi duplicata: ${reenvio.classe}`);
        assert.deepEqual(await modoGravado(g, envioB.correlacao), { log: ["real"], outbox: ["real"] }, "B não nasceu real");
      } finally {
        await p2.fim();
      }

      assert.deepEqual(await modoGravado(g, envioA.correlacao), { log: ["simulated"], outbox: ["simulated"] }, "A foi reclassificado");
      const porChave = await g.cliente.query<{ m: string }>(
        `SELECT source_mode AS m FROM platform.event_log WHERE idempotency_key = $1`,
        [envioA.chave],
      );
      assert.deepEqual(porChave.map((x) => x.m), ["simulated"], "A ganhou uma segunda linha com outro modo");
      assert.deepEqual(await logPorModo(g, a.unidade), { real: 1, simulated: 1 });

      // O replay, com a variável VAZADA de propósito para o assíncrono — e
      // com o valor que mais tentaria: `real`.
      for (const vazado of [undefined, "real", "control"]) {
        const w = subirAssincrono(g, vazado);
        try {
          assert.equal(await ate(w, /\[assincrono\] replay \{/), "visto", `sem replay (${String(vazado)}):\n${w.saida().slice(-600)}`);
          const r = ultimaLinha<Replay>(w, "[assincrono] replay ")!;
          assert.deepEqual(
            fatosPorModo(r, a.unidade),
            { real: 1, simulated: 1 },
            `com ${VARIAVEL_DO_MODO}=${String(vazado)} no assíncrono, o replay reclassificou`,
          );
        } finally {
          await w.fim();
        }
      }
    } finally {
      await g.descartar();
    }
  });

  /* ---------------------------------------------------------------- *
   * H — histórico sem modo
   * ---------------------------------------------------------------- */
  console.log("\nH. HISTORICO SEM MODO CONTINUA UNKNOWN");

  await teste("H1 linhas anteriores à 0003 ficam NULL e fora do replay, mesmo com um crítico real gravando na MESMA unidade", async () => {
    const h = await bancoIsolado("0002_event_log_contexto_dispositivo");
    try {
      const unidade = `Q17H${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
      await h.cliente.query(
        `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type,
            payload, occurred_at, origin, idempotency_key, contract_version)
         VALUES ('ev-q17h1', $1, 'trip', 't-h', 'trip_created', '{}'::jsonb, '2026-08-01T10:00:00Z', 'system', 'k-q17h1', 'trip_created@1.0.0'),
                ('ev-q17h2', $1, 'trip', 't-h', 'trip_started', '{}'::jsonb, '2026-08-01T10:01:00Z', 'system', 'k-q17h2', 'trip_started@1.0.0')`,
        [unidade],
      );
      await h.migrarTudo();
      assert.deepEqual(await logPorModo(h, unidade), { NULL: 2 }, "o histórico não nasceu sem modo");

      const a = await cadastrarAparelho(h, unidade);
      const c = subirCritico(h, "real");
      try {
        assert.equal(await ate(c, /ouvindo em/), "visto", `o crítico não subiu:\n${c.saida().slice(-400)}`);
        assert.equal((await enviarGps(c, a)).status, 200);
      } finally {
        await c.fim();
      }

      const w = subirAssincrono(h, "real");
      try {
        assert.equal(await ate(w, /\[assincrono\] replay \{/), "visto", `sem replay:\n${w.saida().slice(-600)}`);
        const r = ultimaLinha<Replay>(w, "[assincrono] replay ")!;
        assert.equal(r.estado, "completo");
        assert.equal(r.sem_modo_unknown, 2, "o histórico sem modo não foi contado como UNKNOWN");
        assert.deepEqual(fatosPorModo(r, unidade), { real: 1 }, "o histórico entrou num escopo — modo inventado");
      } finally {
        await w.fim();
      }
      assert.deepEqual(await logPorModo(h, unidade), { NULL: 2, real: 1 }, "houve backfill, ou o fato novo não é real");
    } finally {
      await h.descartar();
    }
  });

  const total = passaram + falhas.length;
  console.log(`\n${passaram}/${total} provas (U sem processo; A–H com binários e PostgreSQL reais)`);
  for (const f of falhas) console.log(`  XX ${f}`);
  if (falhas.length) {
    console.error("\nQ017_RED");
    process.exit(1);
  }
  console.log("\nQ017_GREEN");
})().catch((e: unknown) => {
  console.error("falha ao executar a suíte Q-017:", e);
  process.exit(1);
});
