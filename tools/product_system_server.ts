/**
 * DeliveryOS — Product System · servidor de APRESENTACAO
 * ============================================================================
 * SOMENTE LEITURA, e isso e estrutural: este servidor recusa qualquer metodo
 * que nao seja GET ou HEAD, antes de olhar o caminho. Nao existe rota de escrita
 * para desativar depois — nao existe rota de escrita.
 *
 * Ele nao faz parte do runtime critico. `critical.ts` e `async-runtime.ts` nao o
 * conhecem, e ele nao os chama.
 *
 * A cadeia de demonstracao e montada UMA VEZ, no boot, num diretorio temporario.
 * Depois disso o processo so le do que ja calculou — nenhuma requisicao HTTP
 * escreve em lugar nenhum.
 * ==========================================================================*/

import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";

import { entregasVM } from "../src/product/viewmodels/entregas-vm";
import { operacaoVivaVM } from "../src/product/viewmodels/operacao-viva-vm";
import { conferenceBrainVM } from "../src/product/viewmodels/conference-vm";
import { copilotoVM } from "../src/product/viewmodels/copiloto-vm";
import { GRUPOS, MODULOS, UNIDADES } from "../src/product/viewmodels/modulos";
import {
  montarCadeiaDemo,
  montarEntregasDemo,
  AGORA_DEMO,
} from "../src/product/demo/seed-demonstracao";
import { homeVM } from "../src/product/viewmodels/home-vm";
import { CENAS, cena, type CenaHome } from "../src/product/demo/seed-home-demonstracao";

const PORT = Number(process.env.PRODUCT_UI_PORT || 5290);
const RAIZ_UI = join(process.cwd(), "src", "product", "ui");
/** O MESMO arquivo de tokens que ENTREGAS usa. Nao ha copia. */
const RAIZ_SHARED = join(process.cwd(), "src", "entregas", "ui", "shared");
const TOKENS_JSON = join(process.cwd(), "docs", "figma", "DESIGN_TOKENS.json");

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

/* ------------------------------------------------------------------ *
 * Estado calculado no boot
 * ------------------------------------------------------------------ */

interface Pronto {
  home: Record<CenaHome, unknown>;
  entregas: unknown;
  operacaoViva: unknown;
  conference: unknown;
  copiloto: unknown;
  estados: unknown;
}

async function calcular(): Promise<Pronto> {
  const cadeia = await montarCadeiaDemo();

  const facade = await montarEntregasDemo();
  const snap = await facade.snapshot();

  const tokens = JSON.parse(readFileSync(TOKENS_JSON, "utf8")) as {
    estados: Record<string, unknown>;
  };
  const { _leia_primeiro, _eixos, ...estados } = tokens.estados as Record<
    string,
    unknown
  >;

  // As quatro cenas da home sao calculadas no boot, como todo o resto. Cada uma
  // carrega `procedencia: "simulado"` desde a leitura — a marcacao de
  // demonstracao nao e acrescentada aqui, ela ATRAVESSA o contrato.
  const home = Object.fromEntries(
    (Object.keys(CENAS) as CenaHome[]).map((c) => [c, homeVM(cena(c))]),
  ) as Record<CenaHome, unknown>;

  return {
    home,
    entregas: entregasVM(snap, AGORA_DEMO, facade.getPolicyMaxStops()),
    operacaoViva: operacaoVivaVM(cadeia.projecao),
    conference: {
      real: conferenceBrainVM(cadeia.leituraBrain),
      controle_positivo: conferenceBrainVM(cadeia.leituraControlePositivo),
    },
    copiloto: copilotoVM(cadeia.resultadoCopiloto),
    estados: { estados, eixos: _eixos },
  };
}

/* ------------------------------------------------------------------ *
 * Estatico
 * ------------------------------------------------------------------ */

function servirEstatico(res: http.ServerResponse, caminho: string): void {
  let raiz = RAIZ_UI;
  let rel = caminho.replace(/^\//, "");

  if (caminho === "/" || caminho === "") {
    rel = "index.html";
  } else if (caminho.startsWith("/shared/")) {
    raiz = RAIZ_SHARED;
    rel = caminho.replace(/^\/shared\//, "");
  }

  const arquivo = normalize(join(raiz, rel));
  // Travessia de diretorio: o caminho resolvido tem que continuar dentro da raiz.
  const raizNorm = normalize(raiz).replace(/\\/g, "/").toLowerCase();
  const arqNorm = arquivo.replace(/\\/g, "/").toLowerCase();
  if (!arqNorm.startsWith(raizNorm) || !existsSync(arquivo) || !statSync(arquivo).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Nao encontrado: ${caminho}`);
    return;
  }
  res.writeHead(200, {
    "Content-Type": mime[extname(arquivo)] || "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(readFileSync(arquivo));
}

/* ------------------------------------------------------------------ *
 * Servidor
 * ------------------------------------------------------------------ */

export async function criarServidor(): Promise<http.Server> {
  const pronto = await calcular();

  return http.createServer((req, res) => {
    // A trava: metodo de escrita e recusado antes de qualquer roteamento.
    if (req.method !== "GET" && req.method !== "HEAD") {
      return json(res, 405, {
        erro: "metodo_nao_permitido",
        detalhe:
          "O Product System e uma superficie de leitura. Ele nao aceita metodo de escrita porque nao existe acao operacional para executar.",
      });
    }

    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    const p = url.pathname;

    try {
      if (p === "/api/health") {
        return json(res, 200, {
          ok: true,
          modulo: "PRODUCT_SYSTEM",
          demo: true,
          modo: "demonstracao",
          banner: "AMBIENTE DE DEMONSTRACAO · DELIVERYOS PRODUCT SYSTEM",
          somente_leitura: true,
          acao_operacional: false,
        });
      }
      if (p === "/api/estados") return json(res, 200, pronto.estados);
      if (p === "/api/navegacao") {
        return json(res, 200, {
          grupos: GRUPOS,
          modulos: MODULOS,
          unidades: UNIDADES,
        });
      }
      if (p === "/api/home") {
        // `cena` so existe porque esta build e de DEMONSTRACAO. Numa build com
        // fonte real haveria uma leitura, nao um seletor de cena.
        const pedida = url.searchParams.get("cena") as CenaHome | null;
        const escolhida: CenaHome =
          pedida !== null && pedida in CENAS ? pedida : "ambiente";
        return json(res, 200, {
          ...(pronto.home[escolhida] as object),
          cena: escolhida,
          cenas_disponiveis: Object.keys(CENAS),
        });
      }
      if (p === "/api/entregas") return json(res, 200, pronto.entregas);
      if (p === "/api/operacao-viva") return json(res, 200, pronto.operacaoViva);
      if (p === "/api/conference-brain") return json(res, 200, pronto.conference);
      if (p === "/api/copiloto") return json(res, 200, pronto.copiloto);

      return servirEstatico(res, p);
    } catch (e) {
      return json(res, 500, {
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  });
}

if (require.main === module) {
  criarServidor()
    .then((s) => {
      s.listen(PORT, "127.0.0.1", () => {
        console.log(`DeliveryOS Product System  http://127.0.0.1:${PORT}/`);
        console.log("AMBIENTE DE DEMONSTRACAO — somente leitura, sem acao operacional");
      });
    })
    .catch((e: unknown) => {
      console.error("Falha ao iniciar o Product System:", e);
      process.exit(1);
    });
}
