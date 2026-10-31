package br.com.tata.entregas.sync

import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.OutboxEventEntity
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/**
 * Produtor da fila `outbox_event` (C5): a ação do motoboy entra primeiro no
 * Room, com identidade estável, e o SyncWorker a envia ao piloto com recibo
 * por evento. Antes disto a tabela não tinha produtor e, sem rede, a
 * confirmação na porta do cliente se perdia.
 *
 * O Kotlin não decide se a transição vale — quem julga é o domínio no
 * servidor. Aqui só se recusa o que não poderia ser enviado: tipo fora das
 * ações do motoboy, identidade fora do contrato do lote, viagem ou parada
 * ausente, horário ilegível, corpo grande demais.
 */
internal object OperationalEventRecorder {

    /** As ações que a rider-mobile emite. Montar, mudar ou encerrar viagem não sai do celular. */
    val RIDER_COMMANDS: Set<String> = setOf(
        "ConfirmTripDeparture",
        "RecordArrivalReported",
        "ConfirmDelivery",
        "RecordCustomerNotFound",
        "CreateOccurrence",
    )
    private val COM_PARADA = setOf("RecordArrivalReported", "ConfirmDelivery", "RecordCustomerNotFound")
    private val ID = Regex("^[A-Za-z0-9_-]{1,128}$")
    const val MAX_COMMAND_BYTES = 4096

    sealed interface Result {
        data class Recorded(val eventId: String, val duplicate: Boolean) : Result
        data class Refused(val reason: String) : Result
    }

    /** Texto de uma chave; ausente, JSON null ou não-texto = null (optString devolveria "null"). */
    private fun text(o: JSONObject, key: String): String? =
        if (!o.has(key) || o.isNull(key)) null else (o.opt(key) as? String)?.takeIf { it.isNotBlank() }

    /** Valida e monta a linha do Room, ainda sem sequência. */
    internal fun parse(json: String, nowMs: Long): Pair<OutboxEventEntity?, String?> {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return null to "json_invalido"
        val eventId = text(o, "event_id")?.takeIf { ID.matches(it) } ?: return null to "event_id_invalido"
        val key = (text(o, "idempotency_key") ?: eventId).takeIf { ID.matches(it) }
            ?: return null to "idempotency_key_invalida"
        val command = o.optJSONObject("command") ?: return null to "comando_ausente"
        val type = text(command, "type") ?: return null to "tipo_ausente"
        if (type !in RIDER_COMMANDS) return null to "tipo_nao_permitido"
        text(command, "command_id")?.takeIf { ID.matches(it) } ?: return null to "command_id_invalido"
        val occurredAt = text(command, "occurred_at") ?: return null to "horario_ausente"
        if (runCatching { Instant.parse(occurredAt) }.isFailure) return null to "horario_invalido"
        val tripId: String?
        if (type == "CreateOccurrence") {
            text(command, "occurrence_id")?.takeIf { ID.matches(it) } ?: return null to "ocorrencia_invalida"
            tripId = text(command, "related_trip_id")
        } else {
            tripId = text(command, "trip_id") ?: return null to "viagem_ausente"
            if (type in COM_PARADA && text(command, "delivery_id") == null) return null to "parada_ausente"
        }
        if (tripId != null && tripId.length > 128) return null to "viagem_invalida"
        val payload = command.toString()
        if (payload.toByteArray(Charsets.UTF_8).size > MAX_COMMAND_BYTES) return null to "comando_grande_demais"
        return OutboxEventEntity(
            eventId = eventId,
            idempotencyKey = key,
            tripId = tripId,
            kind = type,
            payload = payload,
            occurredAt = occurredAt,
            sequenceLocal = 0L,
            syncState = "pending",
            attempts = 0,
            lastError = null,
            createdAtMs = nowMs,
        ) to null
    }

    suspend fun record(db: EntregasDatabase, json: String, nowMs: Long): Result {
        val (entity, reason) = parse(json, nowMs)
        if (entity == null) return Result.Refused(reason ?: "evento_invalido")
        val inserted = db.insertOutboxSequenced(entity)
        // Mesmo event_id = mesma intenção: a primeira gravação prevalece.
        return Result.Recorded(entity.eventId, duplicate = inserted == -1L)
    }

    fun toJson(r: Result): String = when (r) {
        is Result.Recorded -> JSONObject()
            .put("ok", true)
            .put("event_id", r.eventId)
            .put("duplicate", r.duplicate)
            .put("state", "pending")
            .toString()
        is Result.Refused -> JSONObject().put("ok", false).put("error", r.reason).toString()
    }

    /** O que está guardado, sem o corpo do comando: só o que a página precisa mostrar. */
    suspend fun recentJson(db: EntregasDatabase, limit: Int = 50): String {
        val out = JSONArray()
        for (e in db.outbox().recent(limit)) {
            val deliveryId = runCatching { JSONObject(e.payload) }.getOrNull()?.let { text(it, "delivery_id") }
            out.put(
                JSONObject()
                    .put("event_id", e.eventId)
                    .put("kind", e.kind)
                    .put("trip_id", e.tripId ?: JSONObject.NULL)
                    .put("delivery_id", deliveryId ?: JSONObject.NULL)
                    .put("state", e.syncState)
                    .put("attempts", e.attempts)
                    .put("last_error", e.lastError ?: JSONObject.NULL)
                    .put("sequence_local", e.sequenceLocal),
            )
        }
        return out.toString()
    }
}
