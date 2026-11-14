/**
 * Porta de operador da Home — HTTP de verdade, sockets de verdade, apresentação falsa.
 *
 * Um servidor faz o papel da apresentação em loopback e conta o que recebe;
 * outro monta a porta. O "piloto" são duas funções com uma tabela de códigos
 * que os testes mudam no meio (revogação, troca de papel, limite).
 * Tudo sintético: nenhum código real, nenhum pedido real.
 */
import * as http from "node:http";
import { strict as assert } from "node:assert";
import type { AddressInfo } from "node:net";
import {
  createHomeOperatorGateway, loadHomeGatewayConfig, HOME_SESSION_COOKIE,
  type GatewayActor, type LoginOutcome,
} from "./auth/home-operator-gateway";

const HOME = "https://copiloto.itaim.test";
const PILOT = "https://piloto.itaim.test";
let ok = 0;
const pendentes: Array<[string, () => Promise<void>]> = [];
const test = (nome: string, fn: () => Promise<void>) => { pendentes.push([nome, fn]); };

interface Resposta { status: number; headers: http.IncomingHttpHeaders; body: string }
function pedir(port: number, o: { method?: string; path: string; host?: string; headers?: Record<string, string>; body?: string }): Promise<Resposta> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: o.method ?? "GET", path: o.path,
      headers: { host: o.host ?? "copiloto.itaim.test", ...(o.headers ?? {}) } }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
    if (o.body !== undefined) req.write(o.body);
    req.end();
  });
}
const form = (codigo: string) => ({ method: "POST", path: "/entrar",
  headers: { origin: HOME, "content-type": "application/x-www-form-urlencoded" }, body: "codigo=" + encodeURIComponent(codigo) });
const cookieDe = (r: Resposta) => String((r.headers["set-cookie"] || [])[0] || "").split(";")[0];

