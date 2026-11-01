/**
 * Consumidor assíncrono dos fatos DA ENTREGA: `delivery_ready` e
 * `delivery_removed`.
 *
 * Ele não projeta viagem e não guarda estado. As leituras do pronto
 * (`leitura/prontos-de-entregas.ts`) releem `platform.event_log` sob demanda,
 * com a mesma disciplina das outras portas de leitura. Este consumidor existe
 * para que a mensagem que a ingestão grava na outbox tenha dono: sem ele, o
 * fato iria para dead-letter depois de gastar as tentativas.
 *
 * O que ele recusa: mensagem de outro tipo roteada para cá. Isso é incoerência
 * de roteamento, não dado ruim — falhar faz o motivo aparecer no `last_error`.
 */
import type { OutboxMessage } from "../contracts/messaging";
import type { OutboxHandler } from "./async-worker";

export const HANDLER_TRAJETORIA_PRONTO_VERSION = "handler-trajetoria-pronto@1.0.0";

/** Os tipos que este consumidor reconhece. Nenhum está na Operação Viva. */
export const TIPOS_DA_TRAJETORIA_DO_PRONTO: readonly string[] = ["delivery_ready", "delivery_removed"];

export function montarHandlersDaTrajetoriaDoPronto(): Record<string, OutboxHandler> {
  const handlers: Record<string, OutboxHandler> = {};
  for (const tipo of TIPOS_DA_TRAJETORIA_DO_PRONTO) {
    handlers[tipo] = (msg: OutboxMessage) => {
      const p = (msg.payload ?? {}) as { event_id?: unknown; event_type?: unknown };
      if (msg.kind !== tipo || p.event_type !== tipo || typeof p.event_id !== "string" || !p.event_id) {
        throw new Error(`mensagem não aplicável ao consumidor de ${tipo}: ${String(msg.kind)}`);
      }
    };
  }
  return handlers;
}
