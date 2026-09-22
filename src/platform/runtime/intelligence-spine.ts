/**
 * A ESPINHA DE INTELIGÊNCIA — as setas depois da Operação Viva, no runtime.
 *
 * Antes desta unidade a cadeia
 *
 *   Operação Viva → adapter Conference → observer → conclusões
 *                 → bridge Copiloto → recomendação Shadow
 *
 * existia inteira e provada, mas só em teste: nenhum dos cinco módulos era
 * alcançável a partir de um binário real (medido em `run-topology-audit-tests`).
 * Aqui eles são MONTADOS. Nenhum é reescrito, nenhum ganha um irmão: não há
 * Copiloto novo, motor novo, event bus novo, tabela, migration nem fila.
 *
 * ## Por que nada disto pode derrubar a rua
 *
 * A espinha é NÃO CRÍTICA. Ela roda DEPOIS do tick operacional, fora dos
 * handlers da outbox, e `executar()` **nunca lança** — o retorno é o próprio
 * relato da falha. Isso não é zelo defensivo genérico: se uma exceção daqui
 * subisse até o laço do worker, uma conclusão malformada marcaria como não
 * processado um fato operacional que já foi processado, e o erro secundário
 * mandaria mensagem boa para retry e dead-letter. A inteligência pode estar
 * inteira errada sem que a ingestão, a persistência ou o `/ready` do crítico
 * saibam disso.
 *
 * ## Onde a falha aparece
 *
 * Em `estado()`, e em nenhum outro lugar. Falha silenciosa e falha que
 * contamina o vizinho são o mesmo defeito visto de dois lados; o que sobra é
 * falha visível e contida. Da exceção só atravessa a CLASSE do erro — mesma
 * disciplina de `operacao-viva-adapter.js`, porque a mensagem pode carregar
 * qualquer texto que a fonte tenha tocado.
 *
 * ## O que ela NÃO decide
 *
 * Nada sobre pedido que a projeção não sustente. A Operação Viva trabalha com
 * VIAGEM, o Conference Brain com PEDIDO, e a projeção de hoje não carrega
 * identidade legítima para atravessar essa fronteira. Quem decide isso é o
 * adapter, que já recusa o que não pode afirmar; esta unidade não acrescenta
 * uma segunda opinião — por isso ela não inventa `external_id`, não fabrica
 * ordem e não preenche ausência. Ausência continua ausência.
 *
 * Q-003 continua aberta: nada aqui liga `perfil-delivery/decisao.js` ao
 * Copiloto, escolhe dono da atenção ou dá Foco canônico a esta cadeia. O que
 * sai daqui é sombra — proposta registrada, nunca ação.
 */

import { createRequire } from "node:module";
import { join } from "node:path";

import type { SourceMode } from "../contracts/event-catalog";
import type { PonteDaOperacaoViva } from "./handler-operacao-viva";
import {
  recomendarDeConclusoes,
  type Conclusao,
  type RecomendacaoShadow,
} from "../copiloto/conference-bridge";

export const SPINE_VERSION = "intelligence-spine@1.0.0";

/**
 * Os módulos do Conference Brain são CommonJS e o `tsc` não os enxerga: a
 * imagem de runtime copia só `dist/`, `node_modules/` e `package.json` —
 * `src/` não entra (`deploy/Dockerfile.platform`). Resolver por
 * `process.cwd()` funcionaria aqui e falharia no container, que é a pior
 * combinação possível.
 *
 * Por isso a resolução é RELATIVA a este arquivo: em desenvolvimento aponta
 * para `src/conference-brain/`, compilado aponta para
 * `dist/src/conference-brain/`. Quem garante que o segundo exista é
 * `tools/copiar_conference_brain.js`, no build — mesmo papel que
 * `copiar_migrations.js` cumpre para os `.sql`.
 */
const req = createRequire(join(__dirname, "intelligence-spine.js"));

interface ModuloAdapter {
  criarFetchOrders(o: Record<string, unknown>): () => Promise<unknown>;
  runIdDe(unitId: string, sourceMode: string): string;
}
interface ModuloStore {
  createStore(o: Record<string, unknown>): unknown;
}
interface ModuloObserver {
  createLiveObserver(o: Record<string, unknown>): { runCycle(): Promise<unknown> };
}
interface ModuloConclusoes {
  extrairConclusoes(o: Record<string, unknown>): {
    conclusoes: Conclusao[];
    recusadas: unknown[];
  };
}

