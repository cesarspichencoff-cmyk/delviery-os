/**
 * PB19 — a composição oficial não pode dizer "estou pronta" mentindo.
 *
 * Esta suíte defende UMA propriedade, em várias formas: **capacidade
 * operacional estruturalmente incapaz de funcionar não pode conviver com
 * prontidão declarada.**
 *
 * Os três defeitos que a motivaram foram medidos, não supostos:
 *
 *  - **D3b** — `contracts/event-schema.ts` lia `docs/contracts/eventos.schema.json`
 *    a partir de `process.cwd()`. A imagem oficial leva `/app` com `dist/`,
 *    `node_modules/` e `package.json`; `docs/` não entra. Resultado medido:
 *    `/ready` 200, **todo** lote de GPS 503, log com duas linhas e nenhuma
 *    sobre o 503;
 *  - **D2** — o compose não passava `DELIVERYOS_DEVICE_TOKEN_SECRET`, e o
 *    crítico sai 78 sem ele;
 *  - **D1** — o compose aponta o banco por `deliveryos-postgres` com
 *    `DELIVERYOS_DATABASE_SSL=false`, e a política recusava qualquer host não
 *    `localhost` sem TLS.
 *
 * O método é o mesmo do `run-spine-process-tests`: **não importar nada do
 * runtime**. A suíte monta uma raiz FIEL À IMAGEM — só `dist/`,
 * `node_modules/` e `package.json` — e sobe `node dist/…` ali dentro. Nada é
 * escondido ou movido dentro do repositório: o incidente do C3, em que um
 * `mv` não voltou porque o shell morreu antes, não pode se repetir se o
 * repositório nunca é tocado.
 *
 * Exige `DELIVERYOS_PG_URL`. Sem banco, PULA EM VOZ ALTA (CLAUDE.md §10).
 */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const raiz = process.cwd();
const URL_PG = (process.env.DELIVERYOS_PG_URL ?? "").trim();

console.log("=== PB19 — prontidão honesta na composição oficial ===\n");

if (!URL_PG) {
  console.log("PULADO: DELIVERYOS_PG_URL não definida — nenhum processo real foi exercitado.");
  console.log("Para rodar:  DELIVERYOS_PG_URL=postgres://user@host:porta/base");
  process.exit(0);
}

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

const SEGREDO_FIXTURE = "s".repeat(48);

/**
 * Raiz que imita a imagem: exatamente o que `Dockerfile.platform` copia para
 * `/app`. `node_modules` entra como symlink — ele não muda o que o teste mede
 * e copiar centenas de megabytes por caso tornaria a suíte inutilizável.
 */
function raizDaImagem(): string {
  const dir = mkdtempSync(join(tmpdir(), "pb19-"));
  cpSync(join(raiz, "dist"), join(dir, "dist"), { recursive: true });
  cpSync(join(raiz, "package.json"), join(dir, "package.json"));
  symlinkSync(join(raiz, "node_modules"), join(dir, "node_modules"));
  return dir;
}

const CONTRATO_NA_IMAGEM = join("dist", "docs", "contracts", "eventos.schema.json");

interface Resultado {
  code: number | null;
  saida: string;
}

