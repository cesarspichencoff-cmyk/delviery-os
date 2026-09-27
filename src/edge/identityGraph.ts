/**
 * TATÁ Edge — Order Identity Graph.
 *
 * Links identifiers from independent systems without turning coincidence into fact.
 * Pure, deterministic and replay-safe. No external I/O and no operational effects.
 */

export type EdgeSource =
  | "ifood"
  | "teknisa"
  | "windows_print"
  | "tata_os"
  | "deliveryos"
  | "review"
  | "mail";

export type ConfidenceClass =
  | "PROVEN"
  | "SUPPORTED_INFERENCE"
  | "CANDIDATE"
  | "UNKNOWN";

export type EvidenceDimension =
  | "explicit_source_reference"
  | "exact_external_id"
  | "manual_confirmation"
  | "unit"
  | "amount"
  | "payment_mapping"
  | "item_fingerprint"
  | "timestamp_window";

export interface IdentityRef {
  source: EdgeSource;
  kind: string;
  id: string;
  unit_id?: string;
}

export interface LinkEvidence {
  evidence_id: string;
  dimension: EvidenceDimension;
  /**
   * Safe semantic code only. Raw source text, PII and secrets do not belong here.
   * Example: "teknisa_external_order_id_explicit".
   */
  detail: string;
}

export interface IdentityLink {
  left: IdentityRef;
  right: IdentityRef;
  relation: "same_order";
  evidence: LinkEvidence[];
  confidence: ConfidenceClass;
  first_seen_at: string;
  last_seen_at: string;
}

const PROOF_DIMENSIONS = new Set<EvidenceDimension>([
  "explicit_source_reference",
  "exact_external_id",
  "manual_confirmation",
]);

const SUPPORT_DIMENSIONS = new Set<EvidenceDimension>([
  "unit",
  "amount",
  "payment_mapping",
  "item_fingerprint",
]);

const SAFE_CODE = /^[a-z0-9][a-z0-9_.:-]{0,95}$/i;

function refKey(ref: IdentityRef): string {
  return [ref.source, ref.kind, ref.unit_id ?? "", ref.id].join("|");
}

function linkKey(left: IdentityRef, right: IdentityRef): string {
  const [a, b] = [refKey(left), refKey(right)].sort();
  return `${a}<->${b}`;
}

export function classifyEvidence(evidence: LinkEvidence[]): ConfidenceClass {
  const dimensions = new Set(evidence.map((item) => item.dimension));

  for (const dimension of PROOF_DIMENSIONS) {
    if (dimensions.has(dimension)) return "PROVEN";
  }

  const independentSupport = [...SUPPORT_DIMENSIONS].filter((dimension) =>
    dimensions.has(dimension),
  );

  // Temporal proximity can support another signal, never prove identity alone.
  if (
    independentSupport.length >= 2 ||
    (independentSupport.length >= 1 && dimensions.has("timestamp_window"))
  ) {
    return "SUPPORTED_INFERENCE";
  }

  if (evidence.length > 0) return "CANDIDATE";
  return "UNKNOWN";
}

export class OrderIdentityGraph {
  private readonly links = new Map<string, IdentityLink>();

  upsert(
    left: IdentityRef,
    right: IdentityRef,
    evidence: LinkEvidence[],
    seenAt: string,
  ): IdentityLink {
    assertCompatibleRefs(left, right);
    assertEvidenceSafe(evidence);

    const key = linkKey(left, right);
    const existing = this.links.get(key);

    if (!existing) {
      const unique = dedupeEvidence(evidence);
      const created: IdentityLink = {
        left: { ...left },
        right: { ...right },
        relation: "same_order",
        evidence: unique,
        confidence: classifyEvidence(unique),
        first_seen_at: seenAt,
        last_seen_at: seenAt,
      };
      this.links.set(key, created);
      return cloneLink(created);
    }

    const merged = dedupeEvidence([...existing.evidence, ...evidence]);
    existing.evidence = merged;
    existing.confidence = classifyEvidence(merged);
    if (seenAt < existing.first_seen_at) existing.first_seen_at = seenAt;
    if (seenAt > existing.last_seen_at) existing.last_seen_at = seenAt;
    return cloneLink(existing);
  }

  all(): IdentityLink[] {
    return [...this.links.values()]
      .map(cloneLink)
      .sort((a, b) => linkKey(a.left, a.right).localeCompare(linkKey(b.left, b.right)));
  }

  linksFor(ref: IdentityRef): IdentityLink[] {
    const key = refKey(ref);
    return this.all().filter(
      (link) => refKey(link.left) === key || refKey(link.right) === key,
    );
  }

  snapshot(): string {
    return JSON.stringify(this.all());
  }
}

function assertCompatibleRefs(left: IdentityRef, right: IdentityRef): void {
  for (const ref of [left, right]) {
    if (!ref.id.trim() || ref.id.length > 160) throw new Error("invalid_identity_id");
    if (!ref.kind.trim() || ref.kind.length > 80) throw new Error("invalid_identity_kind");
    if (ref.unit_id !== undefined && (!ref.unit_id.trim() || ref.unit_id.length > 40)) {
      throw new Error("invalid_identity_unit");
    }
  }

  if (refKey(left) === refKey(right)) throw new Error("identity_self_link");

  if (
    left.unit_id !== undefined &&
    right.unit_id !== undefined &&
    left.unit_id !== right.unit_id
  ) {
    throw new Error("identity_unit_conflict");
  }
}

function assertEvidenceSafe(items: readonly LinkEvidence[]): void {
  for (const item of items) {
    if (!SAFE_CODE.test(item.evidence_id)) throw new Error("unsafe_evidence_id");
    if (!SAFE_CODE.test(item.detail)) throw new Error("unsafe_evidence_detail");
  }
}

function dedupeEvidence(items: LinkEvidence[]): LinkEvidence[] {
  const byId = new Map<string, LinkEvidence>();
  for (const item of items) {
    const existing = byId.get(item.evidence_id);
    if (!existing) {
      byId.set(item.evidence_id, { ...item });
      continue;
    }
    if (
      existing.dimension !== item.dimension ||
      existing.detail !== item.detail
    ) {
      throw new Error("evidence_id_conflict");
    }
  }
  return [...byId.values()].sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
}

function cloneLink(link: IdentityLink): IdentityLink {
  return {
    ...link,
    left: { ...link.left },
    right: { ...link.right },
    evidence: link.evidence.map((item) => ({ ...item })),
  };
}
