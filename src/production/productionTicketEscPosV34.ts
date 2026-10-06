import type { KitchenNeedContribution, KitchenNeedProjection } from "./kitchenDependencies";
import type { StationProductionTicketV2 } from "./productionTicketV2";

export interface EscPosV34RenderResult {
  schema: "deliveryos.production-ticket-escpos-v34.v1";
  profile: "EPSON_TM_T20_80MM_V34";
  ready_for_preview: boolean;
  ready_for_automatic_operational_print: boolean;
  blocking_reasons: string[];
  bytes: number[];
  text_trace: string;
  effects: {
    print: false;
    spooler_write: false;
    odhen_write: false;
  };
}

export interface StationEscPosV34Input {
  ticket: StationProductionTicketV2;
  display_station_name: string;
  kitchen_needs?: KitchenNeedProjection | null;
  test_banner?: string | null;
}

export interface KitchenEscPosV34Input {
  ticket: StationProductionTicketV2;
  kitchen_needs: KitchenNeedProjection;
  test_banner?: string | null;
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const FONT_A_COLUMNS = 48;
const FONT_B_COLUMNS = 64;

function inline(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizedName(value: unknown): string {
  return inline(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function quantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function unsupportedLatin1(value: string): boolean {
  for (const char of value) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp < 0x20 || cp > 0xff) return true;
  }
  return false;
}

class EscPosBuilder {
  readonly bytes: number[] = [];
  readonly trace: string[] = [];
  readonly blocking = new Set<string>();

  command(...values: number[]): void {
    this.bytes.push(...values);
  }

  line(value = ""): void {
    const text = inline(value);
    if (text && unsupportedLatin1(text)) {
      this.blocking.add("UNSUPPORTED_LATIN1_TEXT");
      return;
    }
    this.bytes.push(...Buffer.from(text, "latin1"), LF);
    this.trace.push(text);
  }

  init(): void {
    this.command(ESC, 0x40);
    this.command(ESC, 0x74, 0x10);
    this.font("A");
  }

  align(mode: "LEFT" | "CENTER" | "RIGHT"): void {
    const n = mode === "LEFT" ? 0 : mode === "CENTER" ? 1 : 2;
    this.command(ESC, 0x61, n);
  }

  bold(on: boolean): void {
    this.command(ESC, 0x45, on ? 1 : 0);
  }

  font(mode: "A" | "B"): void {
    this.command(ESC, 0x4d, mode === "A" ? 0 : 1);
  }

  size(mode: "NORMAL" | "DOUBLE_HEIGHT" | "DOUBLE_BOTH" | "ID_EMPHASIS"): void {
    const n =
      mode === "NORMAL"
        ? 0x00
        : mode === "ID_EMPHASIS"
          ? 0x01
          : mode === "DOUBLE_HEIGHT"
            ? 0x10
            : 0x11;
    this.command(GS, 0x21, n);
  }

  cut(): void {
    this.command(LF, LF, LF, GS, 0x56, 0x42, 0x00);
  }
}

function contributionKey(name: string, qty: number): string {
  return normalizedName(name) + "|" + quantity(qty);
}

function contributionIndex(
  projection: KitchenNeedProjection | null | undefined,
): Map<string, KitchenNeedContribution[]> {
  const map = new Map<string, KitchenNeedContribution[]>();
  for (const contribution of projection?.contributions ?? []) {
    const key = contributionKey(contribution.item_name, contribution.item_quantity);
    const prior = map.get(key) ?? [];
    prior.push(contribution);
    map.set(key, prior);
  }
  return map;
}

function dependencyLines(contribution: KitchenNeedContribution): string[] {
  const lines: string[] = [];
  if (contribution.hot > 0) lines.push(`${quantity(contribution.hot)}x HOT`);
  if (contribution.ebiten > 0) lines.push(`${quantity(contribution.ebiten)}x EBITEN`);
  if (contribution.shiso > 0) lines.push(`${quantity(contribution.shiso)}x SHISO`);
  return lines;
}

function addBanner(builder: EscPosBuilder, banner: string | null | undefined): void {
  const text = inline(banner);
  if (!text) return;
  builder.align("CENTER");
  builder.font("A");
  builder.bold(true);
  builder.size("NORMAL");
  builder.line(text);
}

function addDestination(builder: EscPosBuilder, destination: string): void {
  builder.align("CENTER");
  builder.font("A");
  builder.bold(true);
  builder.size("DOUBLE_BOTH");
  builder.line(inline(destination));
  builder.size("NORMAL");
  builder.line("----------------------------------------");
}

function addSingleLineEmphasis(
  builder: EscPosBuilder,
  value: string,
  blockingPrefix: string,
): void {
  const text = inline(value);
  builder.align("LEFT");
  builder.bold(true);
  builder.size("DOUBLE_HEIGHT");

  if (text.length <= FONT_A_COLUMNS) {
    builder.font("A");
    builder.line(text);
  } else if (text.length <= FONT_B_COLUMNS) {
    builder.font("B");
    builder.line(text);
  } else {
    builder.blocking.add(`${blockingPrefix}:${normalizedName(text)}`);
  }

  builder.font("A");
  builder.size("NORMAL");
}

function addStationFooter(builder: EscPosBuilder, ticket: StationProductionTicketV2): void {
  builder.line("");
  builder.align("LEFT");
  builder.font("A");
  builder.bold(true);
  builder.size("DOUBLE_HEIGHT");
  builder.line(`IFOOD ${inline(ticket.identifiers.ifood_sequence)}`);

  builder.bold(false);
  builder.size("NORMAL");
  builder.line(`TEKNISA ${inline(ticket.identifiers.teknisa_sequence)}`);

  const time = inline(ticket.identifiers.order_time);
  if (time) builder.line(`HORA ${time}`);

  builder.line("");
  builder.align("RIGHT");
  builder.bold(true);
  builder.size("NORMAL");
  builder.line("TATA");
  builder.size("DOUBLE_BOTH");
  builder.line(inline(ticket.identifiers.tata_sequence));
  builder.size("NORMAL");
  builder.align("LEFT");
}

function addKitchenFooter(builder: EscPosBuilder, ticket: StationProductionTicketV2): void {
  addStationFooter(builder, ticket);
}

function resultFromBuilder(
  builder: EscPosBuilder,
  blockingReasons: string[],
  automaticReady: boolean,
): EscPosV34RenderResult {
  const blocking = new Set([...blockingReasons, ...builder.blocking]);
  const previewReady = builder.bytes.length > 0 && builder.blocking.size === 0;
  return {
    schema: "deliveryos.production-ticket-escpos-v34.v1",
    profile: "EPSON_TM_T20_80MM_V34",
    ready_for_preview: previewReady,
    ready_for_automatic_operational_print:
      previewReady && automaticReady && blocking.size === 0,
    blocking_reasons: [...blocking].sort(),
    bytes: previewReady ? [...builder.bytes] : [],
    text_trace: builder.trace.join("\n"),
    effects: {
      print: false,
      spooler_write: false,
      odhen_write: false,
    },
  };
}

export function renderStationProductionTicketEscPosV34(
  input: StationEscPosV34Input,
): EscPosV34RenderResult {
  const builder = new EscPosBuilder();
  const blocking: string[] = [];
  const station = inline(input.display_station_name);
  if (!station) blocking.push("DISPLAY_STATION_NAME_REQUIRED");

  const deps = contributionIndex(input.kitchen_needs);
  const usedContributionKeys = new Set<string>();

  builder.init();
  addBanner(builder, input.test_banner);
  addDestination(builder, station || "UNKNOWN");

  for (const group of input.ticket.mount_groups) {
    const box = inline(group.box_label);
    if (box) {
      builder.align("CENTER");
      builder.font("A");
      builder.bold(true);
      builder.size("DOUBLE_HEIGHT");
      builder.line(`MONTAR NA ${box}`);
      builder.size("NORMAL");
      builder.line("");
    }

    for (const item of group.items) {
      addSingleLineEmphasis(
        builder,
        `${quantity(item.quantity)}x ${inline(item.product_name)}`,
        "ITEM_LINE_EXCEEDS_64_COLUMNS",
      );

      for (const observation of item.observations) {
        addSingleLineEmphasis(
          builder,
          `OBS: ${inline(observation)}`,
          "ITEM_OBSERVATION_EXCEEDS_64_COLUMNS",
        );
      }
      builder.line("");

      const key = contributionKey(item.product_name, item.quantity);
      const matched = deps.get(key) ?? [];
      if (matched.length > 1) {
        blocking.push(`AMBIGUOUS_KITCHEN_DEPENDENCY_MATCH:${key}`);
      } else if (matched.length === 1) {
        usedContributionKeys.add(key);
        const lines = dependencyLines(matched[0]);
        if (lines.length) {
          builder.align("CENTER");
          builder.font("A");
          builder.bold(true);
          builder.size("NORMAL");
          builder.line("VEM DA COZINHA");
          builder.size("DOUBLE_HEIGHT");
          for (const line of lines) builder.line(line);
          builder.size("NORMAL");
          builder.line("");
        }
      }
    }
  }

  for (const [key, contributions] of deps.entries()) {
    if (
      !usedContributionKeys.has(key) &&
      contributions.some((value) => dependencyLines(value).length > 0)
    ) {
      blocking.push(`UNMATCHED_KITCHEN_DEPENDENCY_CONTRIBUTION:${key}`);
    }
  }

  addStationFooter(builder, input.ticket);
  builder.cut();

  const kitchenComplete = input.kitchen_needs
    ? input.kitchen_needs.ready_for_complete_total
    : true;
  if (input.kitchen_needs) {
    blocking.push(...input.kitchen_needs.blocking_reasons);
  }

  return resultFromBuilder(builder, blocking, kitchenComplete);
}

export function renderKitchenDependencyTicketEscPosV34(
  input: KitchenEscPosV34Input,
): EscPosV34RenderResult {
  const builder = new EscPosBuilder();
  const blocking = [...input.kitchen_needs.blocking_reasons];
  const projection = input.kitchen_needs;
  const hasKnownNeed =
    projection.totals.hot > 0 ||
    projection.totals.ebiten > 0 ||
    projection.totals.shiso > 0;

  if (!hasKnownNeed) blocking.push("NO_KNOWN_KITCHEN_DEPENDENCY");

  builder.init();
  addBanner(builder, input.test_banner);
  addDestination(builder, "COZINHA");
  builder.line("");

  builder.align("CENTER");
  builder.font("A");
  builder.bold(true);
  builder.size("DOUBLE_BOTH");
  if (projection.totals.hot > 0) builder.line(`${quantity(projection.totals.hot)}x HOT`);
  if (projection.totals.ebiten > 0) builder.line(`${quantity(projection.totals.ebiten)}x EBITEN`);
  if (projection.totals.shiso > 0) builder.line(`${quantity(projection.totals.shiso)}x SHISO`);
  builder.size("NORMAL");
  builder.line("");

  builder.align("LEFT");
  builder.bold(false);
  builder.line("ORIGEM");
  for (const contribution of projection.contributions) {
    if (dependencyLines(contribution).length === 0) continue;
    addSingleLineEmphasis(
      builder,
      `${quantity(contribution.item_quantity)}x ${inline(contribution.item_name)}`,
      "KITCHEN_ORIGIN_LINE_EXCEEDS_64_COLUMNS",
    );
  }
  builder.line("");

  builder.align("CENTER");
  builder.font("A");
  builder.bold(true);
  builder.size("DOUBLE_HEIGHT");
  builder.line("[ ] PRODUZIDO");
  builder.size("NORMAL");

  addKitchenFooter(builder, input.ticket);
  builder.cut();

  return resultFromBuilder(
    builder,
    blocking,
    projection.ready_for_complete_total,
  );
}
