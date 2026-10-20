package br.com.tata.entregas

import br.com.tata.entregas.sync.ApiResult
import br.com.tata.entregas.sync.EntregasApi
import br.com.tata.entregas.sync.asPlatformDataResult
import br.com.tata.entregas.sync.interpretarRespostaHttp
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.net.InetAddress
import java.net.ServerSocket

/**
 * Quando um 403 da plataforma é recusa da credencial do aparelho, e quando não é.
 *
 * O corpo do 403 chega pelo `errorStream`; o teste em loopback prova que a
 * `instrucao` sobrevive à fronteira HTTP real do `EntregasApi`. JVM apenas:
 * não é prova de TLS, de aparelho, nem do servidor real. Corpos fictícios.
 */
@RunWith(RobolectricTestRunner::class)
class PlatformRefusalHttpTest {

    private class LocalReceiver(private val status: Int, private val body: String) : AutoCloseable {
        private val server = ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"))
        val baseUrl: String get() = "http://127.0.0.1:${server.localPort}"
        private val thread = Thread {
            try {
                server.accept().use { socket ->
                    socket.soTimeout = 5000
                    val reader = socket.getInputStream().bufferedReader()
                    reader.readLine()
                    var length = 0
                    while (true) {
                        val line = reader.readLine() ?: break
                        if (line.isEmpty()) break
                        if (line.startsWith("Content-Length:", ignoreCase = true)) {
                            length = line.substringAfter(':').trim().toInt()
                        }
                    }
                    repeat(length) { reader.read() }
                    val bytes = body.toByteArray(Charsets.UTF_8)
                    val header = "HTTP/1.1 $status Status\r\n" +
                        "Content-Type: application/json\r\n" +
                        "Content-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
                    socket.getOutputStream().use {
                        it.write(header.toByteArray(Charsets.US_ASCII))
                        it.write(bytes)
                        it.flush()
                    }
                }
            } catch (_: java.io.IOException) { /* fechado no close() */ }
        }.apply { isDaemon = true; start() }

        override fun close() {
            server.close()
            thread.join(3000)
        }
    }

    private val loteRenovavel = """
        {"classe":"nao_autorizado","ok":false,"motivo":"unidade_divergente",
         "instrucao":"renovar_e_repetir","preservar_dados_locais":true,
         "humano":"Este aparelho não está autorizado para esta unidade."}
    """.trimIndent()

    @Test fun `403 de autorizacao do lote de GPS chega como credencial recusada pela fronteira HTTP`() {
        LocalReceiver(403, loteRenovavel).use { platform ->
            val raw = EntregasApi(platform.baseUrl, { "LAB-STALE-UNIT-TOKEN" })
                .sendPoints(listOf(JSONObject().put("point_id", "LAB-POINT")), "LAB")
            assertTrue(raw is ApiResult.Rejected)
            raw as ApiResult.Rejected
            assertEquals("renovar_e_repetir", raw.instruction)
            assertEquals("nao_autorizado", raw.refusalClass)
            val refined = asPlatformDataResult(raw)
            assertTrue(refined is ApiResult.Unauthorized)
            assertEquals(403, (refined as ApiResult.Unauthorized).status)
        }
    }

    @Test fun `403 da fila B5 por corrida com revogacao tambem e credencial recusada`() {
        val body = """{"classe":"nao_autorizado","motivo":"dispositivo_revogado_ou_indisponivel","preservar_dados_locais":true}"""
        LocalReceiver(403, body).use { platform ->
            val raw = EntregasApi(platform.baseUrl, { "LAB-TOKEN" }).sendQueueDepth(3, 0)
            assertTrue(asPlatformDataResult(raw) is ApiResult.Unauthorized)
        }
    }

    @Test fun `403 do bootstrap continua cru para o DeviceSession marcar revogacao`() {
        // `/api/device/session` responde 403 só para revogado ou segredo
        // divergente. O `DeviceSession` lê a resposta crua: lá, 403 É revogação.
        val body = """
            {"ok":false,"classe":"nao_autorizado","motivo":"dispositivo_revogado",
             "instrucao":"parar_e_avisar","preservar_dados_locais":true,"humano":"Aparelho revogado."}
        """.trimIndent()
        LocalReceiver(403, body).use { platform ->
            val raw = EntregasApi(platform.baseUrl, { null })
                .authenticateDevice("LAB-DEVICE", "LAB-SECRET-NOT-REAL-000000000000", "lab")
            assertTrue(raw is ApiResult.Rejected)
            assertEquals(403, (raw as ApiResult.Rejected).status)
            assertEquals("parar_e_avisar", raw.instruction)
            assertFalse(raw.reason.contains("LAB-SECRET"))
        }
    }

    /* --- regra pura --- */

    @Test fun `403 com instrucao de autorizacao vira Unauthorized mesmo sem classe`() {
        for (instrucao in listOf("renovar_e_repetir", "parar_e_avisar")) {
            val r = interpretarRespostaHttp(403, """{"ok":false,"instrucao":"$instrucao","preservar_dados_locais":true}""")
            assertTrue(instrucao, asPlatformDataResult(r) is ApiResult.Unauthorized)
        }
    }

    @Test fun `403 do piloto, sem JSON ou com instrucao desconhecida continua Rejected`() {
        for (body in listOf(
            """{"ok":false,"human":"Só o próprio motoboy registra o aceite do termo.","code":"not_rider"}""",
            "<html>forbidden</html>",
            "",
            """{"classe":"contrato_invalido","instrucao":"prosseguir"}""",
            """{"classe":"NAO_AUTORIZADO","instrucao":"RENOVAR_E_REPETIR"}""",
        )) {
            val r = interpretarRespostaHttp(403, body)
            assertTrue(body, r is ApiResult.Rejected)
            assertSame(body, r, asPlatformDataResult(r))
        }
    }

    @Test fun `so 403 e reclassificado - 400 e 409 com a mesma forma continuam Rejected`() {
        for (status in listOf(400, 404, 409, 422)) {
            val r = interpretarRespostaHttp(status, loteRenovavel)
            assertTrue("HTTP $status", asPlatformDataResult(r) is ApiResult.Rejected)
        }
    }

    @Test fun `sucesso, transitorio e 401 passam intactos`() {
        val ok = interpretarRespostaHttp(200, """{"accepted":1,"duplicate":0,"rejected":0}""")
        val transitorio = interpretarRespostaHttp(503, "indisponivel")
        val vencido = interpretarRespostaHttp(401, """{"instrucao":"renovar_e_repetir"}""")
        for (r in listOf(ok, transitorio, vencido)) assertSame(r, asPlatformDataResult(r))
    }

    @Test fun `campos de recusa so carregam identificador curto`() {
        val r = interpretarRespostaHttp(
            403,
            """{"classe":"nao autorizado; Bearer abc.def.ghi","instrucao":"${"a".repeat(65)}"}""",
        ) as ApiResult.Rejected
        assertNull(r.refusalClass)
        assertNull(r.instruction)
        assertTrue(asPlatformDataResult(r) is ApiResult.Rejected)
    }
}
