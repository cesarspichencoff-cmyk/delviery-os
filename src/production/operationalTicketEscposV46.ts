import type {
  ConferenceTicketV45,
  ProductionTicketV45,
  TicketItemV45,
  OperationalTicketsResultV45,
} from "./operationalTicketsV45";

/**
 * OFFLINE Epson TM-T20 80mm proof renderer.
 *
 * ESC/POS text layout is NOT pixel-equivalent to Figma Condensed.
 * Uses printer Font B 64 columns (assumed; must be physically calibrated).
 * No spooler/network/USB connection and no cut command.
 */
export interface TicketEscPosProofV46 {
  schema: "deliveryos.tickets-escpos-proof-v46.v1";
  profile: "EPSON_TM_T20_80MM_FONT_B_UNCALIBRATED";
  name: string;
  ready_for_offline_preview: boolean;
  ready_for_operational_print: false;
  blocking_reasons: string[];
  text_trace: string;
  bytes: number[];
  byte_count: number;
  effects: {
    print: false;
    spooler_write: false;
    odhen_write: false;
    cut: false;
  };
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const FONT_A_COLS = 48;
const FONT_B_COLS = 64;

type Font = "A" | "B";
type Align = "LEFT" | "RIGHT";

function plain(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
function uppercase(value: unknown): string {
  return plain(value).toLocaleUpperCase("pt-BR");
}
function quantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}
function smallResource(entries: Array<{label: string; quantity: number}>): string[] {
  return entries.map((entry) => quantity(entry.quantity) + " " + uppercase(entry.label));
}

class OfflinePrinter {
  bytes: number[] = [];
  trace: string[] = [];
  blockers = new Set<string>();
  currentFont: Font = "A";

