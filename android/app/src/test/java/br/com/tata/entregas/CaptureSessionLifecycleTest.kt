package br.com.tata.entregas

import br.com.tata.entregas.location.CaptureSessionLifecycle
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

class CaptureSessionLifecycleTest {
    @Test fun oldCallbackAndOldFailureCannotAffectNewTrip() {
        val lifecycle = CaptureSessionLifecycle()
        val a = lifecycle.begin("A") {}
        val callbackA = lifecycle.register(a)!!
        val b = lifecycle.begin("B") {}
        val callbackB = lifecycle.register(b)!!
        assertFalse(lifecycle.isCurrent(callbackA))
        var cleared = false
        assertFalse(lifecycle.stop(a) { cleared = true })
        assertFalse(cleared)
        assertTrue(lifecycle.isCurrent(callbackB))
    }

    @Test fun sameTripRestartDoesNotReviveOldGeneration() {
        val lifecycle = CaptureSessionLifecycle()
        val first = lifecycle.begin("A") {}
        val old = lifecycle.register(first)!!
        lifecycle.stop {}
        val second = lifecycle.begin("A") {}
        assertFalse(lifecycle.isCurrent(first))
        assertFalse(lifecycle.isCurrent(old))
        assertTrue(lifecycle.isCurrent(second))
    }

    @Test fun stopInvalidatesPendingRegistration() {
        val lifecycle = CaptureSessionLifecycle()
        val session = lifecycle.begin("A") {}
        val pending = lifecycle.register(session)!!
        lifecycle.stop {}
        assertFalse(lifecycle.isCurrent(pending))
        assertNull(lifecycle.register(session))
    }

    @Test fun cadenceChangeInvalidatesOnlyPreviousRegistration() {
        val lifecycle = CaptureSessionLifecycle()
        val session = lifecycle.begin("A") {}
        val old = lifecycle.register(session)!!
        val next = lifecycle.register(session)!!
        assertFalse(lifecycle.isCurrent(old))
        assertTrue(lifecycle.isCurrent(next))
        lifecycle.invalidate()
        assertFalse(lifecycle.isCurrent(next))
    }

    @Test fun stopWaitsForInitializationAndClearsPersistedTripLast() {
        val lifecycle = CaptureSessionLifecycle()
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val stopped = CountDownLatch(1)
        var stored: String? = null
        val start = thread {
            lifecycle.begin("A") {
                entered.countDown()
                check(release.await(5, TimeUnit.SECONDS))
                stored = "A"
            }
        }
        assertTrue(entered.await(5, TimeUnit.SECONDS))
        val stop = thread {
            lifecycle.stop { stored = null }
            stopped.countDown()
        }
        release.countDown()
        assertTrue(stopped.await(5, TimeUnit.SECONDS))
        start.join(5000); stop.join(5000)
        assertNull(stored)
        assertNull(lifecycle.current)
    }

    @Test fun failedInitializationCannotAuthorizeCallback() {
        val lifecycle = CaptureSessionLifecycle()
        val previous = lifecycle.begin("A") {}
        try { lifecycle.begin("B") { error("storage failure") } } catch (_: IllegalStateException) {}
        assertNull(lifecycle.current)
        assertNull(lifecycle.register(previous))
    }
}
