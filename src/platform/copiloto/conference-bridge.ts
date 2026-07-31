/**
 * Conference Brain -> Copiloto shadow.
 *
 * O `shadow.ts` ao lado já recomenda a partir da projeção da Operação Viva, e
 * continua fazendo isso. Este arquivo é a outra entrada: recomenda a partir das
 * CONCLUSÕES do Conference Brain, que é a cadeia autorizada da Unidade 5.
 *
 * Ele recebe conclusões como objetos simples e não importa nada do
 * `conference-brain`. É o espelho do adapter da Unidade 4, que recebia a
 * projeção como objeto simples e não importava nada da plataforma. Os dois
 * subsistemas se falam por dado, nunca por dependência — em nenhuma direção.
 *
 * ## O que este arquivo se recusa a fazer
 *
 * Uma conclusão sobre a SAÚDE DA FONTE nunca produz recomendação sobre PEDIDO.
 * Isso não é uma checagem defensiva: é a razão de existir do arquivo. A cadeia
 * real de hoje só produz conclusões de saúde — porque o adapter da Operação
 * Viva não emite pedido (D29) — então a cadeia real, hoje, é estruturalmente
 * incapaz de gerar recomendação de pedido. Se um dia gerar, terá sido porque
 * uma observação legítima de pedido existiu, não porque alguém afrouxou aqui.
 *
 * ## Duas coisas que não são a mesma e não compartilham campo
 *
 *   status          ciclo de vida da recomendação (proposta, vencida, retirada)
 *   evidence_grade  qualidade da evidência que a sustenta
 *
 * Fundi-los seria repetir exatamente o erro que o modelo multidimensional do
 * Brain existe para corrigir: um eixo carregando dois fatos independentes que
 * mudam em momentos diferentes e por causas diferentes.
 *
 * Puro e determinístico: mesmas conclusões + mesmo relógio = mesma saída. Não
 * lê banco, não escreve arquivo, não executa nada, e não está no caminho
 * síncrono de ninguém.
 */

import { createHash } from "node:crypto";
import type { SourceMode } from "../contracts/event-catalog";
import type { Recomendacao, RecommendationStatus, RiskLevel } from "./shadow";
import { exigirConfianca, invalidarSuperadas } from "./shadow";

export const BRIDGE_VERSION = "copiloto-conference-bridge@1.0.0";

/* ------------------------------------------------------------------ *
 * Entrada — o que o Brain entrega
 * ------------------------------------------------------------------ */

export type ConclusionKind = "source_health" | "order_dimension";

export interface Evidencia {
  tipo: string;
  ref: string;
}

/** Conclusão versionada do Conference Brain. Objeto simples, sem comportamento. */
export interface Conclusao {
  conclusion_version: string;
  conclusion_kind: ConclusionKind;
  conclusion_ref: string;
  unit_id: string;
  source_mode: SourceMode;
  shadow: boolean;
  observed_at: string | null;
  source_health: string;
  /** Calculado pela regra do Brain. Nunca reinterpretado aqui. */
  pode_afirmar: boolean;
  evidence: readonly Evidencia[];
  limitacoes: readonly string[];
  notas?: readonly string[];
  /** Só em `order_dimension`. */
  external_id?: string;
  order_state?: string | null;
  readiness_state?: string | null;
  saida_observada?: boolean | null;
  observacoes?: number;
  orders_observed?: number | null;
}

/** Versão da entrada que este código sabe ler. Major diferente é recusa. */
export const CONCLUSION_VERSION_SUPORTADA = "conference-brain-conclusion@1.0.0";

/* ------------------------------------------------------------------ *
 * Saída
 * ------------------------------------------------------------------ */

/**
 * Qualidade da evidência. Eixo próprio, separado do `status`.
 *
 * `insuficiente` nunca aparece numa recomendação — ela é o motivo de a
 * recomendação NÃO existir, e viaja em `recusas`.
 */
export type EvidenceGrade = "sustentada" | "degradada" | "stale" | "insuficiente";

/** Sobre o que a recomendação fala. Uma conclusão de fonte nunca vira "pedido". */
export type EscopoRecomendacao = "fonte" | "pedido";

