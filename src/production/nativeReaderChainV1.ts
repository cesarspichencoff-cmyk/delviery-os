import type { DeliveryProductionJoin, JoinedOperationalItem } from "./deliveryProductionJoin";
import type { ProvenReaderProductV66 } from "./readerIngressV66";
import { buildDailyStoreTataSequenceScope, DAILY_STORE_TATA_SEQUENCE_RULE } from "./tataSequence";
import type { MotorInterfaceV63, MotorKitOutputV63 } from "./currentPackagingBridgeV63";
import { verifyTataSequenceAttestationV1, tataLedgerDayDigestV1 } from "./tataSequenceAttestationV1";

/**
 * Native Reader chain V1 — the missing link between ONE native Teknisa
 * revision (watcher event + V2 consumer decision of the same snapshot) and
 * the existing V6.6 ingress / V6.3 motor bridge / V4.5 tickets / V4.6 render.
 *
 * Why: the V6.8 path joins delivery and production through PRINTED text
 * ("COMANDA.: DLV_<NRCOMANDA>"), which the physical ticket observed on
 * 2026-09-30 did not carry, and it requires a daily service-state file whose
 * expiry blocks every order. Production content is Teknisa-native; both
 * projections can be taken from the SAME native snapshot, keyed by the
 * four-part key, without any print text.
 *
 * Pure: no filesystem, SQL, network, spooler, sequence or print effects.
 * Nothing here authorizes paper; physical effects stay with later gates.
 */

export type ConsumerBlockerLayerV1 = "CONTENT" | "LEGACY_SERVICE_STATE" | "PAIRED_DESTINATION" | "SEQUENCE";

export interface ClassifiedConsumerBlockersV1 {
  content: string[];
  legacy_service_state: string[];
  paired_destination: Array<{ blocker: string; pair: "SUSHI_1" | "SUSHI_2"; canonical_code: string }>;
  sequence: string[];
}

// The installed V1 watcher also reports this exact legacy-hours reason.
// Neither this label nor a reported shift can authorize a destination or print.
const SERVICE_STATE = /^(?:SERVICE_STATE_[A-Z_]+|SERVICE_HOURS_OUTSIDE_WINDOW)$/;

/**
 * Split V2 consumer blockers by the layer they belong to. Anything not
 * explicitly recognised is CONTENT (fail closed). `UPSTREAM_EVENT_NOT_READY`
 * is a legacy-service blocker ONLY when every upstream event blocker is a
 * SERVICE_STATE_* reason; otherwise it stays CONTENT.
 */
export function classifyConsumerBlockersV1(
  blockers: readonly string[],
  eventBlockers: readonly string[],
): ClassifiedConsumerBlockersV1 {
  const out: ClassifiedConsumerBlockersV1 = {
    content: [], legacy_service_state: [], paired_destination: [], sequence: [],
  };
  const upstreamOnlyService = Array.isArray(eventBlockers) && eventBlockers.length > 0 &&
    eventBlockers.every((b) => typeof b === "string" && SERVICE_STATE.test(b));
  for (const raw of Array.isArray(blockers) ? blockers : []) {
    const b = String(raw);
    let m: RegExpExecArray | null;
    if (b === "UPSTREAM_EVENT_NOT_READY") {
      (upstreamOnlyService ? out.legacy_service_state : out.content).push(b);
    } else if ((b === "UPSTREAM_SERVICE_HOURS_OUTSIDE_WINDOW" &&
      upstreamOnlyService && eventBlockers.includes("SERVICE_HOURS_OUTSIDE_WINDOW")) ||
      /^UPSTREAM_SERVICE_SERVICE_STATE_[A-Z_]+$/.test(b) ||
      (/^UPSTREAM_SERVICE_STATE_[A-Z_]+$/.test(b) && upstreamOnlyService)) {
      out.legacy_service_state.push(b);
    } else if ((m = /^(?:SUSHI([12])_DUAL_PRODUCTION_ROLE_UNPROVEN|SERVICE_REQUIRED_SUSHI([12]))_(\d\.\d{2}\.\d{2}\.\d{3}\.\d{2})$/.exec(b))) {
      out.paired_destination.push({ blocker: b, pair: (m[1] || m[2]) === "1" ? "SUSHI_1" : "SUSHI_2", canonical_code: m[3] });
    } else if (b === "TATA_SEQUENCE_STATE_MISSING" || b === "TATA_SEQUENCE_STATE_INVALID") {
      out.sequence.push(b);
    } else {
      out.content.push(b);
    }
  }
  return out;
}

