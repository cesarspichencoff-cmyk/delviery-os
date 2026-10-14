package br.com.tata.entregas.sync

import org.json.JSONObject

/** Platform session and pilot write credential have separate audiences. */
internal data class PilotEventDispatchOutcome(
    val result: ApiResult<JSONObject>,
    /** Only a PLATFORM 401 permits renewing the platform device session. */
    val platformUnauthorized: Boolean,
    /** A delegation policy 403 is NOT an accepted batch. */
    val delegationDenied: Boolean = false,
)

/**
 * A pilot 401 permits a single exchange+retry, never an infinite loop.
 * Caller owns the immutable batch: replays keep the same idempotency keys.
 * Tokens are ephemeral, never stored in Room, preferences or WebView.
 */
internal fun sendWithPilotDelegation(
    exchangeAtPlatform: () -> ApiResult<String>,
    sendToPilot: (String) -> ApiResult<JSONObject>,
): PilotEventDispatchOutcome {
    fun dispatch(access: ApiResult<String>): PilotEventDispatchOutcome = when (access) {
        is ApiResult.Ok -> PilotEventDispatchOutcome(sendToPilot(access.value), false)
        is ApiResult.Unauthorized -> PilotEventDispatchOutcome(access, true)
        is ApiResult.Retryable -> PilotEventDispatchOutcome(access, false)
        is ApiResult.Rejected -> PilotEventDispatchOutcome(access, false, true)
    }
    val first = dispatch(exchangeAtPlatform())
    if (first.result !is ApiResult.Unauthorized || first.platformUnauthorized) return first
    // The pilot rejected the first scoped token. Exactly one new exchange.
    return dispatch(exchangeAtPlatform())
}
