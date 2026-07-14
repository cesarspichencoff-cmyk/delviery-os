/* ============================================================================
 * DeliveryOS · investigação de volume · PIPELINE COM O MOTOR REAL
 * ----------------------------------------------------------------------------
 * Reproduz EXATAMENTE o pipeline de app-v1/app.js (`rodarJanela`/
 * `precomputar`), fora do navegador, para permitir verificação automatizada:
 *   snapshot do núcleo → montarJanela (adaptador D4A, INTOCADO)
 *     → MOTOR.makeFonteItensFromRows + MOTOR.resolver (motor.js, INTOCADO)
 *     → MOTOR.step por minuto (motor.js, INTOCADO) + DECISAO.decidir quando
 *       mode==="foco" (decisao.js, INTOCADO)
 * Nenhuma regra é reimplementada aqui — só chamamos as funções reais.
 * ==========================================================================*/
"use strict";

const path = require("node:path");
const RAIZ = path.join(__dirname, "..", "..", "..", "..");

const MOTOR = require(path.join(RAIZ, "src", "perfil-delivery", "motor.js"));
const DECISAO = require(path.join(RAIZ, "src", "perfil-delivery", "decisao.js"));
const { montarJanela } = require(path.join(RAIZ, "src", "live", "interface", "adaptador.js"));
const seed = require(path.join(RAIZ, "data", "cardapio_knowledge_seed.json"));

MOTOR.setNomes(Object.fromEntries(seed.itens.map((x) => [x.id, x.nome])));

/**
 * @param {object} snapshot   snapshot do núcleo (de executarCenario)
 * @param {string} storeTimeZone
 * @returns {{ janela, timeline: Array, resumo }}  timeline = 1 entrada por minuto,
 *   idêntica em forma ao que app.js.precomputar() produz (mode/sits/foco/etc),
 *   mais sess_active_sit (cópia serializável de sess.active.sit no minuto).
 */
function rodarPipelineReal(snapshot, storeTimeZone) {
  const { janela } = montarJanela(snapshot, { storeTimeZone });
  if (!janela) return { janela: null, timeline: [], resumo: { motivo: "sem_janela_apta" } };

  const FONTE = MOTOR.makeFonteItensFromRows(janela.rows, seed.itens);
  const INFO = {};
  for (const o of janela.NIGHT) INFO[o.id] = MOTOR.resolver(FONTE(o.id));

  const sess = MOTOR.novaSessao();
  const timeline = [];
  for (let t = janela.T0; t <= janela.T1; t++) {
    const R = MOTOR.step(t, janela.NIGHT, INFO, sess);
    let rec = null;
    if (R.mode === "foco" && sess.active) {
      rec = DECISAO.decidir(R, INFO, { fonteReal: true, active: sess.active });
    }
    timeline.push({
      t, mode: R.mode, emand: R.emand,
      sits: R.sits.map((s) => ({ key: s.key, kind: s.kind, praca: s.praca || null, sev: s.sev, n: s.n || null, unblock: s.unblock || null })),
      ambList: (R.ambList || []).map((a) => ({ label: a.label, sev: a.sev })),
      sess_active_sit: sess.active ? {
        key: sess.active.key,
        kind: sess.active.sit.kind,
        praca: sess.active.sit.praca || null,
        sev: sess.active.sit.sev,
        n: sess.active.sit.n || null,
        unblock: sess.active.sit.unblock || null,
        until: sess.active.until
      } : null,
      foco: R.foco ? { head: R.foco.head, impactos: R.foco.impactos, conseq: R.foco.conseq, cmd: R.foco.cmd, sev: R.foco.sev } : null,
      rec: rec ? { tipo: rec.tipo, acao: rec.acao, head: rec.head, porque: rec.porque, impacto: rec.impacto, confianca: rec.confianca } : null
    });
  }

  const modos = {};
  for (const p of timeline) modos[p.mode] = (modos[p.mode] || 0) + 1;
  const primeiroAmbiente = timeline.find((p) => p.mode === "ambiente");
  const primeiroFoco = timeline.find((p) => p.mode === "foco");

  return {
    janela,
    timeline,
    resumo: {
      T0: janela.T0, T1: janela.T1, minutos: timeline.length,
      pedidos_na_janela: janela.NIGHT.length,
      contagem_por_modo: modos,
      minuto_primeiro_ambiente: primeiroAmbiente ? primeiroAmbiente.t : null,
      minuto_primeiro_foco: primeiroFoco ? primeiroFoco.t : null,
      sess_active_sit_no_primeiro_foco: primeiroFoco ? primeiroFoco.sess_active_sit : null
    }
  };
}

module.exports = { rodarPipelineReal };
