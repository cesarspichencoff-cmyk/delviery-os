package br.com.tata.entregas

import br.com.tata.entregas.sync.EventBatchHttpRejectionHold
import br.com.tata.entregas.sync.classifyEventBatchHttpRejection
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Uma falha HTTP do lote, sem recibo por event_id, nunca prova recusa
 * definitiva de cada comando, nem autoriza limpar token da plataforma.
 * O worker preserva ids no Room e sinaliza falha ate reconciliacao.
 */
class EventBatchHttpRejectionTest {
    @Test fun pilot403IndicaBloqueioDeAutorizacao() {
        assertEquals(
            EventBatchHttpRejectionHold.PILOT_AUTHORIZATION_BLOCKED,
            classifyEventBatchHttpRejection(403, delegationDenied = false),
        )
    }

    @Test fun delegacaoRecusadaNuncaViraErroDeDominio() {
        for (status in listOf(400, 403, 409, 422)) {
            assertEquals(
                EventBatchHttpRejectionHold.PILOT_AUTHORIZATION_BLOCKED,
                classifyEventBatchHttpRejection(status, delegationDenied = true),
            )
        }
    }

    @Test fun rejeicaoNaoConfirmadaFicaParaRevisaoNaoTerminal() {
        for (status in listOf(400, 404, 409, 410, 422)) {
            assertEquals(
                EventBatchHttpRejectionHold.UNATTESTED_BATCH_REJECTION,
                classifyEventBatchHttpRejection(status, delegationDenied = false),
            )
        }
    }

    @Test fun codigoInesperadoFalhaFechadoSemCriarAceite() {
        for (status in listOf(0, 429, 500)) {
            assertEquals(
                EventBatchHttpRejectionHold.UNATTESTED_BATCH_REJECTION,
                classifyEventBatchHttpRejection(status, delegationDenied = false),
            )
        }
    }
}
