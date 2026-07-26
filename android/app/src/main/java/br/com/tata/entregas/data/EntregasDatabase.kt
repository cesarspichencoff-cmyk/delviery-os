package br.com.tata.entregas.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * Persistência local. O aparelho é a primeira fonte durável: o ponto é
 * gravado ANTES de qualquer tentativa de rede.
 *
 * Duas coisas que o desenho garante:
 *  - `pointId` é a chave primária e a inserção é IGNORE. Reenviar, reiniciar
 *    o processo ou recuperar o serviço não duplica ponto — a mesma amostra
 *    tem sempre o mesmo id.
 *  - `sequenceLocal` é monotônico por dispositivo, para o servidor conseguir
 *    ordenar o que chegou fora de ordem sem depender do relógio.
 *
 * Coordenada mora aqui e no envio. Nunca em log comum.
 */
@Entity(tableName = "gps_point")
data class GpsPointEntity(
    @PrimaryKey val pointId: String,
    val idempotencyKey: String,
    val tripId: String,
    val deviceId: String,
    val latitude: Double,
    val longitude: Double,
    val accuracyM: Double,
    val speedMps: Double?,
    val headingDeg: Double?,
    val altitudeM: Double?,
    val occurredAt: String,
    val elapsedRealtimeNanos: Long,
    val provider: String,
    val isMock: Boolean,
    val capturedOffline: Boolean,
    val sequenceLocal: Long,
    /** pending · sending · sent · failed */
    val syncState: String,
    val attempts: Int,
    val lastError: String?,
    val createdAtMs: Long,
)

/**
 * Eventos operacionais gerados no aparelho (chegada relatada, entrega
 * confirmada, ocorrência). O Kotlin NÃO decide se a transição é válida: ele
 * apenas registra a intenção e a envia. Quem valida é o domínio no servidor.
 */
@Entity(tableName = "outbox_event")
data class OutboxEventEntity(
    @PrimaryKey val eventId: String,
    val idempotencyKey: String,
    val tripId: String?,
    val kind: String,
    /** JSON do comando, exatamente como o servidor espera. */
    val payload: String,
    val occurredAt: String,
    val sequenceLocal: Long,
    val syncState: String,
    val attempts: Int,
    val lastError: String?,
    val createdAtMs: Long,
)

/**
 * Recibo do aceite do termo. Append-only: `OnConflictStrategy.IGNORE` garante
 * que o primeiro registro prevalece e nada é reescrito depois.
 */
@Entity(tableName = "term_ack")
data class TermAckEntity(
    @PrimaryKey val acknowledgementId: String,
    val riderId: String,
    val unitId: String,
    val termVersion: String,
    val termMaterialVersion: String,
    val termHash: String,
    val status: String,
    val acceptedAt: String,
    val deviceId: String,
    val appVersion: String,
    val language: String,
    val origin: String,
    val correlationId: String,
    val schemaVersion: String,
    val syncState: String,
)

/** Estado mínimo do aparelho — sobrevive a recriação do processo. */
@Entity(tableName = "device_state")
data class DeviceStateEntity(
    @PrimaryKey val key: String,
    val value: String,
    val updatedAtMs: Long,
)

@Dao
interface GpsPointDao {
    /** IGNORE: mesma amostra duas vezes não vira dois pontos. */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(point: GpsPointEntity): Long

    @Query("SELECT * FROM gps_point WHERE syncState IN ('pending','failed') ORDER BY sequenceLocal ASC LIMIT :limit")
    suspend fun nextBatch(limit: Int): List<GpsPointEntity>

    @Query("UPDATE gps_point SET syncState = 'sent' WHERE pointId IN (:ids)")
    suspend fun markSent(ids: List<String>)

    @Query("UPDATE gps_point SET syncState = 'failed', attempts = attempts + 1, lastError = :error WHERE pointId IN (:ids)")
    suspend fun markFailed(ids: List<String>, error: String)

