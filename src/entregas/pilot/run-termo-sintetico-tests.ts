/**
 * Termo SINTÉTICO de laboratório — só no laboratório, nunca em produção.
 *
 * Autorização do César (2026-09-26): uma fixture do termo, marcada
 * "SEM VALOR LEGAL — APENAS TESTE SIMULADO", pode tornar o termo publicável
 * SOMENTE na bancada do emulador. Não usa dado legal inventado, não vira
 * default de pilot/release, não entra em produção, não preenche o checklist
 * legal. O aceite continua sendo feito pela interface do motoboy — nada aqui
 * grava aceite.
 *
 * Contra o servidor REAL compilado (`dist/tools/entregas_pilot_server.js`),
 * cada caso num diretório temporário próprio.
 */

import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isPublishable, TERM_ITAIM_V1 } from "../consent/term";

const RAIZ = process.cwd();
const SERVIDOR = join(RAIZ, "dist", "tools", "entregas_pilot_server.js");
const FIXTURE = "tools/bancada_termo_sintetico.json";
const MARCA = "SEM VALOR LEGAL — APENAS TESTE SIMULADO";

let passou = 0;
const falhas: string[] = [];
async function teste(nome: string, corpo: () => Promise<void> | void): Promise<void> {
  try {
    await corpo();
    passou += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

function portaLivre(): Promise<number> {
  return new Promise((ok, erro) => {
    const s = createServer();
    s.once("error", erro);
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });
}

interface Execucao {
  processo: ChildProcess;
  saida: () => string;
  saiu: Promise<number | null>;
  porta: number;
  dir: string;
}

/** Sobe o piloto compilado com o termo e o ambiente pedidos. */
async function subir(opcoes: { termo: string | null; env: Record<string, string>; servidor?: string }): Promise<Execucao> {
  const dir = mkdtempSync(join(tmpdir(), "termo-sintetico-"));
  const porta = await portaLivre();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ENTREGAS_PILOT_CONFIG: join(RAIZ, "config", "entregas-pilot.example.json"),
    ENTREGAS_UI_PORT: String(porta),
    ENTREGAS_DATA_DIR: join(dir, "dados"),
    ENTREGAS_TERM_CONFIG: opcoes.termo ?? join(dir, "sem-termo.json"),
    ENTREGAS_UNIT_CONFIG: join(dir, "sem-unidade.json"),
    ENTREGAS_GPS_FLAGS_CONFIG: join(dir, "sem-flags.json"),
    ENTREGAS_HTTPS: "",
    ...opcoes.env,
  };
  for (const k of ["ENTREGAS_LABORATORIO", "ENTREGAS_ENV", "ENTREGAS_BIND", "ENTREGAS_USERS", "ENTREGAS_ALLOWED_ORIGINS"]) {
    if (!(k in opcoes.env)) delete env[k];
  }
  const processo = spawn(process.execPath, [opcoes.servidor ?? SERVIDOR], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
  let texto = "";
  processo.stdout?.on("data", (d) => (texto += String(d)));
  processo.stderr?.on("data", (d) => (texto += String(d)));
  const saiu = new Promise<number | null>((ok) => processo.once("exit", (c) => ok(c)));
  return { processo, saida: () => texto, saiu, porta, dir };
}

async function health(porta: number, ms = 20_000): Promise<Record<string, unknown> | null> {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/api/health`);
      if (r.ok) return (await r.json()) as Record<string, unknown>;
    } catch {
      /* subindo */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

async function derrubar(e: Execucao): Promise<void> {
  if (e.processo.exitCode === null) {
    e.processo.kill("SIGKILL");
    await e.saiu;
  }
  rmSync(e.dir, { recursive: true, force: true });
}

async function main(): Promise<void> {
  console.log("\n=== Termo sintético: só no laboratório ===\n");
  assert.ok(existsSync(SERVIDOR), "servidor compilado ausente — rode npx tsc");
  const bruto = readFileSync(join(RAIZ, FIXTURE), "utf8");
  const fixture = JSON.parse(bruto) as typeof TERM_ITAIM_V1 & Record<string, unknown>;
  const termoCompleto = { ...TERM_ITAIM_V1, ...fixture };

  await teste("T1 a fixture carrega a marca em título, corpo, vigência e em todo campo legal", () => {
    for (const [campo, valor] of [
      ["title", fixture.title],
      ["body", fixture.body],
      ["effective_date", fixture.effective_date],
      ["controller.legal_name", fixture.controller.legal_name],
      ["controller.cnpj", fixture.controller.cnpj],
      ["controller.contact_channel", fixture.controller.contact_channel],
      ["controller.contact_owner", fixture.controller.contact_owner],
    ] as const) {
      assert.ok(String(valor).includes(MARCA), `${campo} sem a marca`);
    }
  });

  await teste("T2 nenhum dado legal inventado: sem CNPJ, sem e-mail, sem telefone, sem data civil", () => {
    assert.equal(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/.test(bruto), false, "algo com forma de CNPJ");
    assert.equal(/[\w.+-]+@[\w-]+\.[\w.]+/.test(bruto), false, "algo com forma de e-mail");
    assert.equal(/\(?\d{2}\)?\s?\d{4,5}-?\d{4}/.test(bruto), false, "algo com forma de telefone");
    assert.equal(/\d{4}-\d{2}-\d{2}/.test(JSON.stringify({ ...fixture, _aviso: "" })), false, "data civil na fixture");
  });

  await teste("T3 ela torna o termo publicável — é para isso que ela existe, e só isso", () => {
    assert.equal(isPublishable(termoCompleto), true);
  });

  await teste("T4 não é o padrão de ninguém: fora de config/, e o caminho padrão do termo é ignorado pelo Git", () => {
    assert.equal(FIXTURE.startsWith("config/"), false);
    execFileSync("git", ["check-ignore", "-q", "config/entregas-term.json"], { cwd: RAIZ });
    assert.throws(() => execFileSync("git", ["check-ignore", "-q", FIXTURE], { cwd: RAIZ }), "a fixture estaria ignorada");
  });

  await teste("T5 sem laboratório declarado, o piloto NÃO sobe com a fixture", async () => {
    const e = await subir({ termo: join(RAIZ, FIXTURE), env: {} });
    try {
      const codigo = await Promise.race([e.saiu, new Promise((r) => setTimeout(() => r("vivo"), 15_000))]);
      assert.equal(codigo, 1, `o piloto ficou de pé (${String(codigo)})`);
      assert.match(e.saida(), /SINTÉTICO/);
      assert.match(e.saida(), /ENTREGAS_LABORATORIO=1/);
    } finally {
      await derrubar(e);
    }
  });

  await teste("T6 laboratório declarado MAS remoto: o piloto NÃO sobe com a fixture", async () => {
    const e = await subir({
      termo: join(RAIZ, FIXTURE),
      env: {
        ENTREGAS_LABORATORIO: "1",
        ENTREGAS_ENV: "cloud",
        ENTREGAS_USERS: "rid-remoto:motoboy_interno:Motoboy:tokremotosinteticoabcdefghijklmnopqrstuvwxyz0123",
        ENTREGAS_ALLOWED_ORIGINS: "https://laboratorio.invalid",
      },
    });
    try {
      const codigo = await Promise.race([e.saiu, new Promise((r) => setTimeout(() => r("vivo"), 15_000))]);
      assert.equal(codigo, 1, `o piloto ficou de pé (${String(codigo)})`);
      // Recusou pelo termo, não por configuração de nuvem incompleta.
      assert.match(e.saida(), /SINTÉTICO/, e.saida().slice(-300));
      assert.doesNotMatch(e.saida(), /configuração de ambiente inválida/);
    } finally {
      await derrubar(e);
    }
  });

  await teste("T7 laboratório declarado e local: sobe, publica, e DECLARA que o termo é sintético", async () => {
    const e = await subir({ termo: join(RAIZ, FIXTURE), env: { ENTREGAS_LABORATORIO: "1" } });
    try {
      const h = await health(e.porta);
      assert.ok(h, `não subiu: ${e.saida().slice(-300)}`);
      assert.equal(h!.term_publishable, true);
      assert.equal(h!.term_synthetic, true);
      const r = await fetch(`http://127.0.0.1:${e.porta}/api/term`, {
        headers: { Authorization: "Bearer CHANGE_ME_RIDER_TOKEN" },
      });
      const corpo = (await r.json()) as { term?: { title?: string; body?: string } };
      assert.ok(corpo.term?.title?.includes(MARCA), "a tela do termo não mostraria a marca");
      assert.ok(corpo.term?.body?.includes(MARCA));
      assert.equal(existsSync(join(e.dir, "dados", "term-acks.jsonl")), false, "subir gravou aceite");
    } finally {
      await derrubar(e);
    }
  });

  await teste("T8 a flag de laboratório sozinha não publica nada: sem a fixture, o modelo segue não publicável", async () => {
    const e = await subir({ termo: null, env: { ENTREGAS_LABORATORIO: "1" } });
    try {
      const h = await health(e.porta);
      assert.ok(h, `não subiu: ${e.saida().slice(-300)}`);
      assert.equal(h!.term_publishable, false);
      assert.equal(h!.term_synthetic, false);
    } finally {
      await derrubar(e);
    }
  });

  /*
   * Os testes de recusa enxergam a trava? Um servidor MUTANTE — o compilado,
   * com a condição da trava trocada — é escrito ao lado do original (os
   * require relativos precisam dele em dist/tools/) e apagado no fim. Se o
   * mutante subisse com a fixture e mesmo assim T5/T6 passassem, eles seriam
   * opinião. Aqui se exige que o mutante SUBA: a recusa vinha da trava.
   */
  const COMPILADO = readFileSync(SERVIDOR, "utf8");
  const CONDICAO = 'if (termoSintetico && (process.env.ENTREGAS_LABORATORIO !== "1" || cloud.remote)) {';
  const mutante = (nome: string, troca: string, corpo: (arquivo: string) => Promise<void>) =>
    teste(nome, async () => {
      assert.equal(COMPILADO.split(CONDICAO).length - 1, 1, "MUTACAO NAO APLICADA: condição da trava ausente ou repetida no compilado");
      const arquivo = join(RAIZ, "dist", "tools", `.mutante-termo-sintetico-${process.pid}.js`);
      writeFileSync(arquivo, COMPILADO.replace(CONDICAO, troca));
      try {
        await corpo(arquivo);
      } finally {
        rmSync(arquivo, { force: true });
      }
    });

  await mutante("T9 controle: SEM a trava, o piloto subiria com a fixture e sem laboratório — T5 pega isso", "if (false) {", async (arquivo) => {
    const e = await subir({ termo: join(RAIZ, FIXTURE), env: {}, servidor: arquivo });
    try {
      const h = await health(e.porta);
      assert.ok(h, `o mutante não subiu: ${e.saida().slice(-300)}`);
      assert.equal(h!.term_synthetic, true);
      assert.equal(h!.term_publishable, true, "sem a trava o termo sem valor legal seria servido como publicável");
    } finally {
      await derrubar(e);
    }
  });

  await mutante(
    "T10 controle: sem a condição de REMOTO, o piloto subiria em nuvem com a fixture — T6 pega isso",
    'if (termoSintetico && process.env.ENTREGAS_LABORATORIO !== "1") {',
    async (arquivo) => {
      const e = await subir({
        termo: join(RAIZ, FIXTURE),
        env: {
          ENTREGAS_LABORATORIO: "1",
          ENTREGAS_ENV: "cloud",
          ENTREGAS_USERS: "rid-remoto:motoboy_interno:Motoboy:tokremotosinteticoabcdefghijklmnopqrstuvwxyz0123",
          ENTREGAS_ALLOWED_ORIGINS: "https://laboratorio.invalid",
        },
        servidor: arquivo,
      });
      try {
        const h = await health(e.porta);
        assert.ok(h, `o mutante não subiu: ${e.saida().slice(-300)}`);
        assert.equal(h!.term_synthetic, true);
      } finally {
        await derrubar(e);
      }
    },
  );
  assert.equal(
    readFileSync(SERVIDOR, "utf8"),
    COMPILADO,
    "o servidor compilado mudou durante a suíte",
  );

  console.log(`\n${passou}/${passou + falhas.length}`);
  if (falhas.length) {
    for (const f of falhas) console.log(`  FALHA ${f}`);
    console.log("\nTERMO_SINTETICO_RED");
    process.exit(1);
  }
  console.log("\nTERMO_SINTETICO_GREEN");
}

void main().catch((e) => {
  console.error("falha ao executar a suíte:", e);
  process.exit(1);
});
