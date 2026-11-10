package br.com.tata.entregas

import android.content.Context
import androidx.room.Room
import androidx.work.ListenableWorker
import androidx.work.testing.TestListenableWorkerBuilder
import br.com.tata.entregas.data.DeviceStateEntity
import br.com.tata.entregas.data.EntregasDatabase
import br.com.tata.entregas.data.GpsPointEntity
import br.com.tata.entregas.data.OutboxEventEntity
import br.com.tata.entregas.data.TermAckEntity
import br.com.tata.entregas.sync.ApiResult
import br.com.tata.entregas.sync.DeviceSession
import br.com.tata.entregas.sync.EntregasApi
import br.com.tata.entregas.sync.SyncWorker
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockkConstructor
import io.mockk.mockkObject
import io.mockk.unmockkAll
import io.mockk.verify
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * Executes the actual SyncWorker.doWork() through the WorkManager test
 * constructor and a persistent Room SQLite database. All network responses
 * are mocked at EntregasApi's method boundary: NO external HTTP or device.
 */
@RunWith(RobolectricTestRunner::class)
class SyncWorkerWorkManager4xxTest {
    private lateinit var context: Context
    private lateinit var dbName: String
    private lateinit var db: EntregasDatabase
    private var pilotResult: ApiResult<JSONObject> =
        ApiResult.Rejected("fixture-403", 403)
    private var gpsResult: ApiResult<JSONObject> =
        ApiResult.Retryable("gps-unavailable", 503)
    private var queueResult: ApiResult<JSONObject> = ApiResult.Ok(JSONObject())
    private var termResult: ApiResult<JSONObject> =
        ApiResult.Rejected("fixture-term-unconfirmed", 422)

    private fun open(): EntregasDatabase =
        Room.databaseBuilder(context, EntregasDatabase::class.java, dbName).build()

    @Before fun setup() {
        runBlocking {
        context = RuntimeEnvironment.getApplication()
        dbName = "sync-workmanager-4xx-${System.nanoTime()}.db"
        db = open()
        db.deviceState().put(
            DeviceStateEntity(EntregasDatabase.KEY_RIDER_ID, "actor-fixture", 1L),
        )
        db.deviceState().put(
            DeviceStateEntity(EntregasDatabase.KEY_DEVICE_ID, "device-fixture", 1L),
        )
        // No Keystore enrollment or live platform bootstrap in this fixture.
        mockkObject(EntregasDatabase.Companion)
        every { EntregasDatabase.get(any()) } answers { db }
        mockkObject(DeviceSession)
        coEvery { DeviceSession.estaRevogado(any()) } returns false
        coEvery { DeviceSession.sessaoAtual(any()) } returns
            DeviceSession.Sessao("FAKE-PLATFORM-BEARER", Long.MAX_VALUE)
        every { DeviceSession.precisaAutenticar(any(), any()) } returns false

        mockkConstructor(EntregasApi::class)
        every {
            anyConstructed<EntregasApi>().requestPilotWriteToken(any(), any())
        } returns ApiResult.Ok("FAKE-PILOT-WRITE-BEARER")
        every { anyConstructed<EntregasApi>().sendEvents(any(), any()) } answers { pilotResult }
        every { anyConstructed<EntregasApi>().sendPoints(any(), any()) } answers { gpsResult }
        every { anyConstructed<EntregasApi>().sendQueueDepth(any(), any()) } answers { queueResult }
        every { anyConstructed<EntregasApi>().sendTermAcknowledgement(any()) } answers { termResult }
        // Policies are not part of the 4xx receipt proof; no remote call.
        every { anyConstructed<EntregasApi>().policies() } returns
            ApiResult.Retryable("fixture-policy-unavailable", 503)
        }
    }

    @After fun teardown() {
        db.close()
        context.deleteDatabase(dbName)
        unmockkAll()
    }

    private fun event(id: String, n: Long) = OutboxEventEntity(
        eventId = id,
        idempotencyKey = "key-$id",
        tripId = "trip-fixture",
        kind = "fixture",
        payload = """{"ficticio":true}""",
        occurredAt = "2026-11-08T12:30:00Z",
        sequenceLocal = n,
        syncState = "pending",
        attempts = 0,
        lastError = null,
        createdAtMs = 1_000L,
    )

