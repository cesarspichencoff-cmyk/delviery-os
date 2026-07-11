/* ============================================================================
 * DeliveryOS · src/live · SNAPSHOT
 * ----------------------------------------------------------------------------
 * Estado atual DERIVADO (nunca vira evento; reconstruível 100% do log).
 * Nesta fase o snapshot NÃO alimenta motor.js nem app-v1 — é a saída isolada
 * do núcleo, consumida por testes e por fases futuras (F3/F4).
 *
 * Honestidade estrutural (F3-07 + Addendum §10):
 *  - match_state e completeness andam SEPARADOS em cada pedido.
 *  - "completos" exige completeness "complete" — matched suspeito/incompleto
 *    fica em "parciais" (nunca maquiado de completo).
 *  - conflitos e cancelados têm listas próprias; conflito nunca fica apto
 *    para decisão.
 *  - fontes carregam freshness explícita; complete NÃO significa atualizada.
 * ==========================================================================*/
"use strict";

const { classificarFonte, avaliarGateStaleness } = require("./freshness");

const SEVERIDADE_FRESHNESS = {
  atualizada: 0, atrasada: 1, vencida: 2, desconectada: 3, desconhecida: 4
};

function piorFreshness(classificacoes) {
  if (classificacoes.length === 0) return null;
  return classificacoes.reduce((pior, c) =>
    SEVERIDADE_FRESHNESS[c.freshness_state] > SEVERIDADE_FRESHNESS[pior.freshness_state] ? c : pior
  );
}

/**
 * @param {object} args
 *  pedidos           saída de consolidarVisao()
 *  fontes            Map source -> registro de fonte (ver nucleo.js)
 *  quarentena        instância de criarQuarentena()
 *  contadoresEstado  contadores da consolidação (100% reconstruíveis do log)
 *  recepcao          contadores de recepção — ESCOPO DE SESSÃO: duplicatas e
 *                    quarentenas não são re-anexadas (F2-04), logo estes
 *                    números não sobrevivem ao reinício e são expostos em
 *                    seção própria para nunca passarem por dado reconstruível
 *  config            criarConfig()
 *  agoraMs           relógio injetado
 *  reconstruidoEm    ISO da última reconstrução (null se sessão contínua)
 */
function montarSnapshot({ pedidos, fontes, quarentena, contadoresEstado, recepcao, config, agoraMs, reconstruidoEm }) {
  const fontesSaida = {};
  const porPapel = { status: [], composicao: [] };
  let ultimaConfiavel = null;

  for (const [nome, fonte] of fontes) {
    const cls = classificarFonte(fonte, agoraMs, config.freshness);
    fontesSaida[nome] = {
      ...cls,
      papeis: [...(fonte.papeis || [])],
      ultimo_evento_em: fonte.ultimo_evento_em || null,
      desconectada_em: (fonte.desconectada_em && !fonte.reconectada_em) ? fonte.desconectada_em : null
    };
    for (const papel of fonte.papeis || []) {
      if (porPapel[papel]) porPapel[papel].push(cls);
    }
    if (fonte.last_trusted_at && (!ultimaConfiavel || fonte.last_trusted_at > ultimaConfiavel)) {
      ultimaConfiavel = fonte.last_trusted_at;
    }
  }

  const gate = avaliarGateStaleness({
    status: piorFreshness(porPapel.status),
    composicao: piorFreshness(porPapel.composicao)
  }, config.freshness);

  const cancelados = pedidos.filter((p) => p.cancelado);
  const conflitos = pedidos.filter((p) => !p.cancelado && p.match_state === "conflict");
  const completos = pedidos.filter((p) =>
    !p.cancelado && p.match_state === "matched" && p.qualidade.completeness === "complete");
  const parciais = pedidos.filter((p) =>
    !p.cancelado && p.match_state !== "conflict" &&
    !(p.match_state === "matched" && p.qualidade.completeness === "complete"));

  return {
    versao_snapshot: "1.0",
    modo: "nucleo_isolado", // sem motor, sem interface nesta fase
    gerado_em: new Date(agoraMs).toISOString(),
    reconstruido_em: reconstruidoEm || null,
    ultima_atualizacao_confiavel: ultimaConfiavel,
    pedidos: { completos, parciais, conflitos, cancelados },
    fontes: fontesSaida,
    gate_staleness: gate,
    quarentena: {
      total: quarentena.total(),
      por_motivo: quarentena.porMotivo()
    },
    // derivado do log — sobrevive ao reinício
    qualidade: {
      ...contadoresEstado,
      pedidos_completos: completos.length,
      pedidos_parciais: parciais.length,
      pedidos_em_conflito: conflitos.length,
      pedidos_cancelados: cancelados.length
    },
    // escopo de SESSÃO (F2-04): não sobrevive ao reinício por desenho
    recepcao: { ...recepcao }
  };
}

module.exports = { montarSnapshot };
