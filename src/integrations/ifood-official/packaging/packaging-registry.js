/* ============================================================================
 * Registro de capacidade de embalagem — persiste o que se SABE, com
 * evidência, sobre suporte do iFood a contagem de sacolas/volumes por
 * merchant. Estado padrão é `unknown`; nunca afirma suporte sem evidência
 * (contracts/packaging.js já recusa a escrita nesse caso).
 * ==========================================================================*/
"use strict";

const { buildPackagingCapability, PACKAGING_CAPABILITY_STATE } = require("../contracts/packaging");

function createPackagingRegistry(store) {
  function register(raw) {
    const built = buildPackagingCapability(raw);
    if (!built.ok) return built;
    const putRes = store.put("ifood_packaging_capabilities", built.capability_record);
    return { ok: putRes.ok, record: built.capability_record, put: putRes };
  }

  /** Consulta — se nada foi registrado ainda, o padrão é UNKNOWN (nunca inventa suporte). */
  function get(merchantId, capability) {
    const key = `${merchantId}|${capability}`;
    const existing = store.get("ifood_packaging_capabilities", key);
    if (existing) return existing;
    return { merchant_id: merchantId, capability, state: PACKAGING_CAPABILITY_STATE.UNKNOWN, evidence_refs: [], last_checked_at: null };
  }

  function all() { return store.all("ifood_packaging_capabilities"); }

  return { register, get, all, PACKAGING_CAPABILITY_STATE };
}

module.exports = { createPackagingRegistry };
