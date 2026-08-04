/**
 * LAB · OPERAÇÃO VIVA V4 — unidades operacionais e a regra de consolidação
 * ============================================================================
 * EXPERIMENTAL. `src/product/viewmodels/areas.ts` **não é alterado**, D45 e D46
 * continuam canônicos, e a migração de domínio **não ocorreu**.
 *
 * O DOMÍNIO CANÔNICO tem cinco ambientes, e `enrolados_quentes` ("Sushi
 * Quentes") é subárea de Sushi — decisão do César em 2026-08-01 (D45/D46).
 *
 * A REALIDADE FÍSICA, declarada pelo César em 2026-08-04, é outra: Sushi
 * Quentes fica fisicamente separado do Sushi, no salão e perto do Caixa, e tem
 * produção, carga, ritmo, capacidade e gargalo próprios. Pode estar
 * sobrecarregado com o Sushi calmo, e pode precisar virar Foco sozinho.
 *
 * Este arquivo carrega essa diferença como PROJEÇÃO LOCAL do Lab:
 *
 *   ambiente canônico legado    SUSHI
 *   subárea canônica legada     enrolados_quentes
 *   unidade experimental        SUSHI_QUENTES   (parent: SUSHI)
 *
 * A trava que o gate prova: **a sobrecarga de Sushi Quentes nunca é absorvida
 * pelo estado agregado de Sushi.** Um agregado que engole a subárea é
 * exatamente o que faz um gargalo real desaparecer da tela.
 *
 * A promoção definitiva a ambiente canônico é MISSÃO SEPARADA, com análise de
 * impacto, replay e auditoria. Ver `docs/product/PROPOSTA_EVOLUCAO_SUSHI_QUENTES.md`.
 */

import {
  ambienteDaPraca,
  PRACAS,
  type AmbienteId,
  type ModoDeMedicao,
  type PracaId,
} from "../../../src/product/viewmodels/areas";
import type { ItemDoPedido, PedidoLeitura } from "../../../src/product/viewmodels/sinais";

/* ================================================================== *
 * As seis unidades
 * ================================================================== */

export type UnidadeOperacionalId =
  | "caixa"
  | "sushi"
  | "sushi_quentes"
  | "cozinha"
  | "conferencia"
  | "motoboy";

export interface UnidadeOperacional {
  readonly id: UnidadeOperacionalId;
  readonly rotulo: string;
  readonly descricao: string;
  /** O ambiente canônico ao qual esta unidade pertence hoje. */
  readonly ambiente_canonico: AmbienteId;
  /** A subárea canônica que a origina, quando ela nasce de uma praça só. */
  readonly subarea_canonica: PracaId | null;
  /** Vínculo administrativo. Só `sushi_quentes` tem. */
  readonly parent: UnidadeOperacionalId | null;
  /** `true` quando a unidade não existe no domínio canônico. */
  readonly experimental: boolean;
  readonly medicao: ModoDeMedicao;
  /** As praças cuja carga alimenta esta unidade. */
  readonly pracas: readonly PracaId[];
  /** Por que não há medição própria. Obrigatório quando não há. */
  readonly motivo_sem_medicao: string | null;
}

/**
 * As praças de Sushi **sem** `enrolados_quentes`. Derivado de `PRACAS`, e não
 * escrito à mão: se uma praça nova entrar no ambiente Sushi lá, ela entra aqui
 * também, e o Lab não fica em silêncio sobre uma área que passou a existir.
 */
const PRACAS_DE_SUSHI_SEM_QUENTES: readonly PracaId[] = PRACAS.filter(
  (p) => p.ambiente === "sushi" && p.id !== "enrolados_quentes",
).map((p) => p.id);

const PRACAS_DE_CONFERENCIA: readonly PracaId[] = PRACAS.filter(
  (p) => p.ambiente === "conferencia",
).map((p) => p.id);

