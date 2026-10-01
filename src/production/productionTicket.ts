export type ProductionService = "almoco" | "jantar";

export type ProductionSquare =
  | "caixa"
  | "cozinha"
  | "enrolados"
  | "combinados"
  | "enrolados_quentes"
  | "duplas"
  | "sobremesa"
  | "bar_bebidas"
  | "montagem_outros";

export type ProductionTarget =
  | "CAIXA"
  | "COZINHA"
  | "BALCAO_SUSHI_1"
  | "BALCAO_SUSHI_2"
  | "DELIVERY_SUSHI_1"
  | "DELIVERY_SUSHI_2";

export interface ProductionIdentifiers {
  tata: string;
  teknisa: string | null;
  ifood: string | null;
}

export interface ProductionItem {
  nome: string;
  quantidade: number;
  observacoes?: string[];
}

export interface ProductionMountGroup {
  box_label: string;
  items: ProductionItem[];
}

export interface ProductionTicketInput {
  service: ProductionService;
  square: ProductionSquare;
  identifiers: ProductionIdentifiers;
  horario?: string | null;
  mount_groups: ProductionMountGroup[];
  order_observations?: string[];
}

export interface ProductionRouteResult {
  status: "PROVEN" | "UNKNOWN";
  target: ProductionTarget | null;
  reason: string | null;
}

export interface ProductionTicketPreview {
  schema: "deliveryos.production-ticket-preview.v1";
  ready: boolean;
  blocking_reasons: string[];
  route: ProductionRouteResult;
  content: string;
  privacy: {
    customer_fields_supported: false;
    address_fields_supported: false;
    payment_fields_supported: false;
    free_text_observations_sensitive: true;
  };
  effects: {
    print: false;
    odhen_write: false;
    service_install: false;
    cutover: false;
  };
}

/**
 * LEGACY V1 NOTE
 *
 * The old service/square -> printer table is intentionally no longer route
 * authority. Current truth is product-code routing from Teknisa Retail
 * (CDPRODUTO -> production printer(s)). Keeping a static table here would allow
 * a regression back to the pre-2026-09-30 model.
 */
const TARGET_LABELS: Record<ProductionTarget, string> = {
  CAIXA: "CAIXA",
  COZINHA: "COZINHA",
  BALCAO_SUSHI_1: "BALCAO SUSHI 1",
  BALCAO_SUSHI_2: "BALCAO SUSHI 2",
  DELIVERY_SUSHI_1: "DELIVERY SUSHI 1",
  DELIVERY_SUSHI_2: "DELIVERY SUSHI 2",
};

