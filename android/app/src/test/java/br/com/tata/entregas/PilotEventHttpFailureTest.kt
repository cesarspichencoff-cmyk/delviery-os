package br.com.tata.entregas

import br.com.tata.entregas.sync.ApiResult
import br.com.tata.entregas.sync.PilotEventFailureDecision
import br.com.tata.entregas.sync.decidePilotEventFailure
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PilotEventHttpFailureTest {
    @Test fun badRequest400RequiresReview() {
        val d = decidePilotEventFailure(ApiResult.Rejected("invalid_command", 400))
        assertTrue(d is PilotEventFailureDecision.ReviewRequired)
        assertEquals("HTTP_400: invalid_command", (d as PilotEventFailureDecision.ReviewRequired).reason)
    }

    @Test fun validation422RequiresReview() {
        val d = decidePilotEventFailure(ApiResult.Rejected("invalid_state", 422))
        assertTrue(d is PilotEventFailureDecision.ReviewRequired)
    }

    @Test fun authErrorStaysRecoverable() {
        assertTrue(decidePilotEventFailure(ApiResult.Unauthorized("session_missing", 401))
            is PilotEventFailureDecision.KeepRetryable)
    }

    @Test fun infrastructureErrorsAreNotDomainRejections() {
        for (status in listOf(403, 404, 409, 410, 413, 415)) {
            assertTrue(decidePilotEventFailure(ApiResult.Rejected("unavailable", status))
                is PilotEventFailureDecision.KeepRetryable)
        }
    }

    @Test fun transientErrorsStayRecoverable() {
        for (status in listOf(408, 429, 503)) {
            assertTrue(decidePilotEventFailure(ApiResult.Retryable("temporary", status))
                is PilotEventFailureDecision.KeepRetryable)
        }
    }

    @Test fun longReasonIsBounded() {
        val d = decidePilotEventFailure(ApiResult.Rejected("x".repeat(500), 400))
        assertTrue(d is PilotEventFailureDecision.ReviewRequired)
        assertEquals(240, (d as PilotEventFailureDecision.ReviewRequired).reason.length)
    }
}
