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
import { createRequire } from "node:module";

import { entregasVM } from "../src/product/viewmodels/entregas-vm";
import { operacaoVivaVM } from "../src/product/viewmodels/operacao-viva-vm";
import { conferenceBrainVM } from "../src/product/viewmodels/conference-vm";
import { copilotoVM } from "../src/product/viewmodels/copiloto-vm";
import {
  GRUPOS,
  MODULOS,
  UNIDADES,
  type Unidade,
} from "../src/product/viewmodels/modulos";
import {
  montarCadeiaDemo,
  montarEntregasDemo,
  AGORA_DEMO,
} from "../src/product/demo/seed-demonstracao";
import { homeVM } from "../src/product/viewmodels/home-vm";
import {
  eventosHistoricosDeEnvelopes,
  historicoVM,
  type FonteHistoricoCopiloto,
  type FonteHistoricoOperacao,
  type HistoricoVM,
  type LeituraHistoricaDoStore,
} from "../src/product/viewmodels/historico-vm";
import { createPgClient, type PgSqlClient } from "../src/platform/persistence/sql-client";
import { lerRealidadeDeEntregas } from "../src/platform/leitura/realidade-de-entregas";
import { lerUnidadesOperacionais } from "../src/platform/leitura/unidades-operacionais";
import { lerHistoricoOperacional } from "../src/platform/leitura/historico-operacional";
import { TIPOS_DA_OPERACAO_VIVA } from "../src/platform/runtime/handler-operacao-viva";
import type { LeituraDeRealidade } from "../src/product/viewmodels/entregas-vm";
import { CENAS, cena, type CenaHome } from "../src/product/demo/seed-home-demonstracao";

export function productListenHost(env: NodeJS.ProcessEnv = process.env): string {
  return (env.PRODUCT_UI_HOST || "127.0.0.1").trim() || "127.0.0.1";
}

export function productPgOptions(
  env: NodeJS.ProcessEnv = process.env,
): { url: string; max: number; ssl?: boolean; host_privado?: string } | null {
  const url = (env.DELIVERYOS_DATABASE_URL || env.DELIVERYOS_PG_URL || "").trim();
  if (!url) return null;

  const rawSsl = (env.DELIVERYOS_DATABASE_SSL || "").trim().toLowerCase();
  let ssl: boolean | undefined;
  if (rawSsl === "") ssl = undefined;
  else if (rawSsl === "true") ssl = true;
  else if (rawSsl === "false") ssl = false;
  else throw new Error("DELIVERYOS_DATABASE_SSL precisa ser true ou false");

  const privado = (env.DELIVERYOS_DATABASE_PRIVATE_HOST || "").trim();
  return {
    url,
    max: 2,
    ...(ssl === undefined ? {} : { ssl }),
    ...(privado ? { host_privado: privado } : {}),
  };
}

const PORT = Number(process.env.PRODUCT_UI_PORT || 5290);
const HOST = productListenHost();
const OPCOES_PG_PRODUTO = productPgOptions();
/**
 * A porta de REALIDADE de Entregas. Com a URL do banco da plataforma, a
 * superficie /entregas ganha um bloco lido de identity.device e de
 * platform.event_log — somente leitura, a cada requisicao, separado da
 * demonstracao. Sem a URL, o bloco declara integracao pendente. Com a URL e
 * o banco fora do ar, declara indisponivel. Nunca zero, nunca saudavel por
 * ausencia.
 */
const URL_PLATAFORMA = OPCOES_PG_PRODUTO?.url ?? "";
const DIR_CONFERENCE = (process.env.CONFERENCE_BRAIN_DATA_DIR || "").trim();
const reqLocal = createRequire(join(process.cwd(), "package.json"));

function artefatoRuntime(origem: string, compilado: string): string {
  return existsSync(origem) ? origem : compilado;
}

