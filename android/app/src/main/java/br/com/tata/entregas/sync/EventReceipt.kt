package br.com.tata.entregas.sync

import org.json.JSONObject

/** O contrato real do piloto devolve um resultado por event_id, mesmo com HTTP 200. */
internal data class EventReceiptItem(val eventId: String)
internal data class EventReceiptRejected(val eventId: String, val reason: String)

internal sealed interface EventReceiptDecision {
    data class Apply(
        val sentIds: List<String>,
        val rejected: List<EventReceiptRejected>,
    ) : EventReceiptDecision
    data class Invalid(val reason: String) : EventReceiptDecision
}

/**
 * Nunca usar HTTP 200 como prova de aceite de todos os comandos.
 *
 * Recibo incompleto, duplicado, desconhecido ou com tipos alterados => inválido
 * e TODO o lote permanece reprocessável. Só aplicar IDs explicitamente aceitos;
 * rejeições explícitas do domínio ficam locais para revisão, sem loop de retry.
 */
internal fun decideEventReceipt(
    items: List<EventReceiptItem>,
    response: JSONObject,
): EventReceiptDecision {
    if (response.opt("ok") != true) {
        return EventReceiptDecision.Invalid("lote_sem_ok")
    }
    val results = response.optJSONArray("results")
        ?: return EventReceiptDecision.Invalid("resultados_ausentes")
    if (results.length() != items.size) {
        return EventReceiptDecision.Invalid("quantidade_incompativel")
    }
    val ids = items.map { it.eventId }
    if (ids.size != ids.toSet().size || ids.any { it.isBlank() }) {
        return EventReceiptDecision.Invalid("ids_locais_invalidos")
    }
    val expected = ids.toSet()
    val decisions = mutableMapOf<String, Boolean>()
    val reasons = mutableMapOf<String, String>()
    for (i in 0 until results.length()) {
        val result = results.optJSONObject(i)
            ?: return EventReceiptDecision.Invalid("resultado_invalido")
        val id = result.opt("event_id") as? String
            ?: return EventReceiptDecision.Invalid("id_resultado_invalido")
        if (id !in expected) {
            return EventReceiptDecision.Invalid("id_desconhecido")
        }
        if (id in decisions) {
            return EventReceiptDecision.Invalid("id_repetido")
        }
        val ok = result.opt("ok") as? Boolean
            ?: return EventReceiptDecision.Invalid("aceite_sem_booleano")
        decisions[id] = ok
        if (!ok) {
            val error = (result.opt("error") as? String).orEmpty()
            reasons[id] = semSegredo(error).ifBlank { "recusa_sem_motivo" }.take(240)
        }
    }
    if (decisions.size != ids.size) {
        return EventReceiptDecision.Invalid("ids_ausentes")
    }
    return EventReceiptDecision.Apply(
        sentIds = ids.filter { decisions[it] == true },
        rejected = ids.filter { decisions[it] == false }
            .map { EventReceiptRejected(it, reasons[it] ?: "recusa_sem_motivo") },
    )
}
