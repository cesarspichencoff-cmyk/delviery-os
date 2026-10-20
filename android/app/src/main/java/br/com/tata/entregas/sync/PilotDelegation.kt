package br.com.tata.entregas.sync

import org.json.JSONObject

/**
 * Short-lived, pilot-only credential. Never persist it in Room or WebView.
 * The platform device token is sent ONLY to the platform exchange endpoint.
 * The resulting scoped credential is held in memory for one batch attempt.
 */
internal fun classifyPilotDelegation(
    result: ApiResult<JSONObject>,
    expectedActor: String?,
    expectedDevice: String?,
): ApiResult<String> = when (result) {
    is ApiResult.Ok -> {
        val body = result.value
        val token = body.optString("pilot_token", "")
        val chunks = token.split(".")
        val expires = body.optLong("expires_in_s", -1)
        val actor = body.optString("actor_id", "")
        val unit = body.optString("unit_id", "")
        val device = body.optString("device_id", "")
        val audience = body.optString("audience", "")
        when {
            body.optBoolean("ok", false) != true ||
                chunks.size != 3 || chunks[0] != "pt1" ||
                chunks[1].isBlank() || chunks[2].isBlank() ||
                !chunks[1].matches(Regex("[A-Za-z0-9_-]+")) ||
                !chunks[2].matches(Regex("[A-Za-z0-9_-]+")) ||
                expires !in 1L..300L ||
                audience != "deliveryos-pilot-event-write" ||
                actor.isBlank() || device.isBlank() || unit.isBlank() ->
                ApiResult.Retryable("resposta de delegacao invalida")
            expectedActor.isNullOrBlank() || expectedActor != actor ->
                ApiResult.Rejected("ator da delegacao diverge da sessao local", 403)
            expectedDevice.isNullOrBlank() || expectedDevice != device ->
                ApiResult.Rejected("aparelho da delegacao diverge da identidade local", 403)
            else -> ApiResult.Ok(token)
        }
    }
    is ApiResult.Unauthorized -> result
    is ApiResult.Rejected -> result
    is ApiResult.Retryable -> result
}
