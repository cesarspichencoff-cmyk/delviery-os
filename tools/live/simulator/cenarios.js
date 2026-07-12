/* ============================================================================
 * DeliveryOS · tools/live/simulator · CATÁLOGO DE CENÁRIOS (Fase 3A)
 * ----------------------------------------------------------------------------
 * Cenários mínimos para provar a ARQUITETURA do simulador — não são campanha
 * de 30 dias, não são métricas de negócio. Cada cenário devolve uma lista de
 * passos { em_ms, evento } (offsets desde o início simulado) e o fim_ms em
 * que o snapshot final é tirado. Determinístico dado (seed, cenário, config).
 * F2-07 e F2-08 NÃO são exercitados aqui — riscos acompanhados para a 3B.
 * ==========================================================================*/
"use strict";

const ev = require("./eventos");

const INICIO_PADRAO = "2026-07-11T18:00:00.000Z";
const seg = (n) => n * 1000;

function pedidoSintetico(ctx) {
  return {
    ifood: ctx.ids.proximoIfood(),
    interno: ctx.ids.proximoInterno(),
    job: ctx.ids.proximoJob(),
    itens: ev.itensSinteticos(ctx.aleatorio)
  };
}

const ts = (ctx, emMs) => new Date(ctx.inicioMs + emMs).toISOString();