export interface RecomendacaoShadow extends Recomendacao {
  bridge_version: string;
  unit_id: string;
  /** Identidade da conclusão que a sustenta — a volta até a origem. */
  conclusion_ref: string;
  conclusion_version: string;
  conclusion_kind: ConclusionKind;
  escopo: EscopoRecomendacao;
  /** Só existe quando a recomendação é sobre um pedido observado. */
  external_id: string | null;
  titulo: string;
  descricao: string;
  evidencias: readonly Evidencia[];
  evidence_grade: EvidenceGrade;
  limitacoes: readonly string[];
  /** Literal. Não é configuração — é o que este subsistema é. */
  shadow: true;
  motivo_de_saida: string | null;
}

export interface Recusa {
  conclusion_ref: string | null;
  estado: "insufficient_evidence" | "fora_de_escopo" | "versao_incompativel" | "escopo_divergente";
  motivo: string;
}

export interface ResultadoShadow {
  bridge_version: string;
  shadow: true;
  avaliado_em: string;
  escopo: { unit_id: string; source_mode: SourceMode } | null;
  recomendacoes: readonly RecomendacaoShadow[];
  recusas: readonly Recusa[];
}

/* ------------------------------------------------------------------ *
 * Políticas
 * ------------------------------------------------------------------ */

interface Proposta {
  policy_id: string;
  validade_s: number;
  escopo: EscopoRecomendacao;
  titulo: string;
  descricao: string;
  recommended_action: string;
  confidence: number;
  risk_level: RiskLevel;
}

/**
 * Confiança por estado de saúde da fonte.
 *
 * Alta de propósito, e o motivo é o mesmo do `POLITICA_SINAL_VELHO` do
 * `shadow.ts`: a recomendação não é "faça X na rua", é "não confie no painel".
 * A fonte declarando a própria degradação é um fato observado com certeza — a
 * confiança é sobre a RECOMENDAÇÃO, nunca sobre o dado degradado.
 *
 * `available` não aparece: fonte saudável não gera recomendação nenhuma.
 */
const CONFIANCA_POR_SAUDE: Readonly<Record<string, number>> = Object.freeze({
  stale: 0.9,
  partial: 0.75,
  unavailable: 0.85,
  layout_changed: 0.85,
  inconsistent: 0.85,
  login_required: 0.95,
  captcha_present: 0.95,
  recovering: 0.6,
});

const RISCO_POR_SAUDE: Readonly<Record<string, RiskLevel>> = Object.freeze({
  stale: "alto",
  partial: "medio",
  unavailable: "alto",
  layout_changed: "alto",
  inconsistent: "alto",
  login_required: "alto",
  captcha_present: "alto",
  recovering: "baixo",
});

function politicaFonte(c: Conclusao): Proposta | null {
  if (c.conclusion_kind !== "source_health") return null;
  const confianca = CONFIANCA_POR_SAUDE[c.source_health];
  if (confianca === undefined) return null; // `available` e desconhecidos: calado

  const faltando = c.limitacoes.length;
  return {
    policy_id: "fonte-nao-confiavel",
    validade_s: 300,
    escopo: "fonte",
    titulo: "Leitura da Conferência incompleta",
    descricao:
      faltando > 0
        ? `A fonte reportou "${c.source_health}" e declarou ${faltando} campo(s) que não consegue fornecer. O painel da Conferência não deve ser lido como retrato do que está acontecendo.`
        : `A fonte reportou "${c.source_health}". O painel da Conferência não deve ser lido como retrato do que está acontecendo.`,
    recommended_action: "conferir_fonte_da_conferencia",
    confidence: confianca,
    risk_level: RISCO_POR_SAUDE[c.source_health] ?? "medio",
  };
}

/**
 * Pedido pronto sem saída observada.
 *
 * Só roda com conclusão de PEDIDO, e só quando o Brain autorizou afirmar
 * (`pode_afirmar`). Ausência de evento de saída é `null` — desconhecido — e
 * nunca "não saiu": a recomendação é para CONFERIR, não para afirmar atraso.
 */
