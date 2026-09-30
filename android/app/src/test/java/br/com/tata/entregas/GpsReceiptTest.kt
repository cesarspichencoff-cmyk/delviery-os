package br.com.tata.entregas

import br.com.tata.entregas.sync.GpsReceiptDecision
import br.com.tata.entregas.sync.GpsReceiptItem
import br.com.tata.entregas.sync.GpsReceiptRejection
import br.com.tata.entregas.sync.decideGpsReceipt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GpsReceiptTest {
    private val items = listOf(
        GpsReceiptItem("p1", "k1"),
        GpsReceiptItem("p2", "k2"),
        GpsReceiptItem("p3", "k3"),
    )

    @Test
    fun recibo_parcial_nao_apaga_o_rejeitado() {
        val d = decideGpsReceipt(
            items = items,
            accepted = 2,
            duplicate = 0,
            rejected = 1,
            rejections = listOf(GpsReceiptRejection("k2", "localização simulada")),
        )

        d as GpsReceiptDecision.Apply
        assertEquals(listOf("p1", "p3"), d.sentIds)
        assertEquals(listOf("p2"), d.rejected.map { it.pointId })
        assertEquals("localização simulada", d.rejected.single().reason)
    }

    @Test
    fun duplicata_do_servidor_conta_como_sucesso() {
        val d = decideGpsReceipt(
            items = items.take(2),
            accepted = 1,
            duplicate = 1,
            rejected = 0,
            rejections = emptyList(),
        )
        d as GpsReceiptDecision.Apply
        assertEquals(listOf("p1", "p2"), d.sentIds)
        assertTrue(d.rejected.isEmpty())
    }

    @Test
    fun recibo_inconsistente_falha_fechado() {
        val d = decideGpsReceipt(
            items = items,
            accepted = 3,

            duplicate = 0,
            rejected = 1,
            rejections = listOf(GpsReceiptRejection("k2", "x")),
        )
        d as GpsReceiptDecision.Invalid
        assertEquals("contagens_nao_fecham", d.reason)
    }
}
