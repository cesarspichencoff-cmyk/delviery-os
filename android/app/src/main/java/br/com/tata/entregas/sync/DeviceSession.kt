package br.com.tata.entregas.sync

import br.com.tata.entregas.data.DeviceStateEntity
import br.com.tata.entregas.data.EntregasDatabase
import org.json.JSONObject

/**
 * Credencial do aparelho: obter, guardar, usar, limpar.
 *
 * Antes disto, `KEY_SESSION_TOKEN` era declarada e lida e **nunca escrita**.
 * `tokenProvider()` devolvia `null`, o header `Authorization` não ia, e todo
 * envio recebia 401 — que o `SyncWorker` classificava como rejeição definitiva.
 * O motoboy via o app funcionando, o GPS capturando, e nada chegava. Em
 * silêncio, para sempre.
 *
 * Duas regras que este objeto existe para garantir:
 *
 *  1. **falha de credencial nunca apaga dado de campo.** Um ponto de GPS é
 *     insubstituível; um token se pede de novo;
 *  2. **renovar antes de vencer.** Esperar o token expirar deixa o aparelho sem
 *     credencial no meio da rua, que é exatamente onde não dá para resolver.
 */
object DeviceSession {

    /** Renova com folga, para não vencer em campo. */
    private const val FOLGA_DE_RENOVACAO_MS = 60L * 60L * 1000L

    /** Quando o token vence, em epoch ms. Guardado junto para não precisar decodificá-lo. */
    const val KEY_TOKEN_EXPIRA_EM = "session_token_expires_at"

    /** Aparelho revogado pelo servidor. Enquanto verdadeiro, não se tenta mais. */
    const val KEY_REVOGADO_EM = "device_revoked_at"

    data class Sessao(val token: String, val expiraEmMs: Long)

    /* -------------------------------------------------------------- */

    suspend fun sessaoAtual(db: EntregasDatabase): Sessao? {
        val token = db.deviceState().get(EntregasDatabase.KEY_SESSION_TOKEN) ?: return null
        if (token.isBlank()) return null
        val expira = db.deviceState().get(KEY_TOKEN_EXPIRA_EM)?.toLongOrNull() ?: 0L
        return Sessao(token, expira)
    }

    suspend fun estaRevogado(db: EntregasDatabase): Boolean =
        db.deviceState().get(KEY_REVOGADO_EM) != null

    /**
     * Precisa autenticar?
     *
     * Sim quando não há token, e sim quando ele está perto de vencer. O
     * `agoraMs` é parâmetro para o teste conseguir andar no tempo sem esperar.
     */
    fun precisaAutenticar(sessao: Sessao?, agoraMs: Long): Boolean {
        if (sessao == null) return true
        return agoraMs >= sessao.expiraEmMs - FOLGA_DE_RENOVACAO_MS
    }

    /* -------------------------------------------------------------- */

    /**
     * Autentica e persiste.
     *
     * Idempotente: chamar duas vezes com o mesmo aparelho produz a mesma
     * associação. O servidor decide a identidade a partir do `device_id`, e não
     * de nada que a tela tenha informado — a interface nunca é fonte de
     * autenticação.
     */
    suspend fun autenticar(
        db: EntregasDatabase,
        api: EntregasApi,
        deviceId: String,
        appVersion: String,
        agoraMs: Long,
    ): ResultadoAutenticacao {
        return when (val r = api.authenticateDevice(deviceId, appVersion)) {
            is ApiResult.Ok -> {
                val token = r.value.optString("device_token", "")
                if (token.isBlank()) {
                    // Servidor respondeu 200 sem credencial. Não é sucesso, e
                    // tratar como tal deixaria o aparelho num laço de tentativas
                    // que sempre "dão certo" e nunca autenticam.
                    ResultadoAutenticacao.FalhouTemporariamente("resposta sem device_token")
                } else {
                    val validadeS = r.value.optLong("expires_in_s", 0L)
                    val expiraEm =
                        if (validadeS > 0) agoraMs + validadeS * 1000L
                        else r.value.optString("expires_at").let { iso ->
                            runCatching { java.time.Instant.parse(iso).toEpochMilli() }.getOrDefault(0L)
                        }
                    gravar(db, token, expiraEm, agoraMs)
                    ResultadoAutenticacao.Autenticado
                }
            }

            is ApiResult.Unauthorized ->
                // Autenticar recebendo 401 significa que a credencial HUMANA que
                // autoriza a emissão não vale. Não é o aparelho que está errado,
                // e insistir não resolve.
                ResultadoAutenticacao.PrecisaDeHumano(r.reason)

            is ApiResult.Rejected -> {
                if (r.status == 403) {
                    marcarRevogado(db, agoraMs)
                    ResultadoAutenticacao.Revogado(r.reason)
                } else {
                    ResultadoAutenticacao.PrecisaDeHumano(r.reason)
                }
            }

            is ApiResult.Retryable -> ResultadoAutenticacao.FalhouTemporariamente(r.reason)
        }
    }

