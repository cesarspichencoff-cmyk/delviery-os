import { createHash } from "node:crypto";
import type { OdhenObservationRowRaw, OdhenOrderRaw } from "./odhenReadonly";

export type PrintLogProfileProof = "SYNTHETIC_ONLY" | "REAL_SAMPLE_PROVEN";

export interface PrintLogRegexProfile {
  schema: "deliveryos.shadow.print-log-profile.v1";
  id: string;
  proof: PrintLogProfileProof;
  full_block_framing_proven: boolean;
  order_id: RegExp;
  external_order_id?: RegExp;
  emission?: RegExp;
  item_line: RegExp;
  item_observation_line?: RegExp;
  order_observation_line?: RegExp;
}

export interface PassivePrintItem {
  item_index: number;
  nome: string;
  quantidade: number;
  observacoes: string[];
}

export interface PassivePrintProjection {
  schema: "deliveryos.shadow.passive-print-projection.v1";
  source: "odhen_perifericos_imp_log";
  profile_id: string;
  profile_proof: PrintLogProfileProof;
  ready_for_live_shadow: boolean;
  blocking_reasons: string[];
  ids: {
    pedido_interno: string | null;
    pedido_externo: string | null;
    venda: null;
  };
  emissao: string | null;
  items: PassivePrintItem[];
  order_observations: string[];
  source_contract: {
    item_observation_provenance: "MERGED_PRINT_TEXT";
    order_observation_provenance: "PRINT_ORDER_OBS";
    nr_venda_rest: "ABSENT_FROM_SOURCE";
    tx_prod_com_ven: "ABSENT_FROM_DELIVERY_REPORT_SOURCE";
  };
  privacy: {
    projection_only: true;
    raw_text_retained: false;
    pii_fields_copied: false;
    operational_fingerprint: string;
    policy: "ALLOWLIST_OPERATIONAL_EXTRACTION_ONLY";
  };
}

function capture(pattern: RegExp | undefined, text: string, group: string): string | null {
  if (!pattern) return null;
  pattern.lastIndex = 0;
  const match = pattern.exec(text);
  if (!match) return null;
  const value = match.groups?.[group];
  return value?.trim() || null;
}

function quantity(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function operationalFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

/**
 * Parse one already-framed print block using an explicit profile.
 *
 * Privacy rule: this function is projection-only. It never returns the raw block
 * or unrecognized lines, so customer/address/payment text cannot leak through the
 * returned object by accident.
 *
 * Live rule: a synthetic profile can exercise the parser but can never mark the
 * result ready_for_live_shadow. Live readiness requires a profile proven from a
 * bounded real sample plus proven full-block framing.
 */
export function projectPassivePrintBlock(
  rawBlock: string,
  profile: PrintLogRegexProfile,
): PassivePrintProjection {
  const blocking = new Set<string>();
  const pedidoInterno = capture(profile.order_id, rawBlock, "pedido");
  const pedidoExterno = capture(profile.external_order_id, rawBlock, "externo");
  const emissao = capture(profile.emission, rawBlock, "emissao");

  if (!pedidoInterno) blocking.add("MISSING_PRINTED_ORDER_ID");
  if (profile.proof !== "REAL_SAMPLE_PROVEN") blocking.add("PRINT_PROFILE_NOT_REAL_SAMPLE_PROVEN");
  if (!profile.full_block_framing_proven) blocking.add("PRINT_BLOCK_FRAMING_NOT_PROVEN");

  const items: PassivePrintItem[] = [];
  const orderObservations: string[] = [];
  let currentItem: PassivePrintItem | null = null;

  for (const rawLine of rawBlock.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    profile.item_line.lastIndex = 0;
    const itemMatch = profile.item_line.exec(line);
    if (itemMatch?.groups) {
      const nome = itemMatch.groups.nome?.trim();
      const qty = quantity(itemMatch.groups.quantidade);
      if (!nome || qty === null) {
        blocking.add("INVALID_PRINTED_ITEM_LINE");
        currentItem = null;
        continue;
      }
      currentItem = {
        item_index: items.length,
        nome,
        quantidade: qty,
        observacoes: [],
      };
      items.push(currentItem);
      continue;
    }

    if (profile.item_observation_line) {
      profile.item_observation_line.lastIndex = 0;
      const obsMatch = profile.item_observation_line.exec(line);
      const obs = obsMatch?.groups?.observacao?.trim();
      if (obs) {
        if (!currentItem) {
          blocking.add("PRINT_ITEM_OBSERVATION_WITHOUT_ITEM");
        } else {
          currentItem.observacoes.push(obs);
        }
        continue;
      }
    }

    if (profile.order_observation_line) {
      profile.order_observation_line.lastIndex = 0;
      const orderObsMatch = profile.order_observation_line.exec(line);
      const orderObs = orderObsMatch?.groups?.observacao?.trim();
      if (orderObs) {
        orderObservations.push(orderObs);
        continue;
      }
    }

    // Deliberately ignore every unrecognized line. This is the privacy boundary:
    // customer, phone, address, payment and totals are never copied by default.
  }

  if (!items.length) blocking.add("NO_PRINTED_ITEMS");

  const operationalBasis = {
    ids: {
      pedido_interno: pedidoInterno,
      pedido_externo: pedidoExterno,
      venda: null,
    },
    emissao,
    items,
    order_observations: orderObservations,
  };

  return {
    schema: "deliveryos.shadow.passive-print-projection.v1",
    source: "odhen_perifericos_imp_log",
    profile_id: profile.id,
    profile_proof: profile.proof,
    ready_for_live_shadow: blocking.size === 0,
    blocking_reasons: [...blocking].sort(),
    ids: {
      pedido_interno: pedidoInterno,
      pedido_externo: pedidoExterno,
      venda: null,
    },
    emissao,
    items,
    order_observations: orderObservations,
    source_contract: {
      item_observation_provenance: "MERGED_PRINT_TEXT",
      order_observation_provenance: "PRINT_ORDER_OBS",
      nr_venda_rest: "ABSENT_FROM_SOURCE",
      tx_prod_com_ven: "ABSENT_FROM_DELIVERY_REPORT_SOURCE",
    },
    privacy: {
      projection_only: true,
      raw_text_retained: false,
      pii_fields_copied: false,
      operational_fingerprint: operationalFingerprint(operationalBasis),
      policy: "ALLOWLIST_OPERATIONAL_EXTRACTION_ONLY",
    },
  };
}

export function passivePrintProjectionToOdhenRaw(
  projection: PassivePrintProjection,
): OdhenOrderRaw {
  const observationRows: OdhenObservationRowRaw[] = [];

  for (const item of projection.items) {
    for (const value of item.observacoes) {
      observationRows.push({
        source_field: "PRINT_ITEM_OBS_MERGED",
        value,
        item_index: item.item_index,
        scope_hint: "item",
        join_proven: true,
      });
    }
  }

  for (const value of projection.order_observations) {
    observationRows.push({
      source_field: "PRINT_ORDER_OBS",
      value,
      scope_hint: "order",
      join_proven: true,
    });
  }

  return {
    NRCOMANDA: projection.ids.pedido_interno,
    NRCOMANDAEXT: projection.ids.pedido_externo,
    NRVENDAREST: null,
    emissao: projection.emissao,
    products: projection.items.map((item) => ({
      CDPRODUTO: null,
      NMPRODUTO: item.nome,
      QTPRODCOMVEN: item.quantidade,
    })),
    observation_scan_complete:
      projection.ready_for_live_shadow &&
      projection.profile_proof === "REAL_SAMPLE_PROVEN",
    observation_rows: observationRows,
  };
}