export const UNIDADES: readonly UnidadeOperacional[] = [
  {
    id: "caixa",
    rotulo: "Caixa",
    descricao: "Entrada do pedido e bancada onde a montagem simples acontece.",
    ambiente_canonico: "caixa",
    subarea_canonica: null,
    parent: null,
    experimental: false,
    medicao: "sem_medicao_automatica",
    pracas: [],
    motivo_sem_medicao:
      "Nenhuma fonte mede a fila da Caixa. O sistema não afirma que ela está saudável.",
  },
  {
    id: "sushi",
    rotulo: "Sushi",
    descricao: "Combinados, Duplas e Enrolados — a bancada fria do sushi.",
    ambiente_canonico: "sushi",
    subarea_canonica: null,
    parent: null,
    experimental: false,
    medicao: "carga_por_praca",
    pracas: PRACAS_DE_SUSHI_SEM_QUENTES,
    motivo_sem_medicao: null,
  },
  {
    id: "sushi_quentes",
    rotulo: "Sushi Quentes",
    descricao:
      "Fisicamente separado do Sushi, no salão e perto do Caixa. Produção, ritmo e gargalo próprios.",
    ambiente_canonico: "sushi",
    subarea_canonica: "enrolados_quentes",
    parent: "sushi",
    experimental: true,
    medicao: "carga_por_praca",
    pracas: ["enrolados_quentes"],
    motivo_sem_medicao: null,
  },
  {
    id: "cozinha",
    rotulo: "Cozinha",
    descricao: "Pratos quentes de cozinha, com produção própria.",
    ambiente_canonico: "cozinha",
    subarea_canonica: "cozinha_quentes",
    parent: null,
    experimental: false,
    medicao: "carga_por_praca",
    pracas: ["cozinha_quentes"],
    motivo_sem_medicao: null,
  },
  {
    id: "conferencia",
    rotulo: "Conferência",
    descricao: "Fechamento e conferência do pedido antes de sair.",
    ambiente_canonico: "conferencia",
    subarea_canonica: null,
    parent: null,
    experimental: false,
    medicao: "sinal_por_pedido",
    pracas: PRACAS_DE_CONFERENCIA,
    motivo_sem_medicao:
      "Não existe medição da carga da área. O risco POR PEDIDO continua sendo mostrado.",
  },
  {
    id: "motoboy",
    rotulo: "Motoboy",
    descricao: "Despacho: prontos esperando para sair.",
    ambiente_canonico: "motoboy",
    subarea_canonica: null,
    parent: null,
    experimental: false,
    medicao: "expedicao",
    pracas: [],
    motivo_sem_medicao: null,
  },
];

const POR_ID: ReadonlyMap<UnidadeOperacionalId, UnidadeOperacional> = new Map(
  UNIDADES.map((u) => [u.id, u]),
);

export function unidadePorId(id: UnidadeOperacionalId): UnidadeOperacional {
  const u = POR_ID.get(id);
  if (!u) throw new Error(`Unidade operacional desconhecida: ${String(id)}`);
  return u;
}

export function rotuloDaUnidade(id: UnidadeOperacionalId): string {
  return unidadePorId(id).rotulo;
}

/**
 * A unidade de uma praça, **na leitura do Lab**. É aqui que a promoção acontece:
 * `enrolados_quentes` deixa de responder por Sushi e passa a responder por si.
 * Todas as outras praças seguem o mapa canônico, sem exceção.
 */
export function unidadeDaPraca(praca: PracaId): UnidadeOperacionalId {
  if (praca === "enrolados_quentes") return "sushi_quentes";
  const amb = ambienteDaPraca(praca);
  return amb as UnidadeOperacionalId;
}

/**
 * O caminho do pedido entre unidades. Sushi Quentes entra no caminho por conta
 * própria, e alcança a Conferência como qualquer outra produção.
 */
export interface ArestaDeFluxo {
  readonly de: UnidadeOperacionalId;
  readonly para: UnidadeOperacionalId;
}

export const CAMINHO_DO_PEDIDO_V4: readonly ArestaDeFluxo[] = [
  { de: "caixa", para: "sushi" },
  { de: "caixa", para: "sushi_quentes" },
  { de: "caixa", para: "cozinha" },
  { de: "sushi", para: "conferencia" },
  { de: "sushi_quentes", para: "conferencia" },
  { de: "cozinha", para: "conferencia" },
  { de: "conferencia", para: "motoboy" },
];

