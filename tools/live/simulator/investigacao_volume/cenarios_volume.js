/* ============================================================================
 * DeliveryOS · investigação de volume · CENÁRIOS AMBIENTE E FOCO
 * ----------------------------------------------------------------------------
 * Cenários novos, compatíveis com o executor certificado da 3A
 * (`tools/live/simulator/executor.js`, INTOCADO). Nenhuma flag de força de
 * modo — o motor real (`MOTOR.step`) decide Calmo/Ambiente/Foco sozinho,
 * a partir de volume e tempo de pedidos sintéticos.
 *
 * Matemática de carga (BASELINE real de src/perfil-delivery/motor.js,
 * NÃO alterada, só LIDA aqui para desenhar os cenários):
 *   combinados:3 · duplas:6 · enrolados:5 · enrolados_quentes:3 · cozinha_quentes:4
 *   sev1 (Ambiente): BASELINE < n < 1,4×BASELINE
 *   sev2/3 (candidato a Foco): n >= 1,4×BASELINE (sev2) ou n >= 2×BASELINE (sev3)
 *   Foco exige sev>=2 sustentado por FLOORS.DEBOUNCE=3 minutos consecutivos.
 *
 * ACHADO DE IMPLEMENTAÇÃO 1 (documentado em detalhe no relatório da missão):
 * `MOTOR.step` só conta um pedido como "em produção" (contribuindo pro
 * `load[praça]`) se ele tiver ALGUM destino conhecido — `o.p` (pronto) OU
 * `o.c` (cancelado) não-nulo (`up = o.p!=null?o.p:o.c; if(up==null) continue`).
 * Um pedido com os dois nulos é INVISÍVEL ao motor, não "fica em produção
 * para sempre" como a primeira versão desta investigação assumiu. Por isso
 * todo pedido aqui recebe um evento `status_ifood` coluna "pronto" — mas
 * deliberadamente agendado bem DEPOIS da janela de observação de interesse
 * (`PRONTO_TARDIO_MIN`), garantindo `o.p > t` (logo `wait = t-o.r` continua
 * contando, o pedido segue "em produção") durante toda a demonstração.
 *
 * ACHADO DE IMPLEMENTAÇÃO 2 (também documentado no relatório): o motor tem
 * uma SEGUNDA via para Foco além da sobrecarga de praça — "fechamento"
 * (`kind:"fechamento"`, sev fixo 2): qualquer pedido de bancada única
 * esperando mais que `FLOORS.PROD*0.6=27` minutos vira candidato, e sev2
 * sempre supera sev1. No cenário Ambiente (só sev1) isso faria QUALQUER
 * pedido antigo virar Foco por fechamento depois de ~27 minutos — por isso
 * a janela do Ambiente é deliberadamente mais curta que esse limiar
 * (`PRONTO_TARDIO_AMBIENTE_MIN < 27`). No cenário Foco isso NÃO acontece
 * porque a praça sobrecarregada já está em sev3, que domina o fechamento
 * (sev2) na ordenação de `sits` — confirmado empiricamente, não só por
 * leitura de código (ver relatório, "achados" §4).
 *
 * Todo pedido usa item de UMA SÓ praça (pracas_dependentes:[] no cardápio
 * real) — carga por praça = nº de pedidos, sem interferência cruzada.
 * ==========================================================================*/
"use strict";

const ev = require("../eventos");
const { itemDaPraca } = require("./itens_producao");

const DIA_LOCAL = "2026-09-15";
const HORA_BASE = "19:00:00"; // pico de jantar plausível, dentro da janela operacional 11:00-23:00
const INICIO = `${DIA_LOCAL}T${HORA_BASE}.000-03:00`; // wall-clock local explícito (America/Sao_Paulo)
const min = (n) => n * 60 * 1000;

// "pronto" agendado bem depois de qualquer janela de observação de interesse
// — nenhum pedido deste estudo chega a "sair de produção" antes disso; o
// motor precisa desse destino conhecido só para contar o pedido como
// "em produção" (achado de implementação 1). No Foco, 60min é seguro porque
// a praça sobrecarregada já domina em sev3 (achado 2). No Ambiente, o limite
// tem de ficar ABAIXO do limiar de fechamento (27min, achado 2) para que
// nenhum pedido antigo vire Foco por essa via paralela.
const PRONTO_TARDIO_FOCO_MIN = 60;
const PRONTO_TARDIO_AMBIENTE_MIN = 20; // < FLOORS.PROD*0.6=27 — margem de segurança

function pedidoSintetico(ctx, praca) {
  return {
    ifood: ctx.ids.proximoIfood(),
    interno: ctx.ids.proximoInterno(),
    job: ctx.ids.proximoJob(),
    itens: [itemDaPraca(praca)]
  };
}

function tsEm(ctx, minutoRelativo, segundos) {
  return new Date(ctx.inicioMs + minutoRelativo * 60000 + (segundos || 0) * 1000).toISOString();
}

/** um pedido: comanda + status em_preparo (chegada) + status pronto tardio
 * (destino conhecido, fora da janela de interesse — mantém o pedido "em
 * produção" durante toda a demonstração; ver achado de implementação 1). */
