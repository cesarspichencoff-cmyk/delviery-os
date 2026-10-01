import type { StationProductionTicketV2 } from "./productionTicketV2";

export type ProductionTicketPreviewProfile =
  | "EPSON_TM_T20_80MM_FONT_A"
  | "EPSON_TM_T20_58MM_FONT_A";

export interface ProductionTicketPreview {
  schema: "deliveryos.production-ticket-preview.v1";
  profile: ProductionTicketPreviewProfile;
  columns: 48 | 35;
  text: string;
  max_line_length: number;
  physical_effect: false;
}

const PROFILE_COLUMNS: Record<ProductionTicketPreviewProfile, 48 | 35> = {
  EPSON_TM_T20_80MM_FONT_A: 48,
  EPSON_TM_T20_58MM_FONT_A: 35,
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function wrapLine(value: string, width: number): string[] {
  const text = clean(value);
  if (!text) return [""];
  if (text.length <= width) return [text];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += width) {
        lines.push(word.slice(i, i + width));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function centered(value: string, width: number): string {
  const text = clean(value).slice(0, width);
  const left = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(left) + text;
}

function prepLine(input: {
  label: string;
  quantity: number;
  unit: string;
}): string {
  const unit = clean(input.unit).toUpperCase();
  if (unit === "EA") return `PREPARO: ${input.quantity}x ${clean(input.label)}`;
  return `PREPARO: ${input.quantity} ${unit} ${clean(input.label)}`;
}

function isSushiDestination(name: string): boolean {
  return /SUSHI/i.test(name);
}

export function renderProductionTicketPreview(
  ticket: StationProductionTicketV2,
  profile: ProductionTicketPreviewProfile,
): ProductionTicketPreview {
  const width = PROFILE_COLUMNS[profile];
  const lines: string[] = [];
  const push = (value = "") => {
    for (const wrapped of wrapLine(value, width)) lines.push(wrapped);
  };

  if (isSushiDestination(ticket.destination.printer_name)) {
    for (const group of ticket.mount_groups) {
      if (!clean(group.box_label)) {
        throw new Error(`SUSHI_MOUNT_BOX_REQUIRED:${group.group_id}`);
      }
    }
  }

  lines.push("=".repeat(width));
  lines.push(centered(ticket.destination.printer_name, width));
  lines.push("=".repeat(width));

  push(`IFOOD   ${ticket.identifiers.ifood_sequence}`);
  push(`TEKNISA ${ticket.identifiers.teknisa_sequence}`);
  push(`TATA    ${ticket.identifiers.tata_sequence}`);
  if (ticket.identifiers.order_time) push(`HORA    ${ticket.identifiers.order_time}`);

  for (const group of ticket.mount_groups) {
    lines.push("");
    if (group.box_label) push(`>>> MONTAR NA ${clean(group.box_label)} <<<`);

    for (const item of group.items) {
      push(`${item.quantity}x ${item.product_name}`);
      for (const prep of item.prep_ingredients) push(prepLine(prep));
      for (const observation of item.observations) {
        push(`!!! OBS: ${observation} !!!`);
      }
    }
  }

  if (ticket.order_observations.length) {
    lines.push("");
    push("--- OBS PEDIDO ---");
    for (const observation of ticket.order_observations) push(observation);
  }

  lines.push("");
  push(`[ ] ${ticket.final_check_label}`);

  const max = lines.reduce((value, line) => Math.max(value, line.length), 0);
  if (max > width) throw new Error(`PREVIEW_WIDTH_OVERFLOW:${max}:${width}`);

  return {
    schema: "deliveryos.production-ticket-preview.v1",
    profile,
    columns: width,
    text: lines.join("\n"),
    max_line_length: max,
    physical_effect: false,
  };
}
