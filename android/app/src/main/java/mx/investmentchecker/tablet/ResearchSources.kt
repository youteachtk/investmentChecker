package mx.investmentchecker.tablet

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant

/** Read-only, public, previously computed PC research. No personal holdings or broker calls. */
object ResearchSources {
    private const val RAW = "https://raw.githubusercontent.com/youteachtk/investmentChecker/main/"
    private fun get(path: String): String {
        require(path == "output/analisis-diario.md" || path == "output/status.json")
        val conn = URL(RAW + path + "?refresh=" + System.currentTimeMillis()).openConnection() as HttpURLConnection
        conn.connectTimeout = 12000
        conn.readTimeout = 20000
        conn.instanceFollowRedirects = false
        conn.setRequestProperty("Cache-Control", "no-cache")
        try {
            check(conn.responseCode == 200) { "GitHub: HTTP ${conn.responseCode}" }
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally { conn.disconnect() }
    }

    fun load(): JSONObject {
        val status = JSONObject(get("output/status.json"))
        val markdown = get("output/analisis-diario.md")
        val stamp = Instant.parse(status.getString("updated_utc"))
        val matches = JSONArray()
        var inRanking = false
        for (line in markdown.lineSequence()) {
            if (line.startsWith("| Instrument | Type |")) {
                inRanking = true
                continue
            }
            if (!inRanking || !line.startsWith("|")) continue
            val cols = line.split('|').drop(1).dropLast(1).map { it.trim() }
            if (cols.size < 7 || cols[0].startsWith("---")) continue
            val symbol = cols[0].uppercase()
            val score = cols[2].toDoubleOrNull() ?: continue
            if (!Regex("^[A-Z0-9 .&+/-]{1,48}$").matches(symbol) || score !in 0.0..100.0) continue
            matches.put(JSONObject().put("symbol", symbol).put("score", score)
                .put("type", cols[1]).put("risk", cols[3])
                .put("change_20d", cols[4].toDoubleOrNull())
                .put("volatility", cols[6].toDoubleOrNull()))
            if (matches.length() == 10) break
        }
        check(matches.length() > 0) { "GitHub no contiene clasificación verificable." }
        val age = System.currentTimeMillis() - stamp.toEpochMilli()
        return JSONObject().put("generated_utc", stamp.toString())
            .put("fresh", age in 0..86_400_000L)
            .put("instruments", matches)
            .put("total_universe", status.optInt("universe"))
    }
}
