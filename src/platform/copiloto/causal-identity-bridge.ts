/**
 * Q-003 — ponte causal explícita Entregas -> Shadow -> Foco.
 *
 * Consome somente o contrato público de Entregas. Não lê domínio interno,
 * não interpreta texto e não aproxima identificadores.
 *
 * Uma âncora de pedido só nasce quando:
 * - source_mode está explícito;
 * - delivery_added trouxe trip_id + delivery_id + order_ref;
 * - a evidência da recomendação pertence a UMA única Trip;
 * - essa Trip tem UM único order_ref ativo e sem conflito;
 * - source_mode do vínculo, projeção e recomendação é idêntico.
 *
 * Qualquer ambiguidade = sem âncora = continua shadow.
 */

import type {
  EntregasPublicEvent,
  EntregasSourceMode,
} from "../../entregas/contracts/events/types";
import type { Projecao } from "../projections/operacao-viva";
import type { AncoraCausalShadow } from "./attention-authority";
import type { Recomendacao } from "./shadow";

export interface VinculoCausalDelivery {
  unit_id: string;
  source_mode: EntregasSourceMode;
  delivery_id: string;
  trip_id: string;
  order_ref: string;
  active: boolean;
  last_event_id: string;
}

export type CodigoProblemaIdentidade =
  | "source_mode_ausente"
  | "delivery_id_ausente"
  | "trip_id_ausente"
  | "order_ref_ausente"
  | "delivery_relinked_conflict"
  | "remocao_sem_vinculo"
  | "order_ref_duplicado_ativo";

export interface ProblemaIdentidadeCausal {
  event_id: string;
  codigo: CodigoProblemaIdentidade;
  delivery_id?: string;
  trip_id?: string;
  order_ref?: string;
}

export interface IndiceIdentidadeCausal {
  vinculos: readonly VinculoCausalDelivery[];
  problemas: readonly ProblemaIdentidadeCausal[];
}

const MODOS: readonly EntregasSourceMode[] = ["real", "simulated", "control"];

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function modo(v: unknown): EntregasSourceMode | null {
  return MODOS.includes(v as EntregasSourceMode) ? (v as EntregasSourceMode) : null;
}

export function construirIndiceIdentidadeCausal(
  eventos: readonly EntregasPublicEvent[],
): IndiceIdentidadeCausal {
  const porDelivery = new Map<string, VinculoCausalDelivery>();
  const problemas: ProblemaIdentidadeCausal[] = [];
  const vistos = new Set<string>();
  const deliveriesEmConflito = new Set<string>();

  const ordenados = [...eventos].sort((a, b) => {
    const ta = Date.parse(a.recorded_at) - Date.parse(b.recorded_at);
    if (ta !== 0) return ta;
    const tb = Date.parse(a.occurred_at) - Date.parse(b.occurred_at);
    if (tb !== 0) return tb;
    return a.event_id.localeCompare(b.event_id);
  });

  for (const e of ordenados) {
    if (vistos.has(e.idempotency_key)) continue;
    vistos.add(e.idempotency_key);
    if (e.event_type !== "delivery_added" && e.event_type !== "delivery_removed") continue;

    const sourceMode = modo(e.source_mode);
    if (!sourceMode) {
      problemas.push({ event_id: e.event_id, codigo: "source_mode_ausente" });
      continue;
    }

    const deliveryId = texto(e.delivery_id);
    if (!deliveryId) {
      problemas.push({ event_id: e.event_id, codigo: "delivery_id_ausente" });
      continue;
    }

    const tripId = texto(e.trip_id);
    if (!tripId) {
      problemas.push({
        event_id: e.event_id,
        codigo: "trip_id_ausente",
        delivery_id: deliveryId,
      });
      continue;
    }

    if (e.event_type === "delivery_added") {
      const orderRef = texto(e.payload.order_ref);
      if (!orderRef) {
        problemas.push({
          event_id: e.event_id,
          codigo: "order_ref_ausente",
          delivery_id: deliveryId,
          trip_id: tripId,
        });
        continue;
      }

      const atual = porDelivery.get(deliveryId);
      if (
        atual &&
        atual.active &&
        (
          atual.unit_id !== e.unit_id ||
          atual.source_mode !== sourceMode ||
          atual.trip_id !== tripId ||
          atual.order_ref !== orderRef
        )
      ) {
        deliveriesEmConflito.add(deliveryId);
        problemas.push({
          event_id: e.event_id,
          codigo: "delivery_relinked_conflict",
          delivery_id: deliveryId,
          trip_id: tripId,
          order_ref: orderRef,
        });
        continue;
      }

      porDelivery.set(deliveryId, {
        unit_id: e.unit_id,
        source_mode: sourceMode,
        delivery_id: deliveryId,
        trip_id: tripId,
        order_ref: orderRef,
        active: true,
        last_event_id: e.event_id,
      });
      continue;
    }

    const atual = porDelivery.get(deliveryId);
    if (
      !atual ||
      atual.unit_id !== e.unit_id ||
      atual.source_mode !== sourceMode ||
      atual.trip_id !== tripId
    ) {
      problemas.push({
        event_id: e.event_id,
        codigo: "remocao_sem_vinculo",
        delivery_id: deliveryId,
        trip_id: tripId,
      });
      continue;
    }

    porDelivery.set(deliveryId, {
      ...atual,
      active: false,
      last_event_id: e.event_id,
    });
  }

  const ativos = [...porDelivery.values()].filter(
    (v) => v.active && !deliveriesEmConflito.has(v.delivery_id),
  );
  const porOrder = new Map<string, VinculoCausalDelivery[]>();

  for (const v of ativos) {
    const chave = [v.unit_id, v.source_mode, v.order_ref].join("|");
    porOrder.set(chave, [...(porOrder.get(chave) ?? []), v]);
  }

  for (const grupo of porOrder.values()) {
    if (grupo.length <= 1) continue;
    for (const v of grupo) {
      deliveriesEmConflito.add(v.delivery_id);
      problemas.push({
        event_id: v.last_event_id,
        codigo: "order_ref_duplicado_ativo",
        delivery_id: v.delivery_id,
        trip_id: v.trip_id,
        order_ref: v.order_ref,
      });
    }
  }

  return {
    vinculos: [...porDelivery.values()]
      .filter((v) => !deliveriesEmConflito.has(v.delivery_id))
      .sort((a, b) => a.delivery_id.localeCompare(b.delivery_id)),
    problemas,
  };
}

