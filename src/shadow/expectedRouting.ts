export interface RoutingItemInput {
  item_index: number;
  codigo: string | null;
  nome: string;
  quantidade: number;
}

export interface RoutingOrderInput {
  ids: { pedido_interno: string | null };
  items: RoutingItemInput[];
}

export interface ProductRoutingTable {
  schema: "deliveryos.odhen.product-routing.compact.v1";
  products: Record<string, string[]>;
}

export interface RuntimePrinterEntry {
  printer_code: string;
  printer_name: string;
  printer_ip: string | null;
  printer_port: string | null;
  peripherals_server: string | null;
}

export interface RuntimePrinterMap {
  schema: "deliveryos.runtime-printer-map.v1";
  mappings: RuntimePrinterEntry[];
}

export interface ExpectedRoutingTarget {
  printer_code: string;
  printer_name: string;
  printer_ip: string;
  printer_port: string | null;
  peripherals_server: string | null;
}

export interface ExpectedRoutingItem {
  item_index: number;
  product_code: string | null;
  product_name: string;
  quantity: number;
  targets: ExpectedRoutingTarget[];
}

export interface ExpectedRoutingProjection {
  schema: "deliveryos.shadow.expected-routing.v1";
  order_id: string | null;
  ready: boolean;
  blocking_reasons: string[];
  items: ExpectedRoutingItem[];
  order_targets: ExpectedRoutingTarget[];
  semantics: "EXPECTED_CONFIGURED_ROUTE_NOT_PHYSICAL_PRINT_PROOF";
  effects: {
    print: false;
    database_write: false;
    odhen_change: false;
    fiscal_action: false;
  };
}

export function projectExpectedRouting(
  order: RoutingOrderInput,
  routing: ProductRoutingTable,
  printerMap: RuntimePrinterMap,
): ExpectedRoutingProjection {
  const blocking = new Set<string>();

  if (!Array.isArray(order.items) || order.items.length === 0) {
    blocking.add("NO_ITEMS");
  }

  const printers = new Map(printerMap.mappings.map((x) => [x.printer_code, x]));
  const items: ExpectedRoutingItem[] = [];
  const orderTargets = new Map<string, ExpectedRoutingTarget>();
  const seenItemIndexes = new Set<number>();

  for (const item of order.items) {
    const targets: ExpectedRoutingTarget[] = [];

    if (seenItemIndexes.has(item.item_index)) {
      blocking.add(`DUPLICATE_ITEM_INDEX_${item.item_index}`);
    } else {
      seenItemIndexes.add(item.item_index);
    }

    if (!Number.isFinite(item.quantidade) || item.quantidade <= 0) {
      blocking.add(`INVALID_ITEM_QTY_${item.item_index}`);
    }

    if (!item.codigo) {
      blocking.add(`MISSING_PRODUCT_CODE_${item.item_index}`);
    } else {
      const printerCodes = routing.products[item.codigo];

      if (!printerCodes?.length) {
        blocking.add(`PRODUCT_ROUTE_NOT_FOUND_${item.codigo}`);
      } else {
        for (const printerCode of printerCodes) {
          const printer = printers.get(printerCode);

          if (!printer) {
            blocking.add(`PRINTER_NOT_FOUND_${printerCode}`);
            continue;
          }
          if (!printer.printer_ip) {
            blocking.add(`PRINTER_IP_MISSING_${printerCode}`);
            continue;
          }

          const target: ExpectedRoutingTarget = {
            printer_code: printer.printer_code,
            printer_name: printer.printer_name,
            printer_ip: printer.printer_ip,
            printer_port: printer.printer_port,
            peripherals_server: printer.peripherals_server,
          };

          targets.push(target);
          orderTargets.set(printer.printer_code, target);
        }
      }
    }

    items.push({
      item_index: item.item_index,
      product_code: item.codigo,
      product_name: item.nome,
      quantity: item.quantidade,
      targets,
    });
  }

  return {
    schema: "deliveryos.shadow.expected-routing.v1",
    order_id: order.ids.pedido_interno,
    ready: blocking.size === 0,
    blocking_reasons: [...blocking].sort(),
    items,
    order_targets: [...orderTargets.values()],
    semantics: "EXPECTED_CONFIGURED_ROUTE_NOT_PHYSICAL_PRINT_PROOF",
    effects: {
      print: false,
      database_write: false,
      odhen_change: false,
      fiscal_action: false,
    },
  };
}