    @Query("SELECT COUNT(*) FROM gps_point WHERE syncState IN ('pending','failed')")
    suspend fun pendingCount(): Int

    @Query("SELECT COUNT(*) FROM gps_point WHERE tripId = :tripId")
    suspend fun countForTrip(tripId: String): Int

    @Query("SELECT IFNULL(MAX(sequenceLocal), 0) FROM gps_point")
    suspend fun maxSequence(): Long

    /** Expurgo por retenção. Só remove o que já subiu. */
    @Query("DELETE FROM gps_point WHERE syncState = 'sent' AND createdAtMs < :beforeMs")
    suspend fun purgeSyncedBefore(beforeMs: Long): Int
}

@Dao
interface OutboxEventDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(event: OutboxEventEntity): Long

    @Query("SELECT * FROM outbox_event WHERE syncState IN ('pending','failed') ORDER BY sequenceLocal ASC LIMIT :limit")
    suspend fun nextBatch(limit: Int): List<OutboxEventEntity>

    @Query("UPDATE outbox_event SET syncState = 'sent' WHERE eventId IN (:ids)")
    suspend fun markSent(ids: List<String>)

    @Query("UPDATE outbox_event SET syncState = 'failed', attempts = attempts + 1, lastError = :error WHERE eventId IN (:ids)")
    suspend fun markFailed(ids: List<String>, error: String)

    @Query("SELECT COUNT(*) FROM outbox_event WHERE syncState IN ('pending','failed')")
    suspend fun pendingCount(): Int

    @Query("SELECT IFNULL(MAX(sequenceLocal), 0) FROM outbox_event")
    suspend fun maxSequence(): Long
}

@Dao
interface TermAckDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(ack: TermAckEntity): Long

    @Query("SELECT * FROM term_ack WHERE riderId = :riderId AND termHash = :termHash AND status = 'accepted' LIMIT 1")
    suspend fun findAccepted(riderId: String, termHash: String): TermAckEntity?

    @Query("SELECT * FROM term_ack WHERE riderId = :riderId ORDER BY acceptedAt DESC")
    suspend fun history(riderId: String): List<TermAckEntity>

    @Query("SELECT * FROM term_ack WHERE acknowledgementId = :id LIMIT 1")
    suspend fun byId(id: String): TermAckEntity?

    @Query("SELECT * FROM term_ack WHERE syncState = 'pending'")
    suspend fun pending(): List<TermAckEntity>

    @Query("UPDATE term_ack SET syncState = 'sent' WHERE acknowledgementId IN (:ids)")
    suspend fun markSent(ids: List<String>)
}

@Dao
interface DeviceStateDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(state: DeviceStateEntity)

    @Query("SELECT value FROM device_state WHERE key = :key LIMIT 1")
    suspend fun get(key: String): String?

    @Query("DELETE FROM device_state WHERE key = :key")
    suspend fun clear(key: String)
}

@Database(
    entities = [
        GpsPointEntity::class,
        OutboxEventEntity::class,
        TermAckEntity::class,
        DeviceStateEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class EntregasDatabase : RoomDatabase() {
    abstract fun gpsPoints(): GpsPointDao
    abstract fun outbox(): OutboxEventDao
    abstract fun termAcks(): TermAckDao
    abstract fun deviceState(): DeviceStateDao

    companion object {
        const val KEY_ACTIVE_TRIP = "active_trip_id"
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_RIDER_ID = "rider_id"
        const val KEY_SESSION_TOKEN = "session_token"

        @Volatile
        private var instance: EntregasDatabase? = null

        fun get(context: Context): EntregasDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    EntregasDatabase::class.java,
                    "entregas.db",
                )
                    // Sem fallbackToDestructiveMigration: perder ponto de
                    // viagem por causa de upgrade seria inaceitável.
                    .build()
                    .also { instance = it }
            }
    }
}
