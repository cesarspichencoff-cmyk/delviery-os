package br.com.tata.entregas.notify

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import br.com.tata.entregas.R
import br.com.tata.entregas.ui.MainActivity

/**
 * Notificação persistente da viagem.
 *
 * O texto é fixo e pobre DE PROPÓSITO: a notificação fica visível na tela de
 * bloqueio, onde qualquer pessoa perto do motoboy consegue ler. Endereço,
 * coordenada, valor do pedido ou nome de cliente ali seriam vazamento — e
 * `isSafe()` existe para o teste afirmar a regra, não só a constante atual.
 */
object TripNotification {

    const val CHANNEL_ID = "entregas_viagem"
    const val NOTIFICATION_ID = 4201

    const val TEXT = "TATÁ Entregas — localização ativa durante a viagem"

    /** Termos que jamais podem aparecer na notificação. */
    val FORBIDDEN_TERMS = listOf(
        "rua", "avenida", "número", "cliente", "pedido", "r$", "valor", "lat", "lon",
    )

    fun isSafe(text: String): Boolean {
        val lower = text.lowercase()
        return FORBIDDEN_TERMS.none { lower.contains(it) }
    }

    fun ensureChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.notification_channel_name),
            // LOW: precisa ficar visível, não precisa fazer barulho a cada
            // ponto. Notificação que incomoda vira notificação silenciada.
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = context.getString(R.string.notification_channel_description)
            setShowBadge(false)
            enableVibration(false)
            enableLights(false)
        }
        manager.createNotificationChannel(channel)
    }

    /**
     * Constrói a notificação. Tocar nela reabre a viagem.
     *
     * Não há ação de "parar" aqui: parar o GPS é consequência de encerrar,
     * cancelar ou abandonar a viagem — atos que passam pelo domínio e geram
     * evento. Um botão que desligasse a captura sem passar por isso criaria
     * um caminho de parada sem registro, e o contrato não permite.
     */
    fun build(context: Context, statusLine: String): Notification {
        require(isSafe(TEXT)) { "texto da notificação viola a regra de conteúdo" }
        require(isSafe(statusLine)) { "linha de status viola a regra de conteúdo" }

        val open = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        return NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(TEXT)
            .setContentText(statusLine)
            .setSmallIcon(R.drawable.ic_stat_entregas)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            // Conteúdo aparece na tela de bloqueio porque já é seguro por
            // construção — e o motoboy precisa ver que está ativo.
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()
    }

    /**
     * Linha de status. Fala de estado de sinal e de pendência de envio —
     * nunca de onde a pessoa está.
     */
    fun statusLine(pendingSync: Int, freshness: String): String {
        val base = when (freshness) {
            "current" -> "Sinal bom"
            "stale" -> "Sinal antigo"
            "inaccurate" -> "Sinal impreciso"
            "offline" -> "Sem rede"
            "unavailable" -> "Sem sinal de GPS"
            else -> "Aguardando sinal"
        }
        return if (pendingSync > 0) "$base · $pendingSync aguardando envio" else base
    }
}
