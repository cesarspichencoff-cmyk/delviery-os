package br.com.tata.entregas

import br.com.tata.entregas.sync.LocalRetentionPolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RetentionPolicyTest {
    @Test
    fun `sem politica autorizada preserva tudo`() {
        assertNull(LocalRetentionPolicy.cutoffMs(1_000_000L, null))
        assertNull(LocalRetentionPolicy.cutoffMs(1_000_000L, 0))
        assertNull(LocalRetentionPolicy.cutoffMs(1_000_000L, -1))
    }

    @Test
    fun `prazo valido vira corte sem inventar dias`() {
        val now = 40L * 86_400_000L
        assertEquals(23L * 86_400_000L, LocalRetentionPolicy.cutoffMs(now, 17))
    }

    @Test
    fun `valor absurdo ou relogio invalido falham preservando`() {
        assertNull(LocalRetentionPolicy.cutoffMs(1_000_000L, 36_501))
        assertNull(LocalRetentionPolicy.cutoffMs(-1L, 30))
    }

    @Test
    fun `corte nunca fica negativo`() {
        assertEquals(0L, LocalRetentionPolicy.cutoffMs(1_000L, 1))
    }
}