  constructor() {
    this.command(ESC, 0x40);
    this.command(ESC, 0x74, 0x10); // Windows-1252 candidate, verify with physical device.
    this.font("A");
  }
  command(...bytes: number[]): void {
    this.bytes.push(...bytes);
  }
  font(value: Font): void {
    this.currentFont = value;
    this.command(ESC, 0x4d, value === "A" ? 0 : 1);
  }
  align(value: Align): void {
    this.command(ESC, 0x61, value === "RIGHT" ? 2 : 0);
  }
  bold(value: boolean): void {
    this.command(ESC, 0x45, value ? 1 : 0);
  }
  heightDouble(value: boolean): void {
    this.command(GS, 0x21, value ? 0x10 : 0x00);
  }
  bothDouble(value: boolean): void {
    this.command(GS, 0x21, value ? 0x11 : 0x00);
  }
  line(content = "", context = "GENERAL"): void {
    // Preserve intentional item/quantity spacing while preventing line breaks.
    const line = String(content ?? "").replace(/[\r\n\t]+/g, " ").trim();
    const columns = this.currentFont === "A" ? FONT_A_COLS : FONT_B_COLS;
    if (line.length > columns) {
      this.blockers.add("LINE_EXCEEDS_" + columns + "_COLUMNS:" + context);
      return;
    }
    // No loss/transliteration of text: unsupported characters stop the proof.
    if ([...line].some((char) => {
      const cp = char.codePointAt(0) ?? 0;
      return cp > 0xff || (cp >= 0x80 && cp < 0xa0) || cp < 0x20;
    })) {
      this.blockers.add("CHARACTER_ENCODING_UNVERIFIED:" + context);
      return;
    }
    this.bytes.push(...Buffer.from(line, "latin1"), LF);
    this.trace.push(line);
  }
  item(item: TicketItemV45): void {
    this.align("LEFT");
    this.font("B");
    this.bold(true);
    this.heightDouble(true);
    this.line(quantity(item.quantity) + "  " + uppercase(item.print_name), "ITEM:" + item.source_item_index);
    this.heightDouble(false);
    this.bold(false);
    this.font("B");
    for (const o of item.observations) {
      this.line("OBS: " + uppercase(o), "OBS:" + item.source_item_index);
    }
    for (const f of item.finishing) {
      this.line("FINALIZAR: " + uppercase(f), "FINALIZAR:" + item.source_item_index);
    }
    for (const d of item.kitchen_dependencies) {
      this.line("AGUARDAR COZINHA: " + uppercase(d), "DEPENDENCIA:" + item.source_item_index);
    }
  }
  metadata(ids: { ifood: string; teknisa: string; tata: string; hour: string | null } | null): void {
    if (!ids || !plain(ids.ifood) || !plain(ids.teknisa) ||
        !/^\d{3}$/.test(plain(ids.tata))) {
      this.blockers.add("SOURCE_IDENTIFIERS_UNPROVEN");
      return;
    }
    this.font("B");
    this.bold(true);
    this.line("IFOOD " + plain(ids.ifood) + " | TEKNISA " + plain(ids.teknisa) +
      (ids.hour ? " | " + plain(ids.hour) : ""), "HEADER");
    this.bold(false);
  }
  ending(sequence: string | null): void {
    if (!sequence || !/^\d{3}$/.test(sequence)) {
      this.blockers.add("TATA_SEQUENCE_NOT_PROVEN");
      return;
    }
    this.align("RIGHT");
    this.font("A");
    this.bold(true);
    this.bothDouble(true);
    this.line(sequence, "TATA_SEQUENCE");
    this.bothDouble(false);
    this.bold(false);
    this.align("LEFT");
    this.line("");
    this.line("");
    // No GS V cut command or device/spooler interface, by design.
  }
  result(name: string): TicketEscPosProofV46 {
    const blockers = [...this.blockers].sort();
    return {
      schema: "deliveryos.tickets-escpos-proof-v46.v1",
      profile: "EPSON_TM_T20_80MM_FONT_B_UNCALIBRATED",
      name,
      ready_for_offline_preview: blockers.length === 0,
      ready_for_operational_print: false,
      blocking_reasons: blockers,
      text_trace: this.trace.join("\n"),
      bytes: blockers.length ? [] : [...this.bytes],
      byte_count: blockers.length ? 0 : this.bytes.length,
      effects: {print:false,spooler_write:false,odhen_write:false,cut:false},
    };
  }
}

function addResourceLine(p: OfflinePrinter, text: string, marker: string): void {
  p.font("B");
  p.line(text, marker);
}
function printResourceGroups(
  p: OfflinePrinter, label: string,
  resources: Array<{label:string;quantity:number}>,
): void {
  if (!resources.length) return;
  const values = smallResource(resources);
  const prefix = label + ": ";
  let partial = prefix;
  for (const value of values) {
    const candidate = partial === prefix ? prefix + value : partial + " | " + value;
    if (candidate.length <= FONT_B_COLS) {
      partial = candidate;
    } else {
      if (partial === prefix) {
        p.blockers.add("RESOURCE_NAME_EXCEEDS_PAPER:" + label);
        return;
      }
      addResourceLine(p, partial, "RESOURCE:" + label);
      partial = prefix + value;
      if (partial.length > FONT_B_COLS) {
        p.blockers.add("RESOURCE_NAME_EXCEEDS_PAPER:" + label);
        return;
      }
    }
  }
  if (partial !== prefix) addResourceLine(p, partial, "RESOURCE:" + label);
}

export function renderProductionTicketProofV46(ticket: ProductionTicketV45): TicketEscPosProofV46 {
  const p = new OfflinePrinter();
  p.font("B");
  p.bold(true);
  p.line("TESTE - NAO PRODUZIR", "BANNER");
  p.line("PRODUCAO " + uppercase(ticket.station), "STATION");
  p.metadata(ticket.identifiers);
  p.line("--------------------------------", "DIVIDER");
  for (const box of ticket.boxes) {
    const count = box.physical_box_count ?? 1;
    if (!box.model) p.blockers.add("BOX_MODEL_UNPROVEN");
    p.font("B");
    p.bold(true);
    p.line(count > 1 ? count + "X CAIXA " + box.model : "CAIXA " + box.model, "BOX");
    p.bold(false);
    for (const item of box.items) p.item(item);
    p.line("--------------------------------", "DIVIDER");
  }
  if (ticket.items_without_proven_box.length) {
    p.bold(true);
    p.line("EMBALAGEM A CONFERIR", "PACKING_FALLBACK");
    p.bold(false);
    for (const item of ticket.items_without_proven_box) p.item(item);
  }
  p.ending(ticket.identifiers.tata);
  return p.result("PRODUCAO:" + ticket.station);
}

export function renderConferenceTicketProofV46(ticket: ConferenceTicketV45): TicketEscPosProofV46 {
  const p = new OfflinePrinter();
  p.font("B");
  p.bold(true);
  p.line("TESTE - NAO PRODUZIR", "BANNER");
  p.line("CONFERENCIA", "DESTINATION");
  p.metadata(ticket.identifiers);
  p.line("--------------------------------", "DIVIDER");
  for (const box of ticket.boxes) {
    if (!box.model) p.blockers.add("BOX_MODEL_UNPROVEN");
    p.font("B");
    p.bold(true);
    p.line(box.position + "  CAIXA " + box.model + "  " + box.operator_field, "BOX_OPERATOR");
    p.bold(false);
    for (const item of box.items) p.item(item);
  }
  if (ticket.items_without_proven_box.length) {
    p.bold(true);
    p.line("EMBALAGEM A CONFERIR", "PACKING_FALLBACK");
    p.bold(false);
    for (const item of ticket.items_without_proven_box) p.item(item);
  }
  p.line("--------------------------------", "DIVIDER");
  const parts = [...smallResource(ticket.bags), ...smallResource(ticket.kits)];
  if (parts.length) {
    p.font("B");
    let current = "";
    for (const part of parts) {
      const combined = current ? current + " | " + part : part;
      if (combined.length <= FONT_B_COLS) current = combined;
      else {
        if (!current) p.blockers.add("BAG_KIT_LINE_TOO_LONG");
        else addResourceLine(p, current, "BAG_KIT");
        current = part;
      }
    }
    if (current) addResourceLine(p, current, "BAG_KIT");
  }
  if (!ticket.bags.length && ticket.warnings.some((x) => /BAG_SIZE|EXACT_BAG|PACKAGING_PLAN_MISSING/.test(x))) {
    p.line("SACOLA: A CONFERIR", "BAG_UNKNOWN");
  }
  if (!ticket.kits.length && ticket.warnings.some((x) => /KIT_PLAN_MISSING|KIT_ASSIGNMENT/.test(x))) {
    p.line("KIT: A CONFERIR", "KIT_UNKNOWN");
  }
  printResourceGroups(p, "ACOMP", ticket.accompaniments);
  p.ending(ticket.identifiers?.tata ?? null);
  return p.result("CONFERENCIA");
}

export function renderOperationalTicketsProofV46(source: OperationalTicketsResultV45): {
  production: TicketEscPosProofV46[];
  conference: TicketEscPosProofV46;
  effects: {print:false;spooler_write:false;odhen_write:false;cut:false};
} {
  return {
    production: source.production.map(renderProductionTicketProofV46),
    conference: renderConferenceTicketProofV46(source.conference),
    effects:{print:false,spooler_write:false,odhen_write:false,cut:false},
  };
}