const CENARIOS = [
  {
    id: "fluxo_normal",
    descricao: "comanda -> status em preparo -> status pronto; termina matched e atualizado",
    inicio: INICIO_PADRAO,
    fim_ms: seg(80),
    passos(ctx) {
      const p = pedidoSintetico(ctx);
      return [
        { em_ms: 0, evento: ev.eventoComanda(ctx, ts(ctx, 0), p) },
        { em_ms: seg(30), evento: ev.eventoStatus(ctx, ts(ctx, seg(30)), p, "em_preparo") },
        { em_ms: seg(60), evento: ev.eventoStatus(ctx, ts(ctx, seg(60)), p, "pronto") }
      ];
    }
  },
  {
    id: "status_antes_comanda",
    descricao: "status chega primeiro; comanda casa depois",
    inicio: INICIO_PADRAO,
    fim_ms: seg(80),
    passos(ctx) {
      const p = pedidoSintetico(ctx);
      return [
        { em_ms: 0, evento: ev.eventoStatus(ctx, ts(ctx, 0), p, "em_preparo") },
        { em_ms: seg(60), evento: ev.eventoComanda(ctx, ts(ctx, seg(60)), p) }
      ];
    }
  },
  {
    id: "comanda_antes_status",
    descricao: "comanda chega primeiro; status casa depois",
    inicio: INICIO_PADRAO,
    fim_ms: seg(80),
    passos(ctx) {
      const p = pedidoSintetico(ctx);
      return [
        { em_ms: 0, evento: ev.eventoComanda(ctx, ts(ctx, 0), p) },
        { em_ms: seg(60), evento: ev.eventoStatus(ctx, ts(ctx, seg(60)), p, "em_preparo") }
      ];
    }
  },
  {
    id: "evento_duplicado",
    descricao: "a mesma observação chega duas vezes; o log aceito não cresce",
    inicio: INICIO_PADRAO,
    fim_ms: seg(60),
    passos(ctx) {
      const p = pedidoSintetico(ctx);
      const comanda = ev.eventoComanda(ctx, ts(ctx, 0), p);
      return [
        { em_ms: 0, evento: comanda },
        { em_ms: seg(30), evento: comanda } // mesmo event_id, mesmo conteúdo
      ];
    }
  },
  {
    id: "reimpressao",
    descricao: "reimpressão idêntica não cria segundo pedido",
    inicio: INICIO_PADRAO,
    fim_ms: seg(140),
    passos(ctx) {
      const p = pedidoSintetico(ctx);
      return [
        { em_ms: 0, evento: ev.eventoComanda(ctx, ts(ctx, 0), p) },
        { em_ms: seg(60), evento: ev.eventoStatus(ctx, ts(ctx, seg(60)), p, "em_preparo") },
        { em_ms: seg(120), evento: ev.eventoReimpressao(ctx, ts(ctx, seg(120)), p) }
      ];
    }
  },
  {
    id: "cancelamento",
    descricao: "cancelamento via fonte de status preserva o histórico",
    inicio: INICIO_PADRAO,
    fim_ms: seg(150),
    passos(ctx) {
      const p = pedidoSintetico(ctx);
      return [
        { em_ms: 0, evento: ev.eventoComanda(ctx, ts(ctx, 0), p) },
        { em_ms: seg(60), evento: ev.eventoStatus(ctx, ts(ctx, seg(60)), p, "em_preparo") },
        { em_ms: seg(120), evento: ev.eventoCancelamento(ctx, ts(ctx, seg(120)), p) }
      ];
    }
  },
  {
    id: "identificador_em_conflict",
    descricao: "duas comandas com o mesmo curto no dia + status => conflict, nada apto",
    inicio: INICIO_PADRAO,
    fim_ms: seg(90),
    passos(ctx) {
      const a = pedidoSintetico(ctx);
      const b = { ...pedidoSintetico(ctx), ifood: a.ifood }; // colisão de curto
      return [
        { em_ms: 0, evento: ev.eventoComanda(ctx, ts(ctx, 0), a) },
        { em_ms: seg(30), evento: ev.eventoComanda(ctx, ts(ctx, seg(30)), b) },
        { em_ms: seg(60), evento: ev.eventoStatus(ctx, ts(ctx, seg(60)), a, "em_preparo") }
      ];
    }
  },
  {
    id: "fonte_atrasada",
    descricao: "fonte de status para de emitir e envelhece até 'atrasada'",
    inicio: INICIO_PADRAO,
    fim_ms: seg(130), // status: 130s (atrasada) · comanda: 70s (atualizada)
    passos(ctx) {
      const p = pedidoSintetico(ctx);
      return [
        { em_ms: 0, evento: ev.eventoStatus(ctx, ts(ctx, 0), p, "em_preparo") },
        { em_ms: seg(60), evento: ev.eventoComanda(ctx, ts(ctx, seg(60)), p) }
      ];
    }
  },
  {
    id: "fonte_vencida",
    descricao: "fonte de status envelhece além do limite e vence",
    inicio: INICIO_PADRAO,
    fim_ms: seg(320), // status: 320s (vencida) · comanda: 20s (atualizada)
    passos(ctx) {
      const p = pedidoSintetico(ctx);
      return [
        { em_ms: 0, evento: ev.eventoStatus(ctx, ts(ctx, 0), p, "em_preparo") },
        { em_ms: seg(300), evento: ev.eventoComanda(ctx, ts(ctx, seg(300)), p) }
      ];
    }
  },
  {
    id: "desconexao_reconexao",
    descricao: "fonte declara desconexão; evidência de vida posterior reconecta",
    inicio: INICIO_PADRAO,
    fim_ms: seg(150),
    passos(ctx) {
      const p = pedidoSintetico(ctx);
      const q = pedidoSintetico(ctx);
      return [
        { em_ms: 0, evento: ev.eventoStatus(ctx, ts(ctx, 0), p, "em_preparo") },
        { em_ms: seg(60), evento: ev.eventoFonteDesconectada(ctx, ts(ctx, seg(60)), "sim_status") },
        { em_ms: seg(120), evento: ev.eventoStatus(ctx, ts(ctx, seg(120)), q, "em_preparo") }
      ];
    }
  },
  {
    id: "evento_invalido_quarentena",
    descricao: "evento sem schema_version vai para quarentena; o fluxo segue",
    inicio: INICIO_PADRAO,
    fim_ms: seg(90),
    passos(ctx) {
      const p = pedidoSintetico(ctx);
      const q = pedidoSintetico(ctx);
      return [
        { em_ms: 0, evento: ev.eventoComanda(ctx, ts(ctx, 0), p) },
        { em_ms: seg(30), evento: ev.eventoInvalido(ctx, ts(ctx, seg(30)), q) },
        { em_ms: seg(60), evento: ev.eventoStatus(ctx, ts(ctx, seg(60)), p, "em_preparo") }
      ];
    }
  },
  {
    id: "reinicio_e_replay",
    descricao: "reinício no meio da operação; replay reconstrói o mesmo estado e a operação continua",
    inicio: INICIO_PADRAO,
    fim_ms: seg(200),
    passos(ctx) {
      const p = pedidoSintetico(ctx);
      return [
        { em_ms: 0, evento: ev.eventoComanda(ctx, ts(ctx, 0), p) },
        { em_ms: seg(60), evento: ev.eventoStatus(ctx, ts(ctx, seg(60)), p, "em_preparo") },
        { em_ms: seg(120), reiniciar: true },
        { em_ms: seg(180), evento: ev.eventoStatus(ctx, ts(ctx, seg(180)), p, "pronto") }
      ];
    }
  }
];

const porId = new Map(CENARIOS.map((c) => [c.id, c]));

function obterCenario(id) {
  const c = porId.get(id);
  if (!c) throw new Error(`cenario_desconhecido: ${id}`);
  return c;
}

module.exports = { CENARIOS, obterCenario, INICIO_PADRAO };
