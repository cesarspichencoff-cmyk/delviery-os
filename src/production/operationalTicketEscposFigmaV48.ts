import {OfflinePrinter, renderOperationalTicketsProofV46, type TicketEscPosProofV46} from "./operationalTicketEscposV46";
import type {
  ConferenceTicketV45,
  ProductionTicketV45,
  TicketItemV45,
  OperationalTicketsResultV45,
} from "./operationalTicketsV45";

/**
 * OFFLINE ESC/POS preview aligned to the approved Figma masters:
 * Production V4.4 (node 30:2) and Conference V4.3 (node 20:2), decided by
 * César on 02/11/2026 over the 13 measured differences of V4.6
 * (docs/comandas/VIAS_VS_FIGMA_MEDICAO_20261102.md).
 *
 * Layout only. Semantics are V4.6's, unchanged: the V4.6 proof of the same
 * view is computed first and every non-layout reason it raises (semantic
 * readiness, box membership, quantities, notes plan, three-view identity,
 * global and conference-only vetoes) is inherited, so a V4.8 view carries
 * bytes only when V4.6 would. Still a preview: no device, spooler or cut;
 * paper geometry and the code table need a supervised Epson sheet.
 */
export type TicketEscPosProofV48 = Omit<TicketEscPosProofV46, "schema" | "profile"> & {
  schema: "deliveryos.tickets-escpos-proof-v48.figma.v1";
  profile: "EPSON_TM_T20_80MM_FIGMA_ALIGNED_UNCALIBRATED";
};

const COLS_A = 48;
const COLS_B = 64;
const DIVIDER = "-".repeat(COLS_A);
const BANNER = "SIMULAÇÃO · NÃO PRODUZIR";
const plain = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const upper = (v: unknown) => plain(v).toLocaleUpperCase("pt-BR");
const title = (v: unknown) => plain(v).toLocaleLowerCase("pt-BR").replace(/^\p{L}/u, (c) => c.toLocaleUpperCase("pt-BR"));
const chars = (v: string) => [...v].length;

function quantity(value: unknown, p: OfflinePrinter, context: string): string {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    p.blockers.add("INVALID_QUANTITY:" + context);
    return "QUANTIDADE INVALIDA";
  }
  return String(value);
}

class FigmaPrinterV48 extends OfflinePrinter {
  /** GS ! with any width/height multiplier; the base width check follows it. */
  size(width: number, height: number): void {
    (this as unknown as {currentWidthMultiplier: number}).currentWidthMultiplier = width;
    this.command(0x1d, 0x21, ((width - 1) << 4) | (height - 1));
  }
  /** Font A when the whole line fits 48 columns, otherwise Font B (64). */
  fit(text: string, context: string): void {
    this.font(chars(text) <= COLS_A ? "A" : "B");
    this.line(text, context);
  }
  divider(): void {
    this.font("A");
    this.bold(false);
    this.size(1, 1);
    this.line(DIVIDER, "DIVIDER");
  }
  /** Master 30:3: "iFood #5487  |  TEKNISA 1234  |  19:45". Printed even
   * without a TATÁ number, so previews always show the original ids. */
  identifiers(ids: ProductionTicketV45["identifiers"] | null): void {
    if (!ids || !plain(ids.ifood) || !plain(ids.teknisa)) {
      this.blockers.add("SOURCE_IDENTIFIERS_UNPROVEN");
      return;
    }
    const parts = ["iFood #" + plain(ids.ifood), "TEKNISA " + plain(ids.teknisa),
      ...(ids.hour ? [plain(ids.hour)] : [])];
    const wide = parts.join("  |  ");
    this.bold(false);
    this.fit(chars(wide) <= COLS_A ? wide : parts.join(" | "), "HEADER");
  }
  boxWithOperator(left: string, operator: string): void {
    this.bold(true);
    for (const [font, cols] of [["A", COLS_A], ["B", COLS_B]] as const) {
      const pad = cols - chars(left) - chars(operator);
      if (pad >= 2) {
        this.font(font);
        this.line(left + " ".repeat(pad) + operator, "BOX_OPERATOR");
        this.bold(false);
        return;
      }
    }
    this.bold(false);
    this.blockers.add("BOX_OPERATOR_LINE_EXCEEDS_PAPER");
  }
  itemV48(item: TicketItemV45, boldNotes: boolean): void {
    this.align("LEFT");
    const headline = quantity(item.quantity, this, "ITEM:" + item.source_item_index) + "  " + upper(item.print_name);
    this.font(chars(headline) <= COLS_A ? "A" : "B");
    this.bold(true);
    this.size(1, 2);
    this.line(headline, "ITEM:" + item.source_item_index);
    this.size(1, 1);
    this.bold(boldNotes);
    for (const o of item.observations) this.annotation("OBS", o, "OBS:" + item.source_item_index);
    for (const f of item.finishing) this.annotation("FINALIZAR", f, "FINALIZAR:" + item.source_item_index);
    for (const d of item.kitchen_dependencies)
      this.annotation("AGUARDAR_COZINHA", d, "DEPENDENCIA:" + item.source_item_index);
    this.bold(false);
  }
  /** Master: the TATÁ number is the largest element (box 9.5 mm); 3x3 Font A = 9.0 mm. */
  tata(sequence: string | null): void {
    if (!sequence || !/^\d{3}$/.test(sequence)) {
      this.blockers.add("TATA_SEQUENCE_NOT_PROVEN");
      return;
    }
    this.align("RIGHT");
    this.font("A");
    this.bold(true);
    this.size(3, 3);
    this.line(sequence, "TATA_SEQUENCE");
    this.size(1, 1);
    this.bold(false);
    this.align("LEFT");
    this.line("");
    this.line("");
  }
  resultV48(name: string): TicketEscPosProofV48 {
    return {...this.result(name), schema: "deliveryos.tickets-escpos-proof-v48.figma.v1",
      profile: "EPSON_TM_T20_80MM_FIGMA_ALIGNED_UNCALIBRATED"};
  }
}

