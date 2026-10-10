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
import { GRUPOS, MODULOS, UNIDADES } from "../src/product/viewmodels/modulos";
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
import { foiTimeoutNaFilaDoPoolPg } from "../src/platform/persistence/pg-pool-backpressure";
import { lerRealidadeDeEntregas } from "../src/platform/leitura/realidade-de-entregas";
import { leitorRrCancelavel, type ProtecaoRr } from "../src/platform/leitura/leitor-rr-cancelavel";
import { lerHistoricoOperacional } from "../src/platform/leitura/historico-operacional";
import { lerSaudeDaFonteTata, type AvaliadorDeSaude } from "../src/platform/leitura/saude-fonte-tata";
import { TIPOS_DA_OPERACAO_VIVA } from "../src/platform/runtime/handler-operacao-viva";
import type { LeituraDeRealidade } from "../src/product/viewmodels/entregas-vm";
import { CENAS, cena, type CenaHome } from "../src/product/demo/seed-home-demonstracao";
import {
  adaptarAuditoriaTataComanda,
  tataComandaHistoricoIndisponivel,
  type TataComandaHistoricoVM,
} from "../src/product/viewmodels/tata-comanda-vm";

const PORT = Number(process.env.PRODUCT_UI_PORT || 5290);
/**
 * Q-026 DRAFT: explicit opt-in overload protection for the GET Entregas
 * route. Not enabled in production or by default. PostgreSQL's pool bounds
 * DB connections but does not bound HTTP callers waiting and holding work.
 * Only a declared value 1/2/4 enables it; invalid values fail closed at boot.
 */
function limiteExplicitoEntregas(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 0;
  if (raw === "1" || raw === "2" || raw === "4") return Number(raw);
  throw new Error("DELIVERYOS_ENTREGAS_MAX_INFLIGHT invalido; use 1, 2, 4 ou omita");
}
const LIMITE_ENTREGAS = limiteExplicitoEntregas(process.env.DELIVERYOS_ENTREGAS_MAX_INFLIGHT);
/**
 * Q-026 SHADOW CANDIDATE. Deadline is disabled when omitted.
 * Activation requires an explicit admission limit, so timeout responses
 * cannot permit unbounded abandoned SQL requests accumulating in parallel.
 */
function prazoExplicitoEntregas(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 0;
  if (!/^[0-9]{4,5}$/.test(raw)) throw Error("DELIVERYOS_ENTREGAS_RR_DEADLINE_MS invalido");
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 1_000 || v > 15_000 || LIMITE_ENTREGAS === 0)
    throw Error("DELIVERYOS_ENTREGAS_RR_DEADLINE_MS requer 1000..15000 e admissao 1/2/4");
  return v;
}
const PRAZO_ENTREGAS_RR_MS = prazoExplicitoEntregas(process.env.DELIVERYOS_ENTREGAS_RR_DEADLINE_MS);
/**
 * A porta de REALIDADE de Entregas. Com a URL do banco da plataforma, a
 * superficie /entregas ganha um bloco lido de identity.device e de
 * platform.event_log — somente leitura, a cada requisicao, separado da
 * demonstracao. Sem a URL, o bloco declara integracao pendente. Com a URL e
 * o banco fora do ar, declara indisponivel. Nunca zero, nunca saudavel por
 * ausencia.
 *
 * So DELIVERYOS_DATABASE_URL. `DELIVERYOS_PG_URL` e a URL ADMINISTRATIVA que
 * as suites usam para criar bancos isolados; aceita-la aqui fazia a
 * superficie de leitura conectar como administrador e, nos testes, trocar a
 * demonstracao por um banco alheio (2026-10-07).
 */
