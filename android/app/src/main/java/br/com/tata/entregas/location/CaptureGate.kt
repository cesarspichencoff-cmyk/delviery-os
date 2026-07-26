package br.com.tata.entregas.location

/**
 * Portão de captura — porta Kotlin do mesmo portão que já existe em
 * `src/entregas/consent/location-gate.ts`.
 *
 * A regra NÃO é redecidida aqui: os motivos e a ordem são os mesmos, e há
 * teste espelhado nos dois lados. O que este arquivo faz é impedir que o
 * serviço Android suba sem passar pelas quatro condições — porque no Android
 * quem liga o GPS é o serviço, não a interface.
 *
 * Quatro condições independentes, e nenhuma substitui a outra:
 *   flag ligada · viagem ativa · termo aceito · permissão concedida.
 */
enum class GateBlock(val code: String, val message: String) {
    CAPTURE_DISABLED("capture_disabled", "A localização está desligada na configuração do sistema."),
    NO_ACTIVE_TRIP("no_active_trip", "GPS desligado — sem viagem ativa."),
    TERM_NOT_PUBLISHABLE("term_not_publishable", "O termo de localização ainda não foi liberado pelo responsável."),
    TERM_NOT_ACKNOWLEDGED("term_not_acknowledged", "Você precisa ler e aceitar o termo de localização."),
    TERM_VERSION_OUTDATED("term_version_outdated", "O termo de localização mudou. É preciso ler e aceitar a nova versão."),
    TERM_DECLINED("term_declined", "Você não aceitou o termo de localização. Procure o responsável pela operação."),
    PERMISSION_MISSING("permission_missing", "Falta permitir a localização nas configurações do aparelho."),
    PERMISSION_DENIED("permission_denied", "A permissão de localização está negada nas configurações do aparelho."),
    PERMISSION_REVOKED("permission_revoked", "A permissão de localização foi retirada. É preciso permitir de novo."),
    LOCATION_SERVICES_OFF("location_services_off", "A localização do aparelho está desligada."),
}

enum class PermissionState { UNKNOWN, NOT_REQUESTED, GRANTED_PRECISE, GRANTED_APPROXIMATE, DENIED, REVOKED }

/** Estado do aceite do termo, vindo do armazenamento local. */
data class TermState(
    val publishable: Boolean,
    /** Existe aceite válido para o hash do termo apresentado agora. */
    val acknowledgedForCurrentHash: Boolean,
    /** Já aceitou alguma versão anterior. */
    val acknowledgedOlderVersion: Boolean,
    /** Recusou explicitamente a versão material atual. */
    val declinedCurrentMaterialVersion: Boolean,
)

data class GateInput(
    val captureEnabled: Boolean,
    val activeTripId: String?,
    val term: TermState,
    val permission: PermissionState,
    val locationServicesEnabled: Boolean,
)

data class GateDecision(
    val allowed: Boolean,
    val blocks: List<GateBlock>,
    val message: String,
    val approximateOnly: Boolean,
    val termOk: Boolean,
) {
    /** Primeiro obstáculo real — é o que a tela mostra, não a lista inteira. */
    val primaryBlock: GateBlock? get() = blocks.firstOrNull()
}

object CaptureGate {

    fun evaluate(input: GateInput): GateDecision {
        val blocks = mutableListOf<GateBlock>()

        if (!input.captureEnabled) blocks += GateBlock.CAPTURE_DISABLED
        if (input.activeTripId.isNullOrBlank()) blocks += GateBlock.NO_ACTIVE_TRIP

        var termOk = false
        if (!input.term.publishable) {
            blocks += GateBlock.TERM_NOT_PUBLISHABLE
        } else if (input.term.acknowledgedForCurrentHash) {
            termOk = true
        } else {
            // Distingue quem nunca aceitou, quem aceitou versão vencida e quem
            // recusou — cada um pede uma conversa diferente.
            blocks += when {
                input.term.declinedCurrentMaterialVersion -> GateBlock.TERM_DECLINED
                input.term.acknowledgedOlderVersion -> GateBlock.TERM_VERSION_OUTDATED
                else -> GateBlock.TERM_NOT_ACKNOWLEDGED
            }
        }

        when (input.permission) {
            PermissionState.GRANTED_PRECISE, PermissionState.GRANTED_APPROXIMATE -> Unit
            PermissionState.DENIED -> blocks += GateBlock.PERMISSION_DENIED
            PermissionState.REVOKED -> blocks += GateBlock.PERMISSION_REVOKED
            else -> blocks += GateBlock.PERMISSION_MISSING
        }

        if (!input.locationServicesEnabled) blocks += GateBlock.LOCATION_SERVICES_OFF

        return GateDecision(
            allowed = blocks.isEmpty(),
            blocks = blocks,
            message = blocks.firstOrNull()?.message ?: "GPS autorizado para esta viagem.",
            approximateOnly = input.permission == PermissionState.GRANTED_APPROXIMATE,
            termOk = termOk,
        )
    }
}

/**
 * Passos obrigatórios do primeiro acesso, na ordem. Existe como dado — e não
 * como comentário — para o teste poder afirmar que o pedido de permissão do
 * Android nunca vem antes do termo.
 */
enum class FirstRunStep {
    EXPLICACAO_RESUMIDA,
    TERMO_COMPLETO,
    REGISTRO_DA_CIENCIA,
    PERMISSAO_LOCALIZACAO_PRECISA,
    EXPLICACAO_SERVICO_EM_VIAGEM,
    INICIO_SOMENTE_COM_VIAGEM_ATIVA,
    NOTIFICACAO_PERSISTENTE,
    PARADA_AO_FINAL,
}
