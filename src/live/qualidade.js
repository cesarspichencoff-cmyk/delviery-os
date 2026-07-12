/* ============================================================================
 * DeliveryOS · src/live · QUALIDADE
 * ----------------------------------------------------------------------------
 * Qualidade por evento (defaults honestos) e qualidade do consolidado.
 *
 * F3-07 (fechada aqui):
 *  - completeness: complete | partial | suspect | unknown
 *  - match_state é exposto SEPARADO de completeness no consolidado/snapshot.
 *  - matched NÃO implica complete; complete NÃO implica atualizada.
 *  - parsing_warnings, conflito estrutural ou evidência de que o conteúdo pode
 *    não refletir o papel final => completeness "suspect".
 *
 * Limitação permanente (Addendum §14): manual_correction_detected normalmente
 * é null — null significa "não sabemos", NUNCA "não houve rasura".
 * ==========================================================================*/
"use strict";

const QUALITY_PADRAO = Object.freeze({
  completeness: "unknown",
  freshness: "desconhecida",
  certainty: "observado",
  parsing_warnings: [],
  fields_missing: [],
  source_partial: false,
  manual_correction_possible: true,
  manual_correction_detected: null, // null = "não sabemos" — nunca "não houve"
  digital_state_may_differ_from_paper: true
});

/** Completa a quality de um evento SEM inventar certeza (ausente => unknown). */
function normalizarQualityDeEvento(quality) {
  const q = quality || {};
  const warnings = Array.isArray(q.parsing_warnings) ? q.parsing_warnings.slice() : [];
  if (!quality) warnings.push("quality_ausente_no_evento");
  return {
    completeness: ["complete", "partial", "suspect", "unknown"].includes(q.completeness)
      ? q.completeness : "unknown",
    freshness: typeof q.freshness === "string" ? q.freshness : "desconhecida",
    certainty: q.certainty === "inferido" ? "inferido" : "observado",
    parsing_warnings: warnings,
    fields_missing: Array.isArray(q.fields_missing) ? q.fields_missing.slice() : [],
    source_partial: q.source_partial === true,
    manual_correction_possible: q.manual_correction_possible !== false, // padrão true nesta V1
    manual_correction_detected: (q.manual_correction_detected === true || q.manual_correction_detected === false)
      ? q.manual_correction_detected : null,
    digital_state_may_differ_from_paper: q.digital_state_may_differ_from_paper !== false
  };
}

/**
 * Qualidade do pedido consolidado. match_state NÃO entra aqui — é exposto
 * separado (F3-07): quem lê o snapshot vê os dois lado a lado.
 * @param {object} pedido registro consolidado (ver consolidar.js)
 */
function calcularQualidadeConsolidado(pedido) {
  const warnings = [];
  const faltando = [];

  // F2-08 (corrigido): composição presente exige pelo menos UM item válido
  // (objeto com nome de texto não vazio — shape do contrato §2). Distinções:
  //   comanda null            => composição desconhecida (partial)
  //   itens não-array/null    => composição desconhecida/ inválida (partial)
  //   itens: [] ou só lixo    => composição VAZIA observada (suspect, §abaixo)
  //   >=1 item válido         => segue a lógica normal de completude
  const itens = pedido.comanda ? pedido.comanda.itens : null;
  const composicaoObservada = Array.isArray(itens);
  const itensValidos = composicaoObservada
    ? itens.filter((it) => it && typeof it.nome === "string" && it.nome.trim().length > 0).length
    : 0;
  const temComanda = composicaoObservada && itensValidos > 0;
  const temStatus = !!(pedido.status && pedido.status.coluna);
  if (!temComanda) faltando.push("itens");
  if (!temStatus) faltando.push("status");

  for (const w of pedido.parsing_warnings || []) warnings.push(w);

  let suspeito = false;
  const motivosSuspeita = [];
  if (warnings.length > 0) { suspeito = true; motivosSuspeita.push("parsing_warnings"); }
  if (pedido.comanda && pedido.comanda.reimpressao_divergente) {
    suspeito = true; motivosSuspeita.push("reimpressao_divergente");
  }
  if (pedido.conflito_revisao) { suspeito = true; motivosSuspeita.push("conflito_revisao"); }
  if (pedido.alteracao_pendente_sem_base) { suspeito = true; motivosSuspeita.push("alteracao_sem_base_confiavel"); }
  // F2-08: comanda impressa com composição VAZIA é anômala por natureza — a
  // operação não vende pedido sem item. Nunca complete, nunca apta; se uma
  // alteração posterior trouxer item válido, a suspeita cai e o pedido pode
  // recuperar completude normalmente.
  if (composicaoObservada && itensValidos === 0) {
    suspeito = true; motivosSuspeita.push("comanda_sem_itens");
  }

  let completeness;
  if (suspeito) completeness = "suspect";
  else if (temComanda && temStatus) completeness = "complete";
  else if (temComanda || temStatus) completeness = "partial";
  else completeness = "unknown";

  return {
    completeness,
    motivos_suspeita: motivosSuspeita,
    parsing_warnings: warnings,
    fields_missing: faltando,
    source_partial: !(temComanda && temStatus),
    manual_correction_possible: true,
    manual_correction_detected: null, // captura digital não detecta rasura (limitação permanente)
    digital_state_may_differ_from_paper: true
  };
}

module.exports = { QUALITY_PADRAO, normalizarQualityDeEvento, calcularQualidadeConsolidado };