const URL_PLATAFORMA = (process.env.DELIVERYOS_DATABASE_URL || "").trim();
const DIR_CONFERENCE = (process.env.CONFERENCE_BRAIN_DATA_DIR || "").trim();
/**
 * A faixa de topo diz a COMPOSICAO deste servidor, nao a de uma build
 * imaginada. Com o banco da plataforma ou o Conference Brain configurados, ha
 * tela lida do servidor (Entregas; o historico da Operacao Viva e do Copiloto)
 * ao lado da demonstracao — "AMBIENTE DE DEMONSTRACAO" passava a ser falso, e a
 * moldura desmentia a tela (2026-10-09). A faixa nao diz o MODO dos fatos
 * (real, simulado): isso a tela diz item a item.
 */
const LEITURA_DO_SERVIDOR = Boolean(URL_PLATAFORMA || DIR_CONFERENCE);
const FAIXA_DE_AMBIENTE = LEITURA_DO_SERVIDOR
  ? "DEMONSTRACAO + LEITURA DO SERVIDOR · DELIVERYOS PRODUCT SYSTEM"
  : "AMBIENTE DE DEMONSTRACAO · DELIVERYOS PRODUCT SYSTEM";
/**
 * Raiz do leitor TATÁ na CAIXA (ex.: C:\ProgramData\TataComandaReader). Sem
 * ela, /api/fontes declara a fonte NAO_CONFIGURADA — nunca saudável por
 * ausência. Só faz sentido na mesma máquina do leitor (relógio).
 */
