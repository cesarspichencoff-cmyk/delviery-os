/* ============================================================================
 * DeliveryOS · src/live · DEDUPLICAÇÃO
 * ----------------------------------------------------------------------------
 * Dois níveis, idempotentes por construção (replay-safe):
 *  1. event_id repetido      => mesma OBSERVAÇÃO relida (replay) — ignorada.
 *  2. idempotency_key vista  => mesmo FATO reobservado — não cria fato novo;
 *     só o carimbo de última observação avança (captured_at mais recente).
 *
 * Nome de cliente NUNCA participa de chave (Addendum §7).
 * ==========================================================================*/
"use strict";

function criarRegistroDedup() {
  const eventIds = new Set();
  const fatos = new Map(); // idempotency_key -> { primeira_captura, ultima_captura, observacoes }

  return {
    /**
     * Registra um evento válido.
     * @returns {{tipo:"novo_fato"|"observacao_repetida"|"evento_duplicado", fato?:object}}
     */
    registrar(ev) {
      if (eventIds.has(ev.event_id)) {
        return { tipo: "evento_duplicado" };
      }
      eventIds.add(ev.event_id);

      const existente = fatos.get(ev.idempotency_key);
      if (existente) {
        existente.observacoes += 1;
        if (ev.captured_at > existente.ultima_captura) {
          existente.ultima_captura = ev.captured_at;
        }
        return { tipo: "observacao_repetida", fato: existente };
      }

      const fato = {
        idempotency_key: ev.idempotency_key,
        primeira_captura: ev.captured_at,
        ultima_captura: ev.captured_at,
        observacoes: 1
      };
      fatos.set(ev.idempotency_key, fato);
      return { tipo: "novo_fato", fato };
    },

    jaViuEvento: (eventId) => eventIds.has(eventId),
    jaViuFato: (chave) => fatos.has(chave),
    fato: (chave) => fatos.get(chave) || null
  };
}

module.exports = { criarRegistroDedup };
