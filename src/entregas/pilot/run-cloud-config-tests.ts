/**
 * Contrato de configuração de nuvem — testes.
 *
 * O foco é o que muda quando o processo deixa de ser local: credencial fora
 * do arquivo, CORS fechado, volume declarado, e boot que RECUSA subir em vez
 * de subir degradado. Cada teste aqui responde "o que aconteceria se alguém
 * publicasse isso hoje com esta configuração".
 */

import assert from "node:assert/strict";
import {
  loadCloudConfig,
  parseUsers,
  describe as describeConfig,
  resolveCorsOrigin,
  type CloudConfig,
} from "./cloud-config";

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Token sintético longo o bastante para o modo remoto. */
const TOK_A = "tok-sintetico-aaaaaaaaaaaaaaaaaaaa";
const TOK_B = "tok-sintetico-bbbbbbbbbbbbbbbbbbbb";

function cloudEnv(over: Record<string, string | undefined> = {}) {
  return {
    ENTREGAS_ENV: "cloud",
    ENTREGAS_BIND: "0.0.0.0",
    ENTREGAS_USERS: `ops-1:operador_expedicao:Operador:${TOK_A};rid-1:motoboy_interno:Motoboy:${TOK_B}`,
    ENTREGAS_ALLOWED_ORIGINS: "https://entregas.exemplo",
    ENTREGAS_DATA_DIR: "/dados",
    ...over,
  };
}

function issuesOf(env: Record<string, string | undefined>): string[] {
  const r = loadCloudConfig(env);
  return r.ok ? [] : r.issues.map((i) => i.variable);
}

/* ------------------------------------------------------------------ *
 * Modo local — nada pode quebrar para quem já usa
 * ------------------------------------------------------------------ */

test("ambiente vazio continua válido: o uso local não regride", () => {
  const r = loadCloudConfig({});
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.config.env, "local");
  assert.equal(r.config.remote, false);
  assert.equal(r.config.bind, "127.0.0.1");
  assert.equal(r.config.users.length, 0, "sem ENTREGAS_USERS, o arquivo continua mandando");
});

test("local sem origem declarada mantém CORS aberto", () => {
  const r = loadCloudConfig({});
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(resolveCorsOrigin("http://qualquer", r.config), "*");
});

/* ------------------------------------------------------------------ *
 * Detecção de exposição — o gatilho do rigor
 * ------------------------------------------------------------------ */

test("bind fora do loopback já conta como remoto, mesmo sem ENTREGAS_ENV", () => {
  // Um operador que só troca o bind para o celular alcançar não deveria
  // silenciosamente perder as travas.
  const issues = issuesOf({ ENTREGAS_BIND: "0.0.0.0" });
  assert.ok(issues.includes("ENTREGAS_USERS"), JSON.stringify(issues));
  assert.ok(issues.includes("ENTREGAS_ALLOWED_ORIGINS"));
});

test("ENTREGAS_ENV=cloud exige tudo mesmo com bind de loopback", () => {
  const issues = issuesOf({ ENTREGAS_ENV: "cloud", ENTREGAS_BIND: "127.0.0.1" });
  assert.ok(issues.includes("ENTREGAS_USERS"));
});

test("configuração de nuvem completa é aceita", () => {
  const r = loadCloudConfig(cloudEnv());
  assert.equal(r.ok, true, JSON.stringify(r.ok ? [] : r.issues));
  if (!r.ok) return;
  assert.equal(r.config.remote, true);
  assert.equal(r.config.users.length, 2);
  assert.deepEqual(r.config.allowedOrigins, ["https://entregas.exemplo"]);
});

/* ------------------------------------------------------------------ *
 * Falha fechada
 * ------------------------------------------------------------------ */

test("token CHANGE_ME derruba o boot remoto — não vira só um aviso", () => {
  const issues = issuesOf(
    cloudEnv({ ENTREGAS_USERS: `ops-1:operador_expedicao:Operador:CHANGE_ME_OPS_TOKEN_LONGO_O_SUFICIENTE` }),
  );
  assert.ok(issues.includes("ENTREGAS_USERS"), "placeholder passou");
});

test("token curto é recusado em exposição remota", () => {
  const issues = issuesOf(cloudEnv({ ENTREGAS_USERS: "ops-1:operador_expedicao:Operador:curto" }));
  assert.ok(issues.includes("ENTREGAS_USERS"));
});

test("CORS ausente ou * é recusado em modo remoto", () => {
  assert.ok(issuesOf(cloudEnv({ ENTREGAS_ALLOWED_ORIGINS: undefined })).includes("ENTREGAS_ALLOWED_ORIGINS"));
  assert.ok(issuesOf(cloudEnv({ ENTREGAS_ALLOWED_ORIGINS: "*" })).includes("ENTREGAS_ALLOWED_ORIGINS"));
});

test("diretório de dados é obrigatório em modo remoto", () => {
  // Sem volume declarado, o container grava em camada efêmera e some no
  // primeiro restart. É perda de dado de viagem.
  assert.ok(issuesOf(cloudEnv({ ENTREGAS_DATA_DIR: undefined })).includes("ENTREGAS_DATA_DIR"));
});

