/* ============================================================================
 * DeliveryOS · tools/live/simulator/campanha · F2-08: COMANDA COM ITENS VAZIOS
 * ----------------------------------------------------------------------------
 * Casos de estudo explícitos (Fase 3B) executados pelo executor da 3A, cada
 * um documentando o comportamento ATUAL do núcleo — nada é corrigido aqui.
 * O núcleo aceita `itens: []` como composição presente; o resultado de cada
 * caso é registrado e classificado no relatório da campanha.
 * ==========================================================================*/
"use strict";

const ev = require("../eventos");
const { executarCenario } = require("../executor");

const INICIO = "2026-08-01T18:00:00.000Z";
const seg = (n) => n * 1000;
const ts = (ctx, em) => new Date(ctx.inicioMs + em).toISOString();

const pedidoVazio = (ctx) => ({
  ifood: ctx.ids.proximoIfood(),
  interno: ctx.ids.proximoInterno(),
  job: ctx.ids.proximoJob(),
  itens: []
});

const CASOS_F208 = [
  {
    id: "f208_vazia_depois_recebe_composicao",
    descricao: "comanda nasce vazia; pedido_alterado full_snapshot traz a composição",
    inicio: INICIO, fim_ms: seg(120),
    passos(ctx) {
      const p = pedidoVazio(ctx);
      const itens = [{ nome: "Item Sintetico Alfa", quantidade: 1, observacao: null }];
      return [
        { em_ms: 0, evento: ev.eventoComanda(ctx, ts(ctx, 0), p) },
        { em_ms: seg(60), evento: ev.eventoAlteracao(ctx, ts(ctx, seg(60)), p, { revision: 1, itens }) }
      ];
    }
  },
  {
    id: "f208_vazia_permanece_vazia",
    descricao: "comanda vazia sem mais eventos",
    inicio: INICIO, fim_ms: seg(60),
    passos(ctx) {
      const p = pedidoVazio(ctx);
      return [{ em_ms: 0, evento: ev.eventoComanda(ctx, ts(ctx, 0), p) }];
    }
  },
  {
    id: "f208_vazia_duplicada",
    descricao: "a mesma comanda vazia chega duas vezes (mesmo event_id)",
    inicio: INICIO, fim_ms: seg(60),
    passos(ctx) {
      const p = pedidoVazio(ctx);
      const comanda = ev.eventoComanda(ctx, ts(ctx, 0), p);
      return [
        { em_ms: 0, evento: comanda },
        { em_ms: seg(30), evento: comanda }
      ];
    }
  },
  {
    id: "f208_vazia_apos_status",
    descricao: "status chega primeiro; comanda vazia casa depois",
    inicio: INICIO, fim_ms: seg(80),
    passos(ctx) {
      const p = pedidoVazio(ctx);
      return [
        { em_ms: 0, evento: ev.eventoStatus(ctx, ts(ctx, 0), p, "em_preparo") },
        { em_ms: seg(60), evento: ev.eventoComanda(ctx, ts(ctx, seg(60)), p) }
      ];
    }
  },
  {
    id: "f208_vazia_antes_de_status",
    descricao: "comanda vazia primeiro; status casa depois",
    inicio: INICIO, fim_ms: seg(80),
    passos(ctx) {
      const p = pedidoVazio(ctx);
      return [
        { em_ms: 0, evento: ev.eventoComanda(ctx, ts(ctx, 0), p) },
        { em_ms: seg(60), evento: ev.eventoStatus(ctx, ts(ctx, seg(60)), p, "em_preparo") }
      ];
    }
  },
  {
    id: "f208_vazia_seguida_de_cancelamento",
    descricao: "comanda vazia; cancelamento via fonte de status",
    inicio: INICIO, fim_ms: seg(120),
    passos(ctx) {
      const p = pedidoVazio(ctx);
      return [
        { em_ms: 0, evento: ev.eventoComanda(ctx, ts(ctx, 0), p) },
        { em_ms: seg(60), evento: ev.eventoCancelamento(ctx, ts(ctx, seg(60)), p) }
      ];
    }
  },
  {
    id: "f208_vazia_atravessando_reinicio",
    descricao: "comanda vazia persiste; reinício + replay; status chega depois",
    inicio: INICIO, fim_ms: seg(200),
    passos(ctx) {
      const p = pedidoVazio(ctx);
      return [
        { em_ms: 0, evento: ev.eventoComanda(ctx, ts(ctx, 0), p) },
        { em_ms: seg(120), reiniciar: true },
        { em_ms: seg(180), evento: ev.eventoStatus(ctx, ts(ctx, seg(180)), p, "em_preparo") }
      ];
    }
  }
];

/** executa todos os casos e devolve resultados com observações estruturadas */
function executarCasosF208({ seed, storeTimeZone }) {
  const resultados = [];
  for (const caso of CASOS_F208) {
    const r = executarCenario({ cenario: caso, seed, storeTimeZone });
    const todos = [
      ...r.snapshot.pedidos.completos, ...r.snapshot.pedidos.parciais,
      ...r.snapshot.pedidos.conflitos, ...r.snapshot.pedidos.cancelados
    ];
    const pedido = todos[0] || null;
    resultados.push({
      caso: caso.id,
      aceito: r.relatorio.eventos_aceitos > 0,
      quarentena: r.relatorio.quarentena.total,
      duplicados: r.relatorio.duplicados,
      match_state: pedido ? pedido.match_state : null,
      completeness: pedido ? pedido.qualidade.completeness : null,
      apto_para_decisao: pedido ? pedido.apto_para_decisao : null,
      cancelado: pedido ? pedido.cancelado : null,
      itens_atuais: pedido && pedido.comanda ? (pedido.comanda.itens ? pedido.comanda.itens.length : null) : null,
      replay: r.replay,
      hash_resultado: r.relatorio.hash_resultado
    });
  }
  return resultados;
}

module.exports = { CASOS_F208, executarCasosF208 };