export function orderRefsAtivosDaTrip(
  indice: IndiceIdentidadeCausal,
  escopo: {
    unit_id: string;
    source_mode: EntregasSourceMode;
    trip_id: string;
  },
): string[] {
  return [
    ...new Set(
      indice.vinculos
        .filter(
          (v) =>
            v.active &&
            v.unit_id === escopo.unit_id &&
            v.source_mode === escopo.source_mode &&
            v.trip_id === escopo.trip_id,
        )
        .map((v) => v.order_ref),
    ),
  ].sort();
}

export type MotivoSemAncoraCausal =
  | "modo_divergente"
  | "evidencia_sem_viagem"
  | "evidencia_multi_viagem"
  | "viagem_sem_order_ref_univoco"
  | "viagem_multi_pedido";

export type ResultadoAncoraCausal =
  | {
      ok: true;
      ancora: AncoraCausalShadow;
      trip_id: string;
      order_ref: string;
    }
  | {
      ok: false;
      motivo: MotivoSemAncoraCausal;
      trip_ids: readonly string[];
    };

export function resolverAncoraCausalDaRecomendacao(
  recomendacao: Recomendacao,
  projecao: Projecao,
  indice: IndiceIdentidadeCausal,
): ResultadoAncoraCausal {
  if (recomendacao.source_mode !== projecao.source_mode) {
    return { ok: false, motivo: "modo_divergente", trip_ids: [] };
  }

  const evidencias = new Set(recomendacao.input_event_ids);
  const tripIds = projecao.viagens
    .filter((v) => v.eventos.some((id) => evidencias.has(id)))
    .map((v) => v.trip_id);

  const unicos = [...new Set(tripIds)].sort();
  if (unicos.length === 0) {
    return { ok: false, motivo: "evidencia_sem_viagem", trip_ids: [] };
  }
  if (unicos.length > 1) {
    return { ok: false, motivo: "evidencia_multi_viagem", trip_ids: unicos };
  }

  const tripId = unicos[0];
  const refs = orderRefsAtivosDaTrip(indice, {
    unit_id: projecao.unit_id,
    source_mode: projecao.source_mode,
    trip_id: tripId,
  });

  if (refs.length === 0) {
    return {
      ok: false,
      motivo: "viagem_sem_order_ref_univoco",
      trip_ids: [tripId],
    };
  }
  if (refs.length > 1) {
    return {
      ok: false,
      motivo: "viagem_multi_pedido",
      trip_ids: [tripId],
    };
  }

  const orderRef = refs[0];
  return {
    ok: true,
    ancora: { kind: "pedido", id: orderRef },
    trip_id: tripId,
    order_ref: orderRef,
  };
}
