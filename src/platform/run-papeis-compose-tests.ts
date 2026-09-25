/**
 * Certificação da Cadeia Real — a composição oficial usa os PAPÉIS MÍNIMOS.
 * ============================================================================
 * `deploy/sql/papeis_minimos.sql` foi provado em `test:platform:cadeia` (P1-P5):
 * crítico e assíncrono sobem com papéis sem superusuário, a cadeia passa, e a
 * sabotagem é recusada por privilégio. Esta suíte trava a LIGAÇÃO desse
 * desenho à composição: quem recebe qual senha, e em que ordem os papéis
 * existem antes dos runtimes.
 *
 * Prova pelo RENDERIZADOR do compose (`docker compose config`), nunca por
 * leitura do YAML: o ambiente que importa é o que cada container recebe depois
 * da interpolação. Mesmo isolamento de `run-q017-compose-tests.ts`: ambiente
 * de processo saneado e `--env-file` explícito.
 *
 * O comportamento em containers reais — o runtime conectado de fato com o
 * papel, a sabotagem recusada com a credencial dele — é de
 * `tools/papeis_compose_real.sh`, que exige daemon. Esta suíte não.
 *
 * Sem o plugin `docker compose`, PULA EM VOZ ALTA.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const raiz = process.cwd();
const COMPOSE = join(raiz, "deploy/compose.platform.yaml");
const PAPEIS_SQL = "deploy/sql/papeis_minimos.sql";

console.log("\n=== PAPEIS — A COMPOSICAO OFICIAL SEM SUPERUSUARIO NO RUNTIME ===\n");

const ambienteSaneado = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };

const versao = spawnSync("docker", ["compose", "version"], { encoding: "utf8", env: ambienteSaneado });
if (versao.status !== 0) {
  console.log("PULADO: `docker compose` indisponível — nenhuma composição foi renderizada.");
  console.log(`  ${(versao.stderr || String(versao.error ?? "")).trim().slice(0, 200)}`);
  process.exit(0);
}
console.log(`  ${versao.stdout.trim()}\n`);

let passaram = 0;
const falhas: string[] = [];
function teste(nome: string, fn: () => void): void {
  try {
    fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

const tmp = mkdtempSync(join(tmpdir(), "papeis-compose-"));

/** Fixtures DISTINTAS entre si: cada uma denuncia sozinha onde chegou. */
const SENHA_ADMIN = "fixture-admin-papeis-0a1b2c";
const SENHA_CRITICO = "fixture-critico-papeis-3d4e5f";
const SENHA_ASSINCRONO = "fixture-assincrono-papeis-6a7b8c";
const BASE: Record<string, string> = {
  POSTGRES_PASSWORD: SENHA_ADMIN,
  DELIVERYOS_COMMIT: "abcdef1234567",
  DELIVERYOS_DEVICE_TOKEN_SECRET: "fixture-papeis-".padEnd(48, "x"),
  DELIVERYOS_SOURCE_MODE: "simulated",
  DELIVERYOS_CRITICAL_DB_PASSWORD: SENHA_CRITICO,
  DELIVERYOS_ASYNC_DB_PASSWORD: SENHA_ASSINCRONO,
};

interface Servico {
  environment?: Record<string, string>;
  command?: string[];
  depends_on?: Record<string, { condition?: string }>;
  volumes?: { type?: string; source?: string; target?: string; read_only?: boolean }[];
}
interface Render {
  codigo: number | null;
  erro: string;
  servicos: Record<string, Servico> | null;
}

let arquivos = 0;
/**
 * Renderiza com EXATAMENTE este ambiente. `composeTexto` troca o arquivo de
 * composição por outro (o controle adversarial); o diretório de projeto
 * continua `deploy/`, para que caminhos relativos resolvam igual ao oficial.
 */
