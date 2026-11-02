package br.com.tata.entregas.location

/**
 * Planejamento de provedores, sem registrar localização nem conceder permissões.
 * O serviço deve consultar Play Services via GoogleApiAvailability antes de
 * usar este seletor. SYSTEM_* ainda não é um backend operacional integrado.
 */
internal enum class LocationBackend { GOOGLE_FUSED, SYSTEM_GPS, SYSTEM_NETWORK, UNAVAILABLE }

internal data class LocationCapabilities(
    val playServicesAvailable: Boolean,
    val gpsEnabled: Boolean,
    val networkEnabled: Boolean,
    val fineGranted: Boolean,
    val coarseGranted: Boolean,
)

internal object LocationBackendSelector {
    fun select(c: LocationCapabilities): LocationBackend {
        if (!c.fineGranted && !c.coarseGranted) return LocationBackend.UNAVAILABLE
        if (!c.gpsEnabled && !c.networkEnabled) return LocationBackend.UNAVAILABLE
        if (c.playServicesAvailable) return LocationBackend.GOOGLE_FUSED
        if (c.fineGranted && c.gpsEnabled) return LocationBackend.SYSTEM_GPS
        if (c.networkEnabled) return LocationBackend.SYSTEM_NETWORK
        return LocationBackend.UNAVAILABLE
    }
}
