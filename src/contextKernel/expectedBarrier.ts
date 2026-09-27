import type { OperationalEpisodeEvidence } from "./episodeRecurrence";

export const TATA_ACADEMIA_BARRIER_SNAPSHOT = {
  repository: "cesarspichencoff-cmyk/tata-academia",
  branch: "evolucao/v33-product-pass",
  head: "4d656c9eb6b3ab4e5314e6a62973c9f7cdac6779",
  content_file: "content-source/worlds_4_6_content.json",
  content_blob: "c1f408fc3d335eadf12cc85fa9efb89101701cc1",
} as const;

export interface ExpectedBarrierKnowledge {
  barrier_id: string;
  mechanism_keys: string[];
  academia_claim_ids: string[];
  title: string;
  expected_procedure: string;
  truth_class: "FACT";
  source_status:
    | "PROVEN_FIELD_CONVERSATION"
    | "PROVEN_LIVE_SOURCE_AUDIT";
  proves_execution_on_episode: false;
}

export const EXPECTED_BARRIERS: readonly ExpectedBarrierKnowledge[] = [
  {
    barrier_id: "IDENTIFY_BEFORE_ADVANCE",
    mechanism_keys: ["OMISSION"],
    academia_claim_ids: ["BOQ-002"],
    title: "Identificar antes de avançar",
    expected_procedure:
      "Item sem comanda ou sacola identificável deve ser confirmado antes de avançar.",
    truth_class: "FACT",
    source_status: "PROVEN_FIELD_CONVERSATION",
    proves_execution_on_episode: false,
  },
  {
    barrier_id: "REUNITE_COMPLETE_ORDER",
    mechanism_keys: ["OMISSION"],
    academia_claim_ids: ["ORDER-001", "BOQ-004"],
    title: "Reunir o pedido inteiro",
    expected_procedure:
      "Todos os volumes do pedido devem permanecer identificados e reunidos; uma parte não prova que o conjunto inteiro avançou.",
    truth_class: "FACT",
    source_status: "PROVEN_FIELD_CONVERSATION",
    proves_execution_on_episode: false,
  },
  {
    barrier_id: "PHYSICAL_POST_PRINT_CHECK",
    mechanism_keys: ["OMISSION"],
    academia_claim_ids: ["COMANDA-005"],
    title: "Conferir o chão após impressão",
    expected_procedure:
      "Depois da impressão, o estado físico precisa ser conferido na operação porque Odhen/Teknisa não acompanha o pós-impressão.",
    truth_class: "FACT",
    source_status: "PROVEN_LIVE_SOURCE_AUDIT",
    proves_execution_on_episode: false,
  },
  {
    barrier_id: "FINAL_DIVERGENCE_CONFERENCE",
    mechanism_keys: ["OMISSION", "WRONG_ITEM"],
    academia_claim_ids: ["CONF-001"],
    title: "Conferência final de divergências",
    expected_procedure:
      "A conferência procura e corrige divergências antes que o pedido seja entregue.",
    truth_class: "FACT",
    source_status: "PROVEN_FIELD_CONVERSATION",
    proves_execution_on_episode: false,
  },
  {
    barrier_id: "EXACT_PRODUCT_QUANTITY_MATCH",
    mechanism_keys: ["WRONG_ITEM"],
    academia_claim_ids: ["ORDER-002"],
    title: "Produto e quantidade exatos",
    expected_procedure:
      "Produto e quantidade do pedido precisam coincidir com a linha da comanda; nome parecido ou quantidade parcial não bastam.",
    truth_class: "FACT",
    source_status: "PROVEN_LIVE_SOURCE_AUDIT",
    proves_execution_on_episode: false,
  },
  {
    barrier_id: "CUSTOMER_OBSERVATION_CHECK",
    mechanism_keys: ["WRONG_ITEM"],
    academia_claim_ids: ["OBS-001"],
    title: "Conferir observação do cliente",
    expected_procedure:
      "Observações e alterações do cliente devem ser lidas e confirmadas antes da liberação.",
    truth_class: "FACT",
    source_status: "PROVEN_FIELD_CONVERSATION",
    proves_execution_on_episode: false,
  },
  {
    barrier_id: "MANUAL_CORRECTION_PHYSICAL_CHECK",
    mechanism_keys: ["WRONG_ITEM"],
    academia_claim_ids: ["COMANDA-004"],
    title: "Validar correção manual no físico",
    expected_procedure:
      "Correção escrita à mão pode não existir no dado digital e precisa ser conferida contra o pedido físico.",
    truth_class: "FACT",
    source_status: "PROVEN_LIVE_SOURCE_AUDIT",
    proves_execution_on_episode: false,
  },
];

export interface EpisodeBarrierAssessment {
  episode_id: string;
  mechanism_key: string;
  knowledge_status: "MAPPED_EXPECTED_BARRIERS" | "NO_MAPPED_BARRIER";
  barrier_ids: string[];
  academia_claim_ids: string[];
  execution_status: "UNKNOWN";
  barrier_failure_proven: false;
  barrier_compliance_proven: false;
  causal_status: "UNPROVEN";
  manager_investigator_evidence_debt: boolean;
  attention_authority: "NONE";
  external_effect_authorized: false;
}

export interface ExpectedBarrierAssessmentSet {
  academia_snapshot: typeof TATA_ACADEMIA_BARRIER_SNAPSHOT;
  assessments: EpisodeBarrierAssessment[];
  mapped_episode_count: number;
  unmapped_episode_count: number;
  execution_unknown_count: number;
  barrier_failure_proven_count: 0;
  barrier_compliance_proven_count: 0;
  direct_attention_reasons_created: 0;
  external_effects_authorized: false;
}

export function buildExpectedBarrierAssessments(
  evidence: readonly OperationalEpisodeEvidence[],
): ExpectedBarrierAssessmentSet {
  const assessments = evidence.map((episode) => {
    const barriers = EXPECTED_BARRIERS.filter((barrier) =>
      barrier.mechanism_keys.includes(episode.mechanism_key),
    );
    const claimIds = [
      ...new Set(barriers.flatMap((barrier) => barrier.academia_claim_ids)),
    ].sort();

    return {
      episode_id: episode.episode_id,
      mechanism_key: episode.mechanism_key,
      knowledge_status:
        barriers.length > 0
          ? ("MAPPED_EXPECTED_BARRIERS" as const)
          : ("NO_MAPPED_BARRIER" as const),
      barrier_ids: barriers.map((barrier) => barrier.barrier_id).sort(),
      academia_claim_ids: claimIds,
      execution_status: "UNKNOWN" as const,
      barrier_failure_proven: false as const,
      barrier_compliance_proven: false as const,
      causal_status: "UNPROVEN" as const,
      manager_investigator_evidence_debt: barriers.length > 0,
      attention_authority: "NONE" as const,
      external_effect_authorized: false as const,
    };
  });

  return {
    academia_snapshot: TATA_ACADEMIA_BARRIER_SNAPSHOT,
    assessments,
    mapped_episode_count: assessments.filter(
      (item) => item.knowledge_status === "MAPPED_EXPECTED_BARRIERS",
    ).length,
    unmapped_episode_count: assessments.filter(
      (item) => item.knowledge_status === "NO_MAPPED_BARRIER",
    ).length,
    execution_unknown_count: assessments.filter(
      (item) => item.knowledge_status === "MAPPED_EXPECTED_BARRIERS",
    ).length,
    barrier_failure_proven_count: 0,
    barrier_compliance_proven_count: 0,
    direct_attention_reasons_created: 0,
    external_effects_authorized: false,
  };
}