test("URL pública precisa ser https", () => {
  assert.ok(
    issuesOf(cloudEnv({ ENTREGAS_PUBLIC_URL: "http://entregas.exemplo" })).includes("ENTREGAS_PUBLIC_URL"),
  );
  const r = loadCloudConfig(cloudEnv({ ENTREGAS_PUBLIC_URL: "https://entregas.exemplo" }));
  assert.equal(r.ok, true);
});

test("porta inválida é recusada", () => {
  assert.ok(issuesOf({ ENTREGAS_UI_PORT: "0" }).includes("ENTREGAS_UI_PORT"));
  assert.ok(issuesOf({ ENTREGAS_UI_PORT: "99999" }).includes("ENTREGAS_UI_PORT"));
});

test("ENTREGAS_ENV desconhecido é recusado, não assumido", () => {
  assert.ok(issuesOf({ ENTREGAS_ENV: "producao" }).includes("ENTREGAS_ENV"));
});

/* ------------------------------------------------------------------ *
 * Parsing de usuários
 * ------------------------------------------------------------------ */

test("usuário mal formado é recusado com motivo", () => {
  assert.ok(parseUsers("so-um-campo").issues.length > 0);
  assert.ok(parseUsers("ops-1:papel_inexistente:Op:tok").issues.length > 0);
  assert.ok(parseUsers("ops-1:operador_expedicao:Op:").issues.length > 0);
});

test("label pode conter dois-pontos sem quebrar o token", () => {
  const { users, issues } = parseUsers(`ops-1:operador_expedicao:Turno: manhã:${TOK_A}`);
  assert.deepEqual(issues, []);
  assert.equal(users.length, 1);
  assert.equal(users[0].token, TOK_A, "o token é sempre o último campo");
  assert.equal(users[0].label, "Turno: manhã");
});

test("token repetido entre usuários é recusado", () => {
  // Dois papéis com a mesma credencial: a busca acharia o primeiro, e o
  // privilégio efetivo dependeria da ordem da lista.
  const { issues } = parseUsers(
    `ops-1:operador_expedicao:Op:${TOK_A};ger-1:gerente:Gerente:${TOK_A}`,
  );
  assert.ok(issues.length > 0, "token compartilhado passou");
});

test("actor_id repetido é recusado", () => {
  const { issues } = parseUsers(
    `ops-1:operador_expedicao:Op:${TOK_A};ops-1:gerente:Outro:${TOK_B}`,
  );
  assert.ok(issues.length > 0);
});

/* ------------------------------------------------------------------ *
 * CORS em runtime
 * ------------------------------------------------------------------ */

function remoteConfig(): CloudConfig {
  const r = loadCloudConfig(cloudEnv());
  if (!r.ok) throw new Error("fixture inválida");
  return r.config;
}

test("origem permitida é ecoada; qualquer outra recebe null", () => {
  const c = remoteConfig();
  assert.equal(resolveCorsOrigin("https://entregas.exemplo", c), "https://entregas.exemplo");
  assert.equal(resolveCorsOrigin("https://site-do-atacante", c), null);
  assert.equal(resolveCorsOrigin(undefined, c), null);
});

test("modo remoto nunca devolve curinga", () => {
  const c = remoteConfig();
  for (const o of ["*", "null", "https://entregas.exemplo.evil.com"]) {
    assert.notEqual(resolveCorsOrigin(o, c), "*");
  }
});

/* ------------------------------------------------------------------ *
 * Vazamento
 * ------------------------------------------------------------------ */

test("o resumo de boot não contém nenhum token", () => {
  const c = remoteConfig();
  const blob = JSON.stringify(describeConfig(c));
  for (const t of [TOK_A, TOK_B]) {
    assert.equal(blob.includes(t), false, "token no resumo de boot");
  }
  assert.equal(blob.includes("token"), false, 'nem a palavra "token" precisa aparecer');
});

test("o resumo diz o que foi carregado sem dizer o que é", () => {
  const d = describeConfig(remoteConfig());
  assert.equal(d.users_count, 2);
  assert.deepEqual(d.roles, ["motoboy_interno", "operador_expedicao"]);
  assert.equal(d.remote, true);
});

test("hash do APK aparece truncado, nunca inteiro", () => {
  const c = loadCloudConfig(cloudEnv({ ENTREGAS_APK_SHA256: "a".repeat(64) }));
  assert.ok(c.ok);
  if (!c.ok) return;
  const d = describeConfig(c.config);
  assert.equal(String(d.apk_sha256).length < 64, true);
});

/* ------------------------------------------------------------------ *
 * Execução
 * ------------------------------------------------------------------ */

console.log("=== Contrato de configuração de nuvem ===");
if (failures.length) {
  console.error(`\n=== ${failures.length} FALHA(S) ===`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`\n=== ${passed} cloud-config tests OK ===`);
