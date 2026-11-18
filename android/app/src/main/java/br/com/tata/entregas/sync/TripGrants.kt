package br.com.tata.entregas.sync

import br.com.tata.entregas.data.DeviceStateEntity
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.GpsPointEntity
import org.json.JSONObject
import java.time.Instant

/**
 * Concessão de captura por viagem (X1).
 *
 * O piloto, dono da viagem, a entrega só para a viagem do motoboy vinculado a
 * este aparelho: na consulta de estado de captura que o serviço de localização
 * já faz, e — para a fila de GPS — numa rota própria autenticada pela credencial
 * delegada ao piloto (pt1). O token da plataforma nunca vai ao piloto por aqui.
 * A plataforma só grava GPS de viagem com concessão. O aparelho só guarda e
 * anexa: não decide nada, e não fabrica concessão.
 *
 * Guardada no estado do aparelho, por viagem: sobrevive à morte do processo, e
 * é ela que deixa subir a fila offline depois de a viagem acabar.
 */
internal object TripGrants {
    private const val PREFIX = "trip_grant:"
    /** Mesma folga de borda que a plataforma aplica. */
    private const val EDGE_SLACK_S = 120L

    fun grantIn(body: JSONObject): String? {
        if (!body.has("trip_grant") || body.isNull("trip_grant")) return null
        return valid(body.optString("trip_grant", ""))
    }

    private fun valid(g: String?): String? =
        if (g != null && g.startsWith("tg1.") && g.length in 16..2048 && g.count { it == '.' } == 2) g else null

    suspend fun save(db: EntregasDatabase, tripId: String, grant: String, nowMs: Long = System.currentTimeMillis()) {
        db.deviceState().put(DeviceStateEntity(PREFIX + tripId, grant, nowMs))
    }

    suspend fun load(db: EntregasDatabase, tripId: String): String? =
        valid(db.deviceState().get(PREFIX + tripId))

    /** Janela legível da concessão. A assinatura é da plataforma conferir, não daqui. */
    internal data class Window(val startS: Long, val endS: Long)

    internal fun windowOf(grant: String): Window? = try {
        val body = grant.split(".")[1]
        val json = JSONObject(String(java.util.Base64.getUrlDecoder().decode(body), Charsets.UTF_8))
        Window(json.getLong("window_start"), json.getLong("window_end"))
    } catch (_: Exception) {
        null
    }

    /**
     * A plataforma aceitaria este ponto com esta concessão? Mesma regra dela:
     * captado dentro da janela, ou chegando enquanto a janela está aberta.
     */
    internal fun covers(window: Window, point: GpsPointEntity, nowMs: Long): Boolean {
        fun inside(s: Long) = s >= window.startS - EDGE_SLACK_S && s <= window.endS + EDGE_SLACK_S
        val occurred = try { Instant.parse(point.occurredAt).epochSecond } catch (_: Exception) { null }
        return (occurred != null && inside(occurred)) || inside(nowMs / 1000)
    }

    sealed class Plan {
        /** Pode enviar: estas são as concessões do lote. */
        data class Send(val grants: List<String>) : Plan()
        /** Esperar: há ponto que só uma concessão nova cobriria, e o piloto não respondeu. */
        data class Hold(val reason: String) : Plan()
    }

    /**
     * Concessões para um lote. Usa a guardada quando ela cobre todos os pontos da
     * viagem; senão pede a mais nova ao piloto. Sem resposta do piloto, o lote
     * espera — nenhum ponto vira recusa definitiva porque a rede caiu. Viagem que
     * o piloto diz NÃO ser deste motoboy segue sem concessão: a plataforma recusa
     * esses pontos, como deve.
     */
    suspend fun plan(
        db: EntregasDatabase,
        batch: List<GpsPointEntity>,
        nowMs: Long,
        askPilot: suspend (List<String>) -> ApiResult<JSONObject>,
    ): Plan {
        val byTrip = batch.groupBy { it.tripId }
        val grants = mutableMapOf<String, String>()
        val missing = mutableListOf<String>()
        for ((trip, points) in byTrip) {
            val stored = load(db, trip)
            val window = stored?.let { windowOf(it) }
            if (stored != null && window != null && points.all { covers(window, it, nowMs) }) grants[trip] = stored
            else missing += trip
        }
        if (missing.isNotEmpty()) {
            when (val r = askPilot(missing)) {
                is ApiResult.Ok -> {
                    val answered = r.value.optJSONObject("grants") ?: return Plan.Hold("concessao_resposta_invalida")
                    for (trip in missing) {
                        if (!answered.has(trip)) return Plan.Hold("concessao_sem_resposta_para_viagem")
                        val fresh = if (answered.isNull(trip)) null else valid(answered.optString(trip, ""))
                        if (fresh != null) {
                            save(db, trip, fresh, nowMs)
                            grants[trip] = fresh
                        }
                        // null: o piloto disse que a viagem não é deste motoboy neste aparelho.
                    }
                }
                else -> return Plan.Hold("concessao_de_viagem_indisponivel")
            }
        }
        return Plan.Send(grants.values.toList())
    }
}
