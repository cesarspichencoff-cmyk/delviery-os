import type { ShadowNormalizedOrder } from "./odhenReadonly";

export interface PreviewGate {
  ready_for_preview: boolean;
  blocking_reasons: string[];
}

/**
 * Final-preview gate.
 *
 * Motor calculation may run after the source/motor gate passes, but a final
 * C3.1 preview must still stop if order-level observations have no proven
 * channel into the renderer.
 */
export function previewGate(order: ShadowNormalizedOrder): PreviewGate {
  const reasons: string[] = [];

  if (!order.ready_for_motor) reasons.push("SOURCE_NOT_READY_FOR_MOTOR");
  if (order.order_observations.length > 0) {
    reasons.push("ORDER_OBSERVATION_CHANNEL_NOT_PROVEN");
  }

  return {
    ready_for_preview: reasons.length === 0,
    blocking_reasons: reasons,
  };
}
