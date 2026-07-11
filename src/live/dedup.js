/* ============================================================================
 * DeliveryOS · src/live · DEDUPLICAÇÃO
 * ----------------------------------------------------------------------------
 * Consultada ANTES de qualquer append (F2-04): nenhum duplicata chega ao log.
 *
 * Dois níveis de identidade, ambos com hash de conteúdo canônico:
 *  1. event_id  = a OBSERVAÇÃO.
 *     - mesmo id + mesmo conteúdo  => duplicata (sem append, sem estado).
 *     - mesmo id + conteúdo DIVERGENTE => anomalia (quarentena sanitizada;
 *       o evento anterior aceito NUNCA é substituído em silêncio).
 *  2. idempotency_key = o FATO.
 *     - mesma chave + mesmo conteúdo => observação repetida (sem append;
 *       carimbos em memória podem avançar).
 *     - mesma chave + conteúdo INCOMPATÍVEL => conflito (quarentena
 *       sanitizada; o fato original aceito é preservado).
 *
 * Índices reconstruíveis: o replay do log re-registra cada linha, então uma
 * duplicata recebida DEPOIS do reinício também é reconhecida.
 * Nome de cliente NUNCA participa de chave (Addendum §7).
 * ==========================================================================*/
"use strict";

function criarRegistroDedup() {
  const eventIds = new Map(); // event_id -> hash_conteudo
  const fatos = new Map();    // idempotency_key -> { hash_conteudo, primeira_captura, ultima_captura, observacoes }

  return {
    /**
     * Classifica um evento contra os índices — SEM alterá-los.
     * @returns {{tipo:"novo_fato"|"observacao_repetida"|"evento_duplicado"|
     *            "evento_divergente"|"fato_divergente", fato?:object}}
     */
    consultar(ev, hashConteudo) {
      const hashVisto = eventIds.get(ev.event_id);
      if (hashVisto !== undefined) {
        return hashVisto === hashConteudo
          ? { tipo: "evento_duplicado" }
          : { tipo: "evento_divergente" };
      }
      const fato = fatos.get(ev.idempotency_key);
      if (fato) {
        return fato.hash_conteudo === hashConteudo
          ? { tipo: "observacao_repetida", fato }
          : { tipo: "fato_divergente", fato };
      }
      return { tipo: "novo_fato" };
    },

    /** Registra o evento nos índices (após a decisão de aceite). */
    registrar(ev, hashConteudo) {
      eventIds.set(ev.event_id, hashConteudo);
      const existente = fatos.get(ev.idempotency_key);
      if (existente) {
        existente.observacoes += 1;
        if (ev.captured_at > existente.ultima_captura) {
          existente.ultima_captura = ev.captured_at;
        }
        return existente;
      }
      const fato = {
        idempotency_key: ev.idempotency_key,
        hash_conteudo: hashConteudo,
        primeira_captura: ev.captured_at,
        ultima_captura: ev.captured_at,
        observacoes: 1
      };
      fatos.set(ev.idempotency_key, fato);
      return fato;
    },

    jaViuEvento: (eventId) => eventIds.has(eventId),
    jaViuFato: (chave) => fatos.has(chave),
    fato: (chave) => fatos.get(chave) || null
  };
}

module.exports = { criarRegistroDedup };
