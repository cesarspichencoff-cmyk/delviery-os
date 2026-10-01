package br.com.tata.entregas

import br.com.tata.entregas.sync.enrollmentProofSha256
import org.junit.Assert.assertEquals
import org.junit.Test

class EnrollmentProofTest {
    @Test
    fun `sha256 bate com vetor conhecido independente da implementacao`() {
        assertEquals(
            "3ba3f5f43b92602683c19aee62a20342b084dd5971ddd33808d81a328879a547",
            enrollmentProofSha256("a".repeat(32)),
        )
    }
}