export function renderProductionTicketFigmaV48(ticket: ProductionTicketV45): TicketEscPosProofV48 {
  const p = new FigmaPrinterV48();
  if (ticket.ready_for_semantic_preview !== true) p.blockers.add("STATION_SEMANTIC_NOT_READY");
  p.font("B");
  p.bold(true);
  p.line(BANNER, "BANNER");
  const station = upper(ticket.station);
  p.font(chars(station) <= COLS_A ? "A" : "B");
  p.size(1, 2);
  p.line(station, "STATION");
  p.size(1, 1);
  p.bold(false);
  p.identifiers(ticket.identifiers);
  p.divider();
  let physical = 0;
  for (const box of ticket.boxes) {
    const count = box.physical_box_count === undefined ? 1 : box.physical_box_count;
    quantity(count, p, "BOX_COUNT");
    if (!box.model || box.status !== "PROVEN") p.blockers.add("BOX_MODEL_OR_PROOF_MISSING");
    const repeated = count > 1 && box.status === "PROVEN" &&
      box.items.length === 1 && box.items[0].quantity === count;
    if (count > 1 && !repeated) p.blockers.add("PER_PHYSICAL_BOX_DISTRIBUTION_NOT_PROVEN");
    if (count > 64) p.blockers.add("OFFLINE_PREVIEW_BOX_EXPANSION_BUDGET_EXCEEDED");
    if (count > 64 || count < 1 || !Number.isSafeInteger(count)) continue;
    for (let i = 0; i < (repeated ? count : 1); i++) {
      physical++;
      p.font("A");
      p.bold(true);
      p.line("C" + physical + "  CAIXA " + (box.model ?? "A CONFERIR"), "BOX");
      p.bold(false);
      for (const item of box.items) p.itemV48(repeated ? {...item, quantity: 1} : item, true);
      p.divider();
    }
  }
  if (ticket.items_without_proven_box.length) {
    p.font("A");
    p.bold(true);
    p.line("CAIXA: A DEFINIR", "PACKING_FALLBACK");
    p.bold(false);
    for (const item of ticket.items_without_proven_box) p.itemV48(item, true);
    p.divider();
  }
  p.tata(ticket.identifiers?.tata ?? null);
  return p.resultV48("PRODUCAO:" + ticket.station);
}

/** Master 20:9 resource lines: "Sacola: a conferir  |  Kit: a conferir",
 * "Acomp.: 1 Gari  |  1 Tare"; proven kits keep the motor label ("1 Kit p/2"). */
function resourceLinesV48(t: ConferenceTicketV45, p: OfflinePrinter): string[] {
  const bagUnknown = !t.bags.length && t.warnings.some((x) =>
    /BAG_SIZE|BAG_COUNT|EXACT_BAG|PACKAGING_PLAN_MISSING|RESOURCE_UNKNOWN:.*BAG/.test(x));
  const kitUnknown = !t.kits.length && t.warnings.some((x) =>
    /KIT_PLAN_MISSING|KIT_ASSIGNMENT|KITS_NOT_FACT|RESOURCE_UNKNOWN:.*KIT/.test(x));
  const bag = t.bags.length
    ? "Sacola: " + t.bags.map((b) => quantity(b.quantity, p, "BAG") + " " + plain(b.label).replace(/^sacola\s+/i, "")).join("  |  ")
    : bagUnknown ? "Sacola: a conferir" : null;
  const kit = t.kits.length
    ? t.kits.map((k) => quantity(k.quantity, p, "KIT") + " " + plain(k.label)).join("  |  ")
    : kitUnknown ? "Kit: a conferir" : null;
  const acomp = t.accompaniments.length
    ? "Acomp.: " + t.accompaniments.map((a) => quantity(a.quantity, p, "ACOMP") + " " + title(a.label)).join("  |  ")
    : null;
  const out: string[] = [];
  const both = [bag, kit].filter((x): x is string => !!x).join("  |  ");
  if (both && chars(both) <= COLS_A) out.push(both);
  else for (const x of [bag, kit]) if (x) out.push(x);
  if (acomp) out.push(acomp);
  return out;
}