/** Sobe o crítico e ESPERA que ele termine. Para os casos de falha fechada. */
function bootQueDeveMorrer(dir: string, env: Record<string, string> = {}): Resultado {
  const r = spawnSync(process.execPath, ["dist/src/platform/bin/critical.js"], {
    cwd: dir,
    encoding: "utf8",
    timeout: 30_000,
    env: {
      ...process.env,
      DELIVERYOS_ENV: "local",
      DELIVERYOS_DATABASE_URL: URL_PG,
      DELIVERYOS_MIGRATE_ON_BOOT: "false",
      DELIVERYOS_DEVICE_TOKEN_SECRET: SEGREDO_FIXTURE,
      // Porta VÁLIDA de propósito: `0` é recusado pela configuração, e o
      // processo sairia 78 pelo motivo errado. Um teste que aceita o código
      // de saída sem conferir o motivo já teria passado ali — foi o que
      // aconteceu na primeira versão desta suíte.
      DELIVERYOS_PORT: String(8700 + Math.floor(Math.random() * 200)),
      ...env,
    },
  });
  return { code: r.status, saida: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/* ================================================================== *
 * D3b — asset obrigatório de runtime
 * ================================================================== */
console.log("D3b — CONTRATO DE EVENTOS");

teste("D3b-1 o contrato está no artefato de build, deterministicamente", () => {
  assert.ok(
    existsSync(join(raiz, CONTRATO_NA_IMAGEM)),
    `${CONTRATO_NA_IMAGEM} ausente — rode npm run build:platform; sem ele a imagem recusa todo GPS`,
  );
});

teste("D3b-2 a raiz fiel à imagem NÃO tem docs/ nem src/ — e ainda assim resolve o contrato", () => {
  const dir = raizDaImagem();
  try {
    assert.ok(!existsSync(join(dir, "docs")), "a raiz de teste não está fiel: docs/ presente");
    assert.ok(!existsSync(join(dir, "src")), "a raiz de teste não está fiel: src/ presente");
    // A resolução acontece DENTRO do processo filho, a partir do módulo.
    const r = spawnSync(
      process.execPath,
      ["-e", "const s=require('./dist/src/platform/contracts/event-schema.js');const c=s.carregarCatalogo();console.log('OK',c.version)"],
      { cwd: dir, encoding: "utf8", timeout: 30_000 },
    );
    assert.match(
      `${r.stdout ?? ""}${r.stderr ?? ""}`,
      /OK event-catalog@/,
      `o contrato não resolveu a partir do módulo:\n${r.stdout}${r.stderr}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

teste("D3b-3 CONTROLE POSITIVO: imagem íntegra sobe e ACEITA lote de GPS", () => {
  const dir = raizDaImagem();
  try {
    const r = spawnSync(process.execPath, [join(raiz, "tools", "pb19_ingestao_real.js")], {
      cwd: dir,
      encoding: "utf8",
      timeout: 90_000,
      env: { ...process.env, DELIVERYOS_PG_URL: URL_PG, PB19_SEGREDO: SEGREDO_FIXTURE },
    });
    const saida = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    assert.match(saida, /READY=200/, `/ready não respondeu 200:\n${saida}`);
    assert.match(saida, /GPS=200/, `o lote de GPS não foi aceito:\n${saida}`);
    assert.match(saida, /ACEITOS=1/, `o lote não foi persistido:\n${saida}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const [nome, quebrar, motivo] of [
  ["ausente", (c: string) => rmSync(c), /contrato de eventos ausente/],
  ["corrompido", (c: string) => writeFileSync(c, '{"version":"event-catalog@1.0.0","propert'), /ileg[íi]vel/],
  [
    "incompatível",
    (c: string) => {
      const d = JSON.parse(readFileSync(c, "utf8")) as Record<string, unknown>;
      d.version = "event-catalog@2.0.0";
      writeFileSync(c, JSON.stringify(d));
    },
    /incompat/,
  ],
] as [string, (c: string) => void, RegExp][]) {
  teste(`D3b-4 contrato ${nome}: o crítico FALHA FECHADO no boot, não fica pronto`, () => {
    const dir = raizDaImagem();
    try {
      quebrar(join(dir, CONTRATO_NA_IMAGEM));
      const r = bootQueDeveMorrer(dir);
      assert.equal(r.code, 78, `o crítico subiu com contrato ${nome} (exit ${String(r.code)})`);
      assert.match(r.saida, motivo, `o motivo não ficou no log:\n${r.saida}`);
      assert.doesNotMatch(r.saida, /ouvindo em/, "o crítico chegou a escutar — /ready poderia responder 200");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

teste("D3b-6 o .dockerignore deixa `docs/contracts` ENTRAR no contexto de build", () => {
  // A raiz mais funda do D3b. O `.dockerignore` excluía `docs` com a premissa
  // escrita "não muda o comportamento do serviço" — FALSA, porque
  // `docs/contracts/eventos.schema.json` é lido em runtime. Com a exclusão, o
  // `COPY` do Dockerfile nem chega a rodar: o arquivo não está no contexto.
  const di = readFileSync(join(raiz, ".dockerignore"), "utf8").replace(/^\s*#[^\n]*$/gm, "");
  assert.match(di, /^\s*docs\s*$/m, "o .dockerignore parou de excluir docs/ — a imagem carregaria documentação inteira");
  assert.match(di, /^\s*!docs\/contracts\s*$/m, "o .dockerignore não reinclui docs/contracts — o COPY falha por arquivo fora do contexto");
});

teste("D3b-5 a imagem NÃO carrega docs/ inteiro — só os contratos", () => {
  // Resolver o asset levando documentação inteira para produção esconderia,
  // no volume, quais arquivos são realmente exigidos em runtime.
  const dockerfile = readFileSync(join(raiz, "deploy/Dockerfile.platform"), "utf8")
    .replace(/#[^\n]*/g, "");
  assert.doesNotMatch(dockerfile, /COPY\s+docs\s/, "o Dockerfile passou a copiar docs/ inteiro");
  assert.match(dockerfile, /COPY\s+docs\/contracts/, "o Dockerfile não copia docs/contracts");
});

/* ================================================================== *
 * D2 — segredo dos tokens de aparelho
 * ================================================================== */
console.log("\nD2 — SEGREDO DE APARELHO");

const COMPOSE = readFileSync(join(raiz, "deploy/compose.platform.yaml"), "utf8");
const COMPOSE_SEM_COMENTARIO = COMPOSE.replace(/^\s*#[^\n]*$/gm, "");

teste("D2-1 o compose EXIGE o segredo, com `:?` — o erro chega antes do deploy", () => {
  assert.match(
    COMPOSE_SEM_COMENTARIO,
    /DELIVERYOS_DEVICE_TOKEN_SECRET:\s*\$\{DELIVERYOS_DEVICE_TOKEN_SECRET:\?/,
    "o compose não exige o segredo — `docker compose config` subiria sem ele",
  );
});

teste("D2-2 o segredo fica SÓ no crítico — o assíncrono não emite token", () => {
  // Medido por grafo: `bin/async-runtime.ts` não alcança `auth/device-token.ts`.
  const ambiente = COMPOSE_SEM_COMENTARIO.split("services:")[0] ?? "";
  assert.doesNotMatch(
    ambiente,
    /DELIVERYOS_DEVICE_TOKEN_SECRET/,
    "o segredo entrou em `x-ambiente` e vaza para serviços que não precisam dele",
  );
});

teste("D2-3 nenhum segredo REAL está versionado", () => {
  const ignorado = execFileSync("git", ["check-ignore", "deploy/.env"], { cwd: raiz, encoding: "utf8" }).trim();
  assert.equal(ignorado, "deploy/.env", "deploy/.env deixou de ser ignorado");
  const exemplo = readFileSync(join(raiz, "deploy/.env.platform.example"), "utf8");
  assert.match(
    exemplo,
    /^DELIVERYOS_DEVICE_TOKEN_SECRET=\s*$/m,
    "o exemplo traz valor preenchido — exemplo com segredo dentro vira segredo commitado",
  );
});

teste("D2-4 sem o segredo o crítico NÃO fica pronto: falha fechada no boot", () => {
  const dir = raizDaImagem();
  try {
    const r = bootQueDeveMorrer(dir, { DELIVERYOS_DEVICE_TOKEN_SECRET: "" });
    assert.equal(r.code, 78, `o crítico subiu sem segredo (exit ${String(r.code)})`);
    assert.match(r.saida, /DEVICE_TOKEN_SECRET ausente/, `motivo ausente do log:\n${r.saida}`);
    assert.doesNotMatch(r.saida, /ouvindo em/, "o crítico escutou sem segredo — /ready responderia 200");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

teste("D2-5 segredo curto demais também é recusado, não truncado", () => {
  const dir = raizDaImagem();
  try {
    const r = bootQueDeveMorrer(dir, { DELIVERYOS_DEVICE_TOKEN_SECRET: "curto" });
    assert.equal(r.code, 78, "segredo curto foi aceito");
    assert.match(r.saida, /caracteres|m[íi]nimo/, `o motivo não ficou claro:\n${r.saida}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

teste("D2-6 o segredo NUNCA aparece no log de boot", () => {
  const dir = raizDaImagem();
  const marca = "SEGREDO-QUE-NAO-PODE-VAZAR-" + "z".repeat(24);
  try {
    // Este boot falha por outro motivo (contrato removido), e é bom: garante
    // que o caminho de ERRO também não imprime o segredo — é justamente onde
    // um `describe()` descuidado despeja o ambiente inteiro.
    rmSync(join(dir, CONTRATO_NA_IMAGEM));
    const r = bootQueDeveMorrer(dir, { DELIVERYOS_DEVICE_TOKEN_SECRET: marca });
    assert.ok(!r.saida.includes(marca), `o segredo vazou para o log:\n${r.saida}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ================================================================== *
 * D1 — fronteira de confiança de rede
 * ================================================================== */
console.log("\nD1 — TLS E REDE PRIVADA");

function config(extra: Record<string, string>): { ok: true; tls: boolean } | { ok: false; variavel: string } {
  const r = spawnSync(
    process.execPath,
    [
      "-e",
      `const c=require('./dist/src/platform/config/platform-config.js');
       try{const cfg=c.loadPlatformConfig(process.env);console.log('OK',cfg.database_ssl);}
       catch(e){console.log('ERRO',e.variavel||'?');}`,
    ],
    {
      cwd: raiz,
      encoding: "utf8",
      timeout: 20_000,
      env: {
        PATH: process.env.PATH ?? "",
        DELIVERYOS_ENV: "pilot",
        DELIVERYOS_COMMIT: "abcdef1234567",
        ...extra,
      },
    },
  );
  const saida = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  const m = /OK (true|false)/.exec(saida);
  if (m) return { ok: true, tls: m[1] === "true" };
  const e = /ERRO (\S+)/.exec(saida);
  assert.ok(e, `configuração não respondeu nem OK nem ERRO:\n${saida}`);
  return { ok: false, variavel: e[1] };
}

const INTERNO = "postgres://u:p@deliveryos-postgres:5432/d";
const EXTERNO = "postgres://u:p@db.exemplo.com:5432/d";

teste("D1-1 CONTROLE POSITIVO: o compose interno legítimo é aceito, sem TLS", () => {
  const r = config({
    DELIVERYOS_DATABASE_URL: INTERNO,
    DELIVERYOS_DATABASE_SSL: "false",
    DELIVERYOS_DATABASE_PRIVATE_HOST: "deliveryos-postgres",
  });
  assert.ok(r.ok, "a composição oficial continua sendo recusada");
  assert.equal(r.tls, false);
});

teste("D1-2 banco EXTERNO sem TLS continua recusado", () => {
  const r = config({ DELIVERYOS_DATABASE_URL: EXTERNO, DELIVERYOS_DATABASE_SSL: "false" });
  assert.ok(!r.ok, "banco externo sem TLS passou — a política foi afrouxada");
  assert.equal(r.variavel, "DELIVERYOS_DATABASE_SSL");
});

teste("D1-3 banco EXTERNO com TLS continua permitido", () => {
  const r = config({ DELIVERYOS_DATABASE_URL: EXTERNO, DELIVERYOS_DATABASE_SSL: "true" });
  assert.ok(r.ok, "banco externo com TLS foi recusado");
  assert.equal(r.tls, true);
});

teste("D1-4 declarar o host NÃO desliga TLS sozinho — são dois atos", () => {
  const r = config({ DELIVERYOS_DATABASE_URL: INTERNO, DELIVERYOS_DATABASE_PRIVATE_HOST: "deliveryos-postgres" });
  assert.ok(r.ok);
  assert.equal(r.tls, true, "a declaração sozinha desligou TLS — texto claro por omissão");
});

teste("D1-5 `ssl=false` sem declaração continua recusado", () => {
  const r = config({ DELIVERYOS_DATABASE_URL: INTERNO, DELIVERYOS_DATABASE_SSL: "false" });
  assert.ok(!r.ok, "ssl=false sozinho dispensou TLS fora de localhost");
});

teste("D1-6 a declaração é IGUALDADE EXATA: nada de sufixo nem parecido", () => {
  for (const url of [
    "postgres://u:p@mau-deliveryos-postgres:5432/d",
    "postgres://u:p@deliveryos-postgres.exemplo.com:5432/d",
    "postgres://u:p@outro-host:5432/d",
  ]) {
    const r = config({
      DELIVERYOS_DATABASE_URL: url,
      DELIVERYOS_DATABASE_SSL: "false",
      DELIVERYOS_DATABASE_PRIVATE_HOST: "deliveryos-postgres",
    });
    assert.ok(!r.ok, `${url} foi aceito — a declaração virou regra larga`);
  }
});

teste("D1-7 o compose DECLARA o host privado, e é o mesmo do serviço", () => {
  assert.match(
    COMPOSE_SEM_COMENTARIO,
    /DELIVERYOS_DATABASE_PRIVATE_HOST:\s*deliveryos-postgres/,
    "o compose não declara o host privado — a composição não sobe",
  );
  assert.match(
    COMPOSE_SEM_COMENTARIO,
    /container_name:\s*deliveryos-postgres/,
    "o host declarado não corresponde a nenhum serviço da composição",
  );
  // E o banco não pode publicar porta: privado declarado que publica porta
  // para o host não é privado.
  const bloco = COMPOSE_SEM_COMENTARIO.split("deliveryos-migrate:")[0] ?? "";
  assert.doesNotMatch(bloco, /^\s+ports:/m, "o PostgreSQL passou a publicar porta — a rede deixou de ser privada");
});

/* ================================================================== *
 * D3a — coerência do artefato de build
 * ================================================================== */
console.log("\nD3a — COERENCIA DE BUILD");

interface Carimbo {
  fontes_sha256?: string;
  fontes_arquivos?: number;
  commit?: string | null;
}

function lerCarimbo(distDir: string): Carimbo | null {
  const p = join(distDir, "build-stamp.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Carimbo;
  } catch {
    return null;
  }
}

/** Recalcula o hash das fontes AGORA, pela mesma função que carimbou. */
function hashAtualDasFontes(): string {
  const req = createRequire(join(raiz, "package.json"));
  const t = req("./tools/carimbar_build.js") as { hashDasFontes(): { sha256: string } };
  return t.hashDasFontes().sha256;
}

teste("D3a-1 o dist carrega carimbo com identidade de commit", () => {
  const c = lerCarimbo(join(raiz, "dist"));
  assert.ok(c, "dist/build-stamp.json ausente — o artefato não sabe de onde veio");
  assert.ok(c.fontes_sha256 && c.fontes_sha256.length === 64, "carimbo sem hash de fontes");
  assert.ok(
    typeof c.commit === "string" && c.commit.length >= 7,
    "o artefato não carrega identidade de commit — 'qual código está no ar' vira arqueologia",
  );
});

teste("D3a-2 o dist é COERENTE com as fontes de agora", () => {
  // MEDIDO nesta sessão: o gate leu `dist/.../platform-config.js` depois de eu
  // corrigir a regra de TLS em `src/` sem reconstruir, e reprovou uma
  // propriedade já correta. O falso VERMELHO foi barulhento; o perigo é o
  // inverso — artefato velho que ainda passa, verde sobre código que ninguém
  // mais roda.
  const c = lerCarimbo(join(raiz, "dist"));
  assert.ok(c, "sem carimbo não dá para afirmar coerência");
  assert.equal(
    c.fontes_sha256,
    hashAtualDasFontes(),
    "dist está VELHO em relação a src — rode npm run build:platform antes de confiar em qualquer gate que leia dist/",
  );
});

teste("D3a-3b a checagem não é vazia: importar o carimbador NÃO reescreve o carimbo", () => {
  // A primeira versão de `carimbar_build.js` executava o corpo ao ser
  // importada. O gate importa a ferramenta para recalcular o hash — ou seja,
  // ele REESCREVERIA o carimbo antes de compará-lo, e D3a-2 passaria sempre,
  // medindo nada. Uma verificação que se conserta sozinha não é verificação.
  const p = join(raiz, "dist", "build-stamp.json");
  const antes = readFileSync(p, "utf8");
  // Processo NOVO, de propósito: no mesmo processo o módulo já está em cache
  // do `require`, e uma segunda importação não executaria nada — a checagem
  // passaria sem medir. Foi assim que MP11 ficou cega na primeira execução.
  spawnSync(process.execPath, ["-e", "require('./tools/carimbar_build.js')"], {
    cwd: raiz,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(readFileSync(p, "utf8"), antes, "importar o carimbador reescreveu o carimbo");
});

teste("D3a-3 ADVERSARIAL: carimbo divergente é acusado, e carimbo ausente também", () => {
  const dir = mkdtempSync(join(tmpdir(), "pb19-carimbo-"));
  try {
    // (a) divergente
    writeFileSync(
      join(dir, "build-stamp.json"),
      JSON.stringify({ carimbo_versao: 1, fontes_sha256: "0".repeat(64), commit: "0".repeat(40) }),
    );
    const divergente = lerCarimbo(dir);
    assert.ok(divergente, "o carimbo forjado nem foi lido — o teste não mede nada");
    assert.notEqual(
      divergente.fontes_sha256,
      hashAtualDasFontes(),
      "hash forjado bateu com o real — a comparação não distingue nada",
    );
    // (b) ausente
    rmSync(join(dir, "build-stamp.json"));
    assert.equal(lerCarimbo(dir), null, "carimbo ausente não foi detectado");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

teste("D3a-4 os assets do dist são byte a byte iguais à origem", () => {
  const pares: [string, string][] = [
    ["src/platform/migrations", "dist/src/platform/migrations"],
    ["docs/contracts", "dist/docs/contracts"],
  ];
  for (const [de, para] of pares) {
    const origem = readdirSync(join(raiz, de)).filter((f) => /\.(sql|json)$/.test(f)).sort();
    assert.ok(origem.length > 0, `${de} vazio — o build copiaria nada`);
    for (const f of origem) {
      const a = readFileSync(join(raiz, de, f));
      const b = existsSync(join(raiz, para, f)) ? readFileSync(join(raiz, para, f)) : null;
      assert.ok(b, `${para}/${f} ausente no artefato`);
      assert.ok(a.equals(b), `${para}/${f} difere da origem — artefato incoerente`);
    }
  }
});

teste("D3a-5 a composição IMPEDE schema parcial: migrate próprio, e os dois esperam por ele", () => {
  // A classificação do D3a depende disto. O sintoma (ready 200 + GPS 503 com
  // detalhe) foi reproduzido com schema parcial, mas a composição oficial não
  // consegue produzir esse estado: `migrate` roda da MESMA imagem e os dois
  // runtimes só sobem depois que ele termina com sucesso.
  const semComentario = COMPOSE.replace(/^\s*#[^\n]*$/gm, "");
  assert.match(semComentario, /deliveryos-migrate:/, "a composição perdeu o serviço de migration");
  assert.match(
    semComentario,
    /command:\s*\["node",\s*"dist\/src\/platform\/bin\/migrate\.js"\]/,
    "o serviço de migrate não roda o binário de migration",
  );
  for (const servico of ["deliveryos-critical", "deliveryos-async"]) {
    const bloco = semComentario.split(`${servico}:`)[1]?.split("\n  deliveryos-")[0] ?? "";
    assert.match(
      bloco,
      /deliveryos-migrate:\s*\n\s*condition:\s*service_completed_successfully/,
      `${servico} não espera a migration terminar — schema parcial volta a ser possível`,
    );
  }
  // E os três saem da MESMA imagem: migrate de uma versão com runtime de outra
  // é exatamente como o schema fica parcial na vida real.
  const ancoras = (semComentario.match(/<<:\s*\*imagem/g) ?? []).length;
  assert.ok(ancoras >= 3, `só ${ancoras} serviços herdam a mesma imagem — migrate e runtime podem divergir`);
});

console.log(`\n${passaram}/${passaram + falhas.length} de PB19`);
for (const f of falhas) console.log(`  XX ${f}`);
if (falhas.length) {
  console.error("\nPB19_RED");
  process.exit(1);
}
console.log("\nPB19_GREEN");

void execFileSync;