function renderizar(env: Record<string, string>, composeTexto?: string): Render {
  arquivos += 1;
  const arquivoEnv = join(tmp, `ambiente-${arquivos}.env`);
  writeFileSync(arquivoEnv, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  let arquivoCompose = COMPOSE;
  if (composeTexto !== undefined) {
    arquivoCompose = join(tmp, `compose-${arquivos}.yaml`);
    writeFileSync(arquivoCompose, composeTexto);
  }
  const r = spawnSync(
    "docker",
    ["compose", "--project-directory", join(raiz, "deploy"), "-f", arquivoCompose, "--env-file", arquivoEnv, "config", "--format", "json"],
    { cwd: raiz, encoding: "utf8", env: ambienteSaneado, timeout: 60_000 },
  );
  const servicos = r.status === 0 ? (JSON.parse(r.stdout) as { services: Record<string, Servico> }).services : null;
  return { codigo: r.status, erro: r.stderr ?? "", servicos };
}

/** Os serviços em cujo ambiente final `segredo` aparece — em qualquer valor, URL incluída. */
const quemRecebe = (r: Render, segredo: string): string[] =>
  Object.entries(r.servicos ?? {})
    .filter(([, s]) => Object.values(s.environment ?? {}).some((v) => String(v).includes(segredo)))
    .map(([nome]) => nome)
    .sort();

const urlDe = (r: Render, servico: string): URL => {
  const bruto = r.servicos?.[servico]?.environment?.DELIVERYOS_DATABASE_URL;
  assert.ok(bruto, `${servico} não recebeu DELIVERYOS_DATABASE_URL`);
  return new URL(bruto);
};

const oficial = renderizar(BASE);

try {
  teste("P0 CONTROLE: a composição oficial renderiza com o ambiente completo", () => {
    assert.equal(oficial.codigo, 0, `não renderizou:\n${oficial.erro}`);
    for (const s of ["deliveryos-postgres", "deliveryos-migrate", "deliveryos-papeis", "deliveryos-critical", "deliveryos-async", "deliveryos-backup"]) {
      assert.ok(oficial.servicos?.[s], `serviço ausente: ${s}`);
    }
  });

  teste("P1 a senha ADMINISTRATIVA chega só a banco, migration, papéis e backup — nunca aos runtimes", () => {
    assert.deepEqual(quemRecebe(oficial, SENHA_ADMIN), [
      "deliveryos-backup",
      "deliveryos-migrate",
      "deliveryos-papeis",
      "deliveryos-postgres",
    ]);
  });

  teste("P1c CONTROLE ADVERSARIAL: com a URL comum de antes, P1 acusa os dois runtimes", () => {
    // O desenho anterior, reposto: a URL do dono em `x-ambiente` e nenhuma URL
    // própria. Se a checagem de P1 não acusasse isto, ela seria opinião.
    const original = readFileSync(COMPOSE, "utf8");
    const urlDoDono =
      "postgres://${POSTGRES_USER:-deliveryos}:${POSTGRES_PASSWORD:?senha do banco obrigatoria}@deliveryos-postgres:5432/${POSTGRES_DB:-deliveryos}";
    const mutado = original
      .replace(/\n      DELIVERYOS_DATABASE_URL: postgres:\/\/deliveryos_(critical|async):[^\n]*/g, "")
      .replace("x-ambiente: &ambiente\n", `x-ambiente: &ambiente\n  DELIVERYOS_DATABASE_URL: ${urlDoDono}\n`);
    assert.notEqual(mutado, original, "a mutação não se aplicou — o controle não mede nada");
    const r = renderizar(BASE, mutado);
    assert.equal(r.codigo, 0, `o controle não renderizou:\n${r.erro}`);
    const acusados = quemRecebe(r, SENHA_ADMIN).filter((s) => s === "deliveryos-critical" || s === "deliveryos-async");
    assert.deepEqual(acusados, ["deliveryos-async", "deliveryos-critical"]);
  });

  teste("P2 cada runtime conecta com o PRÓPRIO papel; a migration, com o dono", () => {
    const m = urlDe(oficial, "deliveryos-migrate");
    const c = urlDe(oficial, "deliveryos-critical");
    const a = urlDe(oficial, "deliveryos-async");
    assert.equal(m.username, "deliveryos");
    assert.equal(c.username, "deliveryos_critical");
    assert.equal(a.username, "deliveryos_async");
    assert.equal(decodeURIComponent(m.password), SENHA_ADMIN);
    assert.equal(decodeURIComponent(c.password), SENHA_CRITICO);
    assert.equal(decodeURIComponent(a.password), SENHA_ASSINCRONO);
    for (const u of [m, c, a]) assert.equal(u.hostname, "deliveryos-postgres");
  });

  teste("P3 os papéis das URLs são EXATAMENTE os que o SQL provado cria — e nenhum é o dono", () => {
    const sql = readFileSync(join(raiz, PAPEIS_SQL), "utf8");
    const criados = [...sql.matchAll(/CREATE ROLE (\w+) LOGIN/g)].map((x) => x[1]!).sort();
    assert.deepEqual(criados, ["deliveryos_async", "deliveryos_critical"]);
    const usados = [urlDe(oficial, "deliveryos-async").username, urlDe(oficial, "deliveryos-critical").username];
    assert.deepEqual(usados, criados);
    assert.ok(!/SUPERUSER|CREATEROLE|CREATEDB|BYPASSRLS/.test(sql.replace(/^--.*$/gm, "")), "o SQL concede atributo administrativo a um papel");
    // O mesmo arquivo que `test:platform:cadeia` P1-P5 executa: o desenho
    // ligado ao compose é o desenho provado, não uma cópia.
    assert.ok(readFileSync(join(raiz, "src/platform/run-cadeia-real-tests.ts"), "utf8").includes(`"${PAPEIS_SQL}"`));
  });

  teste("P4 cada senha de papel chega só ao próprio runtime e ao job que a aplica", () => {
    assert.deepEqual(quemRecebe(oficial, SENHA_CRITICO), ["deliveryos-critical", "deliveryos-papeis"]);
    assert.deepEqual(quemRecebe(oficial, SENHA_ASSINCRONO), ["deliveryos-async", "deliveryos-papeis"]);
  });

  teste("P5 sem a senha de um papel, ou com ela vazia, `config` recusa nomeando a variável", () => {
    for (const v of ["DELIVERYOS_CRITICAL_DB_PASSWORD", "DELIVERYOS_ASYNC_DB_PASSWORD"]) {
      const { [v]: _fora, ...sem } = BASE;
      for (const [nome, env] of [["ausente", sem], ["vazia", { ...BASE, [v]: "" }]] as const) {
        const r = renderizar(env);
        assert.notEqual(r.codigo, 0, `${v} ${nome}: a composição renderizou`);
        assert.match(r.erro, new RegExp(`required variable ${v} is missing a value`), `${v} ${nome} recusou por outro motivo:\n${r.erro}`);
      }
    }
  });

  teste("P6 ORDEM: papéis depois da migration; os dois runtimes esperam papéis E migration", () => {
    const s = oficial.servicos!;
    assert.equal(s["deliveryos-papeis"]?.depends_on?.["deliveryos-migrate"]?.condition, "service_completed_successfully");
    for (const r of ["deliveryos-critical", "deliveryos-async"]) {
      assert.equal(s[r]?.depends_on?.["deliveryos-papeis"]?.condition, "service_completed_successfully", `${r} não espera os papéis`);
      assert.equal(s[r]?.depends_on?.["deliveryos-migrate"]?.condition, "service_completed_successfully", `${r} não espera a migration`);
    }
  });

  teste("P7 o job aplica o SQL provado e as senhas, com ON_ERROR_STOP, de um volume SOMENTE LEITURA", () => {
    const p = oficial.servicos!["deliveryos-papeis"]!;
    assert.deepEqual(p.command, [
      "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
      "-f", "/papeis/papeis_minimos.sql", "-f", "/papeis/senhas_dos_papeis.sql",
    ]);
    const v = (p.volumes ?? []).find((x) => x.target === "/papeis");
    assert.ok(v, "o job não monta os arquivos de papéis");
    assert.equal(v.source, join(raiz, "deploy/sql"));
    assert.equal(v.read_only, true, "o volume dos papéis é gravável");
  });

  teste("P8 nenhuma senha viaja em ARGUMENTO de processo, em serviço nenhum", () => {
    for (const [nome, s] of Object.entries(oficial.servicos ?? {})) {
      const argv = (s.command ?? []).join(" ");
      for (const segredo of [SENHA_ADMIN, SENHA_CRITICO, SENHA_ASSINCRONO]) {
        assert.ok(!argv.includes(segredo), `${nome} leva senha na linha de comando`);
      }
    }
    const senhas = readFileSync(join(raiz, "deploy/sql/senhas_dos_papeis.sql"), "utf8");
    assert.match(senhas, /\\getenv senha_do_critico DELIVERYOS_CRITICAL_DB_PASSWORD/);
    assert.match(senhas, /\\getenv senha_do_assincrono DELIVERYOS_ASYNC_DB_PASSWORD/);
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${passaram}/${passaram + falhas.length} provas pelo renderizador do compose`);
for (const f of falhas) console.log(`  XX ${f}`);
if (falhas.length > 0) {
  console.log("\nPAPEIS_COMPOSE_RED");
  process.exit(1);
}
console.log("\nPAPEIS_COMPOSE_GREEN");