async function bancada() {
  const vistos: Array<{ method: string; url: string; headers: http.IncomingHttpHeaders }> = [];
  const apresentacao = http.createServer((req, res) => {
    vistos.push({ method: req.method || "", url: req.url || "", headers: req.headers });
    if (req.url === "/api/home") {
      res.writeHead(200, { "Content-Type": "application/json", "Set-Cookie": "vazou=1", "Cache-Control": "max-age=60" });
      return res.end(JSON.stringify({ titulo: "Leitura parcial", pedidos: 3 }));
    }
    if (req.url === "/") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<html>HOME V3.3</html>"); }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => apresentacao.listen(0, "127.0.0.1", () => r()));
  const upstreamPort = (apresentacao.address() as AddressInfo).port;

  const codigos = new Map<string, GatewayActor>([
    ["GER-CODIGO-SINTETICO", { actor_id: "ger-1", role: "gerente" }],
    ["LID-CODIGO-SINTETICO", { actor_id: "lid-1", role: "lider_delivery" }],
    ["MOTO-CODIGO-SINTETICO", { actor_id: "rid-1", role: "motoboy_interno" }],
    ["OBS-CODIGO-SINTETICO-DE-MAQUINA", { actor_id: "obs-1", role: "observador_fila" }],
  ]);
  const estado = { travado: false, logins: 0, agora: 1_800_000_000_000 };
  const porta = createHomeOperatorGateway(
    loadHomeGatewayConfig({ ENTREGAS_HOME_PUBLIC_URL: HOME, ENTREGAS_HOME_UPSTREAM: `http://127.0.0.1:${upstreamPort}` }, PILOT),
    {
      login(code): LoginOutcome {
        estado.logins += 1;
        if (estado.travado) return { status: "throttled" };
        const a = codigos.get(code);
        return a ? { status: "ok", actor: a } : { status: "denied" };
      },
      actorOf: (code) => codigos.get(code) ?? null,
      now: () => estado.agora,
    });
  const piloto = http.createServer((req, res) => {
    void porta.handle(req, res).then((tratada) => {
      if (tratada) return;
      res.writeHead(200, { "Content-Type": "text/plain" }); res.end("PILOTO");
    });
  });
  await new Promise<void>((r) => piloto.listen(0, "127.0.0.1", () => r()));
  const port = (piloto.address() as AddressInfo).port;
  const fechar = async () => {
    await new Promise<void>((r) => piloto.close(() => r()));
    if (apresentacao.listening) await new Promise<void>((r) => apresentacao.close(() => r()));
  };
  const entrar = async (codigo: string) => {
    const r = await pedir(port, form(codigo));
    assert.equal(r.status, 303, "entrada recusada: " + r.status);
    return cookieDe(r);
  };
  return { port, vistos, codigos, estado, porta, apresentacao, fechar, entrar };
}

test("configuracao: ausente desliga; parcial, sem HTTPS, destino fora do loopback ou hostname do piloto recusam", async () => {
  assert.equal(loadHomeGatewayConfig({}, PILOT), null);
  const erro = (env: Record<string, string>, pilot: string | undefined, codigo: string) =>
    assert.throws(() => loadHomeGatewayConfig(env, pilot), new RegExp(codigo));
  erro({ ENTREGAS_HOME_PUBLIC_URL: HOME }, PILOT, "HOME_GATEWAY_CONFIG_PARTIAL");
  erro({ ENTREGAS_HOME_UPSTREAM: "http://127.0.0.1:5290" }, PILOT, "HOME_GATEWAY_CONFIG_PARTIAL");
  erro({ ENTREGAS_HOME_PUBLIC_URL: "http://copiloto.itaim.test", ENTREGAS_HOME_UPSTREAM: "http://127.0.0.1:5290" }, PILOT, "NOT_HTTPS_ORIGIN");
  erro({ ENTREGAS_HOME_PUBLIC_URL: HOME + "/x", ENTREGAS_HOME_UPSTREAM: "http://127.0.0.1:5290" }, PILOT, "NOT_HTTPS_ORIGIN");
  erro({ ENTREGAS_HOME_PUBLIC_URL: HOME, ENTREGAS_HOME_UPSTREAM: "http://192.168.0.10:5290" }, PILOT, "UPSTREAM_NOT_LOOPBACK");
  erro({ ENTREGAS_HOME_PUBLIC_URL: HOME, ENTREGAS_HOME_UPSTREAM: "https://127.0.0.1:5290" }, PILOT, "UPSTREAM_NOT_LOOPBACK");
  erro({ ENTREGAS_HOME_PUBLIC_URL: HOME, ENTREGAS_HOME_UPSTREAM: "http://127.0.0.1" }, PILOT, "UPSTREAM_NOT_LOOPBACK");
  erro({ ENTREGAS_HOME_PUBLIC_URL: PILOT, ENTREGAS_HOME_UPSTREAM: "http://127.0.0.1:5290" }, PILOT, "HOST_EQUALS_PILOT");
  const desligada = createHomeOperatorGateway(null, { login: () => ({ status: "denied" }), actorOf: () => null });
  assert.equal(desligada.enabled, false);
});

test("outro hostname nao e da Home: a requisicao segue para o piloto, intocada", async () => {
  const b = await bancada();
  try {
    const r = await pedir(b.port, { path: "/api/home", host: "piloto.itaim.test" });
    assert.equal(r.body, "PILOTO");
    assert.equal(b.vistos.length, 0);
  } finally { await b.fechar(); }
});

test("sem sessao nada da apresentacao sai: navegacao vai para a entrada, API recebe 401, e a apresentacao nem e chamada", async () => {
  const b = await bancada();
  try {
    const nav = await pedir(b.port, { path: "/" });
    assert.equal(nav.status, 303);
    assert.equal(nav.headers.location, "/entrar");
    const api = await pedir(b.port, { path: "/api/home" });
    assert.equal(api.status, 401);
    assert.deepEqual(JSON.parse(api.body), { erro: "sessao_necessaria" });
    const forjado = await pedir(b.port, { path: "/api/home", headers: { cookie: HOME_SESSION_COOKIE + "=" + "A".repeat(43) } });
    assert.equal(forjado.status, 401);
    const comBearer = await pedir(b.port, { path: "/api/home", headers: { authorization: "Bearer GER-CODIGO-SINTETICO" } });
    assert.equal(comBearer.status, 401, "codigo no cabecalho abriu a Home sem sessao");
    const entrada = await pedir(b.port, { path: "/entrar" });
    assert.equal(entrada.status, 200);
    assert.match(entrada.body, /name="codigo"/);
    assert.equal(entrada.headers["cache-control"], "no-store");
    assert.equal(b.vistos.length, 0, "a apresentacao foi chamada sem sessao");
  } finally { await b.fechar(); }
});

test("entrada: codigo errado, papel sem acesso e limite de tentativas nao abrem sessao; a tela nao confirma codigo", async () => {
  const b = await bancada();
  try {
    const errado = await pedir(b.port, form("NAO-EXISTE"));
    assert.equal(errado.status, 401);
    assert.equal(errado.headers["set-cookie"], undefined);
    const motoboy = await pedir(b.port, form("MOTO-CODIGO-SINTETICO"));
    assert.equal(motoboy.status, 401);
    assert.equal(motoboy.headers["set-cookie"], undefined);
    assert.equal(motoboy.body, errado.body, "codigo valido de outro papel recebeu resposta diferente do codigo errado");
    const maquina = await pedir(b.port, form("OBS-CODIGO-SINTETICO-DE-MAQUINA"));
    assert.equal(maquina.status, 401);
    b.estado.travado = true;
    const travado = await pedir(b.port, form("GER-CODIGO-SINTETICO"));
    assert.equal(travado.status, 429);
    assert.equal(travado.headers["set-cookie"], undefined);
    b.estado.travado = false;
    const vazio = await pedir(b.port, form(""));
    assert.equal(vazio.status, 401);
    assert.equal(b.porta.sessionCount(), 0);
  } finally { await b.fechar(); }
});

test("entrada vinda de outra origem e recusada antes de conferir o codigo; corpo grande tambem", async () => {
  const b = await bancada();
  try {
    const antes = b.estado.logins;
    const fora = await pedir(b.port, { ...form("GER-CODIGO-SINTETICO"), headers: { origin: "https://outro.site.test", "content-type": "application/x-www-form-urlencoded" } });
    assert.equal(fora.status, 403);
    const semOrigem = await pedir(b.port, { ...form("GER-CODIGO-SINTETICO"), headers: { "content-type": "application/x-www-form-urlencoded" } });
    assert.equal(semOrigem.status, 403);
    const grande = await pedir(b.port, { ...form("x"), body: "codigo=" + "9".repeat(5000) });
    assert.equal(grande.status, 413);
    assert.equal(b.estado.logins, antes, "o codigo foi conferido numa entrada que devia ser recusada antes");
    assert.equal(b.porta.sessionCount(), 0);
  } finally { await b.fechar(); }
});

test("gerente entra: cookie __Host- seguro, a Home chega igual a do caixa, e nada do visitante segue para a apresentacao", async () => {
  const b = await bancada();
  try {
    const r = await pedir(b.port, form("GER-CODIGO-SINTETICO"));
    assert.equal(r.status, 303);
    assert.equal(r.headers.location, "/");
    const bruto = String((r.headers["set-cookie"] || [])[0]);
    assert.match(bruto, new RegExp("^" + HOME_SESSION_COOKIE + "=[A-Za-z0-9_-]{43}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=43200$"));
    assert.ok(!bruto.includes("GER-CODIGO"), "o codigo foi para o cookie");
    const cookie = cookieDe(r);
    const api = await pedir(b.port, { path: "/api/home", headers: { cookie, authorization: "Bearer QUALQUER", "x-forwarded-for": "1.2.3.4" } });
    assert.equal(api.status, 200);
    assert.deepEqual(JSON.parse(api.body), { titulo: "Leitura parcial", pedidos: 3 });
    assert.equal(api.headers["cache-control"], "no-store");
    assert.equal(api.headers["set-cookie"], undefined, "cookie da apresentacao vazou para o navegador");
    assert.equal(api.headers["x-frame-options"], "DENY");
    const visto = b.vistos.at(-1)!;
    assert.equal(visto.url, "/api/home");
    assert.equal(visto.headers.cookie, undefined, "o cookie de sessao seguiu para a apresentacao");
    assert.equal(visto.headers.authorization, undefined, "credencial seguiu para a apresentacao");
    assert.equal(visto.headers["x-forwarded-for"], undefined);
    const raiz = await pedir(b.port, { path: "/", headers: { cookie } });
    assert.equal(raiz.body, "<html>HOME V3.3</html>");
    const comQuery = await pedir(b.port, { path: "/api/home?x=1", headers: { cookie } });
    assert.equal(comQuery.status, 404);
    assert.equal(b.vistos.at(-1)!.url, "/api/home?x=1");
  } finally { await b.fechar(); }
});

test("revogar o codigo no piloto corta a sessao na requisicao seguinte, e ela nao volta sozinha", async () => {
  const b = await bancada();
  try {
    const cookie = await b.entrar("LID-CODIGO-SINTETICO");
    assert.equal((await pedir(b.port, { path: "/api/home", headers: { cookie } })).status, 200);
    const dono = b.codigos.get("LID-CODIGO-SINTETICO")!;
    b.codigos.delete("LID-CODIGO-SINTETICO");
    const chamadas = b.vistos.length;
    assert.equal((await pedir(b.port, { path: "/api/home", headers: { cookie } })).status, 401);
    assert.equal(b.vistos.length, chamadas, "a apresentacao foi chamada com o codigo revogado");
    b.codigos.set("LID-CODIGO-SINTETICO", dono);
    assert.equal((await pedir(b.port, { path: "/api/home", headers: { cookie } })).status, 401, "sessao revogada reviveu");
  } finally { await b.fechar(); }
});

test("codigo que muda de pessoa ou de papel derruba a sessao antiga", async () => {
  const b = await bancada();
  try {
    const cookie = await b.entrar("GER-CODIGO-SINTETICO");
    b.codigos.set("GER-CODIGO-SINTETICO", { actor_id: "ger-1", role: "motoboy_interno" });
    assert.equal((await pedir(b.port, { path: "/api/home", headers: { cookie } })).status, 401);
    b.codigos.set("GER-CODIGO-SINTETICO", { actor_id: "ger-1", role: "gerente" });
    const outro = await b.entrar("GER-CODIGO-SINTETICO");
    b.codigos.set("GER-CODIGO-SINTETICO", { actor_id: "outra-pessoa", role: "gerente" });
    assert.equal((await pedir(b.port, { path: "/api/home", headers: { cookie: outro } })).status, 401);
  } finally { await b.fechar(); }
});

test("a sessao vence em doze horas", async () => {
  const b = await bancada();
  try {
    const cookie = await b.entrar("GER-CODIGO-SINTETICO");
    b.estado.agora += 12 * 60 * 60_000 - 1;
    assert.equal((await pedir(b.port, { path: "/api/home", headers: { cookie } })).status, 200);
    b.estado.agora += 1;
    assert.equal((await pedir(b.port, { path: "/api/home", headers: { cookie } })).status, 401);
    assert.equal(b.porta.sessionCount(), 0);
  } finally { await b.fechar(); }
});

test("com sessao, so leitura: POST, PUT e DELETE nao chegam a apresentacao", async () => {
  const b = await bancada();
  try {
    const cookie = await b.entrar("GER-CODIGO-SINTETICO");
    const antes = b.vistos.length;
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const r = await pedir(b.port, { method, path: "/api/home", headers: { cookie, origin: HOME } });
      assert.equal(r.status, 405, method);
    }
    assert.equal(b.vistos.length, antes);
  } finally { await b.fechar(); }
});

test("dois cookies de sessao na mesma requisicao: nenhum e escolhido", async () => {
  const b = await bancada();
  try {
    const cookie = await b.entrar("GER-CODIGO-SINTETICO");
    const r = await pedir(b.port, { path: "/api/home", headers: { cookie: cookie + "; " + HOME_SESSION_COOKIE + "=" + "B".repeat(43) } });
    assert.equal(r.status, 401);
  } finally { await b.fechar(); }
});

test("apresentacao fora do ar: a Home de fora responde 502 dizendo que a leitura esta indisponivel, e a sessao continua", async () => {
  const b = await bancada();
  try {
    const cookie = await b.entrar("GER-CODIGO-SINTETICO");
    await new Promise<void>((r) => b.apresentacao.close(() => r()));
    const api = await pedir(b.port, { path: "/api/home", headers: { cookie } });
    assert.equal(api.status, 502);
    assert.deepEqual(JSON.parse(api.body), { erro: "apresentacao_indisponivel" });
    const raiz = await pedir(b.port, { path: "/", headers: { cookie } });
    assert.equal(raiz.status, 502);
    assert.match(raiz.body, /indispon/);
    assert.equal(b.porta.sessionCount(), 1);
  } finally { await b.fechar(); }
});

test("dois aparelhos, duas pessoas: a mesma operacao para os dois, e sair de um nao derruba o outro", async () => {
  const b = await bancada();
  try {
    const celular = await b.entrar("GER-CODIGO-SINTETICO");
    const tablet = await b.entrar("LID-CODIGO-SINTETICO");
    assert.notEqual(celular, tablet);
    const a = await pedir(b.port, { path: "/api/home", headers: { cookie: celular } });
    const c = await pedir(b.port, { path: "/api/home", headers: { cookie: tablet } });
    assert.equal(a.body, c.body);
    const semOrigem = await pedir(b.port, { method: "POST", path: "/sair", headers: { cookie: celular } });
    assert.equal(semOrigem.status, 403, "saida forjada de outra origem derrubou a sessao");
    const sair = await pedir(b.port, { method: "POST", path: "/sair", headers: { cookie: celular, origin: HOME } });
    assert.equal(sair.status, 303);
    assert.match(String((sair.headers["set-cookie"] || [])[0]), /Max-Age=0/);
    assert.equal((await pedir(b.port, { path: "/api/home", headers: { cookie: celular } })).status, 401);
    assert.equal((await pedir(b.port, { path: "/api/home", headers: { cookie: tablet } })).status, 200);
  } finally { await b.fechar(); }
});

test("alvo absoluto ou com barra dupla e recusado, sem chegar a apresentacao", async () => {
  const b = await bancada();
  try {
    const cookie = await b.entrar("GER-CODIGO-SINTETICO");
    const antes = b.vistos.length;
    const r = await pedir(b.port, { path: "//evil.test/api/home", headers: { cookie } });
    assert.equal(r.status, 400);
    assert.equal(b.vistos.length, antes);
  } finally { await b.fechar(); }
});

(async () => {
  for (const [nome, fn] of pendentes) {
    try { await fn(); ok += 1; console.log("PASS " + nome); }
    catch (e) { console.error("FAIL " + nome + "\n" + ((e as Error).stack || e)); process.exit(1); }
  }
  console.log(`HOME_OPERATOR_GATEWAY_PASS ${ok}/${pendentes.length} SYNTHETIC_ONLY`);
})();
