package br.com.tata.entregas

import br.com.tata.entregas.sync.ApiResult
import br.com.tata.entregas.sync.classifyPilotDelegation
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PilotDelegationTest {
    private fun response(
        token: String = "pt1.cGF5bG9hZA.c2lnbmF0dXJl",
        actor: String = "LAB-RIDER",
        device: String = "LAB-DEVICE",
        expires: Long = 180,
        audience: String = "deliveryos-pilot-event-write",
    ): ApiResult<JSONObject> = ApiResult.Ok(JSONObject().apply {
        put("ok", true)
        put("pilot_token", token)
        put("expires_in_s", expires)
        put("actor_id", actor)
        put("unit_id", "LAB-UNIT")
        put("device_id", device)
        put("audience", audience)
    })

    @Test fun validScopedTokenAcceptedOnlyInMemory() {
        val result = classifyPilotDelegation(response(), "LAB-RIDER", "LAB-DEVICE")
        assertTrue(result is ApiResult.Ok)
        assertTrue((result as ApiResult.Ok).value.startsWith("pt1."))
    }

    @Test fun wrongActorNeverGrantsPilotAuthority() {
        assertTrue(classifyPilotDelegation(response(actor="LAB-MANAGER"),"LAB-RIDER","LAB-DEVICE") is ApiResult.Rejected)
        assertTrue(classifyPilotDelegation(response(),null,"LAB-DEVICE") is ApiResult.Rejected)
    }

    @Test fun foreignDeviceOrAbsentLocalIdentityCannotGrantPilotAuthority() {
        val foreign = classifyPilotDelegation(response(device = "FOREIGN-DEVICE"), "LAB-RIDER", "LAB-DEVICE")
        assertTrue(foreign is ApiResult.Rejected)
        assertEquals(403, (foreign as ApiResult.Rejected).status)
        assertTrue(foreign.reason.contains("aparelho"))
        assertTrue(classifyPilotDelegation(response(), "LAB-RIDER", null) is ApiResult.Rejected)
        assertTrue(classifyPilotDelegation(response(), "LAB-RIDER", "") is ApiResult.Rejected)
        assertTrue(classifyPilotDelegation(response(), "LAB-RIDER", "OTHER-DEVICE") is ApiResult.Rejected)
    }

    @Test fun matchingActorButForeignDeviceIsDeniedEvenWithValidToken() {
        val result = classifyPilotDelegation(
            response(actor = "LAB-RIDER", device = "DEVICE-SWAPPED"),
            "LAB-RIDER",
            "LAB-DEVICE",
        )
        assertTrue(result is ApiResult.Rejected)
        assertEquals(403, (result as ApiResult.Rejected).status)
    }

    @Test fun invalidAudienceOrLifetimePreservesQueue() {
        for (result in listOf(
            response(audience="deliveryos-platform"),
            response(expires=301),
            response(expires=0),
            response(token="platform.token"),
            response(token="pt1.bad*payload.sig"),
        )) {
            assertTrue(classifyPilotDelegation(result,"LAB-RIDER","LAB-DEVICE") is ApiResult.Retryable)
        }
    }

    @Test fun platform401IsNotConvertedIntoPilotToken() {
        val denied=classifyPilotDelegation(ApiResult.Unauthorized("platform_session_expired",401),"LAB-RIDER","LAB-DEVICE")
        assertTrue(denied is ApiResult.Unauthorized)
        assertEquals(401,(denied as ApiResult.Unauthorized).status)
    }

    @Test fun registry403And503RetainOriginalErrorTypes() {
        assertTrue(classifyPilotDelegation(ApiResult.Rejected("revoked",403),"LAB-RIDER","LAB-DEVICE") is ApiResult.Rejected)
        assertTrue(classifyPilotDelegation(ApiResult.Retryable("registry_down",503),"LAB-RIDER","LAB-DEVICE") is ApiResult.Retryable)
    }
}
