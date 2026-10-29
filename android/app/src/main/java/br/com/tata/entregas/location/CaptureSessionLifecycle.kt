package br.com.tata.entregas.location

/**
 * Identidade da captura, independente do trip_id (que pode ser repetido).
 * START e STOP incluem a escrita local sob o mesmo monitor: um startup antigo
 * nunca pode regravar a viagem depois de uma parada concluída.
 *
 * O serviço chama as transições no main thread; a sincronização também torna
 * explícita a ordem da persistência e permite provar a corrida sem Android.
 */
internal class CaptureSessionLifecycle {
    class Session internal constructor(val tripId: String)
    class Registration internal constructor(val session: Session)

    @Volatile var current: Session? = null
        private set
    @Volatile private var registration: Registration? = null

    @Synchronized
    fun begin(tripId: String, initialize: () -> Unit): Session {
        require(tripId.isNotBlank())
        current = null
        registration = null
        initialize()
        return Session(tripId).also { current = it }
    }

    @Synchronized
    fun stop(expected: Session? = null, clear: () -> Unit): Boolean {
        if (expected != null && current !== expected) return false
        current = null
        registration = null
        clear()
        return true
    }

    @Synchronized
    fun register(session: Session): Registration? {
        if (!isCurrent(session)) return null
        return Registration(session).also { registration = it }
    }

    fun isCurrent(session: Session): Boolean = current === session
    fun isCurrent(candidate: Registration): Boolean =
        current === candidate.session && registration === candidate

    /** Destruição pelo sistema preserva Room para recuperação, mas invalida callbacks. */
    @Synchronized
    fun invalidate() {
        current = null
        registration = null
    }
}
