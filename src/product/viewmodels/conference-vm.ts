/**
 * DeliveryOS — Product System · view model do CONFERENCE BRAIN
 *
 * Leitura apenas. Esta view model NAO importa nenhum modulo do Conference Brain:
 * ela recebe um OBJETO SIMPLES, do mesmo jeito que o Brain recebe um objeto
 * simples da Operacao Viva e o Copiloto recebe um objeto simples do Brain. A
 * direcao de dependencia ja comprovada nas Unidades 4 e 5 continua valendo — a
 * apresentacao entra como terceiro espelho, nao como excecao.
 *
 * O contrato de entrada esta declarado aqui e e montado pelo servidor de
 * apresentacao, fora do componente visual.
 */

import {
  ausente,
  observado,
  selo,
  type Campo,
  type Evidencia,
  type Limitacao,
  type Procedencia,
  type Selo,
} from "./estados";

/* ------------------------------------------------------------------ *
 * Contrato de entrada — objeto simples
 * ------------------------------------------------------------------ */

export interface CicloLido {
  readonly run_id: string;
  readonly cycle_id: string;
  readonly started_at: string;
  readonly finished_at: string | null;
  readonly source_health: string;
  readonly orders_observed: number | null;
  readonly fields_missing: readonly string[];
  readonly notes: string | null;
}

/**
 * Diagnostico de linha recusada. NAO existe campo de conteudo neste tipo, de
 * proposito: uma linha recusada pode carregar dado de pessoa, e o unico jeito de
 * garantir que a tela nao o exiba e nao ter por onde receber.
 */
export interface LinhaInvalidaLida {
  readonly entity: string;
  readonly line_number: number;
  readonly codigos: readonly string[];
  readonly tamanho: number;
  readonly hash: string;
}

export interface SaudeStoreLida {
  readonly memory_only: boolean;
  readonly entidades: readonly { entity: string; records: number }[];
  readonly falhas_de_io: number;
  readonly linhas_corrompidas: number;
  readonly linhas_invalidas: readonly LinhaInvalidaLida[];
}

export interface ConclusaoLida {
  readonly conclusion_ref: string;
  readonly conclusion_kind: "source_health" | "order_dimension";
  readonly conclusion_version: string;
  readonly observed_at: string | null;
  readonly source_health: string | null;
  readonly pode_afirmar: boolean;
  readonly orders_observed: number | null;
  readonly evidencias: readonly Evidencia[];
  readonly limitacoes: readonly string[];
}

export interface LeituraConferenceBrain {
  readonly unit_id: string;
  readonly source_mode: string;
  /** `real` quando a cadeia foi alimentada pela projecao; `controle_positivo_sintetico` no par de controle. */
  readonly procedencia: Procedencia;
  readonly ciclos: readonly CicloLido[];
  readonly saude_do_store: SaudeStoreLida;
  readonly observacoes_de_pedido: number;
  readonly conclusoes: readonly ConclusaoLida[];
}

/* ------------------------------------------------------------------ *
 * Saida
 * ------------------------------------------------------------------ */

export interface FonteVM {
  readonly run_id: string;
  readonly cycle_id: string;
  readonly selo_saude: Selo;
  readonly selo_procedencia: Selo;
  readonly iniciado_em: string;
  readonly terminado_em: Campo<string>;
  readonly pedidos_observados: Campo<number>;
  readonly campos_ausentes: readonly string[];
  readonly nota: Campo<string>;
}

export interface ConclusaoVM {
  readonly ref: string;
  readonly especie: "source_health" | "order_dimension";
  readonly rotulo_especie: string;
  readonly versao: string;
  readonly selo: Selo;
  readonly pode_afirmar_carga: boolean;
  readonly evidencias: readonly Evidencia[];
  readonly limitacoes: readonly string[];
  readonly observado_em: Campo<string>;
}

export interface ConferenceBrainVM {
  readonly modulo: "conference-brain";
  readonly unidade: string;
  readonly procedencia: Procedencia;
  readonly selos_de_cabecalho: readonly Selo[];
  readonly fontes: readonly FonteVM[];
  readonly conclusoes: readonly ConclusaoVM[];
  readonly observacoes_de_pedido: Campo<number>;
  readonly armazenamento: {
    readonly selo: Selo;
    readonly em_memoria: boolean;
    readonly entidades: readonly { entity: string; records: number }[];
    readonly falhas_de_io: number;
    readonly linhas_corrompidas: number;
    readonly linhas_invalidas: readonly LinhaInvalidaLida[];
  };
  readonly limitacoes: readonly Limitacao[];
}

const SAUDE_PARA_ESTADO: Record<string, Parameters<typeof selo>[0]> = {
  ok: "saudavel",
  healthy: "saudavel",
  partial: "parcial",
  degraded: "degradado",
  stale: "stale",
  unavailable: "indisponivel",
};

function saudeParaSelo(h: string): Selo {
  const estado = SAUDE_PARA_ESTADO[h];
  if (estado === undefined) {
    return selo(
      "indisponivel",
      `A fonte relatou "${h}", que nao esta no vocabulario conhecido de saude.`,
    );
  }
  if (estado === "parcial") {
    return selo(
      "parcial",
      "Parte do que a fonte deveria entregar chegou. Parcial nao e saudavel.",
    );
  }
  return selo(estado);
}

