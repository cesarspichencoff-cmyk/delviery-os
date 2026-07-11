/* ============================================================================
 * DeliveryOS · src/live · CORRELAÇÃO ENTRE FONTES
 * ----------------------------------------------------------------------------
 * Casamento comanda×status (Addendum §7).
 *
 * Estados: matched | partial | unmatched | conflict
 *  - matched    casado por identificador forte (ifood_short único no dia,
 *               presente nas duas fontes; pedido_interno ancora a comanda).
 *  - partial    só uma fonte presente e SEM identificador para tentar casar.
 *  - unmatched  só uma fonte presente, identificador existe, mas nenhum
 *               candidato do outro lado (comporta-se como partial).
 *  - conflict   ambiguidade real: mais de um candidato plausível.
 *
 * PROIBIDO (F1-04): consolidar por proximidade temporal; escolher o candidato
 * "mais próximo"; usar nome de cliente como chave. Proximidade temporal é no
 * máximo indício registrado em diagnóstico — nunca chave.
 *
 * Em conflict: preservar todos os eventos, registrar candidatos + motivo,
 * NÃO enviar à decisão operacional, NÃO gerar praça/pressão/embalagem/Foco.
 * ==========================================================================*/
"use strict";

const MATCH_STATES = Object.freeze(["matched", "partial", "unmatched", "conflict"]);

/**
 * Correlaciona um lado de status com as comandas do mesmo dia.
 * @param {object} statusRec  registro do lado status { ifood_short, dia }
 * @param {Array}  comandas   registros do lado comanda do MESMO dia
 * @returns {{estado:string, candidatos:Array, motivo:string}}
 */
function correlacionarStatusComComandas(statusRec, comandas) {
  if (!statusRec.ifood_short) {
    return { estado: "partial", candidatos: [], motivo: "sem_identificador_para_casar" };
  }
  // F2-02: sem dia operacional confiável (storeTimeZone ausente/inválido),
  // NENHUM casamento automático dependente de dia — UTC nunca é assumido.
  if (!statusRec.dia) {
    return { estado: "unmatched", candidatos: [], motivo: "sem_dia_operacional_confiavel" };
  }
  const candidatos = (comandas || []).filter(
    (c) => c.ifood_short && c.ifood_short === statusRec.ifood_short &&
      c.dia && c.dia === statusRec.dia
  );
  if (candidatos.length === 0) {
    return { estado: "unmatched", candidatos: [], motivo: "nenhum_candidato_do_outro_lado" };
  }
  if (candidatos.length === 1) {
    return {
      estado: "matched",
      candidatos: candidatos.map(resumoCandidato),
      motivo: "identificador_forte_unico_no_dia"
    };
  }
  // 2+ comandas com o mesmo curto no dia: ambiguidade real. NUNCA escolher a
  // mais próxima no tempo — todos viram conflict, eventos preservados.
  return {
    estado: "conflict",
    candidatos: candidatos.map(resumoCandidato),
    motivo: "multiplos_candidatos_com_mesmo_identificador"
  };
}

/** Resumo de candidato para diagnóstico — nunca dados pessoais. */
function resumoCandidato(c) {
  return {
    pedido_interno: c.pedido_interno || null,
    ifood_short: c.ifood_short || null,
    dia: c.dia || null,
    emissao: c.emissao || null // registrado como indício de diagnóstico, nunca chave
  };
}

module.exports = { MATCH_STATES, correlacionarStatusComComandas };
