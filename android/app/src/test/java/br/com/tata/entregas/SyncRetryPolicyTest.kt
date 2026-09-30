package br.com.tata.entregas

import br.com.tata.entregas.sync.SyncWorker
import br.com.tata.entregas.sync.shouldRetryFast
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncRetryPolicyTest {

    @Test
    fun `falha transitoria recebe somente tres execucoes rapidas`() {
        assertTrue(shouldRetryFast(0))
        assertTrue(shouldRetryFast(1))
        assertFalse(shouldRetryFast(2))
        assertFalse(shouldRetryFast(10))
    }

    @Test
    fun `jobs v2 nao herdam backoff dos nomes antigos`() {
        assertTrue(SyncWorker.UNIQUE_NOW.endsWith("-v2"))
        assertTrue(SyncWorker.UNIQUE_PERIODIC.endsWith("-v2"))
        assertTrue(SyncWorker.FAST_RETRY_RUNS == 3)
    }
}
