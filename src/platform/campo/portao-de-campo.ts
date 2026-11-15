/**
 * Portão de campo — a única porta que os celulares dos motoboys alcançam (D101).
 *
 * O proxy HTTPS público aponta para UM alvo: este processo, que escuta na
 * interface privada do caixa. Ele não sabe quem é ninguém (a autenticação é do
 * piloto e do crítico); ele só decide o que pode passar:
 *
 *   - uma lista FECHADA de método + caminho, cada um com o seu destino
 *     (piloto ou crítico) e o seu teto de corpo; o resto é 404 sem tocar em
 *     destino nenhum — console, Copiloto, backups, administração, leitura de
 *     despacho, saúde interna: nada disso existe do lado de fora;
 *   - só os cabeçalhos que o app usa seguem; cookie nunca;
 *   - para o piloto vai a marca `X-DeliveryOS-Field: 1` (a do cliente é
 *     descartada), e o piloto passa a aceitar ali só papel de motoboy;
 *   - nenhum segredo fica aqui: o segredo do aparelho atravessa, como em
 *     qualquer proxy, sem ser lido.
 *
 * Não termina TLS: o proxy público termina; daqui ao caixa é a rede privada.
 */
import * as http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

export const PORTAO_DE_CAMPO_VERSION = "portao-de-campo@1";
export const MARCA_DE_CAMPO = "x-deliveryos-field";

type Destino = "piloto" | "critico";
interface Rota { metodos: readonly string[]; caminho: string; prefixo?: boolean; destino: Destino; tetoBytes: number; query?: boolean }

const KB = 1024;
/** A lista fechada. Mudar isto muda a superfície pública: exige teste e revisão. */
export const ROTAS_DE_CAMPO: readonly Rota[] = [
  // Página do motoboy e os estáticos que ela carrega.
  { metodos: ["GET", "HEAD"], caminho: "/rider-mobile/", prefixo: true, destino: "piloto", tetoBytes: 0 },
  { metodos: ["GET", "HEAD"], caminho: "/shared/tokens.css", destino: "piloto", tetoBytes: 0 },
  { metodos: ["GET", "HEAD"], caminho: "/shared/access-gate.css", destino: "piloto", tetoBytes: 0 },
  { metodos: ["GET", "HEAD"], caminho: "/shared/client.js", destino: "piloto", tetoBytes: 0 },
  { metodos: ["GET", "HEAD"], caminho: "/shared/access-gate.js", destino: "piloto", tetoBytes: 0 },
  // API do piloto que o motoboy usa (página e aplicativo).
  { metodos: ["GET", "POST"], caminho: "/api/session", destino: "piloto", tetoBytes: 4 * KB },
  { metodos: ["GET"], caminho: "/api/snapshot", destino: "piloto", tetoBytes: 0 },
  { metodos: ["GET"], caminho: "/api/policies", destino: "piloto", tetoBytes: 0 },
  { metodos: ["GET"], caminho: "/api/term", destino: "piloto", tetoBytes: 0, query: true },
  { metodos: ["POST"], caminho: "/api/term/acknowledge", destino: "piloto", tetoBytes: 16 * KB },
  // Ações do motoboy quando a fila do aparelho não está anunciada. No campo o piloto só aceita
  // papel de motoboy, e o domínio exige que a viagem seja dele (assertOwnTrip).
  { metodos: ["POST"], caminho: "/api/command", destino: "piloto", tetoBytes: 64 * KB },
  { metodos: ["POST"], caminho: "/api/events/batch", destino: "piloto", tetoBytes: 1024 * KB },
  { metodos: ["GET"], caminho: "/api/device/capture-state", destino: "piloto", tetoBytes: 0, query: true },
  { metodos: ["POST"], caminho: "/api/device/trip-grants", destino: "piloto", tetoBytes: 8 * KB },
  // Plataforma: identidade do aparelho, delegação, fila e GPS.
  { metodos: ["POST"], caminho: "/api/device/session", destino: "critico", tetoBytes: 16 * KB },
  { metodos: ["POST"], caminho: "/api/device/pilot-delegation", destino: "critico", tetoBytes: 4 * KB },
  { metodos: ["POST"], caminho: "/api/device/queue-depth", destino: "critico", tetoBytes: 4 * KB },
  { metodos: ["POST"], caminho: "/api/gps/batch", destino: "critico", tetoBytes: 2000 * KB },
];

/** Cabeçalhos do cliente que seguem. Tudo o mais fica (cookie, encaminhamento, marcas). */
const DO_CLIENTE = ["authorization", "content-type", "accept", "accept-language", "if-none-match", "if-modified-since"];
/** Cabeçalhos da resposta que não seguem. */
const NAO_VOLTAM = ["set-cookie", "connection", "keep-alive", "transfer-encoding", "proxy-authenticate", "upgrade", "trailer", "te"];

