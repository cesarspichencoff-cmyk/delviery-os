import type { DeliveryProductionJoin, JoinedOperationalItem } from "./deliveryProductionJoin";
import type { ProvenReaderProductV66 } from "./readerIngressV66";

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

const SERVICE_STATE = /^SERVICE_STATE_[A-Z_]+$/;

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
    } else if (/^UPSTREAM_SERVICE_SERVICE_STATE_[A-Z_]+$/.test(b) ||
      (/^UPSTREAM_SERVICE_STATE_[A-Z_]+$/.test(b) && upstreamOnlyService)) {
      out.legacy_service_state.push(b);
    } else if ((m = /^SUSHI([12])_DUAL_PRODUCTION_ROLE_UNPROVEN_(\d\.\d{2}\.\d{2}\.\d{3}\.\d{2})$/.exec(b))) {
      out.paired_destination.push({ blocker: b, pair: m[1] === "1" ? "SUSHI_1" : "SUSHI_2", canonical_code: m[2] });
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
