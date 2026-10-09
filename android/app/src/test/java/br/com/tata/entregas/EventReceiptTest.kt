package br.com.tata.entregas

import br.com.tata.entregas.sync.EventReceiptDecision
import br.com.tata.entregas.sync.EventReceiptItem
import br.com.tata.entregas.sync.decideEventReceipt
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * O piloto pode responder 200 + results com recusa de um comando.
 * HTTP 200 nao e aceite individual. Apenas ids provadamente aceitos saem da fila.
 */
@RunWith(RobolectricTestRunner::class)
class EventReceiptTest {
    private val items = listOf(EventReceiptItem("e1"), EventReceiptItem("e2"), EventReceiptItem("e3"))

    private fun response(vararg results: String): JSONObject = JSONObject().apply {
        put("ok", true)
        put("results", JSONArray().apply { results.forEach { put(JSONObject(it)) } })
    }

    @Test fun aceiteParcialNaoMarcaOComandoRecusadoComoEnviado() {
        val decision = decideEventReceipt(items, response(
            """{"event_id":"e1","ok":true}""",
            """{"event_id":"e2","ok":false,"error":"regra_de_negocio"}""",
            """{"event_id":"e3","ok":true}""",
        ))
        assertTrue(decision is EventReceiptDecision.Apply)
        val applied = decision as EventReceiptDecision.Apply
        assertEquals(listOf("e1", "e3"), applied.sentIds)
        assertEquals(listOf("e2"), applied.rejected.map { it.eventId })
        assertEquals("regra_de_negocio", applied.rejected.single().reason)
    }

    @Test fun todosAceitosContinuamFuncionais() {
        val decision = decideEventReceipt(items.take(2), response(
            """{"event_id":"e2","ok":true}""",
            """{"event_id":"e1","ok":true}""",
        ))
        assertTrue(decision is EventReceiptDecision.Apply)
        assertEquals(listOf("e1","e2"), (decision as EventReceiptDecision.Apply).sentIds)
    }

    @Test fun reciboSemResultadosNuncaConfirmaUmLote() {
        val decision = decideEventReceipt(items, JSONObject("""{"ok":true}"""))
        assertTrue(decision is EventReceiptDecision.Invalid)
    }

    @Test fun reciboIncompletoNuncaMarcaRestantesComoSucesso() {
        val decision = decideEventReceipt(items, response("""{"event_id":"e1","ok":true}"""))
        assertTrue(decision is EventReceiptDecision.Invalid)
    }

    @Test fun resultadoDuplicadoNuncaSubstituiResultadoAusente() {
        val decision = decideEventReceipt(items, response(
            """{"event_id":"e1","ok":true}""",
            """{"event_id":"e1","ok":true}""",
            """{"event_id":"e3","ok":true}""",
        ))
        assertTrue(decision is EventReceiptDecision.Invalid)
    }

    @Test fun idDesconhecidoNaoPodeConfirmarEvento() {
        val decision = decideEventReceipt(items, response(
            """{"event_id":"e1","ok":true}""",
            """{"event_id":"e2","ok":true}""",
            """{"event_id":"e999","ok":true}""",
        ))
        assertTrue(decision is EventReceiptDecision.Invalid)
    }

    @Test fun campoOkAusenteNaoPodeSerInterpretadoComoRecusaOuAceite() {
        val decision = decideEventReceipt(items.take(1), response("""{"event_id":"e1"}"""))
        assertTrue(decision is EventReceiptDecision.Invalid)
    }

    @Test fun respostaOuterOkFalseNaoEProvaDeAceite() {
        val response = JSONObject("""{"ok":false,"results":[{"event_id":"e1","ok":true}]}""")
        assertTrue(decideEventReceipt(items.take(1), response) is EventReceiptDecision.Invalid)
    }

    @Test fun loteVazioComResultadosVaziosNaoCriaAceites() {
        val decision = decideEventReceipt(emptyList(), response())
        assertTrue(decision is EventReceiptDecision.Apply)
        val applied = decision as EventReceiptDecision.Apply
        assertTrue(applied.sentIds.isEmpty())
        assertTrue(applied.rejected.isEmpty())
    }

    @Test fun erroDoServidorNaoPodePersistirTokenEmTextoLivre() {
        val decision = decideEventReceipt(items.take(1), response(
            """{"event_id":"e1","ok":false,"error":"Authorization: Bearer eyJhbGciOiJIUzI1NiJ9AAAA.BBBBCCCCDDDDEEEEFFFFGGGG"}""",
        ))
        assertTrue(decision is EventReceiptDecision.Apply)
        val reason = (decision as EventReceiptDecision.Apply).rejected.single().reason
        assertTrue(!reason.contains("BBBBCCCC"))
        assertTrue(reason.length <= 240)
    }
}