function clean(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function positiveQuantity(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function requiresBoxLabel(square: ProductionSquare): boolean {
  return (
    square === "enrolados" ||
    square === "combinados" ||
    square === "enrolados_quentes" ||
    square === "duplas"
  );
}

export function routeProductionSquare(
  square: ProductionSquare,
  service: ProductionService,
): ProductionRouteResult {
  return {
    status: "UNKNOWN",
    target: null,
    reason: `LEGACY_STATIC_ROUTE_SUPERSEDED_BY_PRODUCT_ROUTING_CONFIG:${service}:${square}`,
  };
}

function renderIdentifierLine(label: string, value: string | null): string {
  return `${label} ${clean(value) || "-"}`;
}

function renderItem(item: ProductionItem): string[] {
  const lines = [`${item.quantidade}x ${clean(item.nome).toUpperCase()}`];
  for (const obs of item.observacoes ?? []) {
    const value = clean(obs);
    if (value) lines.push(`!!! OBS: ${value.toUpperCase()} !!!`);
  }
  return lines;
}

export function buildProductionTicketPreview(
  input: ProductionTicketInput,
): ProductionTicketPreview {
  const blocking = new Set<string>();
  const route = routeProductionSquare(input.square, input.service);

  if (route.status !== "PROVEN" || !route.target) blocking.add("ROUTE_NOT_PROVEN");
  if (!clean(input.identifiers.tata)) blocking.add("MISSING_TATA_SEQUENCE");
  if (!clean(input.identifiers.teknisa)) blocking.add("MISSING_TEKNISA_SEQUENCE");
  if (!Array.isArray(input.mount_groups) || input.mount_groups.length === 0) {
    blocking.add("NO_MOUNT_GROUPS");
  }

  input.mount_groups.forEach((group, groupIndex) => {
    if (requiresBoxLabel(input.square) && !clean(group.box_label)) {
      blocking.add(`MISSING_BOX_LABEL_${groupIndex}`);
    }
    if (!Array.isArray(group.items) || group.items.length === 0) {
      blocking.add(`NO_ITEMS_IN_GROUP_${groupIndex}`);
      return;
    }
    group.items.forEach((item, itemIndex) => {
      if (!clean(item.nome)) blocking.add(`MISSING_ITEM_NAME_${groupIndex}_${itemIndex}`);
      if (!positiveQuantity(item.quantidade)) {
        blocking.add(`INVALID_ITEM_QTY_${groupIndex}_${itemIndex}`);
      }
    });
  });

  const lines: string[] = [];
  const label = route.target ? TARGET_LABELS[route.target] : "ROTA NAO PROVADA";

  lines.push("================================");
  lines.push(label);
  lines.push("================================");
  lines.push(
    `TATA ${clean(input.identifiers.tata) || "-"}${clean(input.horario) ? `    ${clean(input.horario)}` : ""}`,
  );
  lines.push(renderIdentifierLine("TEKNISA", input.identifiers.teknisa));
  lines.push(renderIdentifierLine("IFOOD", input.identifiers.ifood));
  lines.push("");

  for (const group of input.mount_groups) {
    if (clean(group.box_label)) {
      lines.push(`>>> MONTAR NA ${clean(group.box_label).toUpperCase()} <<<`);
      lines.push("");
    }
    for (const item of group.items) {
      lines.push(...renderItem(item));
      lines.push("");
    }
    lines.push("--------------------------------");
  }

  const orderObs = (input.order_observations ?? []).map(clean).filter(Boolean);
  if (orderObs.length) {
    lines.push("OBS PEDIDO");
    for (const obs of orderObs) lines.push(`!!! ${obs.toUpperCase()} !!!`);
    lines.push("--------------------------------");
  }

  lines.push(input.square === "cozinha" ? "[ ] PRODUZIDO" : "[ ] FINALIZADO");

  return {
    schema: "deliveryos.production-ticket-preview.v1",
    ready: blocking.size === 0,
    blocking_reasons: [...blocking].sort(),
    route,
    content: lines.join("\n"),
    privacy: {
      customer_fields_supported: false,
      address_fields_supported: false,
      payment_fields_supported: false,
      free_text_observations_sensitive: true,
    },
    effects: {
      print: false,
      odhen_write: false,
      service_install: false,
      cutover: false,
    },
  };
}

export interface KitchenNeedSummaryInput {
  mode: "SOLICITADO_DESDE_CORTE" | "PENDENTE_PROVADO";
  since_label?: string | null;
  hot: number;
  ebiten: number;
  shiso: number;
}

export function renderKitchenNeedSummary(input: KitchenNeedSummaryInput): string {
  for (const [name, value] of Object.entries({
    HOT: input.hot,
    EBITEN: input.ebiten,
    SHISO: input.shiso,
  })) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`INVALID_KITCHEN_NEED:${name}`);
    }
  }

  const title =
    input.mode === "PENDENTE_PROVADO"
      ? "PENDENTE PROVADO"
      : `SOLICITADO DESDE ${clean(input.since_label) || "-"}`;

  return [
    "========================",
    title,
    "========================",
    `HOT     ${input.hot}`,
    `EBITEN  ${input.ebiten}`,
    `SHISO   ${input.shiso}`,
  ].join("\n");
}
