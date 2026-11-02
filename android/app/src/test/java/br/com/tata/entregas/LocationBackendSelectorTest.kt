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
}
