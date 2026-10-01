package br.com.tata.entregas.sync

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Cifra credenciais em repouso com uma chave não exportável do Android Keystore.
 *
 * Não protege um aparelho totalmente comprometido enquanto o processo está
 * executando: o app precisa conseguir usar a credencial. Protege o SQLite
 * extraído/copiado contra revelar token e segredo em texto puro.
 */
internal object LocalSecretCipher {
    const val PREFIX = "enc:v1:"
    private const val KEY_ALIAS = "tata_entregas_credentials_v1"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val TAG_BITS = 128
    private const val B64_FLAGS = Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING

    fun isSealed(value: String): Boolean = value.startsWith(PREFIX)
    fun seal(purpose: String, clear: String): String {
        require(purpose.isNotBlank()) { "purpose obrigatório" }
        require(clear.isNotEmpty()) { "valor vazio não é credencial" }
        try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key())
            cipher.updateAAD(purpose.toByteArray(StandardCharsets.UTF_8))
            val encrypted = cipher.doFinal(clear.toByteArray(StandardCharsets.UTF_8))
            val iv = Base64.encodeToString(cipher.iv, B64_FLAGS)
            val payload = Base64.encodeToString(encrypted, B64_FLAGS)
            return "$PREFIX$iv:$payload"
        } catch (e: Exception) {
            throw SecureCredentialStorageException("não foi possível cifrar credencial", e)
        }
    }

    fun open(purpose: String, sealed: String): String {
        require(purpose.isNotBlank()) { "purpose obrigatório" }
        if (!isSealed(sealed)) {
            throw SecureCredentialStorageException("credencial não está cifrada")
        }
        val parts = sealed.removePrefix(PREFIX).split(":", limit = 2)
        if (parts.size != 2 || parts.any { it.isBlank() }) {
            throw SecureCredentialStorageException("credencial cifrada malformada")
        }
        try {
            val iv = Base64.decode(parts[0], B64_FLAGS)
            val payload = Base64.decode(parts[1], B64_FLAGS)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, iv))
            cipher.updateAAD(purpose.toByteArray(StandardCharsets.UTF_8))
            return String(cipher.doFinal(payload), StandardCharsets.UTF_8)
        } catch (e: Exception) {
            throw SecureCredentialStorageException("não foi possível abrir credencial", e)
        }
    }

    @Synchronized
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = store.getKey(KEY_ALIAS, null)
        if (existing is SecretKey) return existing

        val generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore",
        )
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }
}

internal class SecureCredentialStorageException(
    message: String,
    cause: Throwable? = null,
) : IllegalStateException(message, cause)
