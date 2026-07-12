/* ============================================================================
 * DeliveryOS · tools/live/simulator/campanha · CONTRATO DA CAMPANHA
 * ----------------------------------------------------------------------------
 * Configuração determinística e explícita da campanha de 30 dias sintéticos.
 * A MESMA configuração + seed produz os mesmos dias, pedidos, eventos,
 * timestamps, reinícios, resultados e hash canônico.
 *
 * Volume: alvo 8.000–10.000 pedidos sintéticos no total, com perfis de dia
 * NÃO uniformes (calmo/normal/alto/pico + dias degradados). A distribuição é
 * sintética e controlada — NUNCA cópia da distribuição histórica real.
 *
 * Seeds diárias derivam da seed principal: `${campaign_seed}:dia:{n}`.
 * ==========================================================================*/
"use strict";

const { localDayKey } = require("../../../../src/live/normalizar");
const { minutosDe } = require("./tempo");

/* ---- mix de cenários por pedido (pesos; soma 1.0) ---- */
const MIX_BASE = Object.freeze({
  fluxo_normal: 0.55,
  comanda_antes_status: 0.15,
  status_antes_comanda: 0.15,
  cancelamento: 0.04,
  reimpressao: 0.025,
  fora_de_ordem: 0.02,
  comanda_vazia: 0.01,   // F2-08 presente no volume normal
  duplicado: 0.04,
  conflito_par: 0.015
});
const MIX_PRESSAO = Object.freeze({
  ...MIX_BASE,
  fluxo_normal: 0.42, duplicado: 0.15, conflito_par: 0.03 // alto volume deduplicável
});

/* ---- perfis diários (faixas de pedidos por dia) ---- */
const PERFIS = Object.freeze({
  calmo: { pedidos: [160, 200], mix: MIX_BASE },
  normal: { pedidos: [240, 300], mix: MIX_BASE },
  alto: { pedidos: [360, 420], mix: MIX_BASE },
  pico: { pedidos: [480, 540], mix: MIX_BASE },
  pressao: { pedidos: [360, 420], mix: MIX_PRESSAO },
  fonte_instavel: { pedidos: [240, 300], mix: MIX_BASE },
  recuperacao: { pedidos: [240, 300], mix: MIX_BASE },
  invalidos_ampliado: { pedidos: [240, 300], mix: MIX_BASE }
});

/* ---- calendário canônico de 30 dias (não uniforme; dias calmos, normais e
 *      degradados; nenhum dia é artificialmente problemático "só porque sim") */
const CALENDARIO_30D = Object.freeze([
  "calmo", "normal", "normal", "alto", "calmo",              // 1-5  (reinício d5 pós-calmo)
  "pico", "normal", "pressao", "normal", "fonte_instavel",   // 6-10 (desconexão d10)
  "recuperacao", "pico", "normal", "alto", "calmo",          // 11-15 (reinício d12 no pico)
  "normal", "pressao", "normal", "alto", "normal",           // 16-20 (reinícios d17/d20)
  "pico", "normal", "fonte_instavel", "recuperacao", "invalidos_ampliado", // 21-25 (d23 desconexão+reinício)
  "normal", "alto", "calmo", "normal", "normal"              // 26-30 (reinício d28)
]);

const CAMPANHA_30D = Object.freeze({
  campaign_id: "campanha-sintetica-30d-v0",
  campaign_seed: "deliveryos-3b-sintetico",
  store_time_zone: "America/Sao_Paulo",
  start_local_date: "2026-08-01",
  total_days: 30,
  daily_profile: CALENDARIO_30D,
  order_volume_target: Object.freeze({ total_min: 8000, total_max: 10000 }),
  event_mix: Object.freeze({ base: MIX_BASE, pressao: MIX_PRESSAO }),
  operational_window: Object.freeze({ abre_local: "11:00", fecha_local: "23:00" }),
  restart_plan: Object.freeze([
    Object.freeze({ dia: 5, hora_local: "15:00", contexto: "apos_periodo_calmo" }),
    Object.freeze({ dia: 12, hora_local: "19:30", contexto: "durante_volume_elevado" }),
    Object.freeze({ dia: 17, hora_local: "16:00", contexto: "apos_evento_duplicado" }),
    Object.freeze({ dia: 20, hora_local: "17:00", contexto: "apos_conflito" }),
    Object.freeze({ dia: 23, hora_local: "15:20", contexto: "durante_desconexao_antes_de_evidencia_fresca" }),
    Object.freeze({ dia: 28, hora_local: "12:00", contexto: "apos_periodo_calmo" })
  ]),
  disconnect_plan: Object.freeze([
    Object.freeze({ dia: 10, inicio_local: "14:00", duracao_min: 8 }),   // atrasada->vencida->volta
    Object.freeze({ dia: 23, inicio_local: "15:00", duracao_min: 45 })   // indisponibilidade + reinício no meio
  ]),
  anomaly_plan: Object.freeze({
    invalidos_por_dia: 1,
    dias_ampliados: Object.freeze({ 25: 25 }) // incidência ampliada de inválidos
  }),
  boundary_plan: Object.freeze({ dias: Object.freeze([3, 12, 25]), eventos_por_dia: 3 }),
  reporting_config: Object.freeze({ snapshot_diario: true, amostragem_freshness_min: 30 })
});

function validarConfigCampanha(cfg) {
  const falha = (m) => { throw new Error(`config_campanha_invalida: ${m}`); };
  if (!cfg || typeof cfg !== "object") falha("configuracao ausente");
  for (const campo of ["campaign_id", "campaign_seed", "store_time_zone", "start_local_date"]) {
    if (typeof cfg[campo] !== "string" || cfg[campo].length === 0) falha(`${campo} obrigatorio`);
  }
  if (localDayKey("2026-01-01T12:00:00.000Z", cfg.store_time_zone) === null) {
    falha(`store_time_zone IANA invalido: ${cfg.store_time_zone}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cfg.start_local_date)) falha("start_local_date deve ser YYYY-MM-DD");
  if (!Number.isInteger(cfg.total_days) || cfg.total_days < 1) falha("total_days invalido");
  if (!Array.isArray(cfg.daily_profile) || cfg.daily_profile.length !== cfg.total_days) {
    falha("daily_profile deve ter exatamente total_days entradas");
  }
  for (const p of cfg.daily_profile) if (!PERFIS[p]) falha(`perfil desconhecido: ${p}`);
  const j = cfg.operational_window;
  if (!j || minutosDe(j.abre_local) >= minutosDe(j.fecha_local)) falha("operational_window invalida");
  for (const r of cfg.restart_plan || []) {
    if (!Number.isInteger(r.dia) || r.dia < 1 || r.dia > cfg.total_days) falha(`restart_plan dia invalido: ${r.dia}`);
  }
  for (const d of cfg.disconnect_plan || []) {
    if (!Number.isInteger(d.dia) || d.dia < 1 || d.dia > cfg.total_days) falha(`disconnect_plan dia invalido: ${d.dia}`);
  }
  return true;
}

/** seed diária derivada de forma determinística da seed principal */
const seedDoDia = (cfg, indiceDia) => `${cfg.campaign_seed}:dia:${indiceDia}`;

module.exports = { CAMPANHA_30D, PERFIS, MIX_BASE, MIX_PRESSAO, validarConfigCampanha, seedDoDia };