interface StoreHistorico {
  history: (entity: string, opts?: { limit?: number }) => LeituraHistoricaDoStore;
}
const STORE_CONFERENCE = artefatoRuntime(
  join(process.cwd(), "src", "conference-brain", "storage", "store.js"),
  join(process.cwd(), "dist", "src", "conference-brain", "storage", "store.js"),
);
const { createStore: criarStoreConference } = reqLocal(STORE_CONFERENCE) as {
  createStore: (o: { dir: string }) => StoreHistorico;
};
const RAIZ_UI = artefatoRuntime(
  join(process.cwd(), "src", "product", "ui"),
  join(process.cwd(), "dist", "src", "product", "ui"),
);
/** O MESMO arquivo de tokens que ENTREGAS usa. Nao ha copia semantica. */
const RAIZ_SHARED = artefatoRuntime(
  join(process.cwd(), "src", "entregas", "ui", "shared"),
  join(process.cwd(), "dist", "src", "entregas", "ui", "shared"),
);
const TOKENS_JSON = artefatoRuntime(
  join(process.cwd(), "docs", "figma", "DESIGN_TOKENS.json"),
  join(process.cwd(), "dist", "docs", "figma", "DESIGN_TOKENS.json"),
);

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
  historico: HistoricoVM;
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

  const historico = historicoVM(
    {
      disponivel: true,
      fonte: "fixture",
      eventos: eventosHistoricosDeEnvelopes(cadeia.eventosOperacao),
      sem_modo: 0,
      corrompidas: [],
    },
    {
      disponivel: true,
      fonte: "fixture",
      leitura: cadeia.historicoCopiloto,
    },
  );

  return {
    home,
    entregas: entregasVM(snap, AGORA_DEMO, facade.getPolicyMaxStops()),
    operacaoViva: operacaoVivaVM(cadeia.projecao),
    conference: {
      real: conferenceBrainVM(cadeia.leituraBrain),
      controle_positivo: conferenceBrainVM(cadeia.leituraControlePositivo),
    },
    copiloto: copilotoVM(cadeia.resultadoCopiloto),
    historico,
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

async function lerRealidade(
  cliente: PgSqlClient | null,
  unit_id: string | null,
): Promise<LeituraDeRealidade> {
  if (!cliente) {
    return {
      disponivel: false,
      motivo: "integracao_pendente",
      explicacao:
        "Nenhum banco da plataforma foi configurado nesta build (DELIVERYOS_DATABASE_URL). O bloco de realidade nao foi lido.",
    };
  }
  if (!unit_id || !unit_id.trim()) {
    return {
      disponivel: false,
      motivo: "integracao_pendente",
      explicacao:
        "Selecione uma unidade para ler a realidade sem varrer aparelhos de outras unidades.",
    };
  }
  try {
    return {
      disponivel: true,
      realidade: await lerRealidadeDeEntregas(cliente, {
        agora: new Date(),
        unit_id: unit_id.trim(),
      }),
    };
  } catch (e) {
    return {
      disponivel: false,
      motivo: "indisponivel",
      explicacao: `O banco da plataforma nao respondeu a esta leitura: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

type FonteUnidades = "demonstracao" | "identity.unit" | "indisponivel";

interface LeituraDeUnidades {
  readonly unidades: readonly Unidade[];
  readonly fonte_unidades: FonteUnidades;
  readonly unidades_disponiveis: boolean;
}

export async function lerUnidadesParaNavegacao(
  cliente: PgSqlClient | null,
): Promise<LeituraDeUnidades> {
  if (!cliente) {
    return {
      unidades: UNIDADES,
      fonte_unidades: "demonstracao",
      unidades_disponiveis: true,
    };
  }
  try {
    const lidas = await lerUnidadesOperacionais(cliente);
    return {
      unidades: lidas.map((u) => ({
        unit_id: u.unit_id,
        nome: u.display_name,
        origem: "identity.unit" as const,
        timezone: u.timezone,
      })),
      fonte_unidades: "identity.unit",
      unidades_disponiveis: true,
    };
  } catch {
    // Banco configurado e indisponível NÃO cai para demo-unit: isso misturaria
    // fonte real falhando com fixture como se fosse a mesma realidade.
    return {
      unidades: [],
      fonte_unidades: "indisponivel",
      unidades_disponiveis: false,
    };
  }
}

async function lerHistorico(
  cliente: PgSqlClient | null,
  demo: HistoricoVM,
  unit_id: string | null,
): Promise<HistoricoVM> {
  // Sem nenhuma fonte real configurada, a superficie continua a demonstracao
  // explicitamente marcada. Se UMA fonte real foi configurada, a outra ausente
  // nao e preenchida com demo: fica ausente, para nunca misturar verdades.
  if (!cliente && !DIR_CONFERENCE) return demo;

  let operacao: FonteHistoricoOperacao;
  if (!cliente) {
    operacao = { disponivel: false, motivo: "PostgreSQL da plataforma nao configurado para historico." };
  } else if (!unit_id || !unit_id.trim()) {
    operacao = {
      disponivel: false,
      motivo: "Selecione uma unidade para ler historico real sem varrer o event log inteiro.",
    };
  } else {
    try {
      const leitura = await lerHistoricoOperacional(cliente, {
        unit_id,
        tipos: TIPOS_DA_OPERACAO_VIVA,
      });
      operacao = {
        disponivel: true,
        fonte: "platform.event_log",
        eventos: leitura.eventos,
        sem_modo: leitura.sem_modo,
        corrompidas: leitura.corrompidas,
      };
    } catch (e) {
      operacao = {
        disponivel: false,
        motivo: `Falha ao ler event log (${e instanceof Error ? e.name : "Error"}).`,
      };
    }
  }

  let copiloto: FonteHistoricoCopiloto;
  if (!DIR_CONFERENCE) {
    copiloto = { disponivel: false, motivo: "Store do Conference Brain nao configurado para historico." };
  } else {
    try {
      copiloto = {
        disponivel: true,
        fonte: "conference-brain-store",
        leitura: criarStoreConference({ dir: DIR_CONFERENCE }).history("copilot_recommendations", { limit: 200 }),
      };
    } catch (e) {
      copiloto = {
        disponivel: false,
        motivo: `Falha ao ler store do Copiloto (${e instanceof Error ? e.name : "Error"}).`,
      };
    }
  }

  return historicoVM(operacao, copiloto);
}

export async function criarServidor(): Promise<http.Server> {
  const pronto = await calcular();
  const facade = await montarEntregasDemo();
  const clientePlataforma = OPCOES_PG_PRODUTO
    ? await createPgClient(OPCOES_PG_PRODUTO)
    : null;

  const servidor = http.createServer((req, res) => {
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
        void lerUnidadesParaNavegacao(clientePlataforma)
          .then((u) =>
            json(res, 200, {
              grupos: GRUPOS,
              modulos: MODULOS,
              ...u,
            }),
          )
          .catch(() =>
            json(res, 200, {
              grupos: GRUPOS,
              modulos: MODULOS,
              unidades: [],
              fonte_unidades: "indisponivel",
              unidades_disponiveis: false,
            }),
          );
        return;
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
      if (p === "/api/entregas") {
        // A demonstracao e calculada no boot; a REALIDADE e lida agora. Um
        // bloco congelado no boot mostraria o aparelho como estava quando o
        // servidor subiu, e "agora" e o que quem olha esta perguntando.
        void (async () => {
          const snap = await facade.snapshot();
          const leitura = await lerRealidade(
            clientePlataforma,
            url.searchParams.get("unit_id"),
          );
          json(
            res,
            200,
            entregasVM(
              snap,
              new Date().toISOString(),
              facade.getPolicyMaxStops(),
              leitura,
            ),
          );
        })().catch((e: unknown) => json(res, 500, { erro: e instanceof Error ? e.message : String(e) }));
        return;
      }
      if (p === "/api/operacao-viva") {
        void lerHistorico(clientePlataforma, pronto.historico, url.searchParams.get("unit_id"))
          .then((h) => json(res, 200, { ...(pronto.operacaoViva as object), historico: h.operacao_viva }))
          .catch((e: unknown) => json(res, 500, { erro: e instanceof Error ? e.name : "Error" }));
        return;
      }
      if (p === "/api/conference-brain") return json(res, 200, pronto.conference);
      if (p === "/api/copiloto") {
        void lerHistorico(clientePlataforma, pronto.historico, url.searchParams.get("unit_id"))
          .then((h) => json(res, 200, { ...(pronto.copiloto as object), historico: h.copiloto }))
          .catch((e: unknown) => json(res, 500, { erro: e instanceof Error ? e.name : "Error" }));
        return;
      }
      if (p === "/api/historico") {
        void lerHistorico(clientePlataforma, pronto.historico, url.searchParams.get("unit_id"))
          .then((h) => json(res, 200, h))
          .catch((e: unknown) => json(res, 500, { erro: e instanceof Error ? e.name : "Error" }));
        return;
      }

      return servirEstatico(res, p);
    } catch (e) {
      return json(res, 500, {
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  });

  if (clientePlataforma) {
    servidor.once("close", () => {
      void clientePlataforma.close();
    });
  }
  return servidor;
}

if (require.main === module) {
  criarServidor()
    .then((s) => {
      s.listen(PORT, HOST, () => {
        console.log(`DeliveryOS Product System  http://${HOST}:${PORT}/`);
        console.log(
          URL_PLATAFORMA
            ? "MODO READ-ONLY — banco configurado; nenhuma rota de escrita"
            : "AMBIENTE DE DEMONSTRACAO — somente leitura, sem acao operacional",
        );
      });
    })
    .catch((e: unknown) => {
      console.error("Falha ao iniciar o Product System:", e);
      process.exit(1);
    });
}