export function renderConferenceTicketFigmaV48(ticket: ConferenceTicketV45): TicketEscPosProofV48 {
  const p = new FigmaPrinterV48();
  if (ticket.ready_for_semantic_preview !== true) p.blockers.add("CONFERENCE_SEMANTIC_NOT_READY");
  p.font("B");
  p.bold(true);
  // The master conference has no banner; in shadow every view keeps it.
  p.line(BANNER, "BANNER");
  p.font("A");
  p.line("CONFERÊNCIA", "DESTINATION");
  p.bold(false);
  p.identifiers(ticket.identifiers);
  p.divider();
  for (const box of ticket.boxes) {
    if (!box.model) p.blockers.add("BOX_MODEL_UNPROVEN");
    if (box.status !== "PROVEN" || (box.physical_box_count ?? 1) !== 1 || box.items.length === 0)
      p.blockers.add("CONFERENCE_BOX_MEMBERSHIP_NOT_PROVEN");
    p.boxWithOperator(box.position + "  CAIXA " + box.model, box.operator_field);
    for (const item of box.items) p.itemV48(item, false);
    p.divider();
  }
  if (ticket.items_without_proven_box.length) {
    p.font("A");
    p.bold(true);
    p.line("CAIXA: A DEFINIR", "PACKING_FALLBACK");
    p.bold(false);
    for (const item of ticket.items_without_proven_box) p.itemV48(item, false);
    p.divider();
  }
  if (ticket.items_without_physical_box?.length) {
    p.font("A");
    p.bold(true);
    p.line("ITENS SEM CAIXA FISICA", "NO_BOX_PROVEN");
    p.bold(false);
    for (const item of ticket.items_without_physical_box) p.itemV48(item, false);
    p.divider();
  }
  const resources = resourceLinesV48(ticket, p);
  for (const line of resources) p.fit(line, "RESOURCE");
  if (resources.length) p.divider();
  p.tata(ticket.identifiers?.tata ?? null);
  return p.resultV48("CONFERENCIA");
}

/** V4.6 reasons that describe V4.6's OWN layout; V4.8 checks its own instead. */
const V46_LAYOUT_ONLY = [/^LINE_EXCEEDS_\d+_COLUMNS:/, /^CHARACTER_ENCODING_UNVERIFIED:/,
  /^SOURCE_IDENTIFIERS_UNPROVEN$/, /^TATA_SEQUENCE_NOT_PROVEN$/, /^RESOURCE_NAME_EXCEEDS_PAPER:/,
  /^BAG_KIT_LINE_TOO_LONG$/];
function inherit(own: TicketEscPosProofV48, semantic: TicketEscPosProofV46): TicketEscPosProofV48 {
  const carried = semantic.blocking_reasons.filter((r) => !V46_LAYOUT_ONLY.some((re) => re.test(r)));
  const reasons = [...new Set([...own.blocking_reasons, ...carried])].sort();
  return reasons.length === own.blocking_reasons.length && reasons.every((r, i) => r === own.blocking_reasons[i])
    ? own
    : {...own, blocking_reasons: reasons, ready_for_offline_preview: false, bytes: [], byte_count: 0};
}

export function renderOperationalTicketsFigmaV48(source: OperationalTicketsResultV45): {
  production: TicketEscPosProofV48[];
  conference: TicketEscPosProofV48;
  layout: "FIGMA_V44_V43_ALIGNED_V48";
  effects: {print: false; spooler_write: false; odhen_write: false; cut: false};
} {
  const semantic = renderOperationalTicketsProofV46(source);
  return {
    production: source.production.map((t, k) => inherit(renderProductionTicketFigmaV48(t), semantic.production[k])),
    conference: inherit(renderConferenceTicketFigmaV48(source.conference), semantic.conference),
    layout: "FIGMA_V44_V43_ALIGNED_V48",
    effects: {print: false, spooler_write: false, odhen_write: false, cut: false},
  };
}
