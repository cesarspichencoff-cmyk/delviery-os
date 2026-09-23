/**
 * Q-017 — NENHUM FATO É REAL POR ESQUECIMENTO.
 * ============================================================================
 * Decisão do César: na ausência de `DELIVERYOS_SOURCE_MODE`, o runtime
 * crítico RECUSA o boot. Não existe default implícito para `real`.
 *
 * O motivo é contratual. Desde a Q-016 o `source_mode` fica persistido em
 * `platform.event_log`, sobrevive ao reinício e governa a reconstrução da
 * Operação Viva. Um padrão implícito deixou de ser só um valor em memória e
 * passou a ser um carimbo durável com cara de atestação.
 *
 *   AUSENTE ≠ REAL · UNKNOWN ≠ REAL · DEFAULT ≠ ATESTAÇÃO
 *
 * `source_mode` descreve a NATUREZA da evidência (real | simulated | control),
 * não o mecanismo que a capturou. Esta suíte não toca em fonte nenhuma: ela
 * prova só que o rótulo `real` exige declaração.
 *
 * FASE 1 — O DEFEITO, PROVADO ANTES DE CORRIGIR
 * ---------------------------------------------
 * Tudo aqui sobe o BINÁRIO compilado (`dist/`), ingere um GPS pelo caminho
 * HTTP real — aparelho cadastrado, token assinado — e lê o PostgreSQL. Nada é
 * afirmado sobre o código-fonte por leitura.
 *
 * O que distingue os dois defeitos possíveis:
 *   - DEFEITO DE PROPAGAÇÃO: o modo declarado se perde no caminho;
 *   - DEFEITO DE DEFAULT: o modo AUSENTE vira um modo.
 * O controle positivo (`simulated` e `control` chegando intactos) é o que
 * permite dizer qual dos dois existe.
 *
 * Banco isolado por execução (`banco-isolado.ts`). Exige `DELIVERYOS_PG_URL`
 * — o SERVIDOR; sem ela, PULA EM VOZ ALTA (CLAUDE.md §10).
 */

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { bancoIsolado, type BancoIsolado } from "./banco-isolado";
import { emitirToken } from "./auth/device-token";

const URL_SERVIDOR = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const raiz = process.cwd();
const BIN_CRITICO = join(raiz, "dist/src/platform/bin/critical.js");
/** Fixture declarada. Nunca um segredo real. */
const SEGREDO = "fixture-q017-".padEnd(48, "x");

console.log("\n=== Q-017 — NENHUM FATO E REAL POR ESQUECIMENTO ===\n");

if (!URL_SERVIDOR) {
  console.log("PULADO: DELIVERYOS_PG_URL não definida — nenhum binário foi exercitado.");
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

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ *
 * O crítico real
 * ------------------------------------------------------------------ */

/** `undefined` = variável AUSENTE do ambiente — inclusive se o shell a tiver. */
type Modo = string | undefined;

interface Critico {
  filho: ChildProcess;
  porta: number;
  saida(): string;
  /** Resolve quando escuta, ou com o código de saída se morrer antes. */
  pronto(): Promise<"ouvindo" | number | null>;
  fim(): Promise<void>;
}

function subirCritico(b: BancoIsolado, modo: Modo): Critico {
  const porta = 8600 + Math.floor(Math.random() * 300);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DELIVERYOS_ENV: "local",
    DELIVERYOS_DATABASE_URL: b.url,
    DELIVERYOS_MIGRATE_ON_BOOT: "false",
    DELIVERYOS_DEVICE_TOKEN_SECRET: SEGREDO,
    DELIVERYOS_PORT: String(porta),
  };
  // Apagar ANTES de decidir: o shell de quem roda a suíte pode ter a variável,
  // e herdá-la faria o caso "ausente" medir outra coisa.
  delete env.DELIVERYOS_SOURCE_MODE;
  if (modo !== undefined) env.DELIVERYOS_SOURCE_MODE = modo;

  const filho = spawn(process.execPath, [BIN_CRITICO], { cwd: raiz, env, stdio: ["ignore", "pipe", "pipe"] });
  let buffer = "";
  filho.stdout?.on("data", (d: Buffer) => (buffer += d.toString()));
  filho.stderr?.on("data", (d: Buffer) => (buffer += d.toString()));
  const saiu = new Promise<number | null>((r) => filho.once("exit", (c) => r(c)));
  return {
    filho,
    porta,
    saida: () => buffer,
    async pronto() {
      const limite = Date.now() + 20000;
      while (Date.now() < limite) {
        if (/ouvindo em/.test(buffer)) return "ouvindo";
        if (filho.exitCode !== null) return filho.exitCode;
        await esperar(100);
      }
      return null;
    },
    async fim() {
      if (filho.exitCode === null && filho.signalCode === null) {
        filho.kill("SIGTERM");
        setTimeout(() => filho.kill("SIGKILL"), 5000).unref();
      }
      await saiu;
    },
  };
}

