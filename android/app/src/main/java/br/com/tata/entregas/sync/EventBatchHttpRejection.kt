package br.com.tata.entregas.sync

/**
 * No HTTP 4xx de lote nao existe recibo por event_id confirmando commit,
 * recusa individual ou ausencia de efeito. Preserve a mesma identidade Room.
 * Apenas um recibo individual validado pode marcar sent/rejected.
 *
 * Decisao local e pura: nao inspeciona payload, nao acessa rede e nunca
 * invalida a credencial da plataforma por recusa do servidor PILOTO.
 */
internal enum class EventBatchHttpRejectionHold {
    PILOT_AUTHORIZATION_BLOCKED,
    UNATTESTED_BATCH_REJECTION,
}

internal fun classifyEventBatchHttpRejection(
    httpStatus: Int,
    delegationDenied: Boolean,
): EventBatchHttpRejectionHold = when {
    httpStatus == 403 || delegationDenied ->
        EventBatchHttpRejectionHold.PILOT_AUTHORIZATION_BLOCKED
    else -> EventBatchHttpRejectionHold.UNATTESTED_BATCH_REJECTION
}