/** Estado observável da espinha. É aqui — e só aqui — que a falha dela aparece. */
export interface EstadoDaEspinha {
  habilitada: boolean;
  /** Passadas concluídas sem exceção. */
  passadas: number;
  /** Passadas que terminaram em exceção contida. */
  falhas: number;
  ultima_em: string | null;
  /** Só a CLASSE do erro. Mensagem pode carregar dado de operação. */
  ultimo_erro: { classe: string; escopo: string; em: string } | null;
  escopos_vistos: number;
  /** Tudo que a extração devolveu, histórico incluído. */
  conclusoes_lidas: number;
  /**
   * As que foram levadas ao Copiloto. Menor que `conclusoes_lidas` quando há
   * ciclos anteriores — e a diferença aparece aqui de propósito: corte que não
   * dá para contar é corte silencioso.
   */
  conclusoes_vigentes: number;
  recusas: number;
  recomendacoes_ativas: number;
  /**
   * Recomendações de escopo `pedido`. Com a projeção de hoje isto é ZERO, e
   * é a medida de que viagem não virou pedido inferido.
   */
  recomendacoes_de_pedido: number;
  /**
   * Passadas que venceram o prazo. O trabalho abandonado pode continuar
   * rodando em segundo plano — o que NÃO pode é segurar o laço do worker.
   */
  prazos_vencidos: number;
  /** Passadas puladas porque a anterior ainda não voltou. */
  sobreposicoes: number;
}

export interface OpcoesDaEspinha {
  /** A Operação Viva JÁ montada. Não se cria uma segunda projeção. */
  ponte: PonteDaOperacaoViva;
  /** Relógio injetável: o replay precisa de tempo como dado, não como ambiente. */
  agora?: () => Date;
  /**
   * Prazo de uma passada, em ms. Padrão 30 s.
   *
   * MEDIDO antes de existir: sem prazo, um `runCycle()` que nunca resolve
   * — não que lança, que TRAVA — fazia `executar()` não voltar, e como o laço
   * do worker faz `await` nele, a outbox parava de ser consumida. Contenção de
   * exceção não é contenção de travamento, e a invariante fala das duas.
   */
  prazo_ms?: number;
  /** Trocável no teste para provar isolamento de falha sem forjar dado ruim. */
  modulos?: {
    adapter?: ModuloAdapter;
    store?: ModuloStore;
    observer?: ModuloObserver;
    conclusoes?: ModuloConclusoes;
  };
}

export interface EspinhaDeInteligencia {
  /** Uma passada. NUNCA lança. */
  executar(): Promise<EstadoDaEspinha>;
  estado(): EstadoDaEspinha;
}

interface CadeiaDoEscopo {
  store: unknown;
  observer: { runCycle(): Promise<unknown> };
  /**
   * Recomendações da passada anterior. Governam ressurreição: uma decisão
   * terminal não volta porque a mesma conclusão foi lida de novo.
   */
  anteriores: readonly RecomendacaoShadow[];
}

