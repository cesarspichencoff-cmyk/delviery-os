package br.com.tata.entregas

import android.app.Application
import androidx.work.Configuration
import br.com.tata.entregas.notify.TripNotification

/**
 * Application. WorkManager e' inicializado sob demanda (o initializer padrao
 * foi removido no manifest) para o app nao subir trabalho antes de existir
 * sessao — sincronizar sem token so' geraria 401 em loop.
 */
class EntregasApp : Application(), Configuration.Provider {

    override fun onCreate() {
        super.onCreate()
        TripNotification.ensureChannel(this)
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .build()
}
