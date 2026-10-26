package mx.investmentchecker.tablet

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class ProposalInputs(val quotes: JSONObject, val portfolio: JSONObject, val rankingCsv: String)

/** Read-only fetch. Never writes to GitHub or broker and never logs credentials. */
object ProposalSources {
    private const val PUBLIC = "https://raw.githubusercontent.com/youteachtk/investmentChecker/main/output/"
    private fun read(url: String): String {
        require(url.startsWith("https://raw.githubusercontent.com/youteachtk/investmentChecker/"))
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 12000
        conn.readTimeout = 20000
        conn.instanceFollowRedirects = false
        conn.setRequestProperty("Accept", "application/vnd.github+json")
        conn.setRequestProperty("Cache-Control", "no-cache")
        try {
            if (conn.responseCode != 200) throw IllegalStateException("Fuente no disponible (HTTP ${conn.responseCode})")
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally { conn.disconnect() }
    }

    fun loadPublic(portfolio: JSONObject): ProposalInputs {
        val q = JSONObject(read(PUBLIC + "actinver_quotes.json"))
        val ranking = read(PUBLIC + "ranking.csv")
        return ProposalInputs(q, portfolio, ranking)
    }
}
