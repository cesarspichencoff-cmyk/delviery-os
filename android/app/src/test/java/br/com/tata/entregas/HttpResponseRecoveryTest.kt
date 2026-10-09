package br.com.tata.entregas

import br.com.tata.entregas.sync.ApiResult
import br.com.tata.entregas.sync.interpretarRespostaHttp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * HTTP 200 nao prova que um lote foi aceito se o recibo esta corrompido.
 * Classifica sem rede; pontos ficam recuperaveis no Room e reenviam pela
 * mesma chave de idempotencia.
 */
class HttpResponseRecoveryTest {
    @Test
    fun `resposta HTTP 200 com JSON corrompido sempre e retentavel`() {
        val r = interpretarRespostaHttp(200, "{recibo_corrompido")
        assertTrue(r is ApiResult.Retryable)
        assertEquals(200, (r as ApiResult.Retryable).status)
    }

    @Test
    fun `resposta HTTP 200 com JSON valido segue caminho de recibo`() {
        val r = interpretarRespostaHttp(200, """{"accepted":2,"duplicate":0,"rejected":0}""")
        assertTrue(r is ApiResult.Ok)
        assertEquals(2, (r as ApiResult.Ok).value.optInt("accepted"))
    }

    @Test
    fun `resposta HTTP 204 vazia permanece compativel com endpoints sem corpo`() {
        val r = interpretarRespostaHttp(204, "")
        assertTrue(r is ApiResult.Ok)
    }

    @Test
    fun `401 precisa renovar credencial e nao rejeitar lote`() {
        val r = interpretarRespostaHttp(401, """{"human":"credencial vencida"}""")
        assertTrue(r is ApiResult.Unauthorized)
        assertEquals(401, (r as ApiResult.Unauthorized).status)
    }

    @Test
    fun `400 legitimo continua sendo recusa definitiva`() {
        val r = interpretarRespostaHttp(400, """{"human":"contrato invalido"}""")
        assertTrue(r is ApiResult.Rejected)
        assertEquals(400, (r as ApiResult.Rejected).status)
    }

    @Test
    fun `503 permanece retentavel mesmo com resposta invalida`() {
        val r = interpretarRespostaHttp(503, "<html>temporariamente indisponivel</html>")
        assertTrue(r is ApiResult.Retryable)
        assertEquals(503, (r as ApiResult.Retryable).status)
    }
}
