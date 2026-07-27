package br.com.tata.entregas

import br.com.tata.entregas.sync.DeviceSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Credencial do aparelho.
 *
 * O P0 que estes testes existem para impedir: `KEY_SESSION_TOKEN` era lida e
 * nunca escrita, todo envio recebia 401, e o `SyncWorker` classificava 401 como
 * rejeição definitiva — marcando o lote como `failed` para sempre e ainda
 * retornando `Result.success()`.
 *
 * São testes de unidade puros: sem Room, sem rede, sem aparelho. O que eles
 * cobrem é a LÓGICA de decisão. O comportamento com banco real está no teste
 * instrumentado, que exige aparelho e não roda aqui.
 */
@RunWith(RobolectricTestRunner::class)
class DeviceSessionTest {

    private val umaHora = 60L * 60L * 1000L
    private val agora = 1_800_000_000_000L

    /* ---------------------------------------------------------------- */

    @Test
    fun `sem sessao precisa autenticar`() {
        assertTrue(DeviceSession.precisaAutenticar(null, agora))
    }

    @Test
    fun `sessao com folga nao precisa autenticar`() {
        val s = DeviceSession.Sessao("t", agora + 12 * umaHora)
        assertFalse(DeviceSession.precisaAutenticar(s, agora))
    }

    @Test
    fun `renova ANTES de vencer, nao depois`() {
        // Esperar expirar deixa o aparelho sem credencial no meio da rua, que é
        // exatamente onde não dá para resolver.
        val s = DeviceSession.Sessao("t", agora + 30 * 60 * 1000L) // vence em 30 min
        assertTrue("deveria renovar com folga", DeviceSession.precisaAutenticar(s, agora))
    }

    @Test
    fun `token ja vencido precisa autenticar`() {
        val s = DeviceSession.Sessao("t", agora - 1)
        assertTrue(DeviceSession.precisaAutenticar(s, agora))
    }

    @Test
    fun `reinicio preserva sessao valida`() {
        // Reiniciar o app não pode custar uma reautenticação: a decisão depende
        // só do que está persistido, não de estado em memória.
        val persistida = DeviceSession.Sessao("token-guardado", agora + 10 * umaHora)
        assertFalse(DeviceSession.precisaAutenticar(persistida, agora))
    }

    /* ---------------------------------------------------------------- */

    @Test
    fun `a resposta do servidor carrega token e validade`() {
        val r = DeviceSession.respostaDeTeste("abc.def", 3600)
        assertEquals("abc.def", r.optString("device_token"))
        assertEquals(3600L, r.optLong("expires_in_s"))
    }

    /* ---------------------------------------------------------------- */

    @Test
    fun `o saneamento remove o token de um texto de erro`() {
        // Primeiro provar que o varredor ACHA o que se sabe estar lá — senão
        // "nenhum segredo encontrado" pode significar só que ele não funciona.
        val token = "eyJhbGciOiJIUzI1NiJ9AAAA.BBBBCCCCDDDDEEEEFFFFGGGG"
        val sujo = "falha ao enviar: Authorization: Bearer $token (401)"
        val limpo = DeviceSession.semSegredo(sujo)
        assertFalse("o token sobreviveu ao saneamento", limpo.contains(token))
        assertTrue(limpo.contains("removido"))
    }

    @Test
    fun `o saneamento cobre campos nomeados`() {
        for (caso in listOf("""{"token":"abc123def456"}""", "senha=umaSenhaQualquer", "secret: xyz789abc")) {
            assertTrue("não sanou: $caso", DeviceSession.semSegredo(caso).contains("removido"))
        }
    }

    @Test
    fun `o saneamento nao destroi texto legitimo`() {
        val texto = "lote de 42 pontos aceito"
        assertEquals(texto, DeviceSession.semSegredo(texto))
    }

    /* ---------------------------------------------------------------- */

    @Test
    fun `as chaves de credencial sao separadas das chaves de dado`() {
        // A revogação limpa credencial. Nada aqui pode encostar em gps_point,
        // outbox_event ou term_ack — é a diferença entre "perdi o crachá" e
        // "perdi o trabalho do dia".
        val chavesDeCredencial = listOf(
            DeviceSession.KEY_TOKEN_EXPIRA_EM,
            DeviceSession.KEY_REVOGADO_EM,
        )
        for (k in chavesDeCredencial) {
            assertFalse("chave de credencial colide com dado: $k", k.contains("gps"))
            assertFalse(k.contains("outbox"))
            assertFalse(k.contains("term"))
        }
    }
}
