/**
 * Porta de operador para a Home (Copiloto) em outros aparelhos.
 *
 * O servidor de apresentação continua como é: só GET/HEAD, escutando em
 * loopback, sem saber quem pede. Quem já fala com a rede é o piloto — uma
 * porta só, atrás do proxy HTTPS, com os códigos por terminal, o limite de
 * tentativas e os papéis. Este módulo NÃO cria outra credencial nem outro
 * cadastro: recebe do piloto as duas funções que ele já tem (conferir um
 * código, com limite; dizer quem é o dono de um código agora) e faz três
 * coisas, só para o hostname próprio da Home:
 *
 *   1. sem sessão, não entrega nada da apresentação — página de entrada para
 *      navegação, 401 para API;
 *   2. com código de gerente ou líder, abre uma sessão própria em cookie
 *      `__Host-`, e a cada requisição pergunta de novo ao piloto se aquele
 *      código ainda é daquela pessoa naquele papel (revogar corta na próxima);
 *   3. repassa GET/HEAD para o loopback, sem cookie, sem Authorization.
 *
 * Não é o acesso individual por e-mail (`operator-http.ts`); é a mesma
 * autoridade que o console do piloto já usa. Sessões vivem na memória do
 * processo: reinício exige entrar de novo.
 */
import * as http from "node:http";
import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export const HOME_GATEWAY_VERSION = "home-operator-gateway@1";
export const HOME_SESSION_COOKIE = "__Host-deliveryos_home";
/** Quem pode ver a Home de fora do caixa: os mesmos papéis que leem a fonte do Copiloto no piloto. */
export const HOME_ROLES: readonly string[] = ["gerente", "lider_delivery"];

const SESSION_TTL_MS = 12 * 60 * 60_000;
const MAX_SESSIONS = 200;
const MAX_LOGIN_BODY = 2048;
const UPSTREAM_TIMEOUT_MS = 15_000;

export interface GatewayActor { actor_id: string; role: string }
export type LoginOutcome =
  | { status: "ok"; actor: GatewayActor }
  | { status: "denied" }
  | { status: "throttled" };

export interface HomeGatewayConfig {
  /** Origem HTTPS pública da Home, exata. */
  publicOrigin: string;
  /** Hostname (com porta, se houver) que seleciona a Home nesta porta do piloto. */
  host: string;
  upstreamHost: string;
  upstreamPort: number;
}

export interface HomeGatewayDeps {
  /** Confere um código com o limite de tentativas do piloto. */
  login(code: string, remote: string): LoginOutcome;
  /** Dono atual de um código, ou null. Chamado a cada requisição. */
  actorOf(code: string): GatewayActor | null;
  now?: () => number;
}

/**
 * Lê a configuração. Ausente = desligado (null). Parcial ou insegura = erro,
 * e o piloto não sobe: uma Home meio exposta é pior que nenhuma.
 */
export function loadHomeGatewayConfig(
  env: Record<string, string | undefined>,
  pilotPublicUrl: string | undefined,
): HomeGatewayConfig | null {
  const rawPublic = (env.ENTREGAS_HOME_PUBLIC_URL || "").trim();
  const rawUpstream = (env.ENTREGAS_HOME_UPSTREAM || "").trim();
  if (!rawPublic && !rawUpstream) return null;
  if (!rawPublic || !rawUpstream) throw new Error("HOME_GATEWAY_CONFIG_PARTIAL");
  let pub: URL, up: URL;
  try { pub = new URL(rawPublic); up = new URL(rawUpstream); } catch { throw new Error("HOME_GATEWAY_URL_INVALID"); }
  if (pub.protocol !== "https:" || pub.username || pub.password || pub.search || pub.hash ||
      (pub.pathname !== "/" && pub.pathname !== "")) throw new Error("HOME_GATEWAY_PUBLIC_URL_NOT_HTTPS_ORIGIN");
  if (up.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(up.hostname) || !up.port ||
      up.username || up.password || up.search || up.hash || (up.pathname !== "/" && up.pathname !== ""))
    throw new Error("HOME_GATEWAY_UPSTREAM_NOT_LOOPBACK");
  if (pilotPublicUrl) {
    let pilot: URL;
    try { pilot = new URL(pilotPublicUrl); } catch { throw new Error("HOME_GATEWAY_PILOT_URL_INVALID"); }
    // O hostname da Home seleciona a Home. Igual ao do piloto, engoliria o piloto.
    if (pilot.host.toLowerCase() === pub.host.toLowerCase()) throw new Error("HOME_GATEWAY_HOST_EQUALS_PILOT");
  }
  return {
    publicOrigin: pub.origin,
    host: pub.host.toLowerCase(),
    upstreamHost: up.hostname === "[::1]" ? "::1" : up.hostname,
    upstreamPort: Number(up.port),
  };
}