function passosPedido(ctx, minutoRelativo, praca, prontoTardioMin) {
  const p = pedidoSintetico(ctx, praca);
  return [
    { em_ms: min(minutoRelativo), evento: ev.eventoComanda(ctx, tsEm(ctx, minutoRelativo, 0), p) },
    { em_ms: min(minutoRelativo) + 5000, evento: ev.eventoStatus(ctx, tsEm(ctx, minutoRelativo, 5), p, "em_preparo") },
    { em_ms: min(prontoTardioMin), evento: ev.eventoStatus(ctx, tsEm(ctx, prontoTardioMin, 0), p, "pronto") }
  ];
}

/* ---------------- Cenário 1: AMBIENTE (clima em múltiplas áreas, sem foco) ----------------
 * 4 praças de produção, cada uma logo ACIMA do baseline (sev1 — nunca sev2):
 *   duplas: 7 pedidos (BASELINE 6, ratio 1,167) — chegam no minuto 0
 *   enrolados: 6 pedidos (BASELINE 5, ratio 1,2) — minuto 1
 *   enrolados_quentes: 4 pedidos (BASELINE 3, ratio 1,333) — minuto 2
 *   cozinha_quentes: 5 pedidos (BASELINE 4, ratio 1,25) — minuto 3
 * Todas as ratios ficam < 1,4 de propósito — nenhuma praça vira candidata a
 * Foco (sess.pending exige top.sev>=2); sits.length>0 mantém o modo Ambiente
 * do minuto 3 até o "pronto" tardio (minuto 60), uma janela ampla e estável. */
const CENARIO_AMBIENTE = {
  id: "investigacao_ambiente_multiareas",
  inicio: INICIO,
  // fim_ms cola no último evento (sem folga): folga grande deixaria a fonte
  // de STATUS "vencida" no snapshot (config.freshness padrão, vencidaAposMs=
  // 5min) e o adaptador nunca devolveria "ready" — não é um problema do
  // motor nem do adaptador, é só o instante em que este script pede o
  // snapshot; por isso fim_ms fica colado no último evento agendado.
  fim_ms: min(PRONTO_TARDIO_AMBIENTE_MIN),
  passos(ctx) {
    const passos = [];
    passos.push(...Array.from({ length: 7 }, () => passosPedido(ctx, 0, "duplas", PRONTO_TARDIO_AMBIENTE_MIN)).flat());
    passos.push(...Array.from({ length: 6 }, () => passosPedido(ctx, 1, "enrolados", PRONTO_TARDIO_AMBIENTE_MIN)).flat());
    passos.push(...Array.from({ length: 4 }, () => passosPedido(ctx, 2, "enrolados_quentes", PRONTO_TARDIO_AMBIENTE_MIN)).flat());
    passos.push(...Array.from({ length: 5 }, () => passosPedido(ctx, 3, "cozinha_quentes", PRONTO_TARDIO_AMBIENTE_MIN)).flat());
    return passos.sort((a, b) => a.em_ms - b.em_ms);
  }
};

/* ---------------- Cenário 2: FOCO (uma praça vira atenção soberana) ----------------
 * Só cozinha_quentes recebe pedidos (BASELINE 4), um por minuto, minutos 0-7:
 *   minuto4: n=5 (ratio 1,25, sev1) — Ambiente começa
 *   minuto5: n=6 (ratio 1,5, sev2) — sess.pending nasce (since=5)
 *   minuto7: n=8 (ratio 2,0, sev3) — todos os 8 pedidos já chegaram
 *   minuto8: (t-since)=3 >= DEBOUNCE — sustained — Foco DISPARA
 *   minuto8-15: Foco ativo (MAXFOCUS=8 minutos)
 *   minuto16+: Foco expira; cooldown (45min) impede refire; volta a Ambiente
 *   minuto60: "pronto" tardio — pedidos saem de produção, sits esvazia
 * Nenhuma outra praça recebe pedido — cozinha_quentes é a única candidata,
 * garantindo que sess.active.sit não dispute com nenhuma outra situação.
 * Esta sequência também demonstra Calmo → Ambiente → Foco → Ambiente numa
 * janela só (cobre o item 3, opcional, do objetivo técnico). */
const CENARIO_FOCO = {
  id: "investigacao_foco_praca_soberana",
  inicio: INICIO,
  fim_ms: min(PRONTO_TARDIO_FOCO_MIN), // ver nota de fim_ms no CENARIO_AMBIENTE
  passos(ctx) {
    const passos = [];
    for (let m = 0; m <= 7; m++) passos.push(...passosPedido(ctx, m, "cozinha_quentes", PRONTO_TARDIO_FOCO_MIN));
    return passos.sort((a, b) => a.em_ms - b.em_ms);
  }
};

module.exports = {
  CENARIO_AMBIENTE, CENARIO_FOCO, DIA_LOCAL,
  PRONTO_TARDIO_FOCO_MIN, PRONTO_TARDIO_AMBIENTE_MIN
};
