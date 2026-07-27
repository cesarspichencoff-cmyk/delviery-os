/**
 * Copiloto em shadow — recomenda, nunca executa.
 *
 * Toda recomendação daqui é uma proposta com prazo de validade, evidência
 * rastreável e versão de política. Nenhuma delas age.
 *
 * O estado `executed` NÃO EXISTE neste arquivo, e a ausência é deliberada: se o
 * tipo permitisse representá-lo, alguém eventualmente o escreveria — e a
 * primeira automação real do DeliveryOS teria nascido de um campo que ninguém
 * decidiu criar. Automação entra no Macro-Prompt 3, com aprovação humana e
 * kill switch, não por descuido de tipagem.
 *
 * A outra regra estrutural: o Copiloto lê projeção e escreve recomendação.
 * Ele não grava fato de viagem, não toca GPS, e não está no caminho síncrono de
 * ninguém. Se ele travar, o pior que acontece é a fila crescer.
 */

import { createHash } from "node:crypto";
import type { SourceMode } from "../contracts/event-catalog";
import type { Dimensoes, Projecao, ViagemProjetada } from "../projections/operacao-viva";

export const POLICY_VERSION = "copiloto-shadow@1.0.0";

/* ------------------------------------------------------------------ *
 * Contrato
 * ------------------------------------------------------------------ */

/**
 * Estados possíveis. Note o que falta.
 *
 * `accepted_for_future` é aceite de um humano para quando houver automação —
 * registra a intenção sem executar nada agora.
 */
export type RecommendationStatus =
  | "proposed"
  | "expired"
  | "dismissed"
  | "accepted_for_future"
  | "invalidated";

export type RiskLevel = "baixo" | "medio" | "alto";

export interface Recomendacao {
  recommendation_id: string;
  policy_id: string;
  policy_version: string;
  /** Os eventos que sustentam esta recomendação. Vazio é inaceitável. */
  input_event_ids: readonly string[];
  projection_version: string;
  source_mode: SourceMode;
  /** 0..1. Ausente nunca — ver `exigirConfianca`. */
  confidence: number;
  risk_level: RiskLevel;
  recommended_action: string;
  /** Por que, em português, para quem vai ler no balcão. */
  reason: string;
  /** O que NÃO foi possível saber — tão importante quanto o que se sabe. */
  indisponivel: readonly string[];
  requires_human: boolean;
  created_at: string;
  expires_at: string;
  status: RecommendationStatus;
}

/** Uma política é uma função pura da projeção para zero ou uma recomendação. */
export interface Politica {
  policy_id: string;
  /** Quanto tempo a recomendação continua fazendo sentido. */
  validade_s: number;
  avaliar(p: Projecao, ctx: ContextoPolitica): PropostaCrua | null;
}

export interface ContextoPolitica {
  agora: Date;
  /** Sinais que o motor sabe que não tem. */
  indisponivel: readonly string[];
}

export interface PropostaCrua {
  recommended_action: string;
  reason: string;
  confidence: number;
  risk_level: RiskLevel;
  input_event_ids: readonly string[];
  requires_human: boolean;
}

/* ------------------------------------------------------------------ *
 * Políticas
 * ------------------------------------------------------------------ */

function eventosDe(viagens: readonly ViagemProjetada[]): string[] {
  // Só os últimos de cada viagem: a recomendação precisa ser auditável, não
  // carregar o histórico inteiro. Um id por viagem basta para reconstruir.
  return viagens.map((v) => v.eventos[v.eventos.length - 1]).filter(Boolean);
}

/**
 * Sinal velho demais para decidir.
 *
 * A recomendação NÃO é "faça X na rua" — é "não confie no painel agora". Um
 * copiloto que recomenda ação operacional com dado velho é pior que um copiloto
 * calado, porque empresta confiança a um número que não a merece.
 */
