package br.com.tata.entregas.sync

internal data class GpsReceiptItem(
    val pointId: String,
    val idempotencyKey: String,
)

internal data class GpsReceiptRejection(
    val idempotencyKey: String,
    val reason: String,
)

internal data class GpsRejectedPoint(
    val pointId: String,
    val reason: String,
)

internal sealed interface GpsReceiptDecision {
    data class Apply(
        val sentIds: List<String>,
        val rejected: List<GpsRejectedPoint>,
    ) : GpsReceiptDecision

    data class Invalid(val reason: String) : GpsReceiptDecision
}

internal fun decideGpsReceipt(
    items: List<GpsReceiptItem>,
    accepted: Int,
    duplicate: Int,
    rejected: Int,
    rejections: List<GpsReceiptRejection>,
): GpsReceiptDecision {
    if (accepted < 0 || duplicate < 0 || rejected < 0) {
        return GpsReceiptDecision.Invalid("contagens_ausentes")
    }
    if (accepted + duplicate + rejected != items.size) {
        return GpsReceiptDecision.Invalid("contagens_nao_fecham")
    }
    if (rejected != rejections.size) {
        return GpsReceiptDecision.Invalid("rejeicoes_nao_fecham")
    }

    val byKey = items.associateBy { it.idempotencyKey }
    if (byKey.size != items.size) {
        return GpsReceiptDecision.Invalid("chave_local_duplicada")
    }

    val seen = mutableSetOf<String>()
    val rejectedPoints = mutableListOf<GpsRejectedPoint>()
    for (r in rejections) {
        if (!seen.add(r.idempotencyKey)) {
            return GpsReceiptDecision.Invalid("rejeicao_duplicada")
        }
        val item = byKey[r.idempotencyKey]
            ?: return GpsReceiptDecision.Invalid("rejeicao_de_item_desconhecido")
        rejectedPoints += GpsRejectedPoint(
            pointId = item.pointId,
            reason = r.reason.ifBlank { "recusa_sem_motivo" }.take(240),
        )
    }

    val sentIds = items
        .filterNot { seen.contains(it.idempotencyKey) }
        .map { it.pointId }

    return GpsReceiptDecision.Apply(sentIds, rejectedPoints)
}