    private fun point(id: String, n: Long) = GpsPointEntity(
        pointId = id,
        idempotencyKey = "gps-key-$id",
        tripId = "trip-fixture",
        deviceId = "device-fixture",
        latitude = 0.0,
        longitude = 0.0,
        accuracyM = 3.0,
        speedMps = null,
        headingDeg = null,
        altitudeM = null,
        occurredAt = "2026-11-08T12:30:00Z",
        elapsedRealtimeNanos = n,
        provider = "fixture",
        isMock = false,
        capturedOffline = true,
        sequenceLocal = n,
        syncState = "pending",
        attempts = 0,
        lastError = null,
        createdAtMs = 1_000L,
    )

    private fun termAck(id: String = "term-fixture-01") = TermAckEntity(
        acknowledgementId = id,
        riderId = "actor-fixture",
        unitId = "ITAIM",
        termVersion = "term-v1",
        termMaterialVersion = "material-v1",
        termHash = "hash-fixture",
        status = "accepted",
        acceptedAt = "2026-11-08T12:30:00Z",
        deviceId = "device-fixture",
        appVersion = "lab-debug",
        language = "pt-BR",
        origin = "rider_app",
        correlationId = "correlation-fixture",
        schemaVersion = "consent@1.0.0",
        syncState = "pending",
    )

    private fun matchingTermReceipt(ack: TermAckEntity) = JSONObject()
        .put("ok", true)
        .put("acknowledgement_id", ack.acknowledgementId)
        .put("receipt", JSONObject()
            .put("recibo", ack.acknowledgementId)
            .put("unidade", ack.unitId)
            .put("versao_do_termo", ack.termVersion)
            .put("impressao_do_texto", ack.termHash)
            .put("aparelho", ack.deviceId)
            .put("situacao", "aceito"))

    private suspend fun invoke(attempt: Int): ListenableWorker.Result {
        val worker = TestListenableWorkerBuilder<SyncWorker>(context)
            .setRunAttemptCount(attempt)
            .build()
        return worker.doWork()
    }

    @Test fun pilot403WorkManagerFailurePreservesRoomAfterRestart() = runBlocking {
        val original = event("evt-403-worker", 1)
        db.outbox().insert(original)
        pilotResult = ApiResult.Rejected("pilot-forbidden", 403)
        assertTrue(invoke(0) is ListenableWorker.Result.Failure)
        verify(exactly = 1) { anyConstructed<EntregasApi>().sendEvents(any(), any()) }
        db.close()
        db = open()
        val row = db.outbox().nextBatch(20).single()
        assertEquals(original.eventId, row.eventId)
        assertEquals(original.idempotencyKey, row.idempotencyKey)
        assertEquals(original.payload, row.payload)
        assertEquals("failed", row.syncState)
        assertEquals(1, row.attempts)
        assertEquals(0, db.outbox().rejectedCount())
    }

    @Test fun domain422WithoutPerEventReceiptFailsEvenAfterRetryCap() = runBlocking {
        val first = event("evt-422-a", 1)
        val second = event("evt-422-b", 2)
        db.outbox().insert(first)
        db.outbox().insert(second)
        pilotResult = ApiResult.Rejected("whole-batch-422", 422)
        assertTrue(invoke(2) is ListenableWorker.Result.Failure)
        db.close()
        db = open()
        val rows = db.outbox().nextBatch(20)
        assertEquals(listOf(first.eventId, second.eventId), rows.map { it.eventId })
        assertEquals(listOf(first.idempotencyKey, second.idempotencyKey),
            rows.map { it.idempotencyKey })
        assertTrue(rows.all { it.syncState == "failed" && it.attempts == 1 })
        assertEquals(0, db.outbox().rejectedCount())
    }

    @Test fun concurrentGpsRetryAndUnreceipted409NeverReportSuccess() = runBlocking {
        db.outbox().insert(event("evt-gps-mixed", 1))
        db.gpsPoints().insert(point("gps-mixed", 1))
        pilotResult = ApiResult.Rejected("conflict-without-event-receipt", 409)
        gpsResult = ApiResult.Retryable("offline", 503)
        // GPS retry first: no false success and no terminal event state.
        assertTrue(invoke(0) is ListenableWorker.Result.Retry)
        assertEquals(1, db.gpsPoints().pendingCount())
        assertEquals(1, db.outbox().pendingCount())
        // After fast retry cap, the 4xx must remain visible as Failure.
        assertTrue(invoke(2) is ListenableWorker.Result.Failure)
        db.close()
        db = open()
        val row = db.outbox().nextBatch(20).single()
        assertEquals("evt-gps-mixed", row.eventId)
        assertEquals("key-evt-gps-mixed", row.idempotencyKey)
        assertEquals("failed", row.syncState)
        assertEquals(2, row.attempts)
        assertEquals(1, db.gpsPoints().pendingCount())
        assertEquals(0, db.outbox().rejectedCount())
    }