export interface ConfigDoPortao {
  piloto: { host: string; port: number };
  critico: { host: string; port: number };
  timeoutMs?: number;
}

export function rotaDe(metodo: string, alvo: string): Rota | null {
  if (!alvo.startsWith("/") || alvo.startsWith("//") || alvo.includes("\\")) return null;
  const [caminho, query] = splitOnce(alvo, "?");
  let decodificado: string;
  try { decodificado = decodeURIComponent(caminho); } catch { return null; }
  // Nada de truque de caminho: o que chega ao destino é exatamente o que foi conferido aqui.
  if (decodificado !== caminho || caminho.includes("/../") || caminho.endsWith("/..") || caminho.includes("/./") || caminho.includes("%")) return null;
  for (const r of ROTAS_DE_CAMPO) {
    const casa = r.prefixo ? caminho.startsWith(r.caminho) : caminho === r.caminho;
    if (!casa || !r.metodos.includes(metodo)) continue;
    if (query !== null && !r.query && !r.prefixo) return null;
    return r;
  }
  return null;
}

function splitOnce(s: string, sep: string): [string, string | null] {
  const i = s.indexOf(sep);
  return i < 0 ? [s, null] : [s.slice(0, i), s.slice(i + 1)];
}

export function criarPortaoDeCampo(cfg: ConfigDoPortao) {
  const timeoutMs = cfg.timeoutMs ?? 30_000;
  const negar = (res: ServerResponse, status: number, codigo: string) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(JSON.stringify({ ok: false, code: codigo }));
  };
  return (req: IncomingMessage, res: ServerResponse): void => {
    const metodo = req.method || "";
    const rota = rotaDe(metodo, req.url || "");
    if (!rota) return negar(res, 404, "fora_do_campo");
    const declarado = Number(req.headers["content-length"] ?? "0");
    if (rota.tetoBytes === 0 && (req.headers["transfer-encoding"] || (Number.isFinite(declarado) && declarado > 0)))
      return negar(res, 413, "corpo_nao_permitido");
    if (Number.isFinite(declarado) && declarado > rota.tetoBytes && rota.tetoBytes > 0) return negar(res, 413, "corpo_grande_demais");
    const destino = rota.destino === "piloto" ? cfg.piloto : cfg.critico;
    const headers: Record<string, string> = {};
    for (const h of DO_CLIENTE) {
      const v = req.headers[h];
      if (typeof v === "string") headers[h] = v;
    }
    if (rota.destino === "piloto") headers[MARCA_DE_CAMPO] = "1";
    headers.host = `${destino.host}:${destino.port}`;
    let enviados = 0;
    let encerrado = false;
    const up = http.request({ host: destino.host, port: destino.port, method: metodo, path: req.url, headers, timeout: timeoutMs }, (ur) => {
      const volta: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(ur.headers)) if (v !== undefined && !NAO_VOLTAM.includes(k.toLowerCase())) volta[k] = v;
      res.writeHead(ur.statusCode ?? 502, volta);
      ur.pipe(res);
    });
    const falhar = () => {
      if (encerrado) return;
      encerrado = true;
      if (!res.headersSent) negar(res, 502, "destino_indisponivel");
      else res.destroy();
    };
    up.on("timeout", () => up.destroy(new Error("timeout")));
    up.on("error", falhar);
    req.on("data", (c: Buffer) => {
      enviados += c.length;
      if (enviados > rota.tetoBytes) {
        encerrado = true;
        up.destroy();
        if (!res.headersSent) negar(res, 413, "corpo_grande_demais");
        req.destroy();
        return;
      }
      up.write(c);
    });
    req.on("end", () => { if (!encerrado) up.end(); });
    req.on("error", () => up.destroy());
  };
}

/** Lê a configuração do ambiente. Destinos só em loopback ou na rede privada declarada. */
export function configDoAmbiente(env: NodeJS.ProcessEnv): ConfigDoPortao & { escuta: { host: string; port: number } } {
  const alvo = (nome: string) => {
    const raw = (env[nome] || "").trim();
    let u: URL;
    try { u = new URL(raw); } catch { throw new Error(`${nome} inválido`); }
    if (u.protocol !== "http:" || !u.port || u.pathname !== "/" || u.search || u.username || u.password) throw new Error(`${nome} precisa ser http://host:porta/`);
    return { host: u.hostname, port: Number(u.port) };
  };
  const escuta = alvo("DELIVERYOS_FIELD_LISTEN");
  if (escuta.host === "0.0.0.0" || escuta.host === "::" || escuta.host === "[::]") throw new Error("DELIVERYOS_FIELD_LISTEN não pode escutar em todas as interfaces");
  return { escuta, piloto: alvo("DELIVERYOS_FIELD_PILOT"), critico: alvo("DELIVERYOS_FIELD_CRITICAL") };
}