function politicaPedido(c: Conclusao): Proposta | null {
  if (c.conclusion_kind !== "order_dimension") return null;
  if (c.order_state !== "ready") return null;
  if (c.saida_observada === true) return null;

  const notificado = c.readiness_state === "ready_notified";
  return {
    policy_id: "pedido-pronto-sem-saida",
    validade_s: 900,
    escopo: "pedido",
    titulo: "Pedido pronto sem saída observada",
    descricao: notificado
      ? "O pedido está pronto e a prontidão foi informada à plataforma, e nenhuma saída foi observada até agora."
      : "O pedido está pronto e nenhuma saída foi observada até agora.",
    recommended_action: "conferir_pedido_pronto",
    confidence: notificado ? 0.8 : 0.7,
    risk_level: "medio",
  };
}

const POLITICAS: readonly ((c: Conclusao) => Proposta | null)[] = [politicaFonte, politicaPedido];

/* ------------------------------------------------------------------ *
 * Motor
 * ------------------------------------------------------------------ */

/**
 * Id determinístico por (ponte, política, conclusão, escopo).
 *
 * A conclusão entra pela identidade, e não pelo conteúdo: duas leituras da
 * MESMA conclusão são a mesma recomendação, e reprocessar o histórico inteiro
 * não pode multiplicar linha no painel.
 */
function idDeterministico(policyId: string, c: Conclusao): string {
  const base = [BRIDGE_VERSION, policyId, c.unit_id, c.source_mode, c.conclusion_ref].join("|");
  return `rec-${createHash("sha256").update(base).digest("hex").slice(0, 24)}`;
}

/** Status que não voltam atrás. Ver `recomendarDeConclusoes`. */
const TERMINAIS: readonly RecommendationStatus[] = ["expired", "dismissed", "invalidated"];

function grauDeEvidencia(c: Conclusao, escopo: EscopoRecomendacao): EvidenceGrade {
  if (c.evidence.length === 0) return "insuficiente";
  if (c.source_health === "stale") return "stale";
  // Para recomendação de PEDIDO, a regra do Brain manda: sem autorização para
  // afirmar, não há leitura confiante sobre a operação.
  if (escopo === "pedido" && !c.pode_afirmar) return "insuficiente";
  if (c.limitacoes.length > 0) return "degradada";
  return "sustentada";
}

export interface OpcoesBridge {
  agora: Date;
  /** Recomendações já persistidas. Governam ressurreição e retirada. */
  anteriores?: readonly RecomendacaoShadow[];
  /** Escopo esperado. Conclusão divergente é recusada, nunca filtrada em silêncio. */
  unit_id?: string;
  source_mode?: SourceMode;
}

/**
 * Avalia conclusões e devolve recomendações em sombra.
 *
 * Nunca lança: conclusão malformada vira recusa declarada. O Copiloto inteiro
 * pode estar errado sem que a Conferência, a Operação Viva ou a rua sintam.
 */
