/* ============================================================================
 * ExternalPackagingCapability — o que se sabe, com evidência, sobre suporte
 * do iFood a contagem de sacolas/volumes por pedido (ex.: "Volume 1 de 2").
 * ----------------------------------------------------------------------------
 * Regra da missão: o estado PADRÃO é `unknown`. Nunca afirmar suporte
 * oficial sem evidência registrada em `evidence_refs`. O DeliveryOS
 * continua controlando `package_count`/volumes internamente
 * (`src/perfil-delivery/motor.js`) independente do que este contrato
 * registrar — nenhuma sincronização real acontece nesta missão.
 * ==========================================================================*/
"use strict";

const PACKAGING_CAPABILITY_STATE = Object.freeze({
  UNSUPPORTED: "unsupported",   // confirmado, com evidência, que o provedor NÃO suporta
  UNKNOWN: "unknown",           // padrão — nada investigado/confirmado ainda
  CANDIDATE: "candidate",       // hipótese levantada, sem evidência ainda
  DOCUMENTED: "documented",     // documentação pública encontrada, não testada
  TESTABLE: "testable",         // documentado o bastante para desenhar um teste de homologação
  AVAILABLE: "available",       // confirmado disponível em homologação/produção
  SYNCHRONIZED: "synchronized", // DeliveryOS já envia/recebe o dado de verdade
  FAILED: "failed"              // tentativa de uso real falhou (registrar motivo)
});
const PACKAGING_CAPABILITY_STATE_LIST = Object.freeze(Object.values(PACKAGING_CAPABILITY_STATE));

/**
 * @param {object} raw
 *   merchantId
 *   capability      nome da capacidade (ex.: "package_count", "volume_count", "bag_count")
 *   state            um de PACKAGING_CAPABILITY_STATE — default UNKNOWN se ausente/inválido
 *   evidenceRefs[]    referências (doc, teste, ticket) que sustentam o estado — nunca vazio se state != unknown/candidate
 */
function buildPackagingCapability(raw) {
  const r = raw || {};
  if (!r.merchantId || !r.capability) return null;
  const state = PACKAGING_CAPABILITY_STATE_LIST.includes(r.state) ? r.state : PACKAGING_CAPABILITY_STATE.UNKNOWN;
  const evidenceRefs = Array.isArray(r.evidenceRefs) ? r.evidenceRefs.slice() : [];
  // regra dura: qualquer estado além de unknown/candidate exige evidência registrada
  const requiresEvidence = ![PACKAGING_CAPABILITY_STATE.UNKNOWN, PACKAGING_CAPABILITY_STATE.CANDIDATE].includes(state);
  if (requiresEvidence && !evidenceRefs.length) {
    return { ok: false, errors: ["estado_sem_evidencia:" + state] };
  }
  return {
    ok: true,
    capability_record: {
      merchant_id: r.merchantId,
      capability: r.capability,
      state,
      evidence_refs: evidenceRefs,
      last_checked_at: r.lastCheckedAt || null
    }
  };
}

module.exports = { PACKAGING_CAPABILITY_STATE, PACKAGING_CAPABILITY_STATE_LIST, buildPackagingCapability };
