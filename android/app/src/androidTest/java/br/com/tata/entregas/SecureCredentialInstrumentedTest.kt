package br.com.tata.entregas

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import br.com.tata.entregas.data.DeviceStateEntity
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.GpsPointEntity
import br.com.tata.entregas.sync.DeviceSession
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest

@RunWith(AndroidJUnit4::class)
class SecureCredentialInstrumentedTest {
    private val alias = "tata_entregas_credentials_v1"
    private lateinit var dbFile: File
    private lateinit var db: EntregasDatabase

    private fun open(): EntregasDatabase =
        Room.databaseBuilder(
            ApplicationProvider.getApplicationContext(),
            EntregasDatabase::class.java,
            dbFile.name,
        ).build()

    private fun deleteCredentialKey() {
        KeyStore.getInstance("AndroidKeyStore").apply {
            load(null)
            if (containsAlias(alias)) deleteEntry(alias)
        }
    }

    @Before
    fun setUp() {
        deleteCredentialKey()
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        dbFile = ctx.getDatabasePath("entregas-secure-${System.nanoTime()}.db")
        db = open()
    }

    @After
    fun tearDown() {
        db.close()
        dbFile.delete()
        deleteCredentialKey()
    }

    @Test
    fun segredo_novo_fica_cifrado_e_sobrevive_reabertura_do_banco() = runBlocking {
        val clear = DeviceSession.segredoDoAparelho(db, 1_000L)
        val stored = db.deviceState().get(DeviceSession.KEY_DEVICE_SECRET)

        assertTrue(clear.length >= 32)
        assertTrue(stored?.startsWith("enc:v1:") == true)
        assertFalse(stored == clear)
        assertFalse(stored.orEmpty().contains(clear))

        db.close()
        db = open()
        assertEquals(clear, DeviceSession.segredoDoAparelho(db, 2_000L))
    }

    @Test
    fun segredo_legado_em_claro_e_migrado_sem_trocar_identidade() = runBlocking {
        val legacy = "a".repeat(32)
        db.deviceState().put(DeviceStateEntity(DeviceSession.KEY_DEVICE_SECRET, legacy, 1_000L))

        val clear = DeviceSession.segredoDoAparelho(db, 2_000L)
        val stored = db.deviceState().get(DeviceSession.KEY_DEVICE_SECRET)

        assertEquals(legacy, clear)
        assertTrue(stored?.startsWith("enc:v1:") == true)
        assertFalse(stored == legacy)
    }

    @Test
    fun token_novo_fica_cifrado_e_continua_util_depois_de_reabrir() = runBlocking {
        DeviceSession.gravar(
            db = db,
            token = "token-super-secreto-fixture",
            expiraEmMs = 9_999_999L,
            actorId = "rid-1",
            agoraMs = 1_000L,
        )

        val stored = db.deviceState().get(EntregasDatabase.KEY_SESSION_TOKEN)
        assertTrue(stored?.startsWith("enc:v1:") == true)
        assertFalse(stored.orEmpty().contains("token-super-secreto-fixture"))
        assertEquals("token-super-secreto-fixture", DeviceSession.sessaoAtual(db)?.token)

        db.close()
        db = open()
        assertEquals("token-super-secreto-fixture", DeviceSession.sessaoAtual(db)?.token)
    }

    @Test
    fun token_legado_em_claro_e_migrado_no_primeiro_uso() = runBlocking {
        db.deviceState().put(
            DeviceStateEntity(
                EntregasDatabase.KEY_SESSION_TOKEN,
                "token-legado-em-claro",
                1_000L,
            ),
        )
        db.deviceState().put(
            DeviceStateEntity(DeviceSession.KEY_TOKEN_EXPIRA_EM, "9999999", 1_000L),
        )

        assertEquals("token-legado-em-claro", DeviceSession.sessaoAtual(db)?.token)
        val stored = db.deviceState().get(EntregasDatabase.KEY_SESSION_TOKEN)
        assertTrue(stored?.startsWith("enc:v1:") == true)
        assertFalse(stored == "token-legado-em-claro")
    }

    @Test
    fun codigo_de_vinculo_e_sha256_estavel_do_segredo_sem_expor_o_segredo() = runBlocking {
        val secret = DeviceSession.segredoDoAparelho(db, 1_000L)
        val expected = MessageDigest.getInstance("SHA-256")
            .digest(secret.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

        val proof = DeviceSession.provaDeVinculo(db, 2_000L)
        assertEquals(expected, proof)
        assertTrue(proof.matches(Regex("^[0-9a-f]{64}$")))
        assertFalse(proof.contains(secret))

        db.close()
        db = open()
        assertEquals(proof, DeviceSession.provaDeVinculo(db, 3_000L))
        assertTrue(db.deviceState().get(DeviceSession.KEY_DEVICE_SECRET)?.startsWith("enc:v1:") == true)
    }

    @Test
    fun perda_da_chave_falha_fechado_sem_apagar_fila_nem_regenerar_segredo() = runBlocking {
        val clearSecret = DeviceSession.segredoDoAparelho(db, 1_000L)
        DeviceSession.gravar(
            db = db,
            token = "token-que-pode-ser-renovado",
            expiraEmMs = 9_999_999L,
            actorId = "rid-1",
            agoraMs = 1_000L,
        )
        val sealedSecret = db.deviceState().get(DeviceSession.KEY_DEVICE_SECRET)
        db.gpsPoints().insert(
            GpsPointEntity(
                pointId = "gps:dev-1:trip-1:2026-10-01T12:00:00.000Z",
                idempotencyKey = "gps:dev-1:trip-1:2026-10-01T12:00:00.000Z",
                tripId = "trip-1",
                deviceId = "dev-1",
                latitude = -23.5,
                longitude = -46.6,
                accuracyM = 12.0,
                speedMps = null,
                headingDeg = null,
                altitudeM = null,
                occurredAt = "2026-10-01T12:00:00.000Z",
                elapsedRealtimeNanos = 1L,
                provider = "fused",
                isMock = false,
                capturedOffline = false,
                sequenceLocal = 1L,
                syncState = "pending",
                attempts = 0,
                lastError = null,
                createdAtMs = 1_000L,
            ),
        )

        deleteCredentialKey()

        assertNull("token indecifrável deve forçar bootstrap", DeviceSession.sessaoAtual(db))
        assertNull(db.deviceState().get(EntregasDatabase.KEY_SESSION_TOKEN))
        assertEquals(1, db.gpsPoints().pendingCount())
        assertEquals(sealedSecret, db.deviceState().get(DeviceSession.KEY_DEVICE_SECRET))

        var failedClosed = false
        try {
            DeviceSession.segredoDoAparelho(db, 2_000L)
        } catch (_: IllegalStateException) {
            failedClosed = true
        }
        assertTrue("segredo perdido não pode ser regenerado silenciosamente", failedClosed)
        assertEquals(sealedSecret, db.deviceState().get(DeviceSession.KEY_DEVICE_SECRET))
        assertFalse(sealedSecret.orEmpty().contains(clearSecret))
    }
}
