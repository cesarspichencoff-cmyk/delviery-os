package br.com.tata.entregas

import br.com.tata.entregas.location.CaptureGate
import br.com.tata.entregas.location.FirstRunStep
import br.com.tata.entregas.location.GateBlock
import br.com.tata.entregas.location.GateInput
import br.com.tata.entregas.location.PermissionState
import br.com.tata.entregas.location.TermState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Portão de captura no Android.
 *
 * Estes testes são espelho dos que rodam em `run-native-consent-tests.ts`.
 * A regra vale nos dois lados ou não vale em lugar nenhum — e no Android ela
 * importa mais, porque aqui quem liga o GPS é um serviço do sistema que pode
 * subir sem a interface estar na frente.
 */
class CaptureGateTest {

    private fun termOk() = TermState(
        publishable = true,
        acknowledgedForCurrentHash = true,
        acknowledgedOlderVersion = true,
        declinedCurrentMaterialVersion = false,
    )

    private fun input(
        captureEnabled: Boolean = true,
        tripId: String? = "trip-1",
        term: TermState = termOk(),
        permission: PermissionState = PermissionState.GRANTED_PRECISE,
        servicesOn: Boolean = true,
    ) = GateInput(captureEnabled, tripId, term, permission, servicesOn)

    @Test
    fun `tudo em ordem libera a captura`() {
        val d = CaptureGate.evaluate(input())
        assertTrue(d.blocks.joinToString(), d.allowed)
        assertTrue(d.termOk)
    }

    @Test
    fun `sem viagem ativa nao captura`() {
        val d = CaptureGate.evaluate(input(tripId = null))
        assertFalse(d.allowed)
        assertTrue(d.blocks.contains(GateBlock.NO_ACTIVE_TRIP))
    }

    @Test
    fun `sem termo aceito nao captura`() {
        val d = CaptureGate.evaluate(
            input(
                term = TermState(
                    publishable = true,
                    acknowledgedForCurrentHash = false,
                    acknowledgedOlderVersion = false,
                    declinedCurrentMaterialVersion = false,
                ),
            ),
        )
        assertFalse(d.allowed)
        assertEquals(GateBlock.TERM_NOT_ACKNOWLEDGED, d.primaryBlock)
    }

    @Test
    fun `termo recusado nao ativa GPS e encaminha ao responsavel`() {
        val d = CaptureGate.evaluate(
            input(
                term = TermState(
                    publishable = true,
                    acknowledgedForCurrentHash = false,
                    acknowledgedOlderVersion = false,
                    declinedCurrentMaterialVersion = true,
                ),
            ),
        )
        assertFalse(d.allowed)
        assertEquals(GateBlock.TERM_DECLINED, d.primaryBlock)
        assertTrue(d.message.contains("responsável"))
    }

    @Test
    fun `versao material nova exige nova ciencia`() {
        val d = CaptureGate.evaluate(
            input(
                term = TermState(
                    publishable = true,
                    acknowledgedForCurrentHash = false,
                    acknowledgedOlderVersion = true,
                    declinedCurrentMaterialVersion = false,
                ),
            ),
        )
        assertEquals(GateBlock.TERM_VERSION_OUTDATED, d.primaryBlock)
    }

    @Test
    fun `termo aceito nao substitui permissao do sistema`() {
        val d = CaptureGate.evaluate(input(permission = PermissionState.DENIED))
        assertFalse(d.allowed)
        assertTrue(d.blocks.contains(GateBlock.PERMISSION_DENIED))
        assertTrue("o termo continua aceito — são coisas separadas", d.termOk)
    }

    @Test
    fun `permissao revogada durante a viagem bloqueia`() {
        val d = CaptureGate.evaluate(input(permission = PermissionState.REVOKED))
        assertTrue(d.blocks.contains(GateBlock.PERMISSION_REVOKED))
    }

    @Test
    fun `permissao aproximada e sinalizada, nao escondida`() {
        val d = CaptureGate.evaluate(input(permission = PermissionState.GRANTED_APPROXIMATE))
        assertTrue(d.allowed)
        assertTrue(d.approximateOnly)
    }

    @Test
    fun `localizacao do aparelho desligada bloqueia`() {
        val d = CaptureGate.evaluate(input(servicesOn = false))
        assertFalse(d.allowed)
        assertTrue(d.blocks.contains(GateBlock.LOCATION_SERVICES_OFF))
    }

    @Test
    fun `flag desligada impede tudo`() {
        val d = CaptureGate.evaluate(input(captureEnabled = false))
        assertFalse(d.allowed)
        assertEquals(GateBlock.CAPTURE_DISABLED, d.primaryBlock)
    }

    @Test
    fun `termo nao publicavel bloqueia antes de qualquer permissao`() {
        val d = CaptureGate.evaluate(
            input(
                term = TermState(
                    publishable = false,
                    acknowledgedForCurrentHash = false,
                    acknowledgedOlderVersion = false,
                    declinedCurrentMaterialVersion = false,
                ),
            ),
        )
        assertTrue(d.blocks.contains(GateBlock.TERM_NOT_PUBLISHABLE))
    }

    @Test
    fun `permissao do Android nunca vem antes do termo no fluxo`() {
        val steps = FirstRunStep.entries
        assertTrue(
            steps.indexOf(FirstRunStep.TERMO_COMPLETO) <
                steps.indexOf(FirstRunStep.PERMISSAO_LOCALIZACAO_PRECISA),
        )
        assertTrue(
            steps.indexOf(FirstRunStep.REGISTRO_DA_CIENCIA) <
                steps.indexOf(FirstRunStep.PERMISSAO_LOCALIZACAO_PRECISA),
        )
        assertEquals(FirstRunStep.EXPLICACAO_RESUMIDA, steps.first())
        assertEquals(FirstRunStep.PARADA_AO_FINAL, steps.last())
    }
}