interface NativeEventItem { NRPRODCOMVEN: string; CDPRODUTO: string; CDARVPROD: string | null; QTPRODCOMVEN: string; IDSTPRCOMVEN: string }
interface NativeObservationRow { source_field: string; value: string; scope_hint: string; item_index?: number; CDPRODUTO?: string; join_proven?: boolean }
export interface NativeReaderEventV1 {
  schema: string; order_key: string; snapshot_hash: string;
  order: { CDFILIAL: string; CDLOJA: string; NRVENDAREST: string; NRCOMANDA: string; NRCOMANDAEXT: string;
    IDORGCMDVENDA: string; IDSTCOMANDA: string; DTHRABERMESA: string; items: NativeEventItem[];
    observation_scan_complete?: boolean; observation_rows?: NativeObservationRow[] };
  blockers: string[];
}
interface DecisionItem { item_index: number; CDPRODUTO: string; canonical_code: string; product_name: string; quantity: number;
  routing_status?: string; classification?: { family?: string; subfamily?: string; station?: string; review_required?: boolean } | null;
  classification_source?: string | null }
export interface NativeDecisionV1 {
  schema: string; order_key: string; snapshot_hash: string; ifood_sequence: string; teknisa_sequence: string;
  items: DecisionItem[]; observation_scan_complete?: boolean;
  packaging?: { groups?: Array<{ kind?: string; products?: Array<{ name?: string; quantity?: number }> }> } | null;
}