export function recomendarDeConclusoes(
  conclusoes: readonly Conclusao[],
  opcoes: OpcoesBridge,
): ResultadoShadow {
  const agora = opcoes.agora;
  const anteriores = opcoes.anteriores ?? [];
  const recusas: Recusa[] = [];
  const novas: RecomendacaoShadow[] = [];

  // Decisões terminais anteriores, por id. Uma recomendação retirada por gente
  // não pode voltar só porque a mesma conclusão foi lida de novo — e como o id
  // é determinístico pela IDENTIDADE da conclusão, id repetido significa
  // literalmente a mesma conclusão, não uma ocorrência nova.
  const terminais = new Map<string, RecomendacaoShadow>();
  for (const a of anteriores) {
    if (TERMINAIS.includes(a.status)) terminais.set(a.recommendation_id, a);
  }

  // Tipada explicitamente: `Array.isArray` alarga um `readonly T[]` para
  // `any[]`, e a inferência se perderia justamente dentro do laço.
  const lista: readonly Conclusao[] = Array.isArray(conclusoes) ? conclusoes : [];
  for (const c of lista) {
    if (!c || typeof c !== "object") {
      recusas.push({ conclusion_ref: null, estado: "fora_de_escopo", motivo: "conclusao_invalida" });
      continue;
    }
    const major = (v: string): string => String(v ?? "").split("@").pop()?.split(".")[0] ?? "";
    if (major(c.conclusion_version) !== major(CONCLUSION_VERSION_SUPORTADA)) {
      recusas.push({
        conclusion_ref: c.conclusion_ref ?? null,
        estado: "versao_incompativel",
        motivo: `conclusao ${String(c.conclusion_version)} incompativel com ${CONCLUSION_VERSION_SUPORTADA}`,
      });
      continue;
    }
    // Modo divergente é recusa da conclusão, nunca mistura silenciosa: um
    // número que soma real com simulado não descreve nem um nem outro.
    if (
      (opcoes.unit_id !== undefined && c.unit_id !== opcoes.unit_id) ||
      (opcoes.source_mode !== undefined && c.source_mode !== opcoes.source_mode)
    ) {
      recusas.push({
        conclusion_ref: c.conclusion_ref ?? null,
        estado: "escopo_divergente",
        motivo: `esperado ${String(opcoes.unit_id)}/${String(opcoes.source_mode)}, veio ${String(c.unit_id)}/${String(c.source_mode)}`,
      });
      continue;
    }

    for (const politica of POLITICAS) {
      let proposta: Proposta | null;
      try {
        proposta = politica(c);
      } catch {
        // Política que explode não derruba as outras. Mesma regra do shadow.ts.
        continue;
      }
      if (!proposta) continue;

      // A trava central da Unidade 5: conclusão de fonte nunca vira pedido.
      if (proposta.escopo === "pedido" && c.conclusion_kind !== "order_dimension") continue;
      if (proposta.escopo === "pedido" && !c.external_id) {
        recusas.push({
          conclusion_ref: c.conclusion_ref,
          estado: "insufficient_evidence",
          motivo: "recomendacao_de_pedido_exige_identidade_de_pedido_observada",
        });
        continue;
      }

      const grau = grauDeEvidencia(c, proposta.escopo);
      if (grau === "insuficiente") {
        recusas.push({
          conclusion_ref: c.conclusion_ref,
          estado: "insufficient_evidence",
          motivo:
            c.evidence.length === 0
              ? "conclusao_sem_evidencia_rastreavel"
              : "fonte_nao_autoriza_afirmar_sobre_a_operacao",
        });
        continue;
      }

      const confianca = exigirConfianca(proposta.confidence);
      if (confianca === null) {
        // Não existe confiança padrão. Sem número válido, não há recomendação.
        recusas.push({
          conclusion_ref: c.conclusion_ref,
          estado: "insufficient_evidence",
          motivo: "confianca_invalida_ou_ausente",
        });
        continue;
      }

      const id = idDeterministico(proposta.policy_id, c);
      const terminal = terminais.get(id);
      if (terminal) {
        // Expirada, retirada ou invalidada não volta. Carrega-se o registro
        // terminal adiante para que o painel possa dizer POR QUE não está lá.
        novas.push(terminal);
        continue;
      }

      novas.push({
        recommendation_id: id,
        bridge_version: BRIDGE_VERSION,
        policy_id: proposta.policy_id,
        policy_version: BRIDGE_VERSION,
        unit_id: c.unit_id,
        conclusion_ref: c.conclusion_ref,
        conclusion_version: c.conclusion_version,
        conclusion_kind: c.conclusion_kind,
        escopo: proposta.escopo,
        external_id: proposta.escopo === "pedido" ? (c.external_id ?? null) : null,
        titulo: proposta.titulo,
        descricao: proposta.descricao,
        // `input_event_ids` é o contrato antigo do shadow.ts e continua valendo:
        // são as referências que sustentam a recomendação.
        input_event_ids: c.evidence.map((e) => e.ref),
        evidencias: c.evidence,
        evidence_grade: grau,
        projection_version: c.conclusion_version,
        source_mode: c.source_mode,
        confidence: confianca,
        risk_level: proposta.risk_level,
        recommended_action: proposta.recommended_action,
        reason: proposta.descricao,
        indisponivel: c.limitacoes,
        limitacoes: c.limitacoes,
        requires_human: true,
        shadow: true,
        created_at: agora.toISOString(),
        expires_at: new Date(agora.getTime() + proposta.validade_s * 1000).toISOString(),
        status: "proposed",
        motivo_de_saida: null,
      });
    }
  }

  novas.sort((a, b) => a.recommendation_id.localeCompare(b.recommendation_id));

  // Retirada e expiração vêm da função já comprovada no shadow.ts: uma
  // recomendação anterior que não aparece mais entre as atuais teve a base
  // removida e vira `invalidated`; as demais envelhecem. Reimplementar isso
  // aqui criaria uma segunda verdade sobre quando algo deixa de valer.
  const reconciliadas = invalidarSuperadas(
    anteriores as readonly Recomendacao[],
    novas as readonly Recomendacao[],
    agora,
  ) as RecomendacaoShadow[];

  const porId = new Map<string, RecomendacaoShadow>();
  for (const r of reconciliadas) porId.set(r.recommendation_id, comMotivoDeSaida(r));
  for (const r of novas) if (!porId.has(r.recommendation_id)) porId.set(r.recommendation_id, r);

  const finais = [...porId.values()].sort((a, b) =>
    a.recommendation_id.localeCompare(b.recommendation_id),
  );

  return {
    bridge_version: BRIDGE_VERSION,
    shadow: true,
    avaliado_em: agora.toISOString(),
    escopo:
      opcoes.unit_id && opcoes.source_mode
        ? { unit_id: opcoes.unit_id, source_mode: opcoes.source_mode }
        : null,
    recomendacoes: finais,
    recusas,
  };
}

