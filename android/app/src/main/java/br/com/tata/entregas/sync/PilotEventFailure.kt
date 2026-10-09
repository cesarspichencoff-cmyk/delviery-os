package br.com.tata.entregas.sync

internal sealed interface PilotEventFailureDecision {
    data class ReviewRequired(val reason: String) : PilotEventFailureDecision
    data object KeepRetryable : PilotEventFailureDecision
}

internal fun decidePilotEventFailure(error: ApiResult<*>): PilotEventFailureDecision {
    if (error !is ApiResult.Rejected) return PilotEventFailureDecision.KeepRetryable
    if (error.status != 400 && error.status != 422) {
        return PilotEventFailureDecision.KeepRetryable
    }
    val reason = "HTTP_" + error.status + ": " + semSegredo(error.reason)
    return PilotEventFailureDecision.ReviewRequired(reason.take(240))
}