const clean = (v: unknown) => String(v ?? "").trim();
const norm = (v: unknown) => clean(v).normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
function canonical(raw: unknown): string | null {
  const v = clean(raw).replace(/\./g, "");
  if (!/^[0-9]{10}$/.test(v)) return null;
  return v[0] + "." + v.slice(1, 3) + "." + v.slice(3, 5) + "." + v.slice(5, 8) + "." + v.slice(8, 10);
}
function rawQuantity(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^[1-9]\d*(?:\.0+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export interface NativeJoinV1 {
  status: "NATIVE_SAME_SNAPSHOT_JOINED" | "HOLD";
  reasons: string[];
  join: DeliveryProductionJoin | null;
  provenance: {
    source: "TEKNISA_NATIVE_READER_SAME_SNAPSHOT";
    join_key: "FOUR_PART_NATIVE_KEY";
    order_key: string | null;
    snapshot_sha256: string | null;
    print_text_used: false;
    independent_source_attested: false;
  };
}

/**
 * Delivery and production projections taken from ONE native snapshot.
 * Item notes keep their native field: DSOBS* -> customer/delivery notes,
 * TXPRODCOMVEN -> production notes. `configuredRoutes` is the product
 * routing table (canonical code -> printer codes) the ingress will check
 * intents against; it is configuration, never an order fact.
 */
export function joinNativeReaderSnapshotV1(
  event: NativeReaderEventV1,
  decision: NativeDecisionV1,
  configuredRoutes: Readonly<Record<string, readonly string[]>>,
): NativeJoinV1 {
  const reasons = new Set<string>();
  const provenance = {
    source: "TEKNISA_NATIVE_READER_SAME_SNAPSHOT" as const,
    join_key: "FOUR_PART_NATIVE_KEY" as const,
    order_key: null as string | null, snapshot_sha256: null as string | null,
    print_text_used: false as const, independent_source_attested: false as const,
  };
  const hold = (): NativeJoinV1 => ({ status: "HOLD", reasons: [...reasons].sort(), join: null, provenance });
  const o = event?.order;
  if (!event || !decision || !o || !Array.isArray(o.items) || !Array.isArray(decision.items)) {
    reasons.add("NATIVE_PAIR_STRUCTURE_INVALID"); return hold();
  }
  // Structural same-snapshot joining may disregard an expired legacy shift,
  // but it must NEVER turn an explicit missing native child-table scan into
  // ready production content. A caller can set scan_complete=true and rehash
  // the event without acquiring the missing item/component/note source data.
  if (event.blockers.some((b) => b === "NATIVE_CHILD_ITEM_AND_OBSERVATION_TABLES_NOT_READ" ||
      b === "READ_COMPLETENESS_NOT_INDEPENDENTLY_ATTESTED")) {
    reasons.add("NATIVE_CHILD_SOURCE_COVERAGE_NOT_ATTESTED");
  }
  const key = [o.CDFILIAL, o.CDLOJA, o.NRVENDAREST, o.NRCOMANDA].join("|");
  if (event.order_key !== key || decision.order_key !== key || !/^[a-f0-9]{64}$/i.test(clean(event.snapshot_hash)) ||
      event.snapshot_hash !== decision.snapshot_hash)
    reasons.add("NATIVE_FOUR_PART_KEY_OR_SNAPSHOT_MISMATCH");
  if (decision.teknisa_sequence !== o.NRCOMANDA || decision.ifood_sequence !== o.NRCOMANDAEXT)
    reasons.add("NATIVE_ORDER_IDENTIFIERS_MISMATCH");
  if (o.observation_scan_complete !== true || decision.observation_scan_complete !== true)
    reasons.add("NATIVE_OBSERVATION_SCAN_NOT_COMPLETE");
  if (!o.items.length || o.items.length !== decision.items.length)
    reasons.add("NATIVE_ITEM_COVERAGE_MISMATCH");
  const rows = Array.isArray(o.observation_rows) ? o.observation_rows : [];
  const orderNotes: string[] = [];
  const delivery = new Map<number, string[]>(), production = new Map<number, string[]>();
  for (const r of rows) {
    if (!r || r.join_proven !== true || !clean(r.value)) { reasons.add("NATIVE_OBSERVATION_NOT_JOINED"); continue; }
    if (r.scope_hint === "order" && r.source_field === "DSOBSCOMANDA") { orderNotes.push(r.value); continue; }
    const i = r.item_index;
    if (r.scope_hint !== "item" || !Number.isInteger(i) || i! < 0 || i! >= o.items.length ||
        r.CDPRODUTO !== o.items[i!]?.CDPRODUTO) { reasons.add("NATIVE_OBSERVATION_SCOPE_INVALID"); continue; }
    const target = r.source_field === "TXPRODCOMVEN" ? production :
      r.source_field === "DSOBSDESCIT" || r.source_field === "DSOBSPEDDIGCMD" ? delivery : null;
    if (!target) { reasons.add("NATIVE_OBSERVATION_FIELD_UNKNOWN"); continue; }
    target.set(i!, [...(target.get(i!) ?? []), r.value]);
  }
  const items: JoinedOperationalItem[] = [];
  const lines = new Set<string>();
  o.items.forEach((raw, i) => {
    const d = decision.items[i];
    const qty = rawQuantity(raw?.QTPRODCOMVEN);
    const code = canonical(raw?.CDARVPROD);
    if (!d || !raw || !clean(raw.NRPRODCOMVEN) || lines.has(raw.NRPRODCOMVEN) || d.item_index !== i + 1 ||
        raw.CDPRODUTO !== d.CDPRODUTO || code === null || code !== d.canonical_code ||
        qty === null || qty !== d.quantity || !clean(d.product_name)) {
      reasons.add("NATIVE_ITEM_IDENTITY_OR_QUANTITY_MISMATCH:" + (i + 1)); return;
    }
    lines.add(raw.NRPRODCOMVEN);
    const routes = configuredRoutes[code];
    items.push({
      delivery_item_index: i, codigo: code, nome: d.product_name, quantidade: qty,
      delivery_observacoes: delivery.get(i) ?? [], tx_prod_com_ven: production.get(i) ?? [],
      printer_keys: Array.isArray(routes) ? [...new Set(routes.map(String))] : [],
    });
  });
  provenance.order_key = key; provenance.snapshot_sha256 = clean(event.snapshot_hash).toLowerCase();
  if (reasons.size) return hold();
  return {
    status: "NATIVE_SAME_SNAPSHOT_JOINED", reasons: [], provenance,
    join: {
      schema: "deliveryos.delivery-production-join.v1", ready: true, blocking_reasons: [],
      ids: { pedido_interno: o.NRCOMANDA, pedido_externo: o.NRCOMANDAEXT },
      items, order_observations: orderNotes,
      effects: { print: false, persistence_write: false, odhen_write: false },
    },
  };
}

/**
 * Per-item notes for the production print plan, from the SAME native join.
 * Mirrors the V6.6 ingress source rule exactly (delivery DSOBS* first, then
 * TXPRODCOMVEN, first spelling kept, duplicates by the same normalization
 * dropped), so plan, ingress and tickets compare equal lists. Without this
 * every revision with an item note held at PRODUCTION_CUSTOMER_OBSERVATION_DIVERGENCE.
 */
export function nativeTicketItemsV1(join: DeliveryProductionJoin | null): Array<{ item_index: number; item_observations: string[] }> {
  return (join?.items ?? []).map((item) => {
    const unique: string[] = [];
    for (const raw of [...(item.delivery_observacoes ?? []), ...(item.tx_prod_com_ven ?? [])])
      if (!unique.some((x) => norm(x) === norm(raw))) unique.push(raw);
    return { item_index: item.delivery_item_index, item_observations: unique };
  });
}

export interface CatalogEquivalenceRecordV1 {
  id: string;
  canonical_code: string;
  native_cdproduto: string;
  native_name: string;
  academy_entry_ids: string[];
  shared: { descricao_sha256: string; classification: { family: string; subfamily?: string; station: string } };
}
export interface CatalogResolutionV1 {
  resolved: Array<{ item_index: number; record_id: string;
    classification: { family: string; subfamily?: string; station: string; review_required: false };
    classification_source: string }>;
  explained_blockers: string[];
  motor_rerun_required: boolean;
  refused: string[];
}
const CODE = /^\d\.\d{2}\.\d{2}\.\d{3}\.\d{2}$/;
function validEquivalenceRecord(r: CatalogEquivalenceRecordV1): boolean {
  return !!r && typeof r.id === "string" && !!clean(r.id) && CODE.test(clean(r.canonical_code)) &&
    /^\d{10}$/.test(clean(r.native_cdproduto)) && !!clean(r.native_name) &&
    Array.isArray(r.academy_entry_ids) && r.academy_entry_ids.length >= 2 &&
    new Set(r.academy_entry_ids).size === r.academy_entry_ids.length &&
    /^[a-f0-9]{64}$/.test(clean(r.shared?.descricao_sha256)) &&
    !!clean(r.shared?.classification?.family) && !!clean(r.shared?.classification?.station);
}

/**
 * Classification for a native item the consumer could not classify, taken
 * from a catalog-EQUIVALENCE record: every listed Academy entry is the same
 * product (identical composition text and classification), so the choice
 * between them cannot change any result. Applies ONLY to an item that is
 * unclassified AND named by the consumer's own CLASSIFICATION_UNKNOWN_<code>,
 * and ONLY on an exact (canonical code, CDPRODUTO, native name) match with a
 * single record. Labelled CATALOG_EQUIVALENT_ACADEMY_ENTRIES — never "human".
 * When the consumer never ran the motor, the caller MUST re-run the pinned
 * motor; the packaging/kit blockers are explained only under that duty.
 */
export function resolveCatalogEquivalenceV1(
  event: NativeReaderEventV1,
  decision: NativeDecisionV1,
  records: readonly CatalogEquivalenceRecordV1[],
  consumerBlockers: readonly string[],
): CatalogResolutionV1 {
  const out: CatalogResolutionV1 = { resolved: [], explained_blockers: [], motor_rerun_required: false, refused: [] };
  const valid = (Array.isArray(records) ? records : []).filter(validEquivalenceRecord);
  if (Array.isArray(records) && valid.length !== records.length) out.refused.push("CATALOG_EQUIVALENCE_RECORD_INVALID");
  const blockers = new Set((consumerBlockers ?? []).map(String));
  for (const d of decision?.items ?? []) {
    const c = d.classification;
    if (c && c.review_required === false) continue; // never override a proven classification
    if (!blockers.has("CLASSIFICATION_UNKNOWN_" + d.canonical_code)) continue;
    const raw = event?.order?.items?.[d.item_index - 1];
    const matches = valid.filter((r) => r.canonical_code === d.canonical_code &&
      r.native_cdproduto === raw?.CDPRODUTO && norm(r.native_name) === norm(d.product_name));
    if (matches.length > 1) { out.refused.push("CATALOG_EQUIVALENCE_AMBIGUOUS:" + d.canonical_code); continue; }
    if (matches.length !== 1) continue;
    const r = matches[0];
    out.resolved.push({ item_index: d.item_index, record_id: r.id,
      classification: { ...r.shared.classification, review_required: false },
      classification_source: "CATALOG_EQUIVALENT_ACADEMY_ENTRIES:" + r.id });
    out.explained_blockers.push("CLASSIFICATION_UNKNOWN_" + d.canonical_code,
      "PACKAGING_INPUT_CLASSIFICATION_NOT_PROVEN:" + d.item_index);
  }
  const resolvedIdx = new Set(out.resolved.map((x) => x.item_index));
  const allClassified = (decision?.items ?? []).length > 0 && (decision.items).every((d) =>
    resolvedIdx.has(d.item_index) || (d.classification?.review_required === false && !!clean(d.classification_source)));
  if (out.resolved.length && allClassified && !decision.packaging) {
    out.motor_rerun_required = true;
    out.explained_blockers.push("PACKAGING_NOT_RUN", "PACKAGING_SKIPPED_INCOMPLETE_OR_UNREVIEWED_ORDER", "KITS_NOT_FACT");
  }
  return out;
}

/**
 * Current-product identities for the V6.6 ingress, taken ONLY from a decision
 * item whose classification the consumer proved (review_required === false,
 * a classification source, a station) or a catalog-equivalence resolution.
 * CLOSED_COMBO comes from the pinned motor's own output (a "combinado" group
 * listing the product): the consumer's output, or the chain's own re-run when
 * the consumer never ran it. Anything the motor did not group stays UNKNOWN.
 */
export function nativeIdentitiesV1(
  decision: NativeDecisionV1,
  resolution?: CatalogResolutionV1,
  motorPackaging?: NativeDecisionV1["packaging"],
): { identities: ProvenReaderProductV66[]; held: number[] } {
  const combos = new Set<string>(), grouped = new Set<string>();
  for (const g of (motorPackaging ?? decision.packaging)?.groups ?? [])
    for (const p of g.products ?? []) {
      grouped.add(norm(p.name));
      if (g.kind === "combinado") combos.add(norm(p.name));
    }
  const byIndex = new Map((resolution?.resolved ?? []).map((r) => [r.item_index, r]));
  const identities: ProvenReaderProductV66[] = [], held: number[] = [];
  for (const raw of decision.items ?? []) {
    const r = byIndex.get(raw.item_index);
    const d = r ? { ...raw, classification: r.classification, classification_source: r.classification_source } : raw;
    const c = d.classification;
    const proven = !!c && c.review_required === false && !!clean(d.classification_source) && !!clean(c.station) && !!clean(c.family);
    if (!proven) held.push(d.item_index - 1);
    const name = norm(d.product_name);
    identities.push({
      item_index: d.item_index - 1, product_code: d.canonical_code, product_name: d.product_name, quantity: d.quantity,
      classification: { station: proven ? clean(c!.station) : null, family: proven ? clean(c!.family) : null },
      packaging_role: !grouped.has(name) ? "UNKNOWN" : combos.has(name) ? "CLOSED_COMBO" : "OTHER",
      station_proof: proven ? "CURRENT_MOTOR_PROVEN" : "UNKNOWN",
      proof: proven ? "CURRENT_PRODUCT_IDENTITY_CROSSWALK_PROVEN" : "UNKNOWN",
      source_ref: !proven ? "" : r ? "catalog-equivalence:" + r.record_id + ":" + d.canonical_code
        : "native-decision:" + clean(d.classification_source) + ":" + d.canonical_code,
    });
  }
  return { identities, held };
}

/**
 * Station -> paired-printer category for the window selector. Source: the
 * human rule recorded by César on 2026-11-02 (lunch BALCAOSUSHI1 combinados /
 * BALCAOSUSHI2 enrolados; dinner DELIVERY SUSHI 1/2) and the store audit that
 * puts sushi/sashimi/duplas on the first pair and rolls/temaki on the second.
 * Any other station is INDEPENDENT only when its configured route has no pair;
 * unknown stations stay UNKNOWN (destination HOLD, content unaffected).
 */
export const STATION_WINDOW_RULE_REF_V1 =
  "pr131#issuecomment-6569886639+docs/comandas/AUDITORIA_REVALIDADA_IMPRESSORAS_E_JANELAS_20261027.md";
export function stationWindowCategoryV1(station: string | null | undefined): "COMBINADOS" | "ENROLADOS" | "INDEPENDENT_IF_UNPAIRED" | "UNKNOWN" {
  const s = norm(station);
  if (s === "COMBINADOS" || s === "DUPLAS") return "COMBINADOS";
  if (s === "ENROLADOS") return "ENROLADOS";
  if (s === "COZINHA QUENTES" || s === "BEBIDAS" || s === "BAR") return "INDEPENDENT_IF_UNPAIRED";
  return "UNKNOWN";
}

/**
 * Human kit decisions for an EXACT composition the pinned motor does not
 * judge (data/comandas_kit_rules_human_v1.json, César in PR #135 comment
 * 6582963189). Applies only to one line of the recorded combo (code,
 * CDPRODUTO, native name, quantity 1) plus proven temaki lines whose units
 * equal temaki_units, and nothing else. A motor FACT always wins; a
 * different motor FACT is a conflict. Never generalized.
 */
export interface HumanKitRuleV1 {
  id: string;
  combo: { canonical_code: string; native_cdproduto: string; native_name: string; quantity: 1 };
  temaki_units: number;
  kits: Array<{ kit: string; quantidade: number }>;
  evidence: "HUMAN_CONFIRMED_RULE";
  decided_by: string; decided_on: string; source_ref: string;
}
export interface HumanKitRuleResolutionV1 {
  rule: HumanKitRuleV1 | null;
  reason: string | null;
  composition: Array<{ name: string; quantity: number }>;
}
const HUMAN_KIT_LABELS = new Set(["Kit p/1", "Kit p/2", "Kit Simples"]);
function validHumanKitRule(r: unknown): r is HumanKitRuleV1 {
  const x = r as Partial<HumanKitRuleV1> | null;
  return !!x && typeof x === "object" && typeof x.id === "string" && x.id.length > 0 && x.id.length <= 80 &&
    !!x.combo && /^\d\.\d{2}\.\d{2}\.\d{3}\.\d{2}$/.test(String(x.combo.canonical_code)) &&
    /^\d{10}$/.test(String(x.combo.native_cdproduto)) && !!clean(x.combo.native_name) && x.combo.quantity === 1 &&
    Number.isSafeInteger(x.temaki_units) && x.temaki_units! >= 1 && x.temaki_units! <= 20 &&
    Array.isArray(x.kits) && x.kits.length > 0 &&
    x.kits.every((k) => HUMAN_KIT_LABELS.has(String(k?.kit)) && Number.isSafeInteger(k?.quantidade) && k.quantidade > 0) &&
    x.evidence === "HUMAN_CONFIRMED_RULE" && !!clean(x.source_ref) && !!clean(x.decided_by) &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(x.decided_on));
}
const kitKey = (kits: ReadonlyArray<{ kit: string; quantidade: number }>) =>
  JSON.stringify(kits.map((k) => [String(k.kit), k.quantidade]).sort());
const compositionKey = (list: ReadonlyArray<{ name: unknown; quantity: unknown }>) =>
  JSON.stringify(list.map((x) => [norm(x.name), Number(x.quantity)]).sort());

export function resolveHumanKitRuleV1(
  decision: NativeDecisionV1, resolution: CatalogResolutionV1 | undefined,
  rules: unknown, motorKits: { status?: string; kits?: Array<{ kit: string; quantidade: number }> } | null | undefined,
): HumanKitRuleResolutionV1 {
  const none = (reason: string | null = null): HumanKitRuleResolutionV1 => ({ rule: null, reason, composition: [] });
  const list = Array.isArray(rules) ? rules : [];
  if (!list.length) return none();
  if (!list.every(validHumanKitRule)) return none("HUMAN_KIT_RULE_RECORD_INVALID");
  const byIndex = new Map((resolution?.resolved ?? []).map((r) => [r.item_index, r]));
  const items = (decision.items ?? []).map((raw) => {
    const r = byIndex.get(raw.item_index);
    return r ? { ...raw, classification: r.classification, classification_source: r.classification_source } : raw;
  });
  const proven = (x: DecisionItem) => !!x.classification && x.classification.review_required === false &&
    !!clean(x.classification_source) && !!clean(x.classification.station) && !!clean(x.classification.family);
  const matches = (list as HumanKitRuleV1[]).filter((rule) => {
    const combo = items.filter((x) => x.canonical_code === rule.combo.canonical_code);
    if (combo.length !== 1) return false;
    const c = combo[0];
    if (c.CDPRODUTO !== rule.combo.native_cdproduto || c.quantity !== 1 ||
        norm(c.product_name) !== norm(rule.combo.native_name) || !proven(c)) return false;
    const others = items.filter((x) => x !== c);
    if (!others.length || !others.every((x) => proven(x) && norm(x.classification?.subfamily) === "TEMAKI")) return false;
    return others.reduce((n, x) => n + x.quantity, 0) === rule.temaki_units;
  });
  if (!matches.length) return none();
  if (matches.length > 1) return none("HUMAN_KIT_RULE_AMBIGUOUS");
  const rule = matches[0];
  if (motorKits?.status === "FACT")
    return kitKey(motorKits.kits ?? []) === kitKey(rule.kits) ? none() : none("HUMAN_KIT_RULE_CONFLICTS_WITH_MOTOR");
  return { rule, reason: null, composition: items.map((x) => ({ name: x.product_name, quantity: x.quantity })) };
}

/** The pinned motor, unchanged, except kitVerdict for the ONE approved
 * composition when the motor itself gives no FACT. Anything else delegates. */
export function withHumanKitRuleV1(motor: MotorInterfaceV63, applied: HumanKitRuleResolutionV1): MotorInterfaceV63 {
  const rule = applied.rule;
  if (!rule) return motor;
  const approved = compositionKey(applied.composition);
  return {
    packComanda: (entries) => motor.packComanda(entries),
    kitVerdict: (entries) => {
      const own = motor.kitVerdict(entries);
      if (own?.status === "FACT") return own;
      if (compositionKey(entries.map((e) => ({ name: e.product?.nome, quantity: e.quantity }))) !== approved) return own;
      const decided: MotorKitOutputV63 & { why: string; source: string } = {
        status: "FACT", kits: rule.kits.map((k) => ({ ...k })),
        why: "HUMAN_CONFIRMED_RULE:" + rule.id, source: rule.source_ref,
      };
      return decided;
    },
  };
}

/**
 * Store-local opening time of ONE native revision. Teknisa writes
 * DTHRABERMESA as a plain local datetime (observed "2026-10-02T23:02:07.0000000").
 * A "Z", an offset or any other shape means the value was converted somewhere
 * and the Itaim day/clock is ambiguous: null (HOLD), never a guess.
 */
const STORE_LOCAL_TS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?$/;
export interface StoreLocalTimeV1 { day: string; hm: string }
export function storeLocalTimeV1(raw: unknown): StoreLocalTimeV1 | null {
  if (typeof raw !== "string") return null;
  const m = STORE_LOCAL_TS.exec(raw);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d ||
      h > 23 || mi > 59 || s > 59) return null;
  return { day: `${m[1]}-${m[2]}-${m[3]}`, hm: `${m[4]}:${m[5]}` };
}

