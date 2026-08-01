/**
 * DeliveryOS — Product System · view model da OPERACAO VIVA
 *
 * Leitura apenas, sobre a `Projecao` real de src/platform/projections.
 *
 * A verdade que esta superficie precisa preservar inteira: a Operacao Viva
 * projeta VIAGENS. Ela nao carrega identidade de pedido — `order_id` existe no
 * envelope e nao e propagado para `ViagemAcumulada` (D29). Por isso nenhuma
 * viagem desta tela e apresentada como pedido, e nenhum campo chamado
 * `pedido_*` recebe `trip_id`.
 *
 * A classificacao de cada dimensao (observacao direta, inferencia, contexto,
 * evidencia auxiliar) e a MESMA que o adapter da Unidade 4B4 declara. Ela nao
 * foi reinventada aqui: repetir com outras palavras produziria duas verdades.
 */

import type {
  Dimensoes,
  Frescor,
  Projecao,
  ViagemProjetada,
} from "../../platform/projections/operacao-viva";
import {
  ausente,
  observado,
  selo,
  type Campo,
  type Limitacao,
  type Procedencia,
  type Selo,
} from "./estados";

/** Como a informacao foi obtida. A tela nunca mistura as quatro. */
export type Classificacao =
  | "observacao_direta"
  | "inferencia"
  | "contexto_operacional"
  | "evidencia_auxiliar";

export const ROTULO_CLASSIFICACAO: Record<Classificacao, string> = {
  observacao_direta: "Observado",
  inferencia: "Inferido",
  contexto_operacional: "Contexto",
  evidencia_auxiliar: "Evidencia",
};

export interface DimensaoVM {
  readonly id: keyof Dimensoes;
  readonly nome: string;
  readonly pergunta: string;
  readonly classificacao: Classificacao;
  readonly valor: Campo<string | number>;
  readonly selo: Selo;
}

export interface ViagemProjetadaVM {
  readonly viagem_id: string;
  readonly rotulo_identidade: "Viagem";
  readonly estado: string;
  readonly frescor: Frescor;
  readonly selo_frescor: Selo;
  readonly ultimo_fato_em: string;
  readonly ultima_posicao_em: Campo<string>;
  readonly ocorrencias_abertas: number;
  readonly procedencia: Procedencia;
  readonly eventos_que_a_compuseram: number;
}

export interface OperacaoVivaVM {
  readonly modulo: "operacao-viva";
  readonly unidade: string;
  readonly procedencia: Procedencia;
  readonly selos_de_cabecalho: readonly Selo[];
  readonly calculada_em: string;
  readonly versao_da_projecao: string;
  readonly dimensoes: readonly DimensaoVM[];
  readonly viagens: readonly ViagemProjetadaVM[];
  readonly integridade_do_sinal: Selo;
  readonly quarentena: readonly { event_id: string; motivo: string }[];
  readonly cursor: Campo<string>;
  readonly historico_de_mudanca: Campo<never>;
  readonly sem_dados_suficientes: boolean;
  readonly limitacoes: readonly Limitacao[];
}

function frescorParaSelo(f: Frescor): Selo {
  switch (f) {
    case "fresh":
      return selo("saudavel", "Ultimo fato dentro de 2 minutos.");
    case "aging":
      return selo("parcial", "Entre 2 e 5 minutos sem fato novo. Parcial nao e saudavel.");
    case "stale":
      return selo("stale", "Mais de 5 minutos sem fato novo. Isto nao representa agora.");
    case "unknown":
      return selo(
        "indisponivel",
        "Nunca foi observado. Nunca observado nao e o mesmo que observado e envelhecido.",
      );
  }
}

/**
 * `capacidade_operacional` chega como `number | "desconhecida"`. O sentinela
 * textual vira AUSENCIA — nunca zero. Zero capacidade seria a afirmacao de que a
 * operacao esta saturada, e ninguem observou isso.
 */
function capacidadeParaCampo(
  d: Dimensoes,
  origem: Procedencia,
  quando: string,
): Campo<string | number> {
  if (d.capacidade_operacional === "desconhecida") {
    return ausente<string | number>(
      "indisponivel",
      "A capacidade nao foi apurada. Ausencia de capacidade nao e capacidade zero.",
    );
  }
  return observado<string | number>(d.capacidade_operacional, origem, quando);
}

function frescorParaCampo(
  f: Frescor,
  origem: Procedencia,
  quando: string,
): Campo<string | number> {
  if (f === "unknown") {
    return ausente<string | number>(
      "nao_observado",
      "Este sinal nunca chegou nesta janela.",
    );
  }
  return observado<string | number>(f, origem, quando);
}