interface Aparelho {
  aparelho: string;
  viagem: string;
  token: string;
  sufixo: string;
}

async function cadastrarAparelho(b: BancoIsolado): Promise<Aparelho> {
  const sufixo = Math.random().toString(36).slice(2, 8);
  const unidade = `Q17${sufixo}`.toUpperCase();
  const aparelho = `dev-${sufixo}`;
  await b.cliente.query(`INSERT INTO identity.unit(unit_id, display_name) VALUES ($1, 'Q017')`, [unidade]);
  await b.cliente.query(
    `INSERT INTO identity.actor(actor_id, unit_id, role, label) VALUES ($1, $2, 'motoboy_interno', 'Q017')`,
    [`a-${sufixo}`, unidade],
  );
  await b.cliente.query(
    `INSERT INTO identity.device(device_id, unit_id, actor_id, label) VALUES ($1, $2, $3, 'Q017')`,
    [aparelho, unidade, `a-${sufixo}`],
  );
  const token = emitirToken({ device_id: aparelho, unit_id: unidade, issued_by: "gerente", agora: new Date(), segredo: SEGREDO }).token;
  return { aparelho, viagem: `t-${sufixo}`, token, sufixo };
}

/** Um GPS válido pelo caminho HTTP real. Devolve o status e a correlação. */
async function enviarGps(c: Critico, a: Aparelho, n = 1): Promise<{ status: number; correlacao: string }> {
  const correlacao = `q017-${a.sufixo}-${n}`;
  const ponto = {
    point_id: `p-${a.sufixo}-${n}`,
    idempotency_key: `gps:${a.aparelho}:${a.viagem}:${n}`,
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
  return { status: r.status, correlacao };
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

/* ================================================================== */

void (async () => {
  assert.ok(existsSync(BIN_CRITICO), `${BIN_CRITICO} não existe — rode npm run build:platform`);
  const b = await bancoIsolado(URL_SERVIDOR, undefined, "q017");
  try {
    console.log("1. O DEFEITO — o crítico de HOJE, com o binário compilado");

    await teste("F1 PROPAGAÇÃO: declarado simulated, control ou real, o modo chega intacto ao log e à outbox", async () => {
      for (const modo of ["simulated", "control", "real"]) {
        const c = subirCritico(b, modo);
        try {
          assert.equal(await c.pronto(), "ouvindo", `o crítico não subiu com ${modo}:\n${c.saida().slice(-400)}`);
          const a = await cadastrarAparelho(b);
          const r = await enviarGps(c, a);
          assert.equal(r.status, 200, `GPS recusado com ${modo}`);
          assert.deepEqual(await modoGravado(b, r.correlacao), { log: [modo], outbox: [modo] }, `${modo} não chegou intacto`);
        } finally {
          await c.fim();
        }
      }
    });

    await teste("F2 O DEFEITO: AUSENTE, o crítico sobe e o fato vira REAL durável", async () => {
      const c = subirCritico(b, undefined);
      try {
        assert.equal(await c.pronto(), "ouvindo", `esperava o defeito (subir), veio:\n${c.saida().slice(-400)}`);
        const a = await cadastrarAparelho(b);
        const r = await enviarGps(c, a);
        assert.equal(r.status, 200);
        assert.deepEqual(
          await modoGravado(b, r.correlacao),
          { log: ["real"], outbox: ["real"] },
          "a ausência não virou real — o defeito não é o descrito",
        );
      } finally {
        await c.fim();
      }
    });

    await teste("F3 a forma EXATA: vazio, espaços e maiúsculas JÁ saem 78 — só a ausência vira real", async () => {
      for (const modo of ["", "   ", "REAL"]) {
        const c = subirCritico(b, modo);
        try {
          assert.equal(await c.pronto(), 78, `${JSON.stringify(modo)} não saiu 78:\n${c.saida().slice(-300)}`);
        } finally {
          await c.fim();
        }
      }
    });

    await teste("F4 o boot NÃO declara o modo da instância — ninguém vê o que ela está autorizada a gravar", async () => {
      const c = subirCritico(b, "simulated");
      try {
        assert.equal(await c.pronto(), "ouvindo");
        const boot = c.saida().split("\n").filter((l) => l.startsWith("[critico]"));
        assert.ok(boot.length >= 2, `boot sem linhas legíveis:\n${c.saida().slice(-300)}`);
        assert.equal(
          boot.some((l) => /simulated/.test(l)),
          false,
          "o boot já declara o modo — a lacuna de observabilidade não existe",
        );
      } finally {
        await c.fim();
      }
    });
  } finally {
    await b.descartar();
  }

  const total = passaram + falhas.length;
  console.log(`\n${passaram}/${total} provas com binário real`);
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