export const POLITICA_SINAL_VELHO: Politica = {
  policy_id: "sinal-velho",
  validade_s: 300,
  avaliar(p) {
    const cegas = p.viagens.filter(
      (v) => (v.frescor === "stale" || v.frescor === "unknown") && v.estado === "em_rota",
    );
    if (cegas.length === 0) return null;

    const proporcao = cegas.length / Math.max(1, p.viagens.filter((v) => v.estado === "em_rota").length);
    return {
      recommended_action: "verificar_contato_com_entregadores",
      reason:
        cegas.length === 1
          ? `1 viagem em rota está sem posição recente (${cegas[0].trip_id}). O painel não sabe onde ela está.`
          : `${cegas.length} viagens em rota estão sem posição recente. O painel não sabe onde elas estão.`,
      // A confiança é sobre a RECOMENDAÇÃO, não sobre o dado. Aqui ela é alta
      // justamente porque a ausência de sinal é um fato observado com certeza.
      confidence: Math.min(0.95, 0.6 + proporcao * 0.35),
      risk_level: proporcao > 0.5 ? "alto" : "medio",
      input_event_ids: eventosDe(cegas),
      requires_human: true,
    };
  },
};

/** Carga acima do que a unidade sustenta. */
export const POLITICA_CAPACIDADE: Politica = {
  policy_id: "capacidade-saturada",
  validade_s: 600,
  avaliar(p) {
    const { capacidade_operacional, carga } = p.dimensoes;
    if (capacidade_operacional === "desconhecida") return null;
    if (capacidade_operacional > 0) return null;
    const abertas = p.viagens.filter((v) => v.estado !== "encerrada");
    return {
      recommended_action: "avaliar_pausa_seletiva",
      reason: `${carga} viagens abertas — a unidade está no limite configurado.`,
      confidence: 0.7,
      risk_level: "medio",
      input_event_ids: eventosDe(abertas),
      requires_human: true,
    };
  },
};

/** Ocorrências acumulando sem tratamento. */
export const POLITICA_OCORRENCIAS: Politica = {
  policy_id: "ocorrencias-acumuladas",
  validade_s: 900,
  avaliar(p) {
    if (p.dimensoes.ocorrencias < 2) return null;
    const comOcorrencia = p.viagens.filter((v) => v.ocorrencias_abertas > 0);
    return {
      recommended_action: "revisar_ocorrencias_abertas",
      reason: `${p.dimensoes.ocorrencias} ocorrências abertas em ${comOcorrencia.length} viagem(ns).`,
      confidence: 0.65,
      risk_level: "baixo",
      input_event_ids: eventosDe(comOcorrencia),
      requires_human: true,
    };
  },
};

export const POLITICAS_PADRAO: readonly Politica[] = [
  POLITICA_SINAL_VELHO,
  POLITICA_CAPACIDADE,
  POLITICA_OCORRENCIAS,
];

/* ------------------------------------------------------------------ *
 * Motor
 * ------------------------------------------------------------------ */

/**
 * Id determinístico por (política, projeção, ação).
 *
 * Determinístico de propósito: reprocessar o mesmo log NÃO pode multiplicar
 * recomendações. Com id aleatório, um replay do dia inteiro encheria o painel
 * de duplicatas idênticas e a operação aprenderia a ignorar o painel.
 */
function idDeterministico(policyId: string, p: Projecao, acao: string): string {
  const base = [
    policyId,
    POLICY_VERSION,
    p.projection_version,
    p.unit_id,
    p.source_mode,
    acao,
    // O cursor identifica ATÉ ONDE a projeção enxergou. Duas projeções com o
    // mesmo cursor viram o mesmo mundo e devem produzir a mesma recomendação.
    p.cursor?.event_id ?? "sem-cursor",
  ].join("|");
  return `rec-${createHash("sha256").update(base).digest("hex").slice(0, 24)}`;
}

export interface OpcoesShadow {
  agora: Date;
  politicas?: readonly Politica[];
  /** Sinais que o operador sabe estarem fora do ar. */
  indisponivel?: readonly string[];
}

/**
 * Avalia todas as políticas contra a projeção.
 *
 * Recomendação de projeção `simulated` ou `control` nasce carimbada como tal e
 * jamais pode ser apresentada como leitura da rua.
 */