    sealed class ResultadoAutenticacao {
        object Autenticado : ResultadoAutenticacao()
        /** Rede, servidor fora, timeout. Tentar de novo depois resolve. */
        data class FalhouTemporariamente(val motivo: String) : ResultadoAutenticacao()
        /** Aparelho revogado. Para de tentar; os dados locais FICAM. */
        data class Revogado(val motivo: String) : ResultadoAutenticacao()
        /** Exige alguém: cadastro, autorização, configuração. */
        data class PrecisaDeHumano(val motivo: String) : ResultadoAutenticacao()
    }

    /* -------------------------------------------------------------- */

    private suspend fun gravar(db: EntregasDatabase, token: String, expiraEmMs: Long, agoraMs: Long) {
        db.deviceState().put(DeviceStateEntity(EntregasDatabase.KEY_SESSION_TOKEN, token, agoraMs))
        db.deviceState().put(DeviceStateEntity(KEY_TOKEN_EXPIRA_EM, expiraEmMs.toString(), agoraMs))
        db.deviceState().clear(KEY_REVOGADO_EM)
    }

    private suspend fun marcarRevogado(db: EntregasDatabase, agoraMs: Long) {
        db.deviceState().put(DeviceStateEntity(KEY_REVOGADO_EM, agoraMs.toString(), agoraMs))
        limparCredencial(db)
    }

    /**
     * Apaga a credencial — e SOMENTE a credencial.
     *
     * Nada aqui toca `gps_point`, `outbox_event` ou `term_ack`. É a diferença
     * entre "perdi o crachá" e "perdi o trabalho do dia": a fila local
     * sobrevive à revogação, e volta a sincronizar se o aparelho for
     * reautorizado.
     */
    suspend fun limparCredencial(db: EntregasDatabase) {
        db.deviceState().clear(EntregasDatabase.KEY_SESSION_TOKEN)
        db.deviceState().clear(KEY_TOKEN_EXPIRA_EM)
    }

    /** Troca de usuário ou logout: some a credencial e a identidade do motoboy. */
    suspend fun encerrarSessaoHumana(db: EntregasDatabase) {
        limparCredencial(db)
        db.deviceState().clear(EntregasDatabase.KEY_RIDER_ID)
    }

    /* -------------------------------------------------------------- */

    /**
     * Texto seguro para log ou mensagem de erro.
     *
     * O vazamento comum não é alguém logar o token de propósito: é o token vir
     * dentro do corpo de uma resposta de erro repassada inteira.
     */
    fun semSegredo(texto: String): String =
        texto
            .replace(Regex("""[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}"""), "[token removido]")
            .replace(Regex("""(?i)(bearer\s+)\S+"""), "$1[removido]")
            .replace(
                Regex("""(?i)("?(?:token|authorization|secret|senha|password)"?\s*[:=]\s*"?)[^",;\s}]+"""),
                "$1[removido]",
            )

    /** Só para o teste montar uma resposta de servidor sem depender de rede. */
    fun respostaDeTeste(token: String, validadeS: Long): JSONObject =
        JSONObject().apply {
            put("device_token", token)
            put("expires_in_s", validadeS)
        }
}
