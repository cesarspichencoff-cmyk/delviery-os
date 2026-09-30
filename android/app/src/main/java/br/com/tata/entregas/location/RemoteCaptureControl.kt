package br.com.tata.entregas.location

/**
 * Política pura da resposta remota de controle de captura.
 *
 * Ausência de prova sempre mantém captura. Só 200 conclusivo com
 * `capture=false` ou identidade terminal (403) autorizam STOP.
 */
internal sealed class RemoteCaptureAction {
    object Keep : RemoteCaptureAction()
    object RenewCredential : RemoteCaptureAction()
    data class Stop(val reason: String) : RemoteCaptureAction()
}

internal object RemoteCaptureControl {
    fun success(hasCapture: Boolean, capture: Boolean): RemoteCaptureAction =
        if (hasCapture && !capture) {
            RemoteCaptureAction.Stop("viagem_encerrada_remotamente")
        } else {
            RemoteCaptureAction.Keep
        }

    fun unauthorized(): RemoteCaptureAction = RemoteCaptureAction.RenewCredential

    fun rejected(status: Int): RemoteCaptureAction =
        if (status == 410) {
            // 410 é emitido pelo piloto somente depois de a plataforma atestar
            // revogação terminal. Um 403 genérico de proxy/WAF nunca desliga GPS.
            RemoteCaptureAction.Stop("controle_captura_terminal")
        } else {
            RemoteCaptureAction.Keep
        }

    fun retryable(): RemoteCaptureAction = RemoteCaptureAction.Keep
}
