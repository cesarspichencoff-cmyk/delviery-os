/** Teste de cookie e autorizacao com sujeitos FICTICIOS, sem login ou IdP real. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import {
  criarRegistroDeSessoesFicticias, COOKIE_LAB, type AtorFicticio,
} from "./lab/operator-session-simulated";
import { checarAcessoEscopado, type EscopoApiShadow } from "../../src/product/security/escopo-api-shadow";

let prova = 0;
function check(ok: boolean, nome: string): void {
  assert.ok(ok, nome);
  prova++;
  console.log("ok SESSION-" + prova + " " + nome);
}
const inicio = 1_800_000_000_000;
let agora = inicio;
const ttl = 60_000;
const pessoas = new Map<string, AtorFicticio>([
  ["fic-itaim", { subject_id: "fic-itaim", ativo: true, unidades: ["ITAIM"], revisao_autorizacao: 1 }],
  ["fic-vila", { subject_id: "fic-vila", ativo: true, unidades: ["VILA-LAB"], revisao_autorizacao: 1 }],
  ["fic-duas", { subject_id: "fic-duas", ativo: true, unidades: ["ITAIM", "VILA-LAB"], revisao_autorizacao: 1 }],
]);
const sessions = criarRegistroDeSessoesFicticias(pessoas, ttl);
const attest = (subject_id: string) => ({ modo: "LAB_SYNTHETIC_ONLY" as const, subject_id });
const issue = (subject: string, unit: string) => sessions.emitir(attest(subject), unit, agora);
const cookie = (token: string) => COOKIE_LAB + "=" + token;

check(sessions.verificar(undefined, agora).autorizado === false, "sem cookie recusa");
check(sessions.verificar(COOKIE_LAB + "=forged", agora).autorizado === false, "cookie invalido recusa");
check(sessions.verificar(cookie("ab".repeat(32)), agora).autorizado === false, "token aleatorio desconhecido recusa");
assert.throws(() => criarRegistroDeSessoesFicticias(pessoas, 10 * 60 * 1000 + 1), /TTL_INVALID/);
check(true, "TTL limitado a dez minutos");
assert.throws(() => issue("fic-itaim", "VILA-LAB"), /LAB_GRANT_REQUIRED/);
check(true, "nao emite sessao de unidade sem concessao");
assert.throws(() => issue("nao-cadastrado", "ITAIM"), /LAB_GRANT_REQUIRED/);
check(true, "nao emite sessao de sujeito desconhecido");
const ita = issue("fic-itaim", "ITAIM");
check(ita.token_apenas_para_harness.length === 64 && !ita.set_cookie.includes("LAB_SYNTHETIC_ONLY"),
  "cookie opaco forte sem claims no valor");
check(ita.set_cookie.includes("; Secure; HttpOnly; SameSite=Strict;") &&
      ita.set_cookie.includes("Path=/") && ita.set_cookie.includes("Max-Age=60"),
      "atributos de cookie de sessao protegida");
check(sessions.verificar(cookie(ita.token_apenas_para_harness), agora).autorizado === true,
  "sessao valida confirma pessoa e unidade ficticia");
check(sessions.verificar(cookie(ita.token_apenas_para_harness) + "; " + cookie(ita.token_apenas_para_harness), agora).autorizado === false,
  "cookie duplicado recusa");
const expire = issue("fic-itaim", "ITAIM");
agora += ttl;
check(sessions.verificar(cookie(expire.token_apenas_para_harness), agora).autorizado === false,
  "limite exato da expiracao recusado");
agora = inicio;
const explicitRevoked = issue("fic-itaim", "ITAIM");
sessions.revogar(explicitRevoked.token_apenas_para_harness);
check(sessions.verificar(cookie(explicitRevoked.token_apenas_para_harness), agora).autorizado === false,
  "revogacao direta imediata");
const disabled = issue("fic-vila", "VILA-LAB");
pessoas.set("fic-vila", { ...pessoas.get("fic-vila")!, ativo: false });
const denied = sessions.verificar(cookie(disabled.token_apenas_para_harness), agora);
check(!denied.autorizado && denied.status === 403, "operador desativado recusa sem nova emissao");
pessoas.set("fic-vila", { subject_id: "fic-vila", ativo: true, unidades: ["VILA-LAB"], revisao_autorizacao: 2 });
check(sessions.verificar(cookie(disabled.token_apenas_para_harness), agora).autorizado === false,
  "reativar operador nao ressuscita token anterior");
const revGrant = issue("fic-duas", "ITAIM");
pessoas.set("fic-duas", { ...pessoas.get("fic-duas")!, unidades: ["VILA-LAB"], revisao_autorizacao: 2 });
check(sessions.verificar(cookie(revGrant.token_apenas_para_harness), agora).autorizado === false,
  "retirada de unidade e revisao de vinculo negam sessao antiga");

const interServerSecret = randomBytes(32); // somente adaptador de teste na memoria
const escopo = (unidade: string): EscopoApiShadow => ({ unit_id: unidade, segredo: interServerSecret });
let leituras = 0;
const app = createServer((req, res) => {
  const reply = (status: number, body: object) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Vary": "Cookie",
    });
    res.end(JSON.stringify(body));
  };
  if (req.method !== "GET") return reply(405, { erro: "somente_leitura" });
  const auth = sessions.verificar(req.headers.cookie, agora);
  if (!auth.autorizado) return reply(auth.status, { erro: auth.motivo });
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  // Adapta sessao sintética à regra existente do servidor SHADOW,
  // sem fornecer bearer ao navegador nem alterar rota de producao.
  const decisao = checarAcessoEscopado(escopo(auth.unidade), url, "Bearer " + interServerSecret.toString("hex"));
  if (!decisao.autorizado) return reply(decisao.status, { erro: decisao.erro });
  leituras++;
  reply(200, { unit_id: auth.unidade, subject_id: auth.subject_id, source_mode: "simulated", fatos: 0 });
});
async function main() {
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const address = app.address();
  if (!address || typeof address === "string") throw Error("LAB_HTTP_UNAVAILABLE");
  const origin = "http://127.0.0.1:" + address.port;
  const request = (path: string, token?: string, headers: Record<string,string> = {}) =>
    fetch(origin + path, { headers: { ...headers, ...(token ? { Cookie: cookie(token) } : {}) } });
  try {
    let before = leituras;
    check((await request("/api/entregas")).status === 401 && leituras === before,
      "HTTP sem sessao recusa antes de leitura");
    check((await request("/api/entregas", "cd".repeat(32))).status === 401 && leituras === before,
      "HTTP com sessao falsa recusa sem leitura");
    const ok = await request("/api/entregas", ita.token_apenas_para_harness);
    const json = await ok.json() as { unit_id: string; source_mode: string };
    check(ok.status === 200 && json.unit_id === "ITAIM" && json.source_mode === "simulated",
      "sessao valida permite apenas escopo ficticio");
    check(!ok.headers.has("set-cookie") && !JSON.stringify(json).includes(ita.token_apenas_para_harness),
      "resposta nunca divulga cookie ou segredo");
    before = leituras;
    check((await request("/api/entregas?unidade=VILA-LAB", ita.token_apenas_para_harness)).status === 403 && leituras===before,
      "tentativa de unidade alheia proibida antes de leitura");
    check((await request("/api/copiloto?unit_id=ITAIM&unit_id=VILA-LAB", ita.token_apenas_para_harness)).status===403 && leituras===before,
      "parametros de unidade duplicados recusados");
    check((await request("/api/historico?unit_id=ITAIM", ita.token_apenas_para_harness)).status===403 && leituras===before,
      "rota auxiliar desconhecida recusada");
    const fake = await request("/api/entregas?unidade=VILA-LAB", ita.token_apenas_para_harness, {
      "X-User": "fic-vila", "X-Unit": "VILA-LAB", "X-Role": "gerente",
    });
    check(fake.status===403 && leituras===before, "cabecalhos auto-declarados nao elevam concessao");
    const v = issue("fic-vila", "VILA-LAB");
    const other = await request("/api/entregas", v.token_apenas_para_harness);
    check(other.status === 200 && (await other.json() as {unit_id:string}).unit_id === "VILA-LAB",
      "segunda sessao autorizada nao herda a unidade anterior");
    check((await request("/api/entregas", ita.token_apenas_para_harness)).status === 200,
      "alternar sessoes nao contamina sessao original");
    pessoas.set("fic-vila", { ...pessoas.get("fic-vila")!, ativo: false });
    before = leituras;
    check((await request("/api/entregas", v.token_apenas_para_harness)).status===403 && leituras===before,
      "revogacao de operador recusa proxima leitura");
    agora += ttl;
    check((await request("/api/entregas", ita.token_apenas_para_harness)).status===401,
      "expiracao recusa mesmo quando cookie continua guardado");
    console.log("OPERATOR_SESSION_SYNTHETIC_LAB: " + prova + "/" + prova + " PASS (NO IDP, NO REAL LOGIN, NO PRODUCTION)");
  } finally {
    app.closeAllConnections();
    await new Promise<void>((resolve) => app.close(() => resolve()));
  }
}
void main().catch((e) => { console.error(e); process.exitCode = 1; });