const DIR_LEITOR_TATA = (process.env.TATA_READER_INSTALL_ROOT || "").trim();
const reqLocal = createRequire(join(process.cwd(), "package.json"));
interface StoreHistorico {
  history: (entity: string, opts?: { limit?: number }) => LeituraHistoricaDoStore;
}
const { createStore: criarStoreConference } = reqLocal(
  join(process.cwd(), "src", "conference-brain", "storage", "store"),
) as { createStore: (o: { dir: string }) => StoreHistorico };
/** O MESMO avaliador que o cutover usa na CAIXA. Não há cópia. */
const { evaluateTataReaderHealthV1: avaliarSaudeTata } = reqLocal(
  join(process.cwd(), "runtime", "tata-reader", "tata_reader_health_v1.cjs"),
) as { evaluateTataReaderHealthV1: AvaliadorDeSaude };
const RAIZ_UI = join(process.cwd(), "src", "product", "ui");
/** O MESMO arquivo de tokens que ENTREGAS usa. Nao ha copia. */
const RAIZ_SHARED = join(process.cwd(), "src", "entregas", "ui", "shared");
const TOKENS_JSON = join(process.cwd(), "docs", "figma", "DESIGN_TOKENS.json");
const TATA_COMANDA_AUDIT_JSON = join(
  process.cwd(),
  "data",
  "tata_comanda_day_truth_2026-10-05_v1.json",
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

function lerAuditoriaTataComanda(): TataComandaHistoricoVM {
  try {
    return adaptarAuditoriaTataComanda(
      JSON.parse(readFileSync(TATA_COMANDA_AUDIT_JSON, "utf8")) as unknown,
    );
  } catch (e) {
    return tataComandaHistoricoIndisponivel(
      "Auditoria TATA Comanda indisponivel: " +
        (e instanceof Error ? e.message : "Error"),
    );
  }
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
    lerAuditoriaTataComanda(),
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

async function lerRealidade(cliente: PgSqlClient | null, protecao?: ProtecaoRr): Promise<LeituraDeRealidade> {
  if (!cliente) {
    return {
      disponivel: false,
      motivo: "integracao_pendente",
      explicacao:
        "Nenhum banco da plataforma foi configurado nesta build (DELIVERYOS_DATABASE_URL). O bloco de realidade nao foi lido.",
    };
  }
  try {
    return {
      disponivel: true,
      realidade: await lerRealidadeDeEntregas(
        protecao ? leitorRrCancelavel(cliente, protecao) : cliente,
        { agora: new Date() },
      ),
    };
  } catch (e) {
    // Preserve the specific queue-overload cause only for the explicit HTTP
    // guard. A generic outage, DNS/TLS/connect failure or SQLSTATE is still
    // returned as an unavailable *data block*, not mislabeled as capacity.
    if (protecao && foiTimeoutNaFilaDoPoolPg(e)) throw e;
    // Detalhes de rede/SQL podem conter nomes internos e caminhos. A tela
    // precisa conhecer a indisponibilidade, nunca o erro bruto do driver.
    return {
      disponivel: false,
      motivo: "indisponivel",
      explicacao: "O banco da plataforma nao respondeu a esta leitura. Nao foi possivel confirmar os dados atuais; a demonstracao permanece identificada separadamente.",
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

  return historicoVM(operacao, copiloto, demo.tata_comanda);
}

export async function criarServidor(): Promise<http.Server> {
  const pronto = await calcular();
  const facade = await montarEntregasDemo();
  // Q-026 candidate: a request must never wait 5s in pg.Pool.connect()
  // when the explicit HTTP read budget can be only 1-3s.
  // pg-pool owns/removes timed-out FIFO waiters; unlike Promise.race,
  // this does NOT abandon a queued pool lease that may surface later.
  // Only applies to the opt-in guarded reader; default stays unchanged.
  const checkoutMaxMs = PRAZO_ENTREGAS_RR_MS > 0
    ? Math.min(1_000, PRAZO_ENTREGAS_RR_MS)
    : undefined;
  const clientePlataforma = URL_PLATAFORMA
    ? await createPgClient({
        url: URL_PLATAFORMA,
        max: 2,
        ...(checkoutMaxMs !== undefined ? { connectionTimeoutMillis: checkoutMaxMs } : {}),
      })
    : null;
  // Dedicated cancel connection: reader pool max=2 could be fully borrowed.
  // Only created when the candidate is explicitly enabled; never in default.
  const canceladorEntregas = PRAZO_ENTREGAS_RR_MS > 0 && URL_PLATAFORMA
    ? await createPgClient({ url: URL_PLATAFORMA, max: 1, connectionTimeoutMillis: 1_000 })
    : null;
  // Count HTTP requests admitted, not borrowed PG connections or queue size.
  // Counter belongs to THIS server instance and is released after settlement.
  let entregasEmAndamento = 0;

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
          leitura_do_servidor: LEITURA_DO_SERVIDOR,
          modo: LEITURA_DO_SERVIDOR ? "demonstracao_e_leitura_do_servidor" : "demonstracao",
          banner: FAIXA_DE_AMBIENTE,
          somente_leitura: true,
          acao_operacional: false,
        });
      }
      if (p === "/api/estados") return json(res, 200, pronto.estados);
      if (p === "/api/fontes") {
        // Saúde REAL das fontes, lida a cada requisição. Fonte não configurada
        // aparece como tal; o histórico de 05/10 continua histórico.
        const h = pronto.historico.tata_comanda;
        void lerSaudeDaFonteTata(DIR_LEITOR_TATA || null, Date.now(), avaliarSaudeTata)
          .then((tata) =>
            json(res, 200, {
              modulo: "fontes",
              fontes: [tata],
              historico_tata_comanda: h.disponivel
                ? { disponivel: true, ao_vivo: false, data_operacional: h.data_operacional, rota: "/api/historico" }
                : { disponivel: false, ao_vivo: false, motivo: h.motivo },
              limitacoes: [
                "Saude por PROGRESSO (heartbeat, ultimo lote OK, checkpoint), nunca por servico RUNNING.",
                "Idades calculadas no relogio desta maquina: so e honesto na mesma maquina do leitor.",
                "Historico de 05/10 nao e estado ao vivo e nao entra nesta saude.",
              ],
            }),
          )
          // Nunca a mensagem crua (traria caminho local): so a classe do erro.
          .catch((e: unknown) => json(res, 500, { erro: e instanceof Error ? e.name : "Error" }));
        return;
      }
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
      if (p === "/api/entregas") {
        const limitar = LIMITE_ENTREGAS > 0 && clientePlataforma !== null;
        if (limitar && entregasEmAndamento >= LIMITE_ENTREGAS) {
          res.setHeader("Retry-After", "1");
          return json(res, 503, { erro: "leitura_temporariamente_ocupada" });
        }
        if (limitar) entregasEmAndamento++;
        // SHADOW opt-in: response close is a disconnect only when it was not
        // cleanly ended. HTTP request 'close' fires on normal GET completion
        // and must NOT be used as a disconnect signal.
        const protegido = PRAZO_ENTREGAS_RR_MS > 0 && clientePlataforma && canceladorEntregas;
        const abortador = protegido ? new AbortController() : null;
        const prazoAbsolutoMs = protegido ? Date.now() + PRAZO_ENTREGAS_RR_MS : 0;
        let causa: "desconexao" | "prazo" | null = null;
        const interromper = (motivo: "desconexao" | "prazo") => {
          if (!abortador || abortador.signal.aborted) return;
          causa = motivo;
          abortador.abort();
          // Reply on deadline without releasing admission before PostgreSQL
          // actually rolls back. This is a response deadline, NOT proof of
          // total DB-connection acquisition time.
          if (motivo === "prazo" && !res.destroyed && !res.writableEnded)
            json(res, 503, { erro: "prazo_total_excedido" });
        };
        const aoFechar = () => {
          if (!res.writableEnded) interromper("desconexao");
        };
        if (abortador) res.on("close", aoFechar);
        const relogio = abortador
          ? setTimeout(() => interromper("prazo"), PRAZO_ENTREGAS_RR_MS)
          : null;
        // A demonstracao e calculada no boot; a REALIDADE e lida agora. Um
        // bloco congelado no boot mostraria o aparelho como estava quando o
        // servidor subiu, e "agora" e o que quem olha esta perguntando.
        // `unidade` filtra a leitura pelas unidades que ELA encontrou; texto
        // curto, so comparado por igualdade — nunca vai para SQL.
        const unidade = (url.searchParams.get("unidade") || "").trim().slice(0, 64) || null;
        void (async () => {
          const snap = await facade.snapshot();
          const leitura = await lerRealidade(
            clientePlataforma,
            abortador && canceladorEntregas
              ? { signal: abortador.signal, prazoAbsolutoMs, cancelador: canceladorEntregas }
              : undefined,
          );
          if (abortador && Date.now() >= prazoAbsolutoMs) interromper("prazo");
          if (abortador?.signal.aborted || res.destroyed || res.writableEnded) return;
          json(res, 200, entregasVM(snap, new Date().toISOString(), facade.getPolicyMaxStops(), leitura, { unidade }));
        })()
          .catch((e: unknown) => {
            if (res.destroyed || res.writableEnded) return;
            if (abortador && foiTimeoutNaFilaDoPoolPg(e)) {
              res.setHeader("Retry-After", "1");
              // No raw driver text and no fake 200 for admitted pool overload.
              return json(res, 503, { erro: "leitura_temporariamente_ocupada" });
            }
            json(res, 500, { erro: "leitura_indisponivel" });
          })
          .finally(() => {
            if (relogio) clearTimeout(relogio);
            if (abortador) res.removeListener("close", aoFechar);
            // Never release the admission slot merely because a 503 was sent:
            // the PG transaction must complete/rollback first.
            if (limitar) entregasEmAndamento--;
            void causa; // Only local event classification; no customer data.
          });
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
        // Falhas de roteamento nao devem publicar excecoes e caminhos locais.
        erro: "leitura_indisponivel",
      });
    }
  });
}

if (require.main === module) {
  criarServidor()
    .then((s) => {
      s.listen(PORT, "127.0.0.1", () => {
        console.log(`DeliveryOS Product System  http://127.0.0.1:${PORT}/`);
        console.log(`${FAIXA_DE_AMBIENTE.split(" · ")[0]} — somente leitura, sem acao operacional`);
      });
    })
    .catch((e: unknown) => {
      console.error("Falha ao iniciar o Product System:", e);
      process.exit(1);
    });
}
