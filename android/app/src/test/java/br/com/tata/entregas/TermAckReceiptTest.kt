package br.com.tata.entregas

import br.com.tata.entregas.data.TermAckEntity
import br.com.tata.entregas.sync.confirmsTermAckOnPilot
import org.json.JSONObject
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** No backend/phone/GPS: direct regression against the pilot acknowledgement JSON. */
@RunWith(RobolectricTestRunner::class)
class TermAckReceiptTest {
    private val ack = TermAckEntity(
        acknowledgementId = "LAB-ACK-01",
        riderId = "LAB-RIDER",
        unitId = "ITAIM",
        termVersion = "term-v1",
        termMaterialVersion = "material-v1",
        termHash = "lab-hash-01",
        status = "accepted",
        acceptedAt = "2026-11-04T00:00:00Z",
        deviceId = "LAB-DEVICE",
        appVersion = "pilot-v1",
        language = "pt-BR",
        origin = "rider_app",
        correlationId = "LAB-CORRELATION",
        schemaVersion = "consent@1.0.0",
        syncState = "pending",
    )

    private fun receipt(input: TermAckEntity = ack): JSONObject = JSONObject()
        .put("recibo", input.acknowledgementId)
        .put("unidade", input.unitId)
        .put("versao_do_termo", input.termVersion)
        .put("impressao_do_texto", input.termHash)
        .put("aceito_em", input.acceptedAt)
        .put("situacao", if (input.status == "accepted") "aceito" else "recusado")
        .put("aparelho", input.deviceId)

    private fun response(input: TermAckEntity = ack): JSONObject = JSONObject()
        .put("ok", true)
        .put("acknowledgement_id", input.acknowledgementId)
        .put("stored", true)
        .put("receipt", receipt(input))

    @Test fun confirmedLegacyReceiptPermitsLocalSent() {
        assertTrue(confirmsTermAckOnPilot(ack, response()))
    }

    @Test fun idempotentReceiptPermitsSentOnlyWhenOriginalMatches() {
        val r = response().put("stored", false)
        assertTrue(confirmsTermAckOnPilot(ack, r))
        assertFalse(confirmsTermAckOnPilot(ack, r.put("receipt", receipt().put("situacao", "recusado"))))
    }

    @Test fun negativeOkNeverConfirmsEvenOnHttp200() {
        assertFalse(confirmsTermAckOnPilot(ack, response().put("ok", false)))
        assertFalse(confirmsTermAckOnPilot(ack, response().put("ok", "true")))
    }

    @Test fun emptyOrMissingReceiptRemainsPending() {
        assertFalse(confirmsTermAckOnPilot(ack, JSONObject().put("ok", true)))
        assertFalse(confirmsTermAckOnPilot(ack, response().remove("receipt").let { response().put("receipt", JSONObject()) }))
    }

    @Test fun wrongAckIdNeverConfirms() {
        assertFalse(confirmsTermAckOnPilot(ack, response().put("acknowledgement_id", "OTHER")))
        assertFalse(confirmsTermAckOnPilot(ack, response().put("receipt", receipt().put("recibo", "OTHER"))))
    }

    @Test fun wrongUnitNeverConfirms() {
        assertFalse(confirmsTermAckOnPilot(ack, response().put("receipt", receipt().put("unidade", "MOOCA"))))
    }

    @Test fun oldOrDifferentTermVersionNeverConfirms() {
        assertFalse(confirmsTermAckOnPilot(ack, response().put("receipt", receipt().put("versao_do_termo", "old"))))
        assertFalse(confirmsTermAckOnPilot(ack, response().put("receipt", receipt().put("impressao_do_texto", "other"))))
    }

    @Test fun foreignDeviceNeverConfirms() {
        assertFalse(confirmsTermAckOnPilot(ack, response().put("receipt", receipt().put("aparelho", "ANOTHER"))))
    }

    @Test fun declinedRequiresDeclinedRemoteReceipt() {
        val d = ack.copy(status = "declined")
        assertTrue(confirmsTermAckOnPilot(d, response(d)))
        assertFalse(confirmsTermAckOnPilot(d, response(d).put("receipt", receipt(d).put("situacao", "aceito"))))
    }

    @Test fun explicitRecordMustMatchActorStatusAndTerm() {
        val record = JSONObject().put("acknowledgement_id", ack.acknowledgementId)
            .put("rider_id", ack.riderId)
            .put("unit_id", ack.unitId)
            .put("device_id", ack.deviceId)
            .put("term_hash", ack.termHash)
            .put("status", ack.status)
        assertTrue(confirmsTermAckOnPilot(ack, response().put("record", record)))
        assertFalse(confirmsTermAckOnPilot(ack, response().put("record", JSONObject(record.toString()).put("rider_id", "OTHER"))))
        assertFalse(confirmsTermAckOnPilot(ack, response().put("record", JSONObject(record.toString()).put("status", "declined"))))
    }

    @Test fun invalidLocalIdentityNeverClaimsServerConfirmation() {
        assertFalse(confirmsTermAckOnPilot(ack.copy(deviceId = ""), response()))
        assertFalse(confirmsTermAckOnPilot(ack.copy(status = "unknown"), response()))
    }
}
