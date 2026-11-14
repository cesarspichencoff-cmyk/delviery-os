package br.com.tata.entregas.sync

import br.com.tata.entregas.data.EntregasDatabase

/**
 * Vincula a politica de 4xx ao DAO REAL, sem recibo inventado.
 *
 * Uma resposta HTTP ao lote inteiro nao comprova o resultado de cada event_id.
 * Preservamos os mesmos IDs/keys/payload no Room para reconciliacao e reenvio.
 * A transicao terminal continua exclusiva de decideEventReceipt com recibo
 * individual validado.
 */
internal suspend fun retainUnreceiptedEventBatch(
    db: EntregasDatabase,
    eventIds: List<String>,
    rejection: ApiResult.Rejected,
    delegationDenied: Boolean,
): EventBatchHttpRejectionHold {
    // Falhar SEM escrever quando o proprio lote local estiver ambiguo.
    require(eventIds.isNotEmpty() && eventIds.all { it.isNotBlank() } &&
        eventIds.size == eventIds.toSet().size) { "EVENT_BATCH_LOCAL_IDS_INVALID" }

    // O DAO usa UPDATE condicional. Nem timeout tardio pode reviver
    // 'sent'/'rejected'; o payload e a idempotencyKey nao sao reescritos.
    db.outbox().markFailed(eventIds, rejection.reason)
    return classifyEventBatchHttpRejection(
        httpStatus = rejection.status,
        delegationDenied = delegationDenied,
    )
}