export function operacaoVivaVM(p: Projecao): OperacaoVivaVM {
  const origem: Procedencia = p.source_mode === "real" ? "real" : "simulado";
  const quando = p.calculada_em;
  const d = p.dimensoes;

  const dimensoes: DimensaoVM[] = [
    {
      id: "carga",
      nome: "Carga",
      pergunta: "Quantas viagens abertas ao mesmo tempo?",
      classificacao: "contexto_operacional",
      valor: observado<string | number>(d.carga, origem, quando),
      selo: selo(origem),
    },
    {
      id: "atraso",
      nome: "Atraso",
      pergunta: "Quantas viagens passaram do tempo esperado?",
      classificacao: "inferencia",
      valor: observado<string | number>(d.atraso, origem, quando),
      selo: selo(origem),
    },
    {
      id: "mobilidade",
      nome: "Mobilidade",
      pergunta: "Quantas viagens tem posicao recente?",
      classificacao: "inferencia",
      valor: observado<string | number>(d.mobilidade, origem, quando),
      selo: selo(origem),
    },
    {
      id: "integridade_sinal",
      nome: "Integridade do sinal",
      pergunta: "Qual a qualidade do que esta chegando?",
      classificacao: "inferencia",
      valor: frescorParaCampo(d.integridade_sinal, origem, quando),
      selo: frescorParaSelo(d.integridade_sinal),
    },
    {
      id: "saude_sincronizacao",
      nome: "Saude da sincronizacao",
      pergunta: "O aparelho esta conseguindo sincronizar?",
      classificacao: "inferencia",
      valor: frescorParaCampo(d.saude_sincronizacao, origem, quando),
      selo: frescorParaSelo(d.saude_sincronizacao),
    },
    {
      id: "confianca_evidencia",
      nome: "Confianca da evidencia",
      pergunta: "O quanto a evidencia sustenta esta leitura?",
      classificacao: "inferencia",
      valor: observado<string | number>(d.confianca_evidencia, origem, quando),
      selo:
        d.confianca_evidencia === "baixa"
          ? selo("evidencia_insuficiente", "A leitura se apoia em pouca evidencia.")
          : selo(origem),
    },
    {
      id: "capacidade_operacional",
      nome: "Capacidade operacional",
      pergunta: "Quanto a operacao ainda aguenta antes de saturar?",
      classificacao: "inferencia",
      valor: capacidadeParaCampo(d, origem, quando),
      selo:
        d.capacidade_operacional === "desconhecida"
          ? selo("indisponivel", "Nao apurada. Nao e zero.")
          : selo(origem),
    },
    {
      id: "ocorrencias",
      nome: "Ocorrencias",
      pergunta: "Quantas ocorrencias estao abertas?",
      classificacao: "contexto_operacional",
      valor: observado<string | number>(d.ocorrencias, origem, quando),
      selo: selo(origem),
    },
    {
      id: "risco_envelhecimento",
      nome: "Risco de envelhecimento",
      pergunta: "Qual o risco de estar decidindo com dado velho?",
      classificacao: "inferencia",
      valor: observado<string | number>(d.risco_envelhecimento, origem, quando),
      selo:
        d.risco_envelhecimento === "alto"
          ? selo("degradado", "Alto risco de decidir com dado velho.")
          : selo(origem),
    },
  ];

  const viagens: ViagemProjetadaVM[] = p.viagens.map((v: ViagemProjetada) => ({
    viagem_id: v.trip_id,
    rotulo_identidade: "Viagem" as const,
    estado: v.estado,
    frescor: v.frescor,
    selo_frescor: frescorParaSelo(v.frescor),
    ultimo_fato_em: v.ultimo_fato_em,
    ultima_posicao_em:
      v.ultima_posicao_em === undefined
        ? ausente<string>(
            "nao_observado",
            "Esta viagem nunca reportou posicao. Nunca reportar nao e reportar parado.",
          )
        : observado(v.ultima_posicao_em, origem, quando),
    ocorrencias_abertas: v.ocorrencias_abertas,
    procedencia: v.source_mode === "real" ? "real" : "simulado",
    eventos_que_a_compuseram: v.eventos.length,
  }));

  return {
    modulo: "operacao-viva",
    unidade: p.unit_id,
    procedencia: origem,
    selos_de_cabecalho: [
      selo(origem),
      selo(
        "somente_demonstracao",
        "A projecao desta tela e calculada sobre um log de eventos de demonstracao. A funcao `projetar` e a real.",
      ),
    ],
    calculada_em: p.calculada_em,
    versao_da_projecao: p.projection_version,
    dimensoes,
    viagens,
    integridade_do_sinal: frescorParaSelo(d.integridade_sinal),
    quarentena: p.quarentena,
    cursor:
      p.cursor === undefined
        ? ausente<string>(
            "nao_observado",
            "Nenhum evento foi aplicado ainda nesta janela.",
          )
        : observado(p.cursor.event_id, origem, p.cursor.occurred_at),
    historico_de_mudanca: ausente<never>(
      "integracao_pendente",
      "A projecao devolve o estado atual, nao a serie de mudancas. Reconstruir historico exige varrer o event log, e nao ha rota de leitura para isso.",
    ),
    sem_dados_suficientes: p.viagens.length === 0,
    limitacoes: [
      {
        titulo: "Viagem nao e pedido",
        texto:
          "Esta projecao indexa por viagem. `order_id` existe no envelope de evento e nao e propagado para a viagem acumulada, entao nenhuma tela pode afirmar o que uma viagem diz sobre um pedido.",
      },
      {
        titulo: "Frescor e leitura de relogio, nao fato",
        texto:
          "Os mesmos eventos produzem `recente` agora e `desatualizado` daqui a dez minutos, sem nada ter mudado na rua. Por isso o frescor nunca e persistido junto do fato.",
      },
      {
        titulo: "Nao ha historico",
        texto:
          "A tela mostra o estado calculado agora. Nao existe, nesta unidade, superficie que mostre como cada dimensao chegou ate aqui.",
      },
    ],
  };
}
