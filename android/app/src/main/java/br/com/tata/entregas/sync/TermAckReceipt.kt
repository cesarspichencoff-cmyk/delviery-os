package br.com.tata.entregas.sync

import br.com.tata.entregas.data.TermAckEntity
import org.json.JSONObject

/**
 * HTTP 2xx is not proof that the PILOT stored THIS rider's term acknowledgement.
 *
 * The pilot's response includes an immutable acknowledgement_id and a receipt
 * bound to unit, term material, device and the effective acceptance/decline.
 * Local Room data remains pending when the response is missing or inconsistent.
 *
 * No network call, state change, credential, device location or log output here.
 */
internal fun confirmsTermAckOnPilot(ack: TermAckEntity, response: JSONObject): Boolean {
    if (response.opt("ok") != true) return false
    if (ack.status !in setOf("accepted", "declined")) return false
    if (listOf(
            ack.acknowledgementId, ack.riderId, ack.deviceId, ack.unitId,
            ack.termVersion, ack.termHash,
        ).any { it.isBlank() }
    ) return false
    if (response.optString("acknowledgement_id") != ack.acknowledgementId) return false

    // The server sends the stored record, not necessarily the attempted write.
    // When idempotency returns stored=false, only the ORIGINAL record is authority.
    val receipt = response.optJSONObject("receipt") ?: return false
    if (receipt.optString("recibo") != ack.acknowledgementId ||
        receipt.optString("unidade") != ack.unitId ||
        receipt.optString("versao_do_termo") != ack.termVersion ||
        receipt.optString("impressao_do_texto") != ack.termHash ||
        receipt.optString("aparelho") != ack.deviceId ||
        receipt.optString("situacao") != (if (ack.status == "accepted") "aceito" else "recusado")
    ) return false

    // The newer route also returns the record. Check it when present, but the
    // older authorized route legitimately returns only the receipt.
    val stored = response.opt("record")
    if (stored != null && stored !== JSONObject.NULL) {
        val record = response.optJSONObject("record") ?: return false
        if (record.optString("acknowledgement_id") != ack.acknowledgementId ||
            record.optString("rider_id") != ack.riderId ||
            record.optString("unit_id") != ack.unitId ||
            record.optString("device_id") != ack.deviceId ||
            record.optString("term_hash") != ack.termHash ||
            record.optString("status") != ack.status
        ) return false
    }

    return true
}


/**
 * The same receipt-to-Room transition used by SyncWorker and local HTTP QA.
 *
 * Never promote a term acknowledgement from HTTP status alone. In particular,
 * 200 without a matching receipt, 401, 422, and transport ambiguity preserve
 * the original append-only local acknowledgement for later reconciliation.
 */
internal suspend fun persistTermAckOnVerifiedReceipt(
    db: br.com.tata.entregas.data.EntregasDatabase,
    ack: TermAckEntity,
    response: ApiResult<JSONObject>,
): Boolean {
    val body = (response as? ApiResult.Ok)?.value ?: return false
    if (!confirmsTermAckOnPilot(ack, body)) return false
    db.termAcks().markSent(listOf(ack.acknowledgementId))
    return true
}