/* ================================================================== *
 * ONE_ORDER_ONE_CONSOLIDATION_ENVIRONMENT
 * ================================================================== */

/**
 * A regra física vinculante, declarada pelo César em 2026-08-04.
 *
 * Para cada pedido existe UM ponto de abertura e consolidação. Todas as sacolas
 * daquele pedido são abertas ali, todos os itens convergem para ali, e nada
 * disso se divide: não existe uma parte no Caixa e outra no Delivery, não
 * existe junção posterior, e sacola já aberta não muda de ambiente.
 *
 * Independência produtiva NÃO é independência de consolidação. Sushi Quentes
 * produzir sozinho não autoriza o pedido dele a ser fechado em outro lugar.
 */
export const REGRA_DE_CONSOLIDACAO = "ONE_ORDER_ONE_CONSOLIDATION_ENVIRONMENT" as const;

export type FluxoDeConsolidacao = "delivery_conferencia" | "caixa";

/** As seis condições que o Caixa precisa satisfazer — todas, e comprovadas. */
export type CondicaoCaixa =
  | "composicao_completa_conhecida"
  | "capacidade_do_caixa"
  | "materiais_e_acompanhamentos"
  | "conferencia_integral_ali"
  | "beneficio_operacional"
  | "permanencia_integral";

export const CONDICOES_CAIXA: readonly CondicaoCaixa[] = [
  "composicao_completa_conhecida",
  "capacidade_do_caixa",
  "materiais_e_acompanhamentos",
  "conferencia_integral_ali",
  "beneficio_operacional",
  "permanencia_integral",
];

const ROTULO_CONDICAO: Readonly<Record<CondicaoCaixa, string>> = {
  composicao_completa_conhecida:
    "A composição completa é conhecida antes de abrir a sacola",
  capacidade_do_caixa: "O Caixa tem capacidade agora",
  materiais_e_acompanhamentos: "Materiais e acompanhamentos estão disponíveis",
  conferencia_integral_ali: "A conferência pode acontecer integralmente ali",
  beneficio_operacional: "Existe benefício operacional sustentado",
  permanencia_integral: "O pedido permanece integralmente nesse fluxo",
};

/**
 * `nao_observada` e `nao_comprovada` são coisas diferentes e a interface não
 * pode fundi-las: "ninguém olhou" não é "olhou e não serve". As duas mantêm o
 * pedido no fluxo normal, mas por motivos que a operação lê diferente.
 */
export type EstadoDaCondicao = "comprovada" | "nao_comprovada" | "nao_observada";

export interface CondicaoAvaliada {
  readonly id: CondicaoCaixa;
  readonly rotulo: string;
  readonly estado: EstadoDaCondicao;
  readonly detalhe: string;
}

/** O que a leitura declara sobre as condições do Caixa para um pedido. */
export type DeclaracaoDeCondicoes = Partial<
  Record<CondicaoCaixa, { readonly estado: EstadoDaCondicao; readonly detalhe: string }>
>;

export interface DecisaoDeConsolidacao {
  readonly pedido_id: string;
  readonly regra: typeof REGRA_DE_CONSOLIDACAO;
  readonly fluxo: FluxoDeConsolidacao;
  /** `true` quando o pedido tem item de Sushi: o fluxo não é escolha. */
  readonly obrigatorio: boolean;
  /** `true` quando o pedido chegou a ser AVALIADO para o Caixa. */
  readonly candidato_a_caixa: boolean;
  readonly condicoes: readonly CondicaoAvaliada[];
  readonly unidades_produtoras: readonly UnidadeOperacionalId[];
  readonly motivo: string;
}

function unidadesProdutoras(itens: readonly ItemDoPedido[]): UnidadeOperacionalId[] {
  const vistas: UnidadeOperacionalId[] = [];
  for (const i of itens) {
    if (i.praca === null) continue;
    const u = unidadeDaPraca(i.praca);
    if (!vistas.includes(u)) vistas.push(u);
  }
  return vistas;
}

/**
 * Se o pedido tem item produzido pelo SUSHI — a unidade fria, já sem Sushi
 * Quentes. É esta pergunta, e não "é quente?", que decide o ponto de
 * consolidação.
 */
