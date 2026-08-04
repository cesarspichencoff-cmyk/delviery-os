/**
 * DeliveryOS — Product System · view model do COPILOTO SHADOW
 *
 * Leitura apenas, e a palavra "apenas" aqui e o produto inteiro: esta view model
 * nao expoe verbo de acao, nao tem campo de comando, e nao existe caminho de
 * tipo que produza um controle acionavel a partir dela. Uma recomendacao chega,
 * e o que sai e texto, evidencia e limitacao.
 *
 * Dois eixos que nao compartilham campo (D34):
 *   status         ciclo de vida  — proposed, expired, dismissed, invalidated
 *   evidence_grade qualidade      — sustentada, degradada, stale
 * `insuficiente` nunca e atributo de recomendacao que existe: e o motivo de ela
 * nao existir, e viaja em `recusas`. Fundir os dois repetiria o erro que o
 * modelo multidimensional do Brain existe para corrigir.
 */

import type {
  RecomendacaoShadow,
  Recusa,
  ResultadoShadow,
} from "../../platform/copiloto/conference-bridge";
import {
  ausente,
  confiancaApresentavel,
  observado,
  selo,
  type Campo,
  type Evidencia,
  type Limitacao,
  type Procedencia,
  type Selo,
} from "./estados";

export interface RecomendacaoVM {
  readonly id: string;
  readonly titulo: string;
  readonly descricao: string;
  /** Sobre o que fala. Uma conclusao de fonte nunca vira "pedido". */
  readonly escopo: "fonte" | "pedido";
  readonly rotulo_escopo: string;
  /** Somente quando a recomendacao e sobre um pedido observado. */
  readonly pedido_ref: Campo<string>;
  readonly motivo: string;
  readonly selo_ciclo_de_vida: Selo;
  readonly selo_evidencia: Selo;
  readonly selo_procedencia: Selo;
  readonly selo_shadow: Selo;
  readonly selo_decisao_humana: Selo;
  readonly confianca: Campo<number>;
  readonly risco: string;
  readonly evidencias: readonly Evidencia[];
  readonly limitacoes: readonly string[];
  readonly indisponivel: readonly string[];
  readonly validade_ate: string;
  readonly ativa: boolean;
  readonly motivo_de_saida: Campo<string>;
  readonly volta_ate_a_origem: string;
  /**
   * Literal, e por escrito. Nao e configuracao — e o que este subsistema e.
   * A tela repete a frase inteira em cada cartao porque ler metade de um cartao
   * e o modo normal de ler sob pressao.
   */
  readonly porque_nao_executada: string;
}

export interface RecusaVM {
  readonly ref: Campo<string>;
  readonly selo: Selo;
  readonly motivo: string;
}

export interface CopilotoVM {
  readonly modulo: "copiloto";
  readonly unidade: Campo<string>;
  readonly procedencia: Procedencia;
  readonly selos_de_cabecalho: readonly Selo[];
  readonly avaliado_em: string;
  readonly versao_da_ponte: string;
  readonly ativas: readonly RecomendacaoVM[];
  readonly fora_de_atividade: readonly RecomendacaoVM[];
  readonly recusas: readonly RecusaVM[];
  readonly sem_recomendacao_sustentada: boolean;
  readonly historico_de_mudancas: Campo<never>;
  readonly nenhuma_acao_executada: true;
  readonly limitacoes: readonly Limitacao[];
}

export const FRASE_SOMBRA =
  "O Copiloto esta em modo sombra: ele observa e propoe, e nenhuma acao foi ou sera executada automaticamente. Quem decide e uma pessoa.";

function cicloDeVidaParaSelo(status: RecomendacaoShadow["status"]): Selo {
  switch (status) {
    case "proposed":
      return selo("shadow", "Proposta ativa. Nada foi executado.");
    case "expired":
      return selo("expirado", "A validade venceu.");
    case "dismissed":
      return selo("retirado", "Retirada por decisao humana.");
    case "invalidated":
      return selo("invalidado", "Um fato novo derrubou a base.");
    case "accepted_for_future":
      return selo(
        "acao_humana_necessaria",
        "Um humano registrou aceite para quando houver automacao. Nada foi executado agora.",
      );
  }
}

function evidenciaParaSelo(g: RecomendacaoShadow["evidence_grade"]): Selo {
  switch (g) {
    case "sustentada":
      return selo("saudavel", "A evidencia sustenta a leitura.");
    case "degradada":
      return selo("degradado", "A evidencia chega em menos qualidade do que deveria.");
    case "stale":
      return selo("stale", "A evidencia e antiga. Antiga nao e atual.");
    case "insuficiente":
      // Defesa em profundidade: por contrato este valor nunca chega numa
      // recomendacao que existe. Se chegar, a tela nao o esconde.
      return selo(
        "evidencia_insuficiente",
        "Esta recomendacao nao deveria existir com este grau. Tratada como nao sustentada.",
      );
  }
}

function recusaParaSelo(e: Recusa["estado"]): Selo {
  switch (e) {
    case "insufficient_evidence":
      return selo(
        "evidencia_insuficiente",
        "Nao havia base rastreavel, entao nenhuma recomendacao foi criada.",
      );
    case "fora_de_escopo":
      return selo("indisponivel", "A conclusao esta fora do escopo avaliado.");
    case "versao_incompativel":
      return selo("erro_bloqueante", "Versao de conclusao incompativel, recusada na porta.");
    case "escopo_divergente":
      return selo("conflito", "O escopo da conclusao diverge do escopo avaliado.");
  }
}

