package br.com.tata.entregas

import br.com.tata.entregas.sync.ApiResult
import br.com.tata.entregas.sync.sendWithPilotDelegation
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PilotEventDispatchTest {
    @Test fun delegatedRetryOccursOnlyOnceAndPreservesBatch() {
        var exchanges = 0
        val seen = mutableListOf<String>()
        val eventId = "LAB-EVENT-UNCHANGED"
        val correlation = "LAB-CORRELATION-UNCHANGED"
        val outcome = sendWithPilotDelegation(
            exchangeAtPlatform = {
                exchanges++
                ApiResult.Ok(if (exchanges == 1) "pt1.first.sig" else "pt1.second.sig")
            },
            sendToPilot = { token ->
                seen.add("$token:$eventId:$correlation")
                if (seen.size == 1) ApiResult.Unauthorized("expired",401)
                else ApiResult.Ok(JSONObject("""{"ok":true}"""))
            },
        )
        assertTrue(outcome.result is ApiResult.Ok)
        assertTrue(!outcome.platformUnauthorized)
        assertEquals(2, exchanges)
        assertEquals(
            listOf(
                "pt1.first.sig:$eventId:$correlation",
                "pt1.second.sig:$eventId:$correlation",
            ), seen,
        )
    }

    @Test fun repeatedPilot401StopsAfterTwoSends() {
        var exchanges=0
        var sends=0
        val outcome=sendWithPilotDelegation(
            exchangeAtPlatform={ exchanges++; ApiResult.Ok("pt1.test.sig") },
            sendToPilot={ sends++; ApiResult.Unauthorized("pilot_denied",401) },
        )
        assertTrue(outcome.result is ApiResult.Unauthorized)
        assertTrue(!outcome.platformUnauthorized)
        assertEquals(2,exchanges)
        assertEquals(2,sends)
    }

    @Test fun platform401NeverContactsPilot() {
        var sends=0
        val outcome=sendWithPilotDelegation(
            exchangeAtPlatform={ApiResult.Unauthorized("platform_expired",401)},
            sendToPilot={ sends++; ApiResult.Ok(JSONObject()) },
        )
        assertTrue(outcome.platformUnauthorized)
        assertEquals(0,sends)
    }

    @Test fun registry503NeverContactsPilot() {
        var sends=0
        val outcome=sendWithPilotDelegation(
            exchangeAtPlatform={ApiResult.Retryable("registry_unavailable",503)},
            sendToPilot={ sends++; ApiResult.Ok(JSONObject()) },
        )
        assertTrue(outcome.result is ApiResult.Retryable)
        assertEquals(0,sends)
    }

    @Test fun secondExchange403DeniesWithoutThirdAttempt() {
        var exchanges=0
        var sends=0
        val outcome=sendWithPilotDelegation(
            exchangeAtPlatform={
                exchanges++
                if(exchanges == 1) ApiResult.Ok("pt1.first.sig")
                else ApiResult.Rejected("device_revoked",403)
            },
            sendToPilot={ sends++; ApiResult.Unauthorized("pilot_denied",401) },
        )
        assertTrue(outcome.result is ApiResult.Rejected)
        assertEquals(2,exchanges)
        assertEquals(1,sends)
    }
}
