package br.com.tata.entregas.sync

import org.json.JSONObject

/** As duas instruções que a autenticação do aparelho manda junto de um 403. */
private val INSTRUCOES_DE_AUTORIZACAO = setOf("renovar_e_repetir", "parar_e_avisar")

/**
 * 403 da autenticação do aparelho numa rota de DADO da plataforma (lote de
 * GPS, fila B5) é recusa de credencial, não do conteúdo.
 *
 * A plataforma usa 403 para "a unidade do token ficou velha, renove e repita"
 * e para "revogado ou desconhecido, pare e avise", e nos dois casos o corpo diz
 * `preservar_dados_locais: true` (`corpoDeRecusa`, em
 * `src/platform/auth/device-auth.ts`). Antes, esse 403 caía em `Rejected` e o
 * lote de GPS virava `rejected` terminal: até 100 pontos por execução fora da
 * fila para sempre, inclusive depois de o aparelho ser reautorizado — e, com o
 * token ainda dentro da validade, a execução seguinte fazia o mesmo com os
 * próximos 100.
 *
 * Como [ApiResult.Unauthorized], o lote fica `failed` com a mesma chave de
 * idempotência e a credencial local é descartada. O resto quem decide é o
 * bootstrap em `/api/device/session`, a única autoridade local de revogação:
 * token novo, o lote sobe; 403 lá, `DeviceSession.Revogado`, e o worker para
 * de enviar sem apagar nada. O lote só sai de novo depois que o bootstrap
 * emitir credencial nova; sem ela, nada sai.
 *
 * Só para rotas da plataforma. O bootstrap usa a resposta crua — lá o 403 É a
 * revogação. Um 403 do piloto (ex.: `not_rider`), um 403 sem essa forma e um
 * 400 de contrato continuam [ApiResult.Rejected].
 */
internal fun asPlatformDataResult(result: ApiResult<JSONObject>): ApiResult<JSONObject> {
    if (result !is ApiResult.Rejected || result.status != 403) return result
    val recusaDeAutorizacao = result.refusalClass == "nao_autorizado" ||
        result.instruction in INSTRUCOES_DE_AUTORIZACAO
    return if (recusaDeAutorizacao) ApiResult.Unauthorized(result.reason, result.status) else result
}