    @Test fun gpsBacklogContinuationOutranksPilot403WithoutEventLoss() = runBlocking {
        db.outbox().insert(event("evt-backlog-403", 1))
        repeat(301) { n -> db.gpsPoints().insert(point("gps-batch-$n", n.toLong() + 1)) }
        pilotResult = ApiResult.Rejected("blocked-pilot", 403)
        gpsResult = ApiResult.Ok(JSONObject().apply {
            put("accepted", 100)
            put("duplicate", 0)
            put("rejected", 0)
        })
        assertTrue(invoke(2) is ListenableWorker.Result.Retry)
        assertEquals(1, db.gpsPoints().pendingCount())
        assertEquals(1, db.outbox().pendingCount())
        db.close()
        db = open()
        val remaining = db.outbox().nextBatch(10).single()
        assertEquals("key-evt-backlog-403", remaining.idempotencyKey)
        assertEquals("failed", remaining.syncState)
        assertEquals(0, db.outbox().rejectedCount())
    }
    @Test fun gpsBatch422WithoutPointReceiptsPreservesRoomAfterRestart() = runBlocking {
        val first = point("gps-unreceipted-a", 1)
        val second = point("gps-unreceipted-b", 2)
        db.gpsPoints().insert(first)
        db.gpsPoints().insert(second)
        // O texto remoto nao pode ser gravado: pode carregar dados particulares.
        gpsResult = ApiResult.Rejected("segredo_remoto_nao_persistir", 422)
        assertTrue(invoke(2) is ListenableWorker.Result.Failure)
        verify(exactly = 1) { anyConstructed<EntregasApi>().sendPoints(any(), any()) }
        db.close()
        db = open()
        val rows = db.gpsPoints().nextBatch(20)
        assertEquals(listOf(first.pointId, second.pointId), rows.map { it.pointId })
        assertEquals(
            listOf(first.idempotencyKey, second.idempotencyKey),
            rows.map { it.idempotencyKey },
        )
        assertTrue(rows.all { it.syncState == "failed" && it.attempts == 1 })
        assertTrue(rows.all { it.lastError == "lote_gps_sem_recibo_http_422" })
        assertEquals(2, db.gpsPoints().pendingCount())
        assertEquals(0, db.gpsPoints().rejectedCount())
    }

    @Test fun gpsBatch409RepeatedNeverCreatesTerminalPointWithoutReceipt() = runBlocking {
        val original = point("gps-409-repeated", 1)
        db.gpsPoints().insert(original)
        gpsResult = ApiResult.Rejected("lote_sem_recibo", 409)
        repeat(2) { assertTrue(invoke(2) is ListenableWorker.Result.Failure) }
        db.close()
        db = open()
        val rows = db.gpsPoints().nextBatch(20)
        assertEquals(1, rows.size)
        val saved = rows.single()
        assertEquals(original.pointId, saved.pointId)
        assertEquals(original.idempotencyKey, saved.idempotencyKey)
        assertEquals(original.latitude, saved.latitude, 0.0)
        assertEquals(original.longitude, saved.longitude, 0.0)
        assertEquals("failed", saved.syncState)
        assertEquals(2, saved.attempts)
        assertEquals(0, db.gpsPoints().rejectedCount())
    }