/**
 * TATÁ number levels, never merged:
 *   PREVIEW                     computed from a supplied state; nothing stored
 *   CANDIDATE_PERSISTED_IN_LAB  bound and read back in a disposable lab DB
 *   LIVE_ATTESTED               real store state + independent attestation;
 *                               NO producer exists yet
 * Each level fixes its two flags; a claim whose flags disagree is refused.
 */
export type TataSequenceLevelV1 = "PREVIEW" | "CANDIDATE_PERSISTED_IN_LAB" | "LIVE_ATTESTED";
const LEVEL_FLAGS_V1: Readonly<Record<TataSequenceLevelV1, readonly [boolean, boolean]>> = {
  PREVIEW: [false, false],
  CANDIDATE_PERSISTED_IN_LAB: [true, false],
  LIVE_ATTESTED: [true, true],
};
export interface TataSequenceBindingClaimV1 {
  level: TataSequenceLevelV1; persisted: boolean; attested_independently: boolean;
  order_key: string; scope_id: string; tata_sequence: string;
}
export interface TataSequenceVerdictV1 {
  /** accepted level of the claim; null when absent or refused */
  level: TataSequenceLevelV1 | null;
  /** ONLY for LIVE_ATTESTED: the number that may reach paper */
  number: string | null;
  /** PREVIEW / lab number: reported for review, never printed */
  candidate_number: string | null;
  /** daily scope of THIS revision (tataSequence.ts), null if the day is not trusted */
  scope_id: string | null;
  reason: string | null;
  rule_ref: string;
}

