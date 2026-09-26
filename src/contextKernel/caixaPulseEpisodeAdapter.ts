import type {
  EpisodeMechanismBasis,
  EpisodeResolutionMarker,
  OperationalEpisodeEvidence,
} from "./episodeRecurrence";

export interface CaixaPulseOccurrenceRow {
  business_date: string;
  shift: string;
  mailbox_key: string;
  occurrence_index: number;
  domain: string;
  category: string;
  status: string;
  happened_text: string;
  action_text: string;
}

export interface CaixaPulseEpisodeAdaptation {
  evidence: OperationalEpisodeEvidence[];
  classified_count: number;
  unclassified_count: number;
  ambiguous_multi_signal_count: number;
  mechanism_basis: EpisodeMechanismBasis;
  causal_status: "UNPROVEN";
  attention_authority: "NONE";
  external_effect_authorized: false;
}

const MECHANISM_RULES: ReadonlyArray<{
  key: string;
  patterns: readonly RegExp[];
}> = [
  { key: "SAFETY_CONTAMINATION", patterns: [/alerg/i] },
  {
    key: "BAG_SWAP_CUSTODY",
    patterns: [/trocou as sacolas/i, /troca(?:ram|da) as sacolas/i],
  },
  { key: "PACKAGING_LEAK", patterns: [/vazou/i, /vazamento/i] },
  {
    key: "PLATFORM_FAILURE",
    patterns: [/sistema do ifood bugou/i, /falha.*ifood/i, /plataforma indispon/i],
  },
  {
    key: "DELAY_LOGISTICS",
    patterns: [
      /pedido esta atrasado/i,
      /pedido ainda nao saiu/i,
      /nao alocava motob/i,
      /vai chegar muito tarde/i,
    ],
  },
  {
    key: "FOOD_QUALITY",
    patterns: [
      /gosto .*forte/i,
      /gosto esquisito/i,
      /nao achei .* fresco/i,
      /cheiro de am/i,
      /muito frio/i,
    ],
  },
  {
    key: "WRONG_ITEM",
    patterns: [
      /no lugar d[oa]/i,
      /inves d[oa]/i,
      /era um .* mas foi/i,
      /eram? .* e foi/i,
      /assinalado .* foi/i,
      /como .* e foi um/i,
      /enviad[oa].*com cebolinha/i,
    ],
  },
  {
    key: "OMISSION",
    patterns: [
      /nao mandou/i,
      /nao enviou/i,
      /nao foi enviado/i,
      /pedido foi sem/i,
      /foi sem o /i,
      /faltou /i,
      /nao recebeu /i,
      /nao foi o kit/i,
      /nao foi kit/i,
      /nao foi o cookie/i,
      /so veio um combinado/i,
      /nao foi o combinado/i,
      /nao foi o gohan/i,
      /nao foi o molho/i,
      /nao foi o yakisoba/i,
      /nao foi uramaki/i,
      /nao foi o uramaki/i,
      /nao foi o batera/i,
      /nao foi kids/i,
      /nao foi o kids/i,
      /nao foi o temaki/i,
      /nao foi o missoshiro/i,
      /nao foi o hot/i,
      /nao foi o carpaccio/i,
    ],
  },
  {
    key: "CUSTOMER_OR_OTHER_CANCEL",
    patterns: [
      /nao posso retirar/i,
      /nao vou conseguir retirar/i,
      /nao vou poder receber/i,
      /cliente nao quer mais receber/i,
      /nao quer mais receber/i,
      /endereco errado/i,
      /errei endereco/i,
      /endereco da entrega nao foi localizado/i,
      /cliente nao localizado/i,
      /gostaria de cancelar/i,
    ],
  },
];

const ACTION_RULES: ReadonlyArray<{ key: string; pattern: RegExp }> = [
  { key: "REFUND", pattern: /reembols/i },
  { key: "RESEND", pattern: /reenvio|reenvi/i },
  { key: "CANCEL", pattern: /cancel/i },
  { key: "APOLOGY", pattern: /desculp/i },
  { key: "CAMERA_REVIEW", pattern: /camer/i },
];

export function adaptCaixaPulseOccurrences(
  rows: readonly CaixaPulseOccurrenceRow[],
): CaixaPulseEpisodeAdaptation {
  const seen = new Set<string>();
  let ambiguous = 0;
  const evidence = rows.map((row) => {
    validateRow(row);
    const episodeId =
      "caixa-pulse:" + row.mailbox_key + ":" + String(row.occurrence_index);
    if (seen.has(episodeId)) throw new Error("caixa_pulse_duplicate_episode");
    seen.add(episodeId);

    const mechanism = classifyMechanism(row.happened_text);
    if (mechanism.ambiguous) ambiguous += 1;

    return {
      episode_id: episodeId,
      business_date: row.business_date,
      source_ref: episodeId,
      mechanism_key: mechanism.key,
      mechanism_basis: "RULE_INFERRED" as const,
      resolution_marker: resolutionMarker(row.status),
      action_kinds: classifyActions(row.action_text),
      outcome_observed: false,
    };
  });

  return {
    evidence,
    classified_count: evidence.filter(
      (item) => item.mechanism_key !== "UNCLASSIFIED",
    ).length,
    unclassified_count: evidence.filter(
      (item) => item.mechanism_key === "UNCLASSIFIED",
    ).length,
    ambiguous_multi_signal_count: ambiguous,
    mechanism_basis: "RULE_INFERRED",
    causal_status: "UNPROVEN",
    attention_authority: "NONE",
    external_effect_authorized: false,
  };
}
function classifyMechanism(text: string): {
  key: string;
  ambiguous: boolean;
} {
  const normalized = normalize(text);
  const matches = MECHANISM_RULES.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(normalized)),
  );
  if (matches.length !== 1) {
    return { key: "UNCLASSIFIED", ambiguous: matches.length > 1 };
  }
  return { key: matches[0].key, ambiguous: false };
}

function classifyActions(text: string): string[] {
  const normalized = normalize(text);
  return ACTION_RULES.filter((rule) => rule.pattern.test(normalized))
    .map((rule) => rule.key);
}

function resolutionMarker(status: string): EpisodeResolutionMarker {
  const value = normalize(status);
  if (value === "concluido") return "SOURCE_MARKED_CONCLUDED";
  if (value === "necessario revisao") return "SOURCE_MARKED_REVIEW_NEEDED";
  return "SOURCE_STATUS_OTHER";
}

function normalize(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function validateRow(row: CaixaPulseOccurrenceRow): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.business_date)) {
    throw new Error("caixa_pulse_business_date_invalid");
  }
  const parsed = new Date(row.business_date + "T00:00:00.000Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== row.business_date
  ) {
    throw new Error("caixa_pulse_business_date_invalid");
  }
  if (!row.mailbox_key.trim()) {
    throw new Error("caixa_pulse_mailbox_key_required");
  }
  if (
    !Number.isSafeInteger(row.occurrence_index) ||
    row.occurrence_index < 0
  ) {
    throw new Error("caixa_pulse_occurrence_index_invalid");
  }
  if (!row.happened_text.trim()) {
    throw new Error("caixa_pulse_happened_text_required");
  }
}
