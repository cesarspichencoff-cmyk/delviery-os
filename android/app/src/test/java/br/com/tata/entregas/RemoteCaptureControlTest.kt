package br.com.tata.entregas

import br.com.tata.entregas.location.RemoteCaptureAction
import br.com.tata.entregas.location.RemoteCaptureControl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteCaptureControlTest {
    @Test fun conclusiveFalseStops() {
        val r = RemoteCaptureControl.success(hasCapture = true, capture = false)
        assertEquals(
            "viagem_encerrada_remotamente",
            (r as RemoteCaptureAction.Stop).reason,
        )
    }

    @Test fun missingFieldKeeps() {
        assertTrue(RemoteCaptureControl.success(false, false) is RemoteCaptureAction.Keep)
    }

    @Test fun trueKeeps() {
        assertTrue(RemoteCaptureControl.success(true, true) is RemoteCaptureAction.Keep)
    }

    @Test fun unauthorizedRenewsWithoutStopping() {
        assertTrue(RemoteCaptureControl.unauthorized() is RemoteCaptureAction.RenewCredential)
    }

    @Test fun only410IsTerminal() {
        assertTrue(RemoteCaptureControl.rejected(400) is RemoteCaptureAction.Keep)
        assertTrue(RemoteCaptureControl.rejected(403) is RemoteCaptureAction.Keep)
        val terminal = RemoteCaptureControl.rejected(410) as RemoteCaptureAction.Stop
        assertEquals("controle_captura_terminal", terminal.reason)
    }

    @Test fun retryableKeeps() {
        assertTrue(RemoteCaptureControl.retryable() is RemoteCaptureAction.Keep)
    }
}