export function temItemDeSushi(itens: readonly ItemDoPedido[]): boolean {
  return itens.some((i) => i.praca !== null && unidadeDaPraca(i.praca) === "sushi");
}

/**
 * Decide o ponto único de consolidação do pedido.
 *
 * A assimetria é deliberada e é o coração da regra:
 *
 *   tem Sushi                              -> Delivery/Conferência, OBRIGATÓRIO
 *   não tem Sushi, condições todas comprovadas -> Caixa
 *   não tem Sushi, qualquer outra coisa    -> Delivery/Conferência
 *
 * Ausência de Sushi **não** é elegibilidade. Ela só abre a avaliação. Condição
 * não observada, desconhecida ou não comprovada mantém o pedido no fluxo
 * normal — o Caixa nunca é rota padrão, e nunca é alcançado por omissão.
 */
export function decidirConsolidacao(
  pedido: PedidoLeitura,
  declaradas: DeclaracaoDeCondicoes = {},
): DecisaoDeConsolidacao {
  const produtoras = unidadesProdutoras(pedido.itens);
  const comSushi = temItemDeSushi(pedido.itens);

  const condicoes: CondicaoAvaliada[] = CONDICOES_CAIXA.map((id) => {
    const d = declaradas[id];
    return {
      id,
      rotulo: ROTULO_CONDICAO[id],
      // Sem declaração explícita, a condição é NÃO OBSERVADA. Nunca comprovada.
      estado: d?.estado ?? "nao_observada",
      detalhe: d?.detalhe ?? "Nada nesta leitura observou esta condição.",
    };
  });

  if (comSushi) {
    return {
      pedido_id: pedido.id,
      regra: REGRA_DE_CONSOLIDACAO,
      fluxo: "delivery_conferencia",
      obrigatorio: true,
      candidato_a_caixa: false,
      condicoes,
      unidades_produtoras: produtoras,
      motivo:
        "O pedido tem item do Sushi. Ele é consolidado integralmente no Delivery/Conferência, e os itens de Sushi Quentes e Cozinha convergem para a sacola aberta ali.",
    };
  }

  const faltando = condicoes.filter((c) => c.estado !== "comprovada");
  if (faltando.length > 0) {
    return {
      pedido_id: pedido.id,
      regra: REGRA_DE_CONSOLIDACAO,
      fluxo: "delivery_conferencia",
      obrigatorio: false,
      candidato_a_caixa: true,
      condicoes,
      unidades_produtoras: produtoras,
      motivo: `O pedido não tem Sushi, então foi avaliado para o Caixa — e segue no fluxo normal porque ${faltando.length} de ${CONDICOES_CAIXA.length} condições não estão comprovadas: ${faltando
        .map((c) => c.rotulo.toLowerCase())
        .join("; ")}.`,
    };
  }

  return {
    pedido_id: pedido.id,
    regra: REGRA_DE_CONSOLIDACAO,
    fluxo: "caixa",
    obrigatorio: false,
    candidato_a_caixa: true,
    condicoes,
    unidades_produtoras: produtoras,
    motivo:
      "O pedido não tem Sushi e as seis condições estão comprovadas antes da abertura. Ele pode ser aberto, montado e conferido integralmente no Caixa — e permanece inteiro nesse fluxo.",
  };
}

/**
 * O que o Lab NÃO consegue provar hoje, e é melhor dizer alto.
 *
 * `capacidade_do_caixa` nunca pode ser comprovada por fonte real: a Caixa é
 * `sem_medicao_automatica`, e nenhuma fonte mede aquela fila. Logo, com as
 * fontes de hoje, **a rota do Caixa é inalcançável fora de fixture**. Nas cenas
 * deste Lab ela é declarada, e declaração de fixture não é medição.
 */
export const LIMITE_CONHECIDO_DA_ROTA_DO_CAIXA =
  "Com as fontes de hoje, `capacidade_do_caixa` não pode ser comprovada por medição: nenhuma fonte mede a fila da Caixa. Fora de fixture, a rota do Caixa permanece inalcançável — e é assim que deve permanecer até existir fonte.";
