/* ============================================================================
 * IfoodPollingReceiver — busca UM lote de eventos pendentes via o adapter
 * (`ADAPTER_RESPONSIBILITIES.pollEvents`) e alimenta a MESMA inbox que o
 * webhook alimenta. Nunca decide retry/agendamento sozinho — um `pollOnce()`
 * é um ciclo, quem agenda repetição fica fora deste módulo (mesmo desenho
 * de `observer.js#runCycle` do conference-brain: ciclo puro, agendamento é
 * responsabilidade de outra camada).
 * ==========================================================================*/
"use strict";

const { mapExternalEventPayload } = require("./payload-mapper");

function createPollingReceiver(deps) {
  const inbox = deps.inbox;
  const adapter = deps.adapter;

  /**
   * Um ciclo de polling. Nunca lança — falha do adapter vira
   * `{ok:false, reason}`, nunca exceção não tratada.
   */
  async function pollOnce(cursor) {
    let result;
    try {
      result = await adapter.pollEvents(cursor);
    } catch (e) {
      return { ok: false, reason: "excecao_no_adapter:" + ((e && e.name) || "Error"), received: [] };
    }
    if (!result || result.ok !== true) {
      return { ok: false, reason: (result && result.reason) || "polling_falhou", received: [] };
    }
    const events = Array.isArray(result.events) ? result.events : [];
    const received = events.map((raw) => inbox.receive(mapExternalEventPayload(raw, "polling")));
    return {
      ok: true, received,
      next_cursor: result.nextCursor || null,
      partial: result.partial === true
    };
  }

  return { pollOnce };
}

module.exports = { createPollingReceiver };
