package br.com.tata.entregas.sync

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import javax.net.ssl.HttpsURLConnection

/**
 * Cliente do servidor do piloto.
 *
 * Erro é ESTRUTURADO, nunca exceção solta: quem chama precisa distinguir
 * "não deu para falar agora" (tenta de novo) de "o servidor recusou" (não
 * adianta insistir), e um `catch (e: Exception)` genérico apagaria isso.
 *
 * Nenhuma coordenada é escrita em log por este arquivo.
 */
sealed class ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>()
    /** Falha temporária: rede, timeout, 5xx. Vale retentar. */
    data class Retryable(val reason: String, val status: Int? = null) : ApiResult<Nothing>()
    /** Recusa definitiva: 4xx. Retentar só repete o erro. */
    data class Rejected(val reason: String, val status: Int) : ApiResult<Nothing>()
}

class EntregasApi(
    private val baseUrl: String,
    private val tokenProvider: () -> String?,
    private val timeoutMs: Int = 15_000,
) {

    companion object {
        const val CLIENT_SCHEMA_VERSION = "android-client@1.0.0"
    }

    private fun open(path: String, method: String): HttpURLConnection {
        val conn = URL("$baseUrl$path").openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.connectTimeout = timeoutMs
        conn.readTimeout = timeoutMs
        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        conn.setRequestProperty("X-Entregas-Client", CLIENT_SCHEMA_VERSION)
        tokenProvider()?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
        if (conn is HttpsURLConnection) {
            // Sem hostname verifier customizado e sem trust-all: o certificado
            // de desenvolvimento é aceito via network_security_config no build
            // debug, e não desativando a verificação em código.
            conn.instanceFollowRedirects = false
        }
        return conn
    }

    private fun request(path: String, method: String, body: JSONObject?): ApiResult<JSONObject> {
        return try {
            val conn = open(path, method)
            if (body != null) {
                conn.doOutput = true
                conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            conn.disconnect()

            when {
                status in 200..299 -> ApiResult.Ok(
                    if (text.isBlank()) JSONObject() else JSONObject(text),
                )
                status in 400..499 -> ApiResult.Rejected(
                    runCatching { JSONObject(text).optString("human", text) }.getOrDefault(text),
                    status,
                )
                else -> ApiResult.Retryable("servidor respondeu $status", status)
            }
        } catch (e: java.io.IOException) {
            // Rede caiu, servidor fora, TLS não negociou. Tudo retentável.
            ApiResult.Retryable(e.javaClass.simpleName)
        } catch (e: org.json.JSONException) {
            ApiResult.Rejected("resposta inesperada do servidor", 0)
        }
    }

    /** Autentica o aparelho e devolve o contexto do motoboy. */
    fun authenticateDevice(deviceId: String, appVersion: String): ApiResult<JSONObject> =
        request(
            "/api/device/session",
            "POST",
            JSONObject().apply {
                put("device_id", deviceId)
                put("app_version", appVersion)
                put("client", CLIENT_SCHEMA_VERSION)
            },
        )

    /** Flags, política de captura, termo vigente e unidade. */
    fun policies(): ApiResult<JSONObject> = request("/api/policies", "GET", null)

    fun health(): ApiResult<JSONObject> = request("/api/health", "GET", null)

    /**
     * Envia um lote de pontos. O servidor deduplica por `idempotency_key`;
     * mandar duas vezes é seguro por construção.
     */
    fun sendPoints(points: List<JSONObject>, correlationId: String): ApiResult<JSONObject> =
        request(
            "/api/gps/batch",
            "POST",
            JSONObject().apply {
                put("schema_version", CLIENT_SCHEMA_VERSION)
                put("correlation_id", correlationId)
                put("points", JSONArray(points))
            },
        )

    /** Envia comandos operacionais para o domínio julgar. */
    fun sendEvents(events: List<JSONObject>, correlationId: String): ApiResult<JSONObject> =
        request(
            "/api/events/batch",
            "POST",
            JSONObject().apply {
                put("schema_version", CLIENT_SCHEMA_VERSION)
                put("correlation_id", correlationId)
                put("events", JSONArray(events))
            },
        )

    fun sendTermAcknowledgement(ack: JSONObject): ApiResult<JSONObject> =
        request("/api/term/acknowledge", "POST", ack)
}
