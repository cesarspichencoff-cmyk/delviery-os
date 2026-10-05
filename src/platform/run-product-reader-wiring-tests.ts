/**
 * Product System reader — wiring oficial, sem deploy.
 *
 * Prova o que PODE ser provado sem daemon Docker:
 * - papel/senha separados;
 * - serviço oficial na composição, interno e read-only;
 * - imagem contém o binário e os assets não-TS;
 * - servidor compilado sobe num diretório "image-like" sem src/ original.
 *
 * NÃO prova docker compose up nem credencial real.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  productListenHost,
  productPgOptions,
} from "../../tools/product_system_server";

const ROOT = process.cwd();
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const compose = read("deploy/compose.platform.yaml");
const dockerfile = read("deploy/Dockerfile.platform");
const envExample = read("deploy/.env.platform.example");
const readerSql = read("deploy/sql/product_system_reader.sql");
const passwordSql = read("deploy/sql/senhas_dos_papeis.sql");
const readerPasswordSql = read("deploy/sql/senha_product_reader.sql");
const packageJson = JSON.parse(read("package.json")) as {
  scripts: Record<string, string>;
};

function semComentarios(texto: string): string {
  return texto
    .split("\n")
    .map((l) => (l.trimStart().startsWith("#") ? "" : l))
    .join("\n");
}
const composeCode = semComentarios(compose);

function servico(nome: string): string {
  const linhas = composeCode.split("\n");
  const ini = linhas.findIndex((l) => l.trimEnd() === `  ${nome}:`);
  assert.ok(ini >= 0, `serviço não encontrado: ${nome}`);
  const out: string[] = [];
  for (let i = ini + 1; i < linhas.length; i += 1) {
    const l = linhas[i]!;
    if (l.trim() && !l.startsWith("    ")) break;
    out.push(l);
  }
  return out.join("\n");
}

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log("PASS", name);
}
async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log("PASS", name);
}

test("PRW1 composição oficial declara Product System como profile opt-in", () => {
  const s = servico("deliveryos-product-system");
  assert.match(s, /<<: \*imagem/);
  assert.match(s, /profiles: \["product"\]/);
  assert.match(s, /dist\/tools\/product_system_server\.js/);
  assert.match(s, /networks: \[interna\]/);
});

test("PRW2 Product System é interno, read-only e não publica porta no host", () => {
  const s = servico("deliveryos-product-system");
  assert.match(s, /expose:\s*\n\s*- "5290"/);
  assert.doesNotMatch(s, /ports:/);
  assert.match(s, /read_only: true/);
  assert.match(s, /no-new-privileges:true/);
  assert.match(s, /tmpfs:/);
});

test("PRW3 Product System usa papel próprio e senha própria sem contaminar o core", () => {
  const s = servico("deliveryos-product-system");
  assert.match(
    s,
    /postgres:\/\/deliveryos_product_reader:\$\{DELIVERYOS_PRODUCT_READER_DB_PASSWORD:-\}/,
  );
  assert.doesNotMatch(s, /POSTGRES_PASSWORD/);
  assert.doesNotMatch(s, /deliveryos_critical:/);
  assert.doesNotMatch(s, /deliveryos_async:/);
  const papeis = servico("deliveryos-papeis");
  assert.doesNotMatch(papeis, /DELIVERYOS_PRODUCT_READER_DB_PASSWORD/);
  assert.doesNotMatch(papeis, /product_system_reader\.sql/);
});

test("PRW4 Product System espera setup opt-in; setup espera core pronto", () => {
  const s = servico("deliveryos-product-system");
  assert.match(
    s,
    /deliveryos-product-reader-setup:\s*\n\s*condition: service_completed_successfully/,
  );
  assert.match(
    s,
    /deliveryos-migrate:\s*\n\s*condition: service_completed_successfully/,
  );
  const setup = servico("deliveryos-product-reader-setup");
  assert.match(setup, /profiles: \["product"\]/);
  assert.match(setup, /deliveryos-postgres:\s*\n\s*condition: service_healthy/);
  assert.match(
    setup,
    /deliveryos-papeis:\s*\n\s*condition: service_completed_successfully/,
  );
  assert.match(
    setup,
    /deliveryos-migrate:\s*\n\s*condition: service_completed_successfully/,
  );
});

test("PRW5 healthcheck mede navegação real e bind é interno ao container", () => {
  const s = servico("deliveryos-product-system");
  assert.match(s, /PRODUCT_UI_HOST: 0\.0\.0\.0/);
  assert.match(s, /PRODUCT_UI_PORT: "5290"/);
  assert.match(s, /127\.0\.0\.1:5290\/api\/navegacao/);
});

test("PRW6 setup opt-in cria reader e senha sem tocar no job crítico de papéis", () => {
  const setup = servico("deliveryos-product-reader-setup");
  const iRole = setup.indexOf("/papeis/product_system_reader.sql");
  const iPassword = setup.indexOf("/papeis/senha_product_reader.sql");
  assert.ok(iRole >= 0 && iPassword > iRole);
  assert.match(setup, /DELIVERYOS_PRODUCT_READER_DB_PASSWORD:-/);
  assert.match(setup, /test -n "\$\$DELIVERYOS_PRODUCT_READER_DB_PASSWORD"/);
  assert.match(setup, /exit 78/);
  const core = servico("deliveryos-papeis");
  assert.doesNotMatch(core, /product_system_reader|PRODUCT_READER/);
});

test("PRW7 senha do reader nunca é versionada nem misturada às senhas core", () => {
  assert.match(envExample, /^DELIVERYOS_PRODUCT_READER_DB_PASSWORD=\s*$/m);
  assert.doesNotMatch(passwordSql, /PRODUCT_READER|product_reader/);
  assert.match(
    readerPasswordSql,
    /\\getenv senha_do_product_reader DELIVERYOS_PRODUCT_READER_DB_PASSWORD/,
  );
  assert.match(
    readerPasswordSql,
    /ALTER ROLE deliveryos_product_reader PASSWORD :'senha_do_product_reader'/,
  );
});

test("PRW8 SQL oficial cria reader sem autoridade administrativa", () => {
  const code = readerSql.replace(/^--.*$/gm, "");
  assert.match(code, /CREATE ROLE deliveryos_product_reader LOGIN NOINHERIT/);
  assert.doesNotMatch(
    code,
    /SUPERUSER|CREATEROLE|CREATEDB|BYPASSRLS/,
  );
  assert.doesNotMatch(code, /GRANT\s+(INSERT|UPDATE|DELETE|TRUNCATE)/i);
  assert.match(code, /REVOKE ALL PRIVILEGES/);
});

test("PRW9 secret_hash não entra no GRANT de identity.device", () => {
  const code = readerSql.replace(/^--.*$/gm, "");
  const grant = /GRANT SELECT \(\s*device_id,([\s\S]*?)\)\s+ON identity\.device\s+TO deliveryos_product_reader;/.exec(
    code,
  );
  assert.ok(grant, "GRANT de identity.device ausente");
  assert.doesNotMatch(grant[1]!, /secret_hash/);
});

test("PRW10 build oficial empacota assets do Product System", () => {
  assert.match(dockerfile, /copiar_product_system_assets\.js/);
  assert.match(dockerfile, /docs\/figma\/DESIGN_TOKENS\.json/);
  assert.match(dockerfile, /data\/cardapio_knowledge_seed\.json/);
  assert.match(dockerfile, /EXPOSE 8080 5290/);
  assert.match(
    packageJson.scripts["build:platform"] ?? "",
    /copiar_product_system_assets\.js/,
  );
});

test("PRW11 configuração PostgreSQL preserva a fronteira TLS", () => {
  assert.deepEqual(
    productPgOptions({
      DELIVERYOS_DATABASE_URL:
        "postgres://deliveryos_product_reader:x@deliveryos-postgres:5432/deliveryos",
      DELIVERYOS_DATABASE_SSL: "false",
      DELIVERYOS_DATABASE_PRIVATE_HOST: "deliveryos-postgres",
    }),
    {
      url: "postgres://deliveryos_product_reader:x@deliveryos-postgres:5432/deliveryos",
      max: 2,
      ssl: false,
      host_privado: "deliveryos-postgres",
    },
  );
  assert.deepEqual(
    productPgOptions({
      DELIVERYOS_DATABASE_URL:
        "postgres://deliveryos_product_reader:x@db.example.com:5432/deliveryos",
      DELIVERYOS_DATABASE_SSL: "true",
    }),
    {
      url: "postgres://deliveryos_product_reader:x@db.example.com:5432/deliveryos",
      max: 2,
      ssl: true,
    },
  );
  assert.throws(
    () =>
      productPgOptions({
        DELIVERYOS_DATABASE_URL: "postgres://localhost/deliveryos",
        DELIVERYOS_DATABASE_SSL: "talvez",
      }),
    /precisa ser true ou false/,
  );
});

test("PRW12 bind local continua seguro por padrão", () => {
  assert.equal(productListenHost({}), "127.0.0.1");
  assert.equal(productListenHost({ PRODUCT_UI_HOST: "0.0.0.0" }), "0.0.0.0");
});

async function runAsyncProofs(): Promise<void> {
  await testAsync("PRW13 build gerou todos os assets em dist", async () => {
  for (const p of [
    "dist/src/product/ui/index.html",
    "dist/src/product/ui/app.js",
    "dist/src/product/ui/tokens/product-tokens.css",
    "dist/src/entregas/ui/shared/tokens.css",
    "dist/docs/figma/DESIGN_TOKENS.json",
    "dist/data/cardapio_knowledge_seed.json",
    "dist/src/perfil-delivery/motor.js",
    "dist/src/conference-brain/storage/store.js",
    "dist/tools/product_system_server.js",
  ]) {
    assert.ok(existsSync(join(ROOT, p)), `asset compilado ausente: ${p}`);
  }
});

  await testAsync("PRW14 binário sobe em diretório image-like sem src fonte", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "product-reader-image-like-"));
  const port = 5387;
  try {
    cpSync(join(ROOT, "dist"), join(tmp, "dist"), { recursive: true });
    writeFileSync(
      join(tmp, "package.json"),
      JSON.stringify({ type: "commonjs", private: true }),
    );

    const child = spawn(
      process.execPath,
      ["dist/tools/product_system_server.js"],
      {
        cwd: tmp,
        env: {
          ...process.env,
          PRODUCT_UI_PORT: String(port),
          PRODUCT_UI_HOST: "127.0.0.1",
          DELIVERYOS_DATABASE_URL: "",
          DELIVERYOS_PG_URL: "",
          CONFERENCE_BRAIN_DATA_DIR: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += String(b)));
    child.stderr.on("data", (b) => (stderr += String(b)));

    try {
      const deadline = Date.now() + 15_000;
      let ok = false;
      while (Date.now() < deadline) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/`);
          if (r.ok && (await r.text()).includes("DeliveryOS")) {
            ok = true;
            break;
          }
        } catch {
          // ainda subindo
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      assert.equal(ok, true, `servidor image-like não subiu\nstdout=${stdout}\nstderr=${stderr}`);

      const shared = await fetch(`http://127.0.0.1:${port}/shared/tokens.css`);
      assert.equal(shared.status, 200);
      assert.ok((await shared.text()).length > 100);

      const estados = await fetch(`http://127.0.0.1:${port}/api/estados`);
      assert.equal(estados.status, 200);
      assert.ok((await estados.text()).length > 100);
    } finally {
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once("exit", () => resolve());
        setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 2_000);
      });
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  });

  console.log(`PRODUCT_READER_OFFICIAL_WIRING: ${passed}/14 PASS`);
}

void runAsyncProofs().catch((e) => {
  console.error("PRODUCT_READER_OFFICIAL_WIRING_RED", e instanceof Error ? e.stack : e);
  process.exit(1);
});
