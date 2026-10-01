package br.com.tata.entregas.sync

internal object LocalRetentionPolicy {
    const val MAX_DAYS = 36500
    private const val DAY_MS = 86_400_000L

    /**
     * Converte uma política já AUTORIZADA em corte local.
     *
     * Ausência, zero, valor absurdo ou relógio inválido preservam os dados.
     * Esta função não decide o prazo: só executa um prazo que veio do termo
     * publicável e foi vinculado ao hash daquele termo.
     */
    fun cutoffMs(nowMs: Long, days: Int?): Long? {
        if (nowMs < 0L) return null
        val d = days ?: return null
        if (d !in 1..MAX_DAYS) return null
        val window = d.toLong() * DAY_MS
        return (nowMs - window).coerceAtLeast(0L)
    }
}
