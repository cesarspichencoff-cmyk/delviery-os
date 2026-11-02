package br.com.tata.entregas

import br.com.tata.entregas.location.LocationBackend
import br.com.tata.entregas.location.LocationBackendSelector
import br.com.tata.entregas.location.LocationCapabilities
import org.junit.Assert.assertEquals
import org.junit.Test

/** Somente decisão pura; NÃO comprova registro Android ou funcionamento sem GMS. */
class LocationBackendSelectorTest {
    private val base = LocationCapabilities(
        playServicesAvailable = true, gpsEnabled = true, networkEnabled = true,
        fineGranted = true, coarseGranted = true,
    )
    private fun expect(expected: LocationBackend, c: LocationCapabilities) =
        assertEquals(expected, LocationBackendSelector.select(c))

    @Test fun fusedWhenPlayServicesAvailable() =
        expect(LocationBackend.GOOGLE_FUSED, base)

    @Test fun nativeGpsWithFineAndNoPlayServices() =
        expect(LocationBackend.SYSTEM_GPS, base.copy(playServicesAvailable = false))

    @Test fun nativeNetworkWhenOnlyCoarseAvailable() =
        expect(LocationBackend.SYSTEM_NETWORK, base.copy(
            playServicesAvailable = false, fineGranted = false,
        ))

    @Test fun nativeNetworkWhenGpsDisabled() =
        expect(LocationBackend.SYSTEM_NETWORK, base.copy(
            playServicesAvailable = false, gpsEnabled = false,
        ))

    @Test fun nativeGpsWhenNetworkDisabled() =
        expect(LocationBackend.SYSTEM_GPS, base.copy(
            playServicesAvailable = false, networkEnabled = false,
        ))

    @Test fun coarseDoesNotEscalateToGps() =
        expect(LocationBackend.UNAVAILABLE, base.copy(
            playServicesAvailable = false, networkEnabled = false, fineGranted = false,
        ))

    @Test fun noPermissionsDenied() =
        expect(LocationBackend.UNAVAILABLE, base.copy(fineGranted = false, coarseGranted = false))

    @Test fun noProviderDenied() =
        expect(LocationBackend.UNAVAILABLE, base.copy(gpsEnabled = false, networkEnabled = false))

    @Test fun fusedCanUseNetworkWithCoarseWhenAvailable() =
        expect(LocationBackend.GOOGLE_FUSED, base.copy(fineGranted = false, gpsEnabled = false))

    @Test fun nativeNetworkWhenGpsAbsent() =
        expect(LocationBackend.SYSTEM_NETWORK, base.copy(
            playServicesAvailable = false, fineGranted = false, gpsEnabled = false,
        ))

    @Test fun noGmsAndNoNetworkWithCoarseDenied() =
        expect(LocationBackend.UNAVAILABLE, base.copy(
            playServicesAvailable = false, fineGranted = false, networkEnabled = false,
        ))

    @Test fun noGmsNoProviderDenied() =
        expect(LocationBackend.UNAVAILABLE, base.copy(
            playServicesAvailable = false, gpsEnabled = false, networkEnabled = false,
        ))

    @Test fun noGmsNoProviderWithFineDenied() =
        expect(LocationBackend.UNAVAILABLE, base.copy(
            playServicesAvailable = false, gpsEnabled = false, networkEnabled = false,
            coarseGranted = false,
        ))

    @Test fun fusedFailureUsesNativeGpsEvenIfGoogleServicesAppearAvailable() =
        expectAfterFailure(LocationBackend.SYSTEM_GPS, base)

    @Test fun fusedFailureFallsBackToNetworkWithCoarseOnly() =
        expectAfterFailure(LocationBackend.SYSTEM_NETWORK, base.copy(fineGranted = false))

    @Test fun fusedFailureNoNativeProviderFailsClosed() =
        expectAfterFailure(LocationBackend.UNAVAILABLE, base.copy(
            gpsEnabled = false, networkEnabled = false,
        ))

    @Test fun fusedFailureCannotEscalateCoarseToGps() =
        expectAfterFailure(LocationBackend.UNAVAILABLE, base.copy(
            fineGranted = false, networkEnabled = false,
        ))

    @Test fun fusedFailureOnRevokedPermissionFailsClosed() =
        expectAfterFailure(LocationBackend.UNAVAILABLE, base.copy(
            fineGranted = false, coarseGranted = false,
        ))

    @Test fun fusedFailureCannotRetryGoogleEvenWhenAvailable() {
        for (fine in listOf(false, true)) {
            for (coarse in listOf(false, true)) {
                for (gps in listOf(false, true)) {
                    for (network in listOf(false, true)) {
                        val c = base.copy(
                            fineGranted = fine, coarseGranted = coarse,
                            gpsEnabled = gps, networkEnabled = network,
                        )
                        val target = LocationBackendSelector.afterFusedFailure(c)
                        assert(target != LocationBackend.GOOGLE_FUSED) {
                            "Native recovery cannot choose Google again"
                        }
                        assertEquals(target, LocationBackendSelector.afterFusedFailure(
                            c.copy(playServicesAvailable = false),
                        ))
                    }
                }
            }
        }
    }

    private fun expectAfterFailure(expected: LocationBackend, c: LocationCapabilities) =
        assertEquals(expected, LocationBackendSelector.afterFusedFailure(c))
}
