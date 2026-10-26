package mx.investmentchecker.tablet

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** PAT is encrypted with a non-exportable Android Keystore key; never logged. */
class SecureTokenStore(private val context: Context) {
    private val prefs = context.getSharedPreferences("sync_config", Context.MODE_PRIVATE)
    private val alias = "investmentchecker_private_repo_v1"
    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build())
        }.generateKey()
    }

    fun repo() = prefs.getString("repo", "") ?: ""

    fun save(repo: String, token: String) {
        require(Regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$").matches(repo))
        prefs.edit().putString("repo", repo).apply()
        if (token.isBlank()) return // Keep existing credential when field is blank.
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        prefs.edit().putString("token_iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString("token_cipher", Base64.encodeToString(encrypted, Base64.NO_WRAP)).apply()
    }

    fun token(): String? {
        return try {
            val iv = Base64.decode(prefs.getString("token_iv", null) ?: return null, Base64.NO_WRAP)
            val encrypted = Base64.decode(prefs.getString("token_cipher", null) ?: return null, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(encrypted), Charsets.UTF_8)
        } catch (_: Exception) { null }
    }
}
