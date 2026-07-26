package br.com.tata.entregas

import android.location.Location
import android.os.Build
import br.com.tata.entregas.location.CanonicalPoint
import br.com.tata.entregas.notify.TripNotification
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Conversão Android -> canônico.
 *
 * O teste mais importante daqui é o do `point_id`: a fórmula tem de ser
 * IDÊNTICA à de `src/entregas/gps/validate.ts#pointId`. Se um lado mudar
 * sozinho, o servidor para de deduplicar e a fila offline passa a duplicar
 * ponto no reenvio — falha silenciosa, das piores.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.TIRAMISU])
class CanonicalPointTest {

    /** Coordenada sintética. Nunca localização real de funcionário ou cliente. */
    private val synthLat = -23.5
    private val synthLon = -46.6

    private fun location(
        time: Long = 1_774_000_000_000L,
        accuracy: Float = 12f,
        withSpeed: Boolean = true,
        withBearing: Boolean = true,
    ): Location = Location("fused").apply {
        latitude = synthLat
        longitude = synthLon
        this.accuracy = accuracy
        this.time = time
        elapsedRealtimeNanos = 1_000_000_000L
        if (withSpeed) speed = 5f
        if (withBearing) bearing = 90f
    }

    @Test
    fun `point_id usa a mesma formula do TypeScript`() {
        val occurredAt = "2026-04-01T12:00:00.000Z"
        assertEquals(
            "gps:dev-1:trip-1:$occurredAt",
            CanonicalPoint.pointId("dev-1", "trip-1", occurredAt),
        )
    }

    @Test
    fun `idempotency_key e point_id sao iguais, como no servidor`() {
        val p = CanonicalPoint.fromLocation(location(), "trip-1", "dev-1", false)
        assertEquals(p.pointId, p.idempotencyKey)
    }

    @Test
    fun `timestamp vira ISO em UTC com milissegundos`() {
        val p = CanonicalPoint.fromLocation(
            location(time = 1_774_000_000_000L),
            "trip-1",
            "dev-1",
            false,
        )
        assertTrue(p.occurredAt, p.occurredAt.matches(Regex("""\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z""")))
    }

    @Test
    fun `campos ausentes ficam ausentes, nunca zero`() {
        val p = CanonicalPoint.fromLocation(
            location(withSpeed = false, withBearing = false),
            "trip-1",
            "dev-1",
            false,
        )
        assertNull("velocidade ausente não vira 0", p.speedMps)
        assertNull("direção ausente não vira 0", p.headingDeg)
    }

    @Test
    fun `bearing do Android vira heading no canonico`() {
        val p = CanonicalPoint.fromLocation(location(), "trip-1", "dev-1", false)
        assertEquals(90.0, p.headingDeg!!, 0.001)
    }

    @Test
    fun `monotonico e preservado para detectar salto de relogio`() {
        val p = CanonicalPoint.fromLocation(location(), "trip-1", "dev-1", false)
        assertEquals(1_000_000_000L, p.elapsedRealtimeNanos)
    }

    @Test
    fun `mesma amostra duas vezes produz o mesmo id`() {
        val loc = location()
        val a = CanonicalPoint.fromLocation(loc, "trip-1", "dev-1", false)
        val b = CanonicalPoint.fromLocation(loc, "trip-1", "dev-1", false)
        assertEquals(a.pointId, b.pointId)
    }

    @Test
    fun `viagens diferentes nunca compartilham id`() {
        val loc = location()
        val a = CanonicalPoint.fromLocation(loc, "trip-1", "dev-1", false)
        val b = CanonicalPoint.fromLocation(loc, "trip-2", "dev-1", false)
        assertFalse(a.pointId == b.pointId)
    }

    @Test
    fun `json de envio carrega schema e flag de simulacao`() {
        val json = CanonicalPoint.fromLocation(location(), "trip-1", "dev-1", true).toJson()
        assertEquals("gps@1.0.0", json.getString("schema_version"))
        assertEquals("device", json.getString("source"))
        assertTrue(json.getBoolean("captured_offline"))
        assertTrue(json.has("is_mock"))
    }

    @Test
    fun `mensagem da ponte usa o formato que o AndroidBridgeProvider espera`() {
        val p = CanonicalPoint.fromLocation(location(), "trip-1", "dev-1", false)
        val m = p.toBridgeMessage(1_774_000_000_000L)
        assertEquals("location", m.getString("type"))
        assertTrue(m.has("accuracy_m"))
        assertTrue(m.has("bearing_deg"))
        assertTrue(m.has("time_ms"))
        assertTrue(m.has("elapsed_realtime_ns"))
    }

    @Test
    fun `notificacao nao contem dado de cliente`() {
        assertTrue(TripNotification.isSafe(TripNotification.TEXT))
        assertFalse(TripNotification.isSafe("Entregando na Rua X, 100"))
        assertFalse(TripNotification.isSafe("Pedido de R$ 90"))
        assertFalse(TripNotification.isSafe("lat -23.5 lon -46.6"))
    }

    @Test
    fun `linha de status fala de sinal e fila, nunca de lugar`() {
        val line = TripNotification.statusLine(3, "offline")
        assertTrue(TripNotification.isSafe(line))
        assertTrue(line.contains("3 aguardando envio"))
    }
}