    @Test fun gpsRepeated422RequiresReviewAndNewPointsStillSynchronize() = runBlocking {
        val original = point("gps-review-422", 1)
        db.gpsPoints().insert(original)
        gpsResult = ApiResult.Rejected("texto_remoto_nao_gravar", 422)

        // O terceiro envio total sem recibo fecha a porta automatica.
        repeat(3) { assertTrue(invoke(2) is ListenableWorker.Result.Failure) }
        verify(exactly = 3) { anyConstructed<EntregasApi>().sendPoints(any(), any()) }
        assertEquals(1, db.gpsPoints().reviewRequiredCount())
        assertTrue(db.gpsPoints().nextBatch(20).isEmpty())

        db.close()
        db = open()
        val held = db.gpsPoints().reviewRequiredPoints(20).single()
        assertEquals(original.pointId, held.pointId)
        assertEquals(original.idempotencyKey, held.idempotencyKey)
        assertEquals(original.sequenceLocal, held.sequenceLocal)
        assertEquals("failed", held.syncState)
        assertEquals(3, held.attempts)
        assertEquals("lote_gps_sem_recibo_http_422", held.lastError)
        assertEquals(1, db.gpsPoints().pendingCount())
        assertEquals(0, db.gpsPoints().rejectedCount())

        // Nem o agendamento futuro nem a resposta tardia sem recibo desfazem HOLD.
        assertTrue(invoke(2) is ListenableWorker.Result.Failure)
        verify(exactly = 3) { anyConstructed<EntregasApi>().sendPoints(any(), any()) }
        db.gpsPoints().markFailed(listOf(original.pointId), "timeout_atrasado")
        assertEquals("lote_gps_sem_recibo_http_422",
            db.gpsPoints().reviewRequiredPoints(20).single().lastError)
        assertEquals(3, db.gpsPoints().reviewRequiredPoints(20).single().attempts)

        // Um ponto novo nao fica preso atras da amostra sob revisao.
        db.gpsPoints().insert(point("gps-novo-apos-hold", 2))
        gpsResult = ApiResult.Ok(JSONObject()
            .put("accepted", 1).put("duplicate", 0).put("rejected", 0))
        assertTrue(invoke(2) is ListenableWorker.Result.Failure)
        verify(exactly = 4) { anyConstructed<EntregasApi>().sendPoints(any(), any()) }
        assertEquals(1, db.gpsPoints().reviewRequiredCount())
        assertEquals(1, db.gpsPoints().pendingCount())
        assertTrue(db.gpsPoints().nextBatch(20).isEmpty())
    }

    @Test fun gpsRepeated409StopsAutomaticSendButKeepsIdentity() = runBlocking {
        val original = point("gps-review-409", 1)
        db.gpsPoints().insert(original)
        gpsResult = ApiResult.Rejected("conflict-without-per-point-receipt", 409)
        repeat(3) { assertTrue(invoke(2) is ListenableWorker.Result.Failure) }
        verify(exactly = 3) { anyConstructed<EntregasApi>().sendPoints(any(), any()) }
        db.close()
        db = open()
        val held = db.gpsPoints().reviewRequiredPoints(20).single()
        assertEquals(original.pointId, held.pointId)
        assertEquals(original.idempotencyKey, held.idempotencyKey)
        assertEquals(3, held.attempts)
        assertEquals("lote_gps_sem_recibo_http_409", held.lastError)
        assertTrue(db.gpsPoints().nextBatch(20).isEmpty())
        assertEquals(1, db.gpsPoints().pendingCount())
        assertTrue(invoke(2) is ListenableWorker.Result.Failure)
        verify(exactly = 3) { anyConstructed<EntregasApi>().sendPoints(any(), any()) }
    }

    @Test fun term422WithoutPerAckReceiptFailsAndSurvivesSqliteRestart() = runBlocking {
        val ack = termAck("term-422")
        db.termAcks().insert(ack)
        termResult = ApiResult.Rejected("whole-term-422", 422)
        assertTrue(invoke(0) is ListenableWorker.Result.Failure)
        db.close()
        db = open()
        val row = db.termAcks().byId(ack.acknowledgementId)
        assertEquals("pending", row?.syncState)
        assertEquals(listOf(ack.acknowledgementId),
            db.termAcks().pending().map { it.acknowledgementId })
    }

    @Test fun malformedHttp200AckAtRetryCapNeverReturnsWorkerSuccess() = runBlocking {
        val ack = termAck("term-http200-incomplete")
        db.termAcks().insert(ack)
        // Server says HTTP 200 but cannot attest THIS device, term and actor.
        termResult = ApiResult.Ok(JSONObject()
            .put("ok", true)
            .put("acknowledgement_id", ack.acknowledgementId))
        assertTrue(invoke(0) is ListenableWorker.Result.Retry)
        assertTrue(invoke(2) is ListenableWorker.Result.Failure)
        db.close()
        db = open()
        assertEquals("pending", db.termAcks().byId(ack.acknowledgementId)?.syncState)
    }

    @Test fun validStoredTermReceiptCompletesWorkerAndPersistsSentAfterRestart() = runBlocking {
        val ack = termAck("term-valid-receipt")
        db.termAcks().insert(ack)
        termResult = ApiResult.Ok(matchingTermReceipt(ack))
        assertTrue(invoke(0) is ListenableWorker.Result.Success)
        db.close()
        db = open()
        assertEquals("sent", db.termAcks().byId(ack.acknowledgementId)?.syncState)
        assertEquals(0, db.termAcks().pending().size)
    }

}