function recomendacaoVM(
  r: RecomendacaoShadow,
  procedencia: Procedencia,
): RecomendacaoVM {
  const evidencias: readonly Evidencia[] = r.evidencias.map((e) => ({
    tipo: String((e as { tipo?: unknown }).tipo ?? "evidencia"),
    referencia: String((e as { ref?: unknown }).ref ?? ""),
    observado_em: r.created_at,
  }));

  return {
    id: r.recommendation_id,
    titulo: r.titulo,
    descricao: r.descricao,
    escopo: r.escopo,
    rotulo_escopo: r.escopo === "fonte" ? "Sobre a fonte" : "Sobre um pedido",
    /**
     * `external_id` so existe em recomendacao de pedido. Recomendacao de fonte
     * com identidade de pedido e recusada la atras, no schema do store — aqui a
     * ausencia e representada como ausencia, nunca como string vazia.
     */
    pedido_ref:
      r.external_id === null
        ? ausente<string>(
            "indisponivel",
            "Esta recomendacao fala da fonte, nao de um pedido. Ela nao tem — e nao pode ter — identidade de pedido.",
          )
        : observado(r.external_id, procedencia, r.created_at),
    motivo: r.reason,
    selo_ciclo_de_vida: cicloDeVidaParaSelo(r.status),
    selo_evidencia: evidenciaParaSelo(r.evidence_grade),
    selo_procedencia: selo(procedencia),
    // Sem `detalhe`: o texto acessivel generico do estado `shadow` ja diz
    // exatamente isto, e repetir faria o leitor de tela anunciar a frase duas
    // vezes seguidas. A frase inteira aparece uma vez, no rodape do cartao.
    selo_shadow: selo("shadow"),
    selo_decisao_humana: selo(
      "acao_humana_necessaria",
      "Esta proposta exige decisao humana para virar qualquer coisa.",
    ),
    // Nao estimada nao vira zero nem numero: `confiancaApresentavel` recebe
    // `null` e devolve ausencia declarada.
    confianca: confiancaApresentavel(
      r.confianca.estado === "apurada" ? r.confianca.valor : null,
      evidencias,
    ),
    risco: r.risk_level,
    evidencias,
    limitacoes: r.limitacoes,
    indisponivel: r.indisponivel,
    validade_ate: r.expires_at,
    ativa: r.status === "proposed",
    motivo_de_saida:
      r.motivo_de_saida === null
        ? ausente<string>(
            "nao_observado",
            "Esta recomendacao nao saiu de atividade.",
          )
        : observado(r.motivo_de_saida, procedencia, r.created_at),
    /** O caminho de volta ate o fato que a produziu. */
    volta_ate_a_origem: `${r.conclusion_kind} · ${r.conclusion_ref} · ${r.conclusion_version}`,
    porque_nao_executada: FRASE_SOMBRA,
  };
}

export function copilotoVM(res: ResultadoShadow): CopilotoVM {
  const procedencia: Procedencia =
    res.escopo?.source_mode === "real" ? "real" : "simulado";

  const todas = res.recomendacoes.map((r) => recomendacaoVM(r, procedencia));
  const ativas = todas.filter((r) => r.ativa);
  const fora = todas.filter((r) => !r.ativa);

  return {
    modulo: "copiloto",
    unidade:
      res.escopo === null
        ? ausente<string>(
            "indisponivel",
            "Nenhum escopo foi avaliado nesta leitura.",
          )
        : observado(res.escopo.unit_id, procedencia, res.avaliado_em),
    procedencia,
    selos_de_cabecalho: [
      selo("shadow"),
      selo(procedencia),
      selo(
        "somente_demonstracao",
        "As conclusoes que alimentam esta tela vem de um ciclo de demonstracao. A ponte e o gerador sao os reais.",
      ),
    ],
    avaliado_em: res.avaliado_em,
    versao_da_ponte: res.bridge_version,
    ativas,
    fora_de_atividade: fora,
    recusas: res.recusas.map((r) => ({
      ref:
        r.conclusion_ref === null
          ? ausente<string>(
              "indisponivel",
              "A recusa aconteceu antes de haver conclusao identificavel.",
            )
          : observado(r.conclusion_ref, procedencia, res.avaliado_em),
      selo: recusaParaSelo(r.estado),
      motivo: r.motivo,
    })),
    sem_recomendacao_sustentada: ativas.length === 0,
    historico_de_mudancas: ausente<never>(
      "integracao_pendente",
      "A ponte devolve o resultado da avaliacao atual. Nao ha superficie que leia o historico de status ja gravado no store.",
    ),
    nenhuma_acao_executada: true,
    limitacoes: [
      {
        titulo: "Nenhuma recomendacao de PEDIDO nasce da cadeia real",
        texto:
          "A cadeia real produz apenas recomendacao de FONTE, porque o adapter da Operacao Viva nao emite pedido. Recomendacao de pedido so aparece com fonte sintetica de controle, e ela prova que a ponte funciona — nao que existe fonte real de pedido.",
      },
      {
        titulo: "Nao ha retirada de verdade",
        texto:
          "Retirar e funcao pura no codigo. Nao existe autenticacao nem caminho de interface para um humano retirar uma recomendacao, entao esta tela nao oferece o botao. Oferecer seria fingir um controle que nao existe.",
      },
      {
        titulo: "Nada executa, e isso e estrutural",
        texto:
          "`requires_human` e literal no gerador, o estado `executed` nao existe no vocabulario, nenhum verbo de acao operacional aparece no codigo, e o schema do store recusa registro que dispense humano.",
      },
    ],
  };
}