/** O painel precisa dizer POR QUE algo saiu, não só que saiu. */
function comMotivoDeSaida(r: RecomendacaoShadow): RecomendacaoShadow {
  if (r.status === "proposed" || r.motivo_de_saida) return r;
  const motivo =
    r.status === "expired"
      ? "validade_vencida"
      : r.status === "invalidated"
        ? "evidencia_deixou_de_existir"
        : r.status === "dismissed"
          ? "retirada_por_decisao_humana"
          : "aceita_para_o_futuro_sem_execucao";
  return { ...r, motivo_de_saida: motivo };
}

/** Só o que está de pé agora. Nada de expirado ou retirado aparece como ativo. */
export function ativas(r: ResultadoShadow): readonly RecomendacaoShadow[] {
  return r.recomendacoes.filter((x) => x.status === "proposed");
}

/**
 * Retirada por decisão humana. É registro, não execução: nenhuma ação acontece
 * no mundo, e o `dismissed` volta na próxima avaliação como decisão terminal.
 */
export function retirar(r: RecomendacaoShadow, motivo: string): RecomendacaoShadow {
  return { ...r, status: "dismissed", motivo_de_saida: motivo || "retirada_por_decisao_humana" };
}

/** Registro persistível — a forma que o store do Conference Brain aceita. */
export function paraRegistro(r: RecomendacaoShadow): Record<string, unknown> {
  return {
    recommendation_id: r.recommendation_id,
    unit_id: r.unit_id,
    source_mode: r.source_mode,
    conclusion_ref: r.conclusion_ref,
    conclusion_version: r.conclusion_version,
    policy_id: r.policy_id,
    policy_version: r.policy_version,
    bridge_version: r.bridge_version,
    escopo: r.escopo,
    external_id: r.external_id,
    titulo: r.titulo,
    descricao: r.descricao,
    evidencias: r.evidencias,
    evidence_grade: r.evidence_grade,
    limitacoes: r.limitacoes,
    confidence: r.confidence,
    risk_level: r.risk_level,
    recommended_action: r.recommended_action,
    requires_human: r.requires_human,
    shadow: r.shadow,
    created_at: r.created_at,
    expires_at: r.expires_at,
    status: r.status,
    motivo_de_saida: r.motivo_de_saida,
  };
}

/** Volta do store para o contrato em memória. */
export function deRegistro(reg: Record<string, unknown>): RecomendacaoShadow {
  const r = reg as unknown as RecomendacaoShadow;
  return {
    ...r,
    input_event_ids: (r.evidencias ?? []).map((e: Evidencia) => e.ref),
    evidencias: r.evidencias ?? [],
    limitacoes: r.limitacoes ?? [],
    indisponivel: r.limitacoes ?? [],
    projection_version: r.conclusion_version,
    reason: r.descricao,
    conclusion_kind: r.escopo === "pedido" ? "order_dimension" : "source_health",
    shadow: true,
  };
}
