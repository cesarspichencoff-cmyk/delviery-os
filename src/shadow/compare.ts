import type { MotorRow, ShadowNormalizedOrder } from "./odhenReadonly";

export type ShadowDiffStatus =
  | "MATCH"
  | "EXPECTED_TRANSFORMATION"
  | "UNKNOWN"
  | "MISMATCH";

export interface ShadowDiff {
  field: string;
  status: ShadowDiffStatus;
  source: unknown;
  target: unknown;
  reason: string;
}

export interface ShadowComparisonReport {
  schema: "deliveryos.shadow.compare.v132";
  ready: boolean;
  overall: ShadowDiffStatus;
  diffs: ShadowDiff[];
}

function keyItem(nome: string, quantidade: number): string {
  return `${nome}\u0000${quantidade}`;
}

function observationText(values: string[]): string | null {
  return values.length ? values.join(" | ") : null;
}

function worstStatus(statuses: ShadowDiffStatus[]): ShadowDiffStatus {
  if (statuses.includes("MISMATCH")) return "MISMATCH";
  if (statuses.includes("UNKNOWN")) return "UNKNOWN";
  if (statuses.includes("EXPECTED_TRANSFORMATION")) return "EXPECTED_TRANSFORMATION";
  return "MATCH";
}

/**
 * Compare the normalized Odhen snapshot to the exact rows sent into the existing
 * DeliveryOS item-source seam. No packaging/kit decision is recomputed here.
 */
export function compareNormalizedToMotorRows(
  source: ShadowNormalizedOrder,
  rows: MotorRow[],
): ShadowComparisonReport {
  const diffs: ShadowDiff[] = [];

  if (!source.ready_for_motor) {
    diffs.push({
      field: "ready_for_motor",
      status: "UNKNOWN",
      source: source.blocking_reasons,
      target: null,
      reason: "Fonte ainda não passou pelo gate de completude/observação.",
    });
    return {
      schema: "deliveryos.shadow.compare.v132",
      ready: false,
      overall: "UNKNOWN",
      diffs,
    };
  }

  const pedidoId = source.ids.pedido_interno;
  const rowIds = [...new Set(rows.map((r) => r.pedido_id))];
  diffs.push({
    field: "pedido_id",
    status: pedidoId && rowIds.length === 1 && rowIds[0] === pedidoId ? "MATCH" : "MISMATCH",
    source: pedidoId,
    target: rowIds,
    reason: "NRCOMANDA deve atravessar sem substituição.",
  });

  const sourceItems = source.items
    .map((x) => keyItem(x.nome, x.quantidade))
    .sort();
  const targetItems = rows
    .map((x) => keyItem(x.item_nome, x.quantidade))
    .sort();
  diffs.push({
    field: "items.nome_quantidade",
    status: JSON.stringify(sourceItems) === JSON.stringify(targetItems) ? "MATCH" : "MISMATCH",
    source: sourceItems,
    target: targetItems,
    reason: "Nome e quantidade devem atravessar sem perda.",
  });

  const sourceObs = source.items
    .map((x) => ({
      item: keyItem(x.nome, x.quantidade),
      observacao: observationText(x.observacoes.map((o) => o.value)),
    }))
    .sort((a, b) => a.item.localeCompare(b.item));

  const targetObs = rows
    .map((x) => ({
      item: keyItem(x.item_nome, x.quantidade),
      observacao: x.observacao,
    }))
    .sort((a, b) => a.item.localeCompare(b.item));

  diffs.push({
    field: "items.observacao",
    status: JSON.stringify(sourceObs) === JSON.stringify(targetObs) ? "MATCH" : "MISMATCH",
    source: sourceObs,
    target: targetObs,
    reason: "Observação item-level provada não pode sumir nem mudar de item.",
  });

  const emissionTargets = [...new Set(rows.map((r) => r.horario))];
  diffs.push({
    field: "emissao",
    status:
      emissionTargets.length === 1 && emissionTargets[0] === source.emissao
        ? "MATCH"
        : "MISMATCH",
    source: source.emissao,
    target: emissionTargets,
    reason: "Carimbo disponível atravessa sem reinterpretação.",
  });

  if (source.order_observations.length) {
    diffs.push({
      field: "order_observations",
      status: "UNKNOWN",
      source: source.order_observations,
      target: null,
      reason:
        "O seam atual do motor é item-level. Observação de pedido permanece explícita e bloqueia render final até existir canal comprovado no C3.1.",
    });
  }

  return {
    schema: "deliveryos.shadow.compare.v132",
    ready: true,
    overall: worstStatus(diffs.map((x) => x.status)),
    diffs,
  };
}
