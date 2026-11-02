package br.com.tata.entregas

import br.com.tata.entregas.location.CaptureSessionLifecycle
import br.com.tata.entregas.location.DurableLocationPublication
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DurableLocationPublicationTest {
    @Test fun freshRowAndSameSessionCanPublish() {
        val s = CaptureSessionLifecycle()
        val trip = s.begin("A") {}
        assertTrue(DurableLocationPublication.mayPublish(1L, s.isCurrent(trip)))
    }

    @Test fun duplicateRowNeverPublishes() {
        val s = CaptureSessionLifecycle()
        val trip = s.begin("A") {}
        assertFalse(DurableLocationPublication.mayPublish(-1L, s.isCurrent(trip)))
    }

    @Test fun nonPositiveRowNeverPublishes() {
        assertFalse(DurableLocationPublication.mayPublish(0L, true))
        assertFalse(DurableLocationPublication.mayPublish(-99L, true))
    }

    @Test fun stoppedSessionNeverPublishesEvenAfterRoomInsert() {
        val s = CaptureSessionLifecycle()
        val trip = s.begin("A") {}
        s.stop {}
        assertFalse(DurableLocationPublication.mayPublish(7L, s.isCurrent(trip)))
    }

    @Test fun oldSessionCannotPublishIntoReusedTripId() {
        val s = CaptureSessionLifecycle()
        val old = s.begin("A") {}
        s.stop {}
        val current = s.begin("A") {}
        assertFalse(DurableLocationPublication.mayPublish(7L, s.isCurrent(old)))
        assertTrue(DurableLocationPublication.mayPublish(8L, s.isCurrent(current)))
    }

    @Test fun previousTripCannotPublishAfterTripSwitch() {
        val s = CaptureSessionLifecycle()
        val old = s.begin("A") {}
        val current = s.begin("B") {}
        assertFalse(DurableLocationPublication.mayPublish(7L, s.isCurrent(old)))
        assertTrue(DurableLocationPublication.mayPublish(7L, s.isCurrent(current)))
    }

    @Test fun largeInsertedRowIdAllowedOnlyCurrentSession() {
        assertFalse(DurableLocationPublication.mayPublish(Long.MAX_VALUE, false))
        assertTrue(DurableLocationPublication.mayPublish(Long.MAX_VALUE, true))
    }
}