export function conferenceBrainVM(l: LeituraConferenceBrain): ConferenceBrainVM {
  const fontes: FonteVM[] = l.ciclos.map((c) => ({
    run_id: c.run_id,
    cycle_id: c.cycle_id,
    selo_saude: saudeParaSelo(c.source_health),
    selo_procedencia: selo(l.procedencia),
    iniciado_em: c.started_at,
    terminado_em:
      c.finished_at === null
        ? ausente<string>(
            "nao_observado",
            "Este ciclo nao registrou termino.",
          )
        : observado(c.finished_at, l.procedencia, c.finished_at),
    /**
     * Zero pedidos observados e um FATO medido, e continua sendo zero. `null` e
     * ausencia de medicao, e vira ausencia — nunca zero.
     */
    pedidos_observados:
      c.orders_observed === null
        ? ausente<number>(
            "nao_observado",
            "O ciclo nao registrou contagem de pedidos observados.",
          )
        : observado(c.orders_observed, l.procedencia, c.started_at),
    campos_ausentes: c.fields_missing,
    nota:
      c.notes === null
        ? ausente<string>("nao_observado", "Sem nota neste ciclo.")
        : observado(c.notes, l.procedencia, c.started_at),
  }));

  const conclusoes: ConclusaoVM[] = l.conclusoes.map((c) => ({
    ref: c.conclusion_ref,
    especie: c.conclusion_kind,
    rotulo_especie:
      c.conclusion_kind === "source_health"
        ? "Saude da fonte"
        : "Dimensao de pedido",
    versao: c.conclusion_version,
    selo:
      c.evidencias.length === 0
        ? selo(
            "evidencia_insuficiente",
            "Esta conclusao nao carrega evidencia rastreavel.",
          )
        : selo(l.procedencia),
    pode_afirmar_carga: c.pode_afirmar,
    evidencias: c.evidencias,
    limitacoes: c.limitacoes,
    observado_em:
      c.observed_at === null
        ? ausente<string>("nao_observado", "A conclusao nao registrou instante de observacao.")
        : observado(c.observed_at, l.procedencia, c.observed_at),
  }));

  const s = l.saude_do_store;
  const armazenamentoDegradado =
    s.falhas_de_io > 0 || s.linhas_corrompidas > 0 || s.linhas_invalidas.length > 0;

  return {
    modulo: "conference-brain",
    unidade: l.unit_id,
    procedencia: l.procedencia,
    selos_de_cabecalho: [
      selo(l.procedencia),
      selo(
        "somente_demonstracao",
        "Os ciclos desta tela sao executados sobre um store temporario. O observador e o nucleo multidimensional sao os reais.",
      ),
    ],
    fontes,
    conclusoes,
    /**
     * A afirmacao central desta superficie. Zero aqui NAO e falta de medicao: e
     * o resultado de uma recusa deliberada. A cadeia real nao emite pedido
     * porque a Operacao Viva nao carrega identidade de pedido (D29).
     */
    observacoes_de_pedido: observado(
      l.observacoes_de_pedido,
      l.procedencia,
      l.ciclos[l.ciclos.length - 1]?.started_at ?? new Date(0).toISOString(),
    ),
    armazenamento: {
      selo: armazenamentoDegradado
        ? selo(
            "degradado",
            `${s.linhas_invalidas.length} linha(s) recusada(s) pelo contrato e ${s.linhas_corrompidas} ilegivel(is).`,
          )
        : selo("saudavel", "Sem falha de escrita, linha ilegivel ou registro recusado."),
      em_memoria: s.memory_only,
      entidades: s.entidades,
      falhas_de_io: s.falhas_de_io,
      linhas_corrompidas: s.linhas_corrompidas,
      /**
       * Codigo, tamanho e hash. Nunca o conteudo — e por isso que
       * `LinhaInvalidaLida` nao tem campo de conteudo (D31).
       */
      linhas_invalidas: s.linhas_invalidas,
    },
    limitacoes: [
      {
        titulo: "Nenhuma observacao real de pedido existe hoje",
        texto:
          "A Operacao Viva projeta viagens e nao propaga identidade de pedido. Sem identidade, emitir observacao de pedido exigiria inventar identidade — e a cadeia recusa. Por isso pedidos observados e zero por decisao, nao por cano entupido.",
      },
      {
        titulo: "Linha recusada nunca e exibida",
        texto:
          "Uma linha recusada pelo contrato pode carregar dado de pessoa. O diagnostico guarda codigo do erro, tamanho e hash; o conteudo nao chega nem a esta tela porque o contrato de leitura nao tem campo para ele.",
      },
      {
        titulo: "Ilegivel e proibida sao coisas diferentes",
        texto:
          "Linha corrompida e dano fisico no arquivo. Linha invalida e um registro que alguem conseguiu colocar no disco por fora do contrato. Somar as duas esconderia a segunda.",
      },
    ],
  };
}
