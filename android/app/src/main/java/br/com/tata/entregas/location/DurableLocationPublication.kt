package br.com.tata.entregas.location

/**
 * Decisão pura: um ponto só pode ser exibido como atual depois que o Room
 * confirmou uma nova linha E a identidade da viagem ainda é a mesma.
 *
 * Uma duplicata (-1L), inserção sem identidade (0L) ou sessão já encerrada
 * não autoriza nova publicação. Falhas do Room devem propagar como erro;
 * nunca são convertidas em confirmação fictícia.
 */
internal object DurableLocationPublication {
    fun mayPublish(insertedRowId: Long, sameActiveSession: Boolean): Boolean =
        insertedRowId > 0L && sameActiveSession
}