/**
 * The TATÁ number belongs to the ORDER (four-part native key) inside its
 * store-local day — César, issue #102 and PR #135: 001 at the first order of
 * each Itaim day, lunch and dinner share one sequence, replay / reprint / a
 * new revision of the same order keep the number, a canceled order's number
 * is never recycled. Scope comes from tataSequence.ts, not from a new format.
 */
/** What the caller re-checked OUTSIDE the claim: the trusted attester set,
 * its clock, and the store day ledger read back and inspected with the V2
 * policy (status + the order's number) plus that day's rows. */
export interface SequenceVerdictOptionsV1 {
  attesters?: unknown;
  now_s?: number;
  ledger?: { inspection_status: string; review_binding_number: string | null;
    rows: Array<{ native_order_key: string; tata_sequence: string }> } | null;
}
export function sequenceVerdictV1(binding: unknown, event: NativeReaderEventV1,
  options: SequenceVerdictOptionsV1 = {}): TataSequenceVerdictV1 {
  const time = storeLocalTimeV1(event?.order?.DTHRABERMESA);
  const scope = time ? buildDailyStoreTataSequenceScope({
    store_id: clean(event.order.CDFILIAL) + "|" + clean(event.order.CDLOJA),
    operational_date: time.day,
  }).scope_id : null;
  const verdict = (level: TataSequenceLevelV1 | null, number: string | null,
    candidate: string | null, reason: string | null): TataSequenceVerdictV1 => ({
    level, number, candidate_number: candidate, scope_id: scope, reason,
    rule_ref: DAILY_STORE_TATA_SEQUENCE_RULE.source_ref,
  });
  if (!scope) return verdict(null, null, null, "SOURCE_LOCAL_DAY_NOT_TRUSTED");
  if (!binding || typeof binding !== "object" || Array.isArray(binding))
    return verdict(null, null, null, "TATA_SEQUENCE_NOT_BOUND");
  const b = binding as Partial<TataSequenceBindingClaimV1>;
  const level = typeof b.level === "string" &&
    Object.prototype.hasOwnProperty.call(LEVEL_FLAGS_V1, b.level) ? b.level : null;
  const flags = level ? LEVEL_FLAGS_V1[level] : null;
  if (!level || !flags || b.persisted !== flags[0] || b.attested_independently !== flags[1])
    return verdict(null, null, null, "TATA_SEQUENCE_BINDING_NOT_ATTESTED");
  const seq = typeof b.tata_sequence === "string" ? b.tata_sequence : "";
  if (b.order_key !== event.order_key || b.scope_id !== scope || !/^\d{3}$/.test(seq) || seq === "000")
    return verdict(null, null, null, "TATA_SEQUENCE_BINDING_SCOPE_MISMATCH");
  if (level === "PREVIEW") return verdict(level, null, seq, "TATA_SEQUENCE_PREVIEW_ONLY_NOT_PERSISTED");
  if (level === "CANDIDATE_PERSISTED_IN_LAB")
    return verdict(level, null, seq, "TATA_SEQUENCE_LAB_ONLY_NOT_LIVE_ATTESTED");
  // LIVE_ATTESTED: flags are not proof. A signed statement from a trusted,
  // non-writer attester, a clock, and the day ledger rechecked are required.
  const attestation = (b as { attestation?: unknown }).attestation;
  const check = verifyTataSequenceAttestationV1(attestation, options.attesters, options.now_s);
  if (!check.ok || !check.statement)
    return verdict(null, null, null, "TATA_SEQUENCE_ATTESTATION_REFUSED:" + check.reasons.join(","));
  const st = check.statement;
  if (st.order_key !== event.order_key || st.scope_id !== scope || st.tata_sequence !== seq)
    return verdict(null, null, null, "TATA_SEQUENCE_ATTESTATION_SCOPE_MISMATCH");
  const ledger = options.ledger;
  if (!ledger || !Array.isArray(ledger.rows)) return verdict(null, null, null, "TATA_SEQUENCE_LEDGER_NOT_RECHECKED");
  if (ledger.inspection_status !== "STRONG_KEY_PRESENT_IN_SUPPLIED_STATE_NOT_ATTESTED" ||
      ledger.review_binding_number !== seq)
    return verdict(null, null, null, "TATA_SEQUENCE_LEDGER_DISAGREES");
  // The day keeps growing; the attested prefix 001..rows must be unchanged.
  if (tataLedgerDayDigestV1(ledger.rows, st.ledger_day_rows) !== st.ledger_day_digest)
    return verdict(null, null, null, "TATA_SEQUENCE_LEDGER_HISTORY_CHANGED");
  if (check.scope !== "PRODUCTION_ITAIM")
    return verdict("CANDIDATE_PERSISTED_IN_LAB", null, seq, "TATA_SEQUENCE_ATTESTED_IN_ISOLATION_NOT_LIVE");
  return verdict(level, seq, null, null);
}
