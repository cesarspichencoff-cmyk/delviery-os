/**
 * LAB · OPERAÇÃO VIVA V4 — servidor experimental
 * ============================================================================
 * SOMENTE LEITURA, e isso é estrutural: qualquer método que não seja GET ou
 * HEAD é recusado com **405** e `Allow: GET, HEAD`, ANTES de olhar o caminho.
 * Não existe rota de escrita para desativar depois — não existe rota de
 * escrita. D38 e B7 continuam valendo, e o Modo de Validação vive inteiro no
 * navegador, em IndexedDB.
 *
 * Ele é irmão de `tools/product_system_server.ts`, e não substituto: aquele
 * serve o Product System na 5290 e continua intocado. Este serve o Lab na 5291,
 * com base path próprio, e **não** é montado dentro do roteador principal —
 * `src/product/ui/app.js` está entre os caminhos protegidos pelo PF4.
 *
 * As dezoito cenas são calculadas UMA VEZ, no boot. Depois disso o processo só
 * lê do que já calculou: nenhuma requisição escreve em lugar nenhum.
 */

import http from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

import { operacaoVivaV4VM, type OperacaoVivaV4VM } from "../dominio/vm-v4";
import {
  GRUPOS_DE_CENA,
  IDS_DAS_CENAS,
  leitura,
  type CenaId,
} from "../fixtures/cenarios";
import { VERSAO_FIXTURE } from "../fixtures/base";

export const BASE = "/lab/operacao-viva-v4";
const PORT = Number(process.env.LAB_V4_PORT || 5291);

const RAIZ = process.cwd();
const RAIZ_UI = join(RAIZ, "labs", "operacao-viva-v4", "ui");
const RAIZ_VALIDACAO = join(RAIZ, "labs", "operacao-viva-v4", "validacao");
/**
 * Os tokens canônicos, servidos PELO MESMO ARQUIVO do produto — sem cópia.
 * Um token tem um lugar de nascimento, e ele é `src/product/ui/tokens/`. O Lab
 * lê de lá; ele nunca escreve lá, e `src/product/ui/` é território do PF4.
 */
const RAIZ_TOKENS = join(RAIZ, "src", "product", "ui", "tokens");

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

/** Serve um arquivo de uma raiz declarada, com guarda de travessia. */
function estatico(res: http.ServerResponse, raiz: string, relativo: string): void {
  const arquivo = normalize(join(raiz, relativo));
  const raizNorm = normalize(raiz).replace(/\\/g, "/").toLowerCase();
  const arqNorm = arquivo.replace(/\\/g, "/").toLowerCase();
  if (
    !arqNorm.startsWith(raizNorm) ||
    !existsSync(arquivo) ||
    !statSync(arquivo).isFile()
  ) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Nao encontrado: ${relativo}`);
    return;
  }
  res.writeHead(200, {
    "Content-Type": mime[extname(arquivo)] ?? "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(readFileSync(arquivo));
}

/* ------------------------------------------------------------------ *
 * Calculado no boot
 * ------------------------------------------------------------------ */

export function calcular(): Record<CenaId, OperacaoVivaV4VM> {
  return Object.fromEntries(
    IDS_DAS_CENAS.map((id) => [id, operacaoVivaV4VM(leitura(id))]),
  ) as Record<CenaId, OperacaoVivaV4VM>;
}

export function criarServidor(): http.Server {
  const cenas = calcular();

  return http.createServer((req, res) => {
    // A TRAVA. Método de escrita é recusado antes de qualquer roteamento, e a
    // resposta diz o que é permitido — recusar sem declarar `Allow` obrigaria
    // quem chama a adivinhar.
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, {
        Allow: "GET, HEAD",
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(
        JSON.stringify({
          erro: "metodo_nao_permitido",
          permitido: ["GET", "HEAD"],
          detalhe:
            "O Lab é superfície de leitura. Não existe rota de escrita: a validação humana é salva no seu próprio navegador, em IndexedDB, e nunca sai dele.",
        }),
      );
      return;
    }

    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
    const p = url.pathname;

    try {
      if (p === "/" || p === "") {
        // A query sobrevive ao redirecionamento. `?cena=` é como uma captura de
        // tela e um teste apontam para uma cena específica — perdê-la aqui faria
        // o Lab abrir sempre na primeira, em silêncio.
        res.writeHead(302, { Location: `${BASE}/${url.search}` });
        res.end();
        return;
      }

      if (p === BASE || p === `${BASE}/`) {
        return estatico(res, RAIZ_UI, "index.html");
      }

      if (p === `${BASE}/api/health`) {
        return json(res, 200, {
          ok: true,
          modulo: "LAB_OPERACAO_VIVA_V4",
          experimental: true,
          somente_leitura: true,
          metodos: ["GET", "HEAD"],
          acao_operacional: false,
          persistencia_servidor: false,
          persistencia_cliente: "indexeddb_local",
          autenticacao: false,
          sincronizacao: false,
          versao_fixture: VERSAO_FIXTURE,
          banner: "LABORATÓRIO EXPERIMENTAL · FIXTURE · NADA AQUI É OPERAÇÃO REAL",
        });
      }

      if (p === `${BASE}/api/cenas`) {
        return json(res, 200, {
          versao_fixture: VERSAO_FIXTURE,
          grupos: GRUPOS_DE_CENA,
          cenas: IDS_DAS_CENAS.map((id) => ({
            id,
            titulo: cenas[id].titulo_cenario,
            demonstra: cenas[id].demonstra,
            modo: cenas[id].modo,
          })),
        });
      }

      if (p.startsWith(`${BASE}/api/cena/`)) {
        const id = decodeURIComponent(p.slice(`${BASE}/api/cena/`.length)) as CenaId;
        const vm = cenas[id];
        if (vm === undefined) {
          return json(res, 404, {
            erro: "cena_desconhecida",
            detalhe: `Não existe cena "${id}" neste Lab.`,
            disponiveis: IDS_DAS_CENAS,
          });
        }
        return json(res, 200, vm);
      }

      if (p.startsWith(`${BASE}/ui/`)) {
        return estatico(res, RAIZ_UI, p.slice(`${BASE}/ui/`.length));
      }
      if (p.startsWith(`${BASE}/validacao/`)) {
        return estatico(res, RAIZ_VALIDACAO, p.slice(`${BASE}/validacao/`.length));
      }
      if (p.startsWith(`${BASE}/tokens/`)) {
        return estatico(res, RAIZ_TOKENS, p.slice(`${BASE}/tokens/`.length));
      }

      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Nao encontrado: ${p}`);
    } catch (e) {
      return json(res, 500, { erro: e instanceof Error ? e.message : String(e) });
    }
  });
}

if (require.main === module) {
  const s = criarServidor();
  s.listen(PORT, "127.0.0.1", () => {
    console.log(`DeliveryOS · Lab Operação Viva V4  http://127.0.0.1:${PORT}${BASE}/`);
    console.log("LABORATÓRIO EXPERIMENTAL — somente leitura, fixture, sem ação operacional");
  });
}
