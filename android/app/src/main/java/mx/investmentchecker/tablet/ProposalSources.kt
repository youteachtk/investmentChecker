package mx.investmentchecker.tablet

import android.util.Base64
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class ProposalInputs(val quotes: JSONObject, val portfolio: JSONObject, val rankingCsv: String)

/** Read-only fetch. Never writes to GitHub or broker and never logs credentials. */
object ProposalSources {
    private const val PUBLIC = "https://raw.githubusercontent.com/youteachtk/investmentChecker/main/output/"
    private fun read(url: String, token: String? = null): String {
        require(url.startsWith("https://raw.githubusercontent.com/youteachtk/investmentChecker/") ||
            url.startsWith("https://api.github.com/repos/"))
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 12000
        conn.readTimeout = 20000
        conn.instanceFollowRedirects = false
        conn.setRequestProperty("Accept", "application/vnd.github+json")
        conn.setRequestProperty("Cache-Control", "no-cache")
        if (token != null) conn.setRequestProperty("Authorization", "Bearer $token")
        try {
            if (conn.responseCode != 200) throw IllegalStateException("Fuente no disponible (HTTP ${conn.responseCode})")
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally { conn.disconnect() }
    }

    fun load(repo: String, token: String): ProposalInputs {
        require(Regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$").matches(repo))
        require(token.isNotBlank())
        val q = JSONObject(read(PUBLIC + "actinver_quotes.json"))
        val ranking = read(PUBLIC + "ranking.csv")
        val response = JSONObject(read("https://api.github.com/repos/$repo/contents/actinver/portfolio-latest.json", token))
        val raw = response.getString("content").replace(Regex("\\s"), "")
        val portfolio = JSONObject(String(Base64.decode(raw, Base64.DEFAULT), Charsets.UTF_8))
        return ProposalInputs(q, portfolio, ranking)
    }
}
