package br.com.tata.entregas.sync

import java.security.MessageDigest

/** SHA-256 hex do segredo local. É prova de vínculo, nunca credencial de sessão. */
internal fun enrollmentProofSha256(secret: String): String =
    MessageDigest.getInstance("SHA-256")
        .digest(secret.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