export function montarEspinhaDeInteligencia(o: OpcoesDaEspinha): EspinhaDeInteligencia {
  const relogio = o.agora ?? ((): Date => new Date());
  const prazoMs = o.prazo_ms ?? 30_000;

  /** A passada que venceu o prazo e ainda não voltou. Ver `executar`. */
  let emVoo: Promise<void> | null = null;

  /**
   * Corre a passada contra o prazo. Devolve `true` se ela venceu.
   *
   * O timer NÃO é `unref`: com `unref`, um laço de eventos sem mais nada
   * pendente faz o processo sair ANTES de o prazo disparar, e o prazo vira
   * decoração — foi o que aconteceu na primeira versão, e a suíte saiu com
   * código 0 sem imprimir resultado nenhum. Em vez disso, o timer é LIMPO
   * assim que a passada volta, e aí ele nunca atrasa um encerramento.
   */
  function dentroDoPrazo(p: Promise<unknown>, ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), ms);
      const fim = (): void => {
        clearTimeout(t);
        resolve(true);
      };
      void p.then(fim, fim);
    });
  }

  // Carregamento preguiçoso: com a flag desligada nada disto é exigido do
  // disco, e a espinha off não pode derrubar o boot do worker.
  let carregados: {
    adapter: ModuloAdapter;
    store: ModuloStore;
    observer: ModuloObserver;
    conclusoes: ModuloConclusoes;
  } | null = null;

  function modulos(): NonNullable<typeof carregados> {
    if (carregados) return carregados;
    const m = o.modulos ?? {};
    carregados = {
      adapter: m.adapter ?? (req("../../conference-brain/ingestion/operacao-viva-adapter.js") as ModuloAdapter),
      store: m.store ?? (req("../../conference-brain/storage/store.js") as ModuloStore),
      observer: m.observer ?? (req("../../conference-brain/live/observer.js") as ModuloObserver),
      conclusoes: m.conclusoes ?? (req("../../conference-brain/copiloto/conclusoes.js") as ModuloConclusoes),
    };
    return carregados;
  }

  const porEscopo = new Map<string, CadeiaDoEscopo>();

  const estado: EstadoDaEspinha = {
    habilitada: true,
    passadas: 0,
    falhas: 0,
    ultima_em: null,
    ultimo_erro: null,
    escopos_vistos: 0,
    conclusoes_lidas: 0,
    conclusoes_vigentes: 0,
    recusas: 0,
    recomendacoes_ativas: 0,
    recomendacoes_de_pedido: 0,
    prazos_vencidos: 0,
    sobreposicoes: 0,
  };

  function classeDe(e: unknown): string {
    return e instanceof Error && e.constructor?.name ? e.constructor.name : "Error";
  }

  /**
   * Reduz o histórico de saúde da fonte à leitura VIGENTE.
   *
   * `extrairConclusoes` emite uma conclusão `source_health` POR CICLO já
   * rodado, em ordem — é o registro dos ciclos, e é correto que seja. Mas
   * entregar esse histórico inteiro ao Copiloto a cada passada faz cada ciclo
   * passado valer como se fosse condição de agora: na passada N nascem N
   * recomendações em sombra sobre a mesma fonte, e o número só cresce.
   * Medido antes de corrigir: 3 passadas, 3 conclusões, 3 recomendações ativas.
   *
   * A regra não é inventada aqui. `conclusoes.js` já a declara, na linha em que
   * calcula `saudeVigente`: "a saúde vigente é a do ciclo mais recente desta
   * execução". Esta função apenas passa a respeitá-la do lado de fora.
   *
   * Conclusão de PEDIDO não é tocada: ela já nasce uma por pedido, recalculada
   * do histórico, e é atual por construção.
   */
  function somenteVigentes(conclusoes: readonly Conclusao[]): Conclusao[] {
    const saude = conclusoes.filter((c) => c.conclusion_kind === "source_health");
    const resto = conclusoes.filter((c) => c.conclusion_kind !== "source_health");
    // A extração já devolve os ciclos ordenados por `started_at`.
    const vigente = saude.length ? [saude[saude.length - 1]] : [];
    return [...vigente, ...resto];
  }

  async function passarNoEscopo(
    unit_id: string,
    source_mode: SourceMode,
    agora: Date,
  ): Promise<{
    conclusoes: number;
    vigentes: number;
    recusas: number;
    ativas: number;
    pedido: number;
  }> {
    const M = modulos();
    const chave = `${unit_id}|${source_mode}`;
    const run_id = M.adapter.runIdDe(unit_id, source_mode);

    let cadeia = porEscopo.get(chave);
    if (!cadeia) {
      // `memoryOnly` é deliberado: a espinha não cria artefato durável novo.
      // O que ela acumula é recalculável a partir do event log, que continua
      // sendo a verdade. Retenção é Q-015, não uma decisão tomada aqui.
      const store = M.store.createStore({ memoryOnly: true });
      const fetchOrders = M.adapter.criarFetchOrders({
        // A projeção é lida NO INSTANTE da passada, do escopo certo. Nunca de
        // um escopo vizinho: `source_mode` entra aqui e é conferido lá.
        lerProjecao: () => o.ponte.projecao({ agora, unit_id, source_mode }),
        source_mode,
        now: () => agora.toISOString(),
      });
      const observer = M.observer.createLiveObserver({
        store,
        fetchOrders,
        runId: run_id,
        collectorVersion: SPINE_VERSION,
        now: () => agora.toISOString(),
      });
      cadeia = { store, observer, anteriores: [] };
      porEscopo.set(chave, cadeia);
    }

    await cadeia.observer.runCycle();

    const extraido = M.conclusoes.extrairConclusoes({
      store: cadeia.store,
      observer: cadeia.observer,
      unit_id,
      source_mode,
      run_id,
    });

    const vigentes = somenteVigentes(extraido.conclusoes);

    const resultado = recomendarDeConclusoes(vigentes, {
      agora,
      unit_id,
      source_mode,
      anteriores: cadeia.anteriores,
    });

    cadeia.anteriores = resultado.recomendacoes;

    return {
      conclusoes: extraido.conclusoes.length,
      vigentes: vigentes.length,
      recusas: extraido.recusadas.length + resultado.recusas.length,
      ativas: resultado.recomendacoes.filter((r) => r.status === "proposed").length,
      pedido: resultado.recomendacoes.filter(
        (r) => r.escopo === "pedido" && r.status === "proposed",
      ).length,
    };
  }

  return {
    estado: () => ({ ...estado }),

    async executar(): Promise<EstadoDaEspinha> {
      const agora = relogio();
      const em = agora.toISOString();

      // A passada anterior venceu o prazo e ainda não voltou. Começar outra
      // empilharia trabalho abandonado sobre trabalho abandonado.
      if (emVoo) {
        estado.sobreposicoes++;
        estado.ultima_em = em;
        return { ...estado };
      }

      const passada = corpoDaPassada(agora, em).catch((e: unknown) => {
        // `corpoDaPassada` já contém tudo que era previsto. Este catch existe
        // para o que NÃO era — e ele REGISTRA, não engole: um catch vazio aqui
        // seria falha silenciosa, que é o defeito que esta unidade inteira
        // existe para não cometer.
        estado.falhas++;
        estado.ultimo_erro = { classe: classeDe(e), escopo: "passada-nao-prevista", em };
      });
      emVoo = passada.finally(() => {
        emVoo = null;
      });

      const venceu = await dentroDoPrazo(passada, prazoMs);

      if (!venceu) {
        // O laço do worker segue. O trabalho abandonado termina quando
        // terminar, e a guarda acima impede que o próximo comece antes.
        estado.prazos_vencidos++;
        estado.ultima_em = em;
        estado.ultimo_erro = { classe: "PrazoEsgotado", escopo: "passada", em };
      }
      return { ...estado };
    },
  };

  async function corpoDaPassada(agora: Date, em: string): Promise<void> {
      try {
        const escopos = o.ponte.memoria.escopos();
        let conclusoes = 0;
        let vigentes = 0;
        let recusas = 0;
        let ativas = 0;
        let pedido = 0;
        let quebrou = false;

        for (const e of escopos) {
          // Cada escopo no seu próprio catch: um que explode não impede os
          // outros de rodar, e nenhum deles empresta número ao vizinho — um
          // `real` quebrado não pode zerar o que o `simulado` mediu.
          try {
            const r = await passarNoEscopo(e.unit_id, e.source_mode, agora);
            conclusoes += r.conclusoes;
            vigentes += r.vigentes;
            recusas += r.recusas;
            ativas += r.ativas;
            pedido += r.pedido;
          } catch (err) {
            quebrou = true;
            estado.ultimo_erro = {
              classe: classeDe(err),
              escopo: `${e.unit_id}|${e.source_mode}`,
              em,
            };
          }
        }

        if (quebrou) estado.falhas++;
        else estado.passadas++;
        estado.escopos_vistos = escopos.length;
        estado.conclusoes_lidas = conclusoes;
        estado.conclusoes_vigentes = vigentes;
        estado.recusas = recusas;
        estado.recomendacoes_ativas = ativas;
        estado.recomendacoes_de_pedido = pedido;
        estado.ultima_em = em;
      } catch (e) {
        // Último anteparo: nem enumerar os escopos pode escapar. Quem chama
        // está no meio do laço do worker e não pode receber exceção daqui.
        estado.falhas++;
        estado.ultima_em = em;
        estado.ultimo_erro = { classe: classeDe(e), escopo: "passada", em };
      }
  }
}
