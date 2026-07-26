/**
 * Timeline operacional da viagem.
 *
 * Traduz o event log do domínio para uma linha do tempo que um operador lê
 * sem precisar saber o vocabulário do contrato.
 *
 * Três compromissos que a timeline carrega:
 *  - **chegada nunca vira entrega.** Detectada, relatada e confirmada
 *    aparecem como três linhas distintas, com autor distinto;
 *  - **coordenada não entra.** A timeline diz o que aconteceu e quando, não
 *    onde. Onde é a rota, e a rota exige papel autorizado;
 *  - **sombra é rotulada como sombra.** O retorno detectado em modo shadow
 *    aparece como observação, nunca como fechamento.
 */

import type { DomainEvent } from "../foundation/types";

export const TIMELINE_AUTHORS = ["sistema", "motoboy", "operacao", "desconhecido"] as const;
export type TimelineAuthor = (typeof TIMELINE_AUTHORS)[number];

export interface TimelineEntry {
  at: string;
  event_type: string;
  /** Frase curta em português, para o operador. */
  label: string;
  author: TimelineAuthor;
  object_id: string;
  /** true quando é apenas observação, sem efeito operacional. */
  shadow: boolean;
  /** Marca a distinção que mais confunde: chegada não é entrega. */
  confirms_delivery: boolean;
}

/**
 * Rótulos. Escritos como a operação fala — "Cheguei", não
 * "arrival_reported" — e deixando explícito quem observou.
 */
const LABELS: Record<string, { label: string; author: TimelineAuthor }> = {
  trip_created: { label: "Viagem montada", author: "operacao" },
  delivery_added: { label: "Pedido adicionado à viagem", author: "operacao" },
  delivery_removed: { label: "Pedido retirado da viagem", author: "operacao" },
  trip_started: { label: "Saiu para entrega", author: "motoboy" },
  arrival_detected: { label: "Chegada detectada pelo GPS", author: "sistema" },
  arrival_reported: { label: 'Motoboy avisou "Cheguei"', author: "motoboy" },
  delivery_confirmed: { label: "Entrega confirmada", author: "motoboy" },
  delivery_unconfirmed: { label: "Entrega sem confirmação", author: "sistema" },
  customer_not_found: { label: "Cliente não encontrado", author: "motoboy" },
  return_requested: { label: "Retorno solicitado", author: "operacao" },
  trip_return_started: { label: "Voltando para a loja", author: "motoboy" },
  return_detected: { label: "Retorno detectado pelo GPS", author: "sistema" },
  trip_closed_automatic: { label: "Viagem encerrada automaticamente", author: "sistema" },
  trip_closed_manual: { label: "Viagem encerrada pela operação", author: "operacao" },
  delivery_cancelled: { label: "Pedido cancelado", author: "operacao" },
  delivery_departed: { label: "Parada iniciada", author: "motoboy" },
  occurrence_opened: { label: "Ocorrência aberta", author: "operacao" },
  occurrence_updated: { label: "Ocorrência atualizada", author: "operacao" },
  occurrence_closed: { label: "Ocorrência resolvida", author: "operacao" },
};

/** Só `delivery_confirmed` confirma entrega. Lista fechada, testada. */
const CONFIRMING_EVENTS = new Set(["delivery_confirmed"]);

/**
 * Chaves de payload que jamais podem chegar à timeline. A timeline vai para
 * a tela do console e para o log de leitura; coordenada não passa por aqui.
 */
const FORBIDDEN_PAYLOAD_KEYS = [
  "latitude",
  "longitude",
  "coords",
  "coordinates",
  "lat",
  "lon",
  "endereco",
  "address",
];

export function buildTripTimeline(events: readonly DomainEvent[]): TimelineEntry[] {
  return events
    .slice()
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))
    .map((e) => {
      const known = LABELS[e.event_type];
      const payload = (e.payload ?? {}) as Record<string, unknown>;
      return {
        at: e.occurred_at,
        event_type: e.event_type,
        label: known?.label ?? e.event_type,
        author: known?.author ?? "desconhecido",
        object_id: e.object_id,
        shadow: payload.shadow === true || payload.mode === "shadow",
        confirms_delivery: CONFIRMING_EVENTS.has(e.event_type),
      };
    });
}

/** Confere que nenhuma entrada leva dado proibido. Usado em teste e em runtime. */
export function timelineIsClean(entries: readonly TimelineEntry[]): boolean {
  const blob = JSON.stringify(entries).toLowerCase();
  if (FORBIDDEN_PAYLOAD_KEYS.some((k) => blob.includes(`"${k}"`))) return false;
  // Par de coordenadas com precisão de GPS.
  return !/-?\d{1,3}\.\d{4,}/.test(blob);
}

/**
 * Resumo da chegada para uma parada — o que o operador precisa saber num
 * relance sem abrir a timeline inteira.
 */
export interface ArrivalSummary {
  delivery_id: string;
  detected_at?: string;
  reported_at?: string;
  confirmed_at?: string;
  /** Frase honesta sobre o estado da chegada. */
  label: string;
}

export function summarizeArrival(
  delivery_id: string,
  entries: readonly TimelineEntry[],
): ArrivalSummary {
  const forDelivery = entries.filter((e) => e.object_id === delivery_id);
  const detected = forDelivery.find((e) => e.event_type === "arrival_detected")?.at;
  const reported = forDelivery.find((e) => e.event_type === "arrival_reported")?.at;
  const confirmed = forDelivery.find((e) => e.event_type === "delivery_confirmed")?.at;

  let label: string;
  if (confirmed) label = "Entrega confirmada";
  else if (detected && reported) label = "Chegou (GPS e motoboy) — sem confirmação ainda";
  else if (reported) label = "Motoboy avisou que chegou — sem confirmação ainda";
  else if (detected) label = "GPS indica chegada — sem confirmação ainda";
  else label = "A caminho";

  return {
    delivery_id,
    detected_at: detected,
    reported_at: reported,
    confirmed_at: confirmed,
    label,
  };
}
