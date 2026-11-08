package br.com.tata.entregas

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.WorkManagerTestInitHelper
import br.com.tata.entregas.sync.SyncScheduler
import br.com.tata.entregas.sync.SyncWorker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import java.util.concurrent.TimeUnit

/**
 * Scheduler-only tests using WorkManagerTestInitHelper and its disposable DB.
 *
 * Work is enqueued, never triggered: no Worker execution, no network, no GPS,
 * no receipt or external side effect. These tests prove uniqueness and lane
 * isolation, not 15-minute real-clock execution or device power policies.
 */
@RunWith(RobolectricTestRunner::class)
class SyncSchedulerWorkManagerTest {
    private lateinit var context: Context
    private lateinit var manager: WorkManager

    @Before fun setup() {
        context = RuntimeEnvironment.getApplication()
        WorkManagerTestInitHelper.initializeTestWorkManager(context)
        manager = WorkManager.getInstance(context)
    }

    private fun info(unique: String): List<WorkInfo> =
        manager.getWorkInfosForUniqueWork(unique).get(15, TimeUnit.SECONDS)

    @Test fun periodicUniqueKeepDoesNotStackNewJobs() {
        SyncScheduler.ensurePeriodic(context)
        val first = info(SyncWorker.UNIQUE_PERIODIC)
        assertEquals(1, first.size)
        assertEquals(WorkInfo.State.ENQUEUED, first.single().state)

        SyncScheduler.ensurePeriodic(context)
        val second = info(SyncWorker.UNIQUE_PERIODIC)
        assertEquals(1, second.size)
        assertEquals(first.single().id, second.single().id)
    }

    @Test fun repeatedNowRequestsUseKeepAndSingleWorkId() {
        SyncScheduler.requestNow(context)
        val first = info(SyncWorker.UNIQUE_NOW)
        assertEquals(1, first.size)
        assertEquals(WorkInfo.State.ENQUEUED, first.single().state)

        SyncScheduler.requestNow(context)
        val second = info(SyncWorker.UNIQUE_NOW)
        assertEquals(1, second.size)
        assertEquals(first.single().id, second.single().id)
    }

    @Test fun periodicAndNowHaveIndependentIdentities() {
        SyncScheduler.ensurePeriodic(context)
        val periodic = info(SyncWorker.UNIQUE_PERIODIC).single()
        SyncScheduler.requestNow(context)
        val now = info(SyncWorker.UNIQUE_NOW).single()

        assertNotEquals(periodic.id, now.id)
        assertEquals(WorkInfo.State.ENQUEUED, periodic.state)
        assertEquals(WorkInfo.State.ENQUEUED, now.state)
        assertTrue(SyncWorker.UNIQUE_NOW.endsWith("-v2"))
        assertTrue(SyncWorker.UNIQUE_PERIODIC.endsWith("-v2"))
    }

    @Test fun legacyImmediateJobIsCancelledWithoutCancellingV2() {
        val legacy = OneTimeWorkRequestBuilder<SyncWorker>().build()
        manager.enqueueUniqueWork(
            "entregas-sync-now", ExistingWorkPolicy.KEEP, legacy,
        ).result.get(15, TimeUnit.SECONDS)
        assertEquals(WorkInfo.State.ENQUEUED, info("entregas-sync-now").single().state)

        SyncScheduler.requestNow(context)
        val old = info("entregas-sync-now").single()
        val current = info(SyncWorker.UNIQUE_NOW).single()
        assertEquals(WorkInfo.State.CANCELLED, old.state)
        assertEquals(WorkInfo.State.ENQUEUED, current.state)
    }
}