export function recomendar(p: Projecao, opcoes: OpcoesShadow): Recomendacao[] {
  const politicas = opcoes.politicas ?? POLITICAS_PADRAO;
  const indisponivel = opcoes.indisponivel ?? [];
  const ctx: ContextoPolitica = { agora: opcoes.agora, indisponivel };
  const saida: Recomendacao[] = [];

  for (const pol of politicas) {
    let crua: PropostaCrua | null;
    try {
      crua = pol.avaliar(p, ctx);
    } catch {
      // Política que explode não derruba as outras nem o worker. O Copiloto
      // inteiro pode estar errado sem que a rua sinta.
      continue;
    }
    if (!crua) continue;

    if (crua.input_event_ids.length === 0) {
      // Recomendação sem evidência é palpite. Descartada em silêncio seria
      // pior — mas apresentá-la seria pior ainda.
      continue;
    }
    const confianca = exigirConfianca(crua.confidence);
    if (confianca === null) continue;

    saida.push({
      recommendation_id: idDeterministico(pol.policy_id, p, crua.recommended_action),
      policy_id: pol.policy_id,
      policy_version: POLICY_VERSION,
      input_event_ids: crua.input_event_ids,
      projection_version: p.projection_version,
      source_mode: p.source_mode,
      confidence: confianca,
      risk_level: crua.risk_level,
      recommended_action: crua.recommended_action,
      reason: crua.reason,
      indisponivel,
      // Nesta missão, sempre. O campo existe para o dia em que houver ação
      // automática — e nesse dia ele será a diferença entre as duas coisas.
      requires_human: true,
      created_at: opcoes.agora.toISOString(),
      expires_at: new Date(opcoes.agora.getTime() + pol.validade_s * 1000).toISOString(),
      status: "proposed",
    });
  }

  return saida.sort((a, b) => a.recommendation_id.localeCompare(b.recommendation_id));
}

/**
 * Confiança ausente ou fora de faixa invalida a recomendação.
 *
 * Não existe padrão. Um `confidence` que assume 1 quando ninguém informou
 * apresenta um palpite com a cara de uma certeza.
 */
export function exigirConfianca(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < 0 || v > 1) return null;
  return Math.round(v * 100) / 100;
}

/** Recomendação vencida deixa de ser proposta. */
export function envelhecer(r: Recomendacao, agora: Date): Recomendacao {
  if (r.status !== "proposed") return r;
  if (Date.parse(r.expires_at) > agora.getTime()) return r;
  return { ...r, status: "expired" };
}

/**
 * Invalida recomendações cuja base mudou.
 *
 * Sem isso, uma recomendação continuaria no painel depois de o problema ter
 * passado — e o painel viraria uma lista de coisas que já não são verdade, que
 * é exatamente o que o DeliveryOS existe para não ser.
 */
export function invalidarSuperadas(
  anteriores: readonly Recomendacao[],
  atuais: readonly Recomendacao[],
  agora: Date,
): Recomendacao[] {
  const vivas = new Set(atuais.map((r) => r.recommendation_id));
  return anteriores.map((r) =>
    r.status === "proposed" && !vivas.has(r.recommendation_id)
      ? { ...r, status: "invalidated" as const }
      : envelhecer(r, agora),
  );
}

/**
 * O que o painel mostra.
 *
 * Inclui `porque_nao_executada` porque a pergunta aparece sozinha na cabeça de
 * quem lê: se o sistema sabe, por que não fez? A resposta honesta é que ele não
 * age — e dizer isso é o que mantém a confiança quando um dia ele agir.
 */
export function paraPainel(r: Recomendacao): Record<string, unknown> {
  return {
    recomendacao: r.recommended_action,
    motivo: r.reason,
    fatos_utilizados: r.input_event_ids,
    confianca: r.confidence,
    risco: r.risk_level,
    origem: r.source_mode,
    validade: r.expires_at,
    indisponivel: r.indisponivel,
    porque_nao_executada:
      "O Copiloto está em modo sombra: ele observa e propõe, e nenhuma ação é executada automaticamente.",
    status: r.status,
    politica: `${r.policy_id}@${r.policy_version}`,
  };
}

/** Sinais que a projeção não conseguiu apurar. */
export function indisponiveisDe(d: Dimensoes): string[] {
  const fora: string[] = [];
  if (d.integridade_sinal === "unknown") fora.push("integridade_sinal");
  if (d.capacidade_operacional === "desconhecida") fora.push("capacidade_operacional");
  if (d.saude_sincronizacao === "unknown") fora.push("saude_sincronizacao");
  return fora;
}