interface Session { code: string; actor_id: string; role: string; expiresAt: number }

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000",
};
const PAGE_HEADERS: Record<string, string> = {
  ...SECURITY_HEADERS,
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};
/** Cabeçalhos que a apresentação não manda adiante, e os que são do salto. */
const DROPPED_FROM_UPSTREAM = ["set-cookie", "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "upgrade", "strict-transport-security"];

function loginPage(message: string): string {
  const aviso = message ? `<p class="aviso" role="alert">${message}</p>` : "";
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>DeliveryOS · Itaim</title>
<style>
html,body{height:100%;margin:0}
body{background:#08130d;color:#e8f1ea;font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
main{width:100%;max-width:340px}
h1{font-size:18px;font-weight:600;margin:0 0 4px}
p{margin:0 0 20px;color:#9db5a4;font-size:14px}
label{display:block;font-size:13px;color:#9db5a4;margin-bottom:6px}
input{width:100%;box-sizing:border-box;padding:14px;font-size:18px;border-radius:10px;border:1px solid #2c5940;
background:#0e2016;color:#e8f1ea}
input:focus{outline:2px solid #8cc63f;outline-offset:2px}
button{margin-top:14px;width:100%;padding:14px;font-size:16px;font-weight:600;border:0;border-radius:10px;
background:#8cc63f;color:#08130d}
.aviso{color:#f0c36a;margin:14px 0 0}
</style></head><body><main>
<h1>DeliveryOS · Itaim</h1>
<p>Copiloto da operação. Entre com o seu código de acesso.</p>
<form method="post" action="/entrar" autocomplete="off">
<label for="codigo">Código de acesso</label>
<input id="codigo" name="codigo" type="password" required autofocus autocapitalize="off" autocorrect="off" spellcheck="false">
<button type="submit">Entrar</button>
</form>${aviso}
</main></body></html>`;
}

const NEGADO = "Código não reconhecido para o Copiloto.";
const MUITAS = "Muitas tentativas. Aguarde alguns minutos e tente de novo.";

export function createHomeOperatorGateway(config: HomeGatewayConfig | null, deps: HomeGatewayDeps) {
  const now = deps.now ?? (() => Date.now());
  const sessions = new Map<string, Session>();
  const hashOf = (id: string) => createHash("sha256").update(id).digest("hex");
  const cookieOn = (id: string) =>
    `${HOME_SESSION_COOKIE}=${id}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
  const cookieOff = `${HOME_SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;

  function sessionId(req: IncomingMessage): string | null {
    const raw = req.headers.cookie;
    if (typeof raw !== "string") return null;
    const found = raw.split(";").map((p) => p.trim()).filter((p) => p.startsWith(HOME_SESSION_COOKIE + "="))
      .map((p) => p.slice(HOME_SESSION_COOKIE.length + 1));
    // Dois cookies com o mesmo nome: não se escolhe um.
    if (found.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(found[0])) return null;
    return found[0];
  }

  /** A sessão vale só enquanto o piloto ainda reconhece AQUELE código para AQUELA pessoa NAQUELE papel. */
  function liveSession(req: IncomingMessage): Session | null {
    const id = sessionId(req);
    if (!id) return null;
    const key = hashOf(id);
    const s = sessions.get(key);
    if (!s) return null;
    const actor = now() < s.expiresAt ? deps.actorOf(s.code) : null;
    if (!actor || actor.actor_id !== s.actor_id || actor.role !== s.role || !HOME_ROLES.includes(actor.role)) {
      sessions.delete(key);
      return null;
    }
    return s;
  }

  const page = (res: ServerResponse, status: number, message: string, extra: Record<string, string> = {}) => {
    res.writeHead(status, { ...PAGE_HEADERS, ...extra });
    res.end(loginPage(message));
  };
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  const redirect = (res: ServerResponse, to: string, extra: Record<string, string> = {}) => {
    res.writeHead(303, { ...SECURITY_HEADERS, "Cache-Control": "no-store", Location: to, ...extra });
    res.end();
  };

  function readSmallBody(req: IncomingMessage): Promise<string | null> {
    return new Promise((resolve) => {
      let size = 0;
      const chunks: Buffer[] = [];
      let over = false;
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_LOGIN_BODY) { over = true; return; }
        chunks.push(c);
      });
      req.on("end", () => resolve(over ? null : Buffer.concat(chunks).toString("utf8")));
      req.on("error", () => resolve(null));
    });
  }

  function forward(req: IncomingMessage, res: ServerResponse, cfg: HomeGatewayConfig, path: string): Promise<void> {
    return new Promise((resolve) => {
      const isApi = path.startsWith("/api/");
      const fail = () => {
        // A apresentação caiu ou não respondeu: quem olha precisa ver "sem leitura", não tela velha.
        if (res.headersSent) { res.destroy(); return resolve(); }
        if (isApi) json(res, 502, { erro: "apresentacao_indisponivel" });
        else page(res, 502, "O Copiloto não respondeu no caixa. A leitura está indisponível agora.");
        resolve();
      };
      const up = http.request({
        host: cfg.upstreamHost, port: cfg.upstreamPort, method: req.method, path,
        // Nada do visitante segue adiante além do que a leitura precisa: nem cookie, nem credencial.
        headers: { accept: String(req.headers.accept || "*/*"), "accept-encoding": "identity",
          host: `127.0.0.1:${cfg.upstreamPort}` },
        timeout: UPSTREAM_TIMEOUT_MS,
      }, (ur) => {
        const headers: Record<string, string | string[]> = {};
        for (const [k, v] of Object.entries(ur.headers)) {
          if (v === undefined || DROPPED_FROM_UPSTREAM.includes(k.toLowerCase())) continue;
          headers[k] = v;
        }
        if (isApi || path === "/") headers["cache-control"] = "no-store";
        res.writeHead(ur.statusCode ?? 502, { ...headers, ...SECURITY_HEADERS });
        ur.pipe(res);
        ur.on("end", () => resolve());
        ur.on("error", fail);
      });
      up.on("timeout", () => up.destroy(new Error("timeout")));
      up.on("error", fail);
      res.on("close", () => { if (!res.writableEnded) up.destroy(); });
      up.end();
    });
  }

  return {
    enabled: config !== null,
    sessionCount: () => sessions.size,
    /** true = a requisição era da Home e já foi respondida aqui. */
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
      if (!config) return false;
      if (String(req.headers.host || "").toLowerCase() !== config.host) return false;
      const raw = req.url || "/";
      if (!raw.startsWith("/") || raw.startsWith("//")) { json(res, 400, { erro: "requisicao_invalida" }); return true; }
      const path = raw.split("?")[0];
      const remote = req.socket.remoteAddress || "desconhecida";
      const sameOrigin = req.headers.origin === config.publicOrigin;

      if (path === "/entrar") {
        if (req.method === "GET" || req.method === "HEAD") { page(res, 200, ""); return true; }
        if (req.method !== "POST") { json(res, 405, { erro: "metodo_nao_permitido" }); return true; }
        // Formulário de outra origem não entra em nome de ninguém.
        if (!sameOrigin) { page(res, 403, "Abra esta página pelo endereço do Copiloto e tente de novo."); return true; }
        const body = await readSmallBody(req);
        if (body === null) { page(res, 413, NEGADO); return true; }
        const code = (new URLSearchParams(body).get("codigo") || "").trim();
        const outcome: LoginOutcome = code ? deps.login(code, remote) : { status: "denied" };
        if (outcome.status === "throttled") { page(res, 429, MUITAS); return true; }
        // Código válido de outro papel recebe a MESMA resposta do código errado: a tela não confirma códigos.
        if (outcome.status !== "ok" || !HOME_ROLES.includes(outcome.actor.role)) { page(res, 401, NEGADO); return true; }
        const t = now();
        for (const [k, s] of sessions) if (t >= s.expiresAt) sessions.delete(k);
        if (sessions.size >= MAX_SESSIONS) { page(res, 503, "Muitas sessões abertas. Tente de novo em instantes."); return true; }
        const id = randomBytes(32).toString("base64url");
        sessions.set(hashOf(id), { code, actor_id: outcome.actor.actor_id, role: outcome.actor.role, expiresAt: t + SESSION_TTL_MS });
        redirect(res, "/", { "Set-Cookie": cookieOn(id) });
        return true;
      }

      if (path === "/sair") {
        if (req.method !== "POST") { json(res, 405, { erro: "metodo_nao_permitido" }); return true; }
        if (!sameOrigin) { json(res, 403, { erro: "origem_nao_permitida" }); return true; }
        const id = sessionId(req);
        if (id) sessions.delete(hashOf(id));
        redirect(res, "/entrar", { "Set-Cookie": cookieOff });
        return true;
      }

      if (!liveSession(req)) {
        if (path.startsWith("/api/")) json(res, 401, { erro: "sessao_necessaria" });
        else redirect(res, "/entrar");
        return true;
      }
      // A apresentação só lê. Com sessão ou sem, escrita não passa por aqui.
      if (req.method !== "GET" && req.method !== "HEAD") { json(res, 405, { erro: "somente_leitura" }); return true; }
      await forward(req, res, config, raw);
      return true;
    },
  };
}
