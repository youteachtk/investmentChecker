package mx.investmentchecker.tablet

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.time.Instant

/** The user logs into Actinver inside this app. No credentials, cookies or page data leave the tablet. */
class ActinverCaptureActivity : Activity() {
    private lateinit var browser: WebView
    private lateinit var status: TextView
    private val start = "https://www.retoactinver.com/inicio-sesion/"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        status = TextView(this).apply {
            text = "Inicia sesión y abre la pantalla de tu cartera. Después pulsa Leer cartera."
            setTextColor(Color.DKGRAY)
            textSize = 15f
            setPadding(18, 12, 18, 12)
        }
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(status)
        root.addView(Button(this).apply {
            text = "Leer cartera de esta página"
            setOnClickListener { captureVisiblePortfolio() }
        })
        browser = WebView(this)
        browser.settings.javaScriptEnabled = true
        browser.settings.domStorageEnabled = true
        browser.settings.allowFileAccess = false
        browser.settings.allowContentAccess = false
        browser.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                val domain = uri.host?.lowercase() ?: return true
                return uri.scheme != "https" || !(domain == "retoactinver.com" || domain.endsWith(".retoactinver.com"))
            }
        }
        root.addView(browser, LinearLayout.LayoutParams(-1, 0, 1f))
        root.gravity = Gravity.TOP
        setContentView(root)
        browser.loadUrl(start)
    }

    private fun captureVisiblePortfolio() {
        val url = browser.url ?: ""
        if (!url.startsWith("https://www.retoactinver.com/") &&
            !url.startsWith("https://retoactinver.com/")) {
            status.text = "Abre primero la cartera dentro de Reto Actinver."
            return
        }
        // Read only visible rendered text and tables, never input values, passwords, or cookies.
        val script = """(function(){
          const visible=(e)=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length);
          const rows=[...document.querySelectorAll('tr')].filter(visible).map(tr=>
            [...tr.querySelectorAll('th,td')].filter(visible).map(c=>c.innerText.trim()));
          return JSON.stringify({text:document.body.innerText.slice(0,80000),rows:rows.slice(0,150)});
        })();""".trimIndent()
        status.text = "Leyendo la cartera visible..."
        browser.evaluateJavascript(script) { value ->
            try {
                val snapshot = JSONObject(JSONTokener(value).nextValue() as String)
                val portfolio = parsePortfolio(snapshot)
                getSharedPreferences("actinver_capture", MODE_PRIVATE).edit()
                    .putString("portfolio", portfolio.toString()).apply()
                status.text = "Cartera leída: ${portfolio.getJSONArray("holdings").length()} posiciones. Regresa y actualiza propuestas."
                // Never submit orders, click broker controls, or auto-fill trade forms.
            } catch (_: Exception) {
                getSharedPreferences("actinver_capture", MODE_PRIVATE).edit().remove("portfolio").apply()
                status.text = "No se pudieron verificar saldos y posiciones en esta página. Abre el resumen de tu cartera e inténtalo allí."
            }
        }
    }

    private fun parsePortfolio(snapshot: JSONObject): JSONObject {
        val lines = snapshot.optString("text").split('\n').map { it.trim() }.filter { it.isNotBlank() }
        fun amount(s: String): Double? {
            val cleaned = s.replace("MXN", "", true).replace("$", "").replace(",", "").trim()
            return Regex("^-?\\d+(?:\\.\\d{1,2})?$").matchEntire(cleaned)?.value?.toDoubleOrNull()
        }
        fun labeled(vararg labels: String): Double? {
            for (i in lines.indices) {
                for (label in labels) {
                    val match = Regex("(?i)" + Regex.escape(label) + "\\s*:?\\s*\\$?\\s*([0-9,]+(?:\\.[0-9]{1,2})?)")
                        .find(lines[i])
                    val direct = match?.groupValues?.get(1)?.let(::amount)
                    if (direct != null) return direct
                    if (lines[i].equals(label, true) && i + 1 < lines.size) {
                        val adjacent = amount(lines[i + 1])
                        if (adjacent != null) return adjacent
                    }
                }
            }
            return null
        }
        val total = labeled("Valor total", "Valor del portafolio", "Valor de la cartera", "Patrimonio total")
        val cash = labeled("Poder de compra", "Saldo disponible", "Disponible para comprar", "Efectivo disponible")
        val invested = labeled("Inversiones", "Valor invertido", "Valor de inversiones")
        require(total != null && cash != null && invested != null && total >= 1000 && cash >= 0 && invested >= 0)

        val holdings = JSONArray()
        val rows = snapshot.optJSONArray("rows") ?: JSONArray()
        if (rows.length() > 0) {
            val header = rows.optJSONArray(0) ?: JSONArray()
            val keys = (0 until header.length()).map { header.optString(it).lowercase() }
            val symbolColumn = keys.indexOfFirst { it.contains("emisora") || it.contains("símbolo") || it.contains("simbolo") }
            val quantityColumn = keys.indexOfFirst { it.contains("títulos") || it.contains("titulos") || it.contains("cantidad") }
            val valueColumn = keys.indexOfFirst { it.contains("valor") || it.contains("importe") }
            if (symbolColumn >= 0 && quantityColumn >= 0 && valueColumn >= 0) {
                for (i in 1 until rows.length()) {
                    val row = rows.optJSONArray(i) ?: continue
                    val symbol = row.optString(symbolColumn).trim().uppercase()
                    val quantity = amount(row.optString(quantityColumn))
                    val value = amount(row.optString(valueColumn))
                    if (Regex("^[A-Z0-9 .&+/-]{1,48}$").matches(symbol) && quantity != null && quantity > 0 && value != null && value >= 0) {
                        holdings.put(JSONObject().put("symbol", symbol).put("quantity", quantity).put("value_mxn", value))
                    }
                }
            }
        }
        require(invested == 0.0 || holdings.length() > 0) { "No hay posiciones verificadas" }
        val valueSum = (0 until holdings.length()).sumOf { holdings.getJSONObject(it).getDouble("value_mxn") }
        require(kotlin.math.abs(valueSum - invested) <= kotlin.math.max(100.0, invested * .025))
        require(kotlin.math.abs(total - cash - invested) <= kotlin.math.max(100.0, total * .015))

        return JSONObject().put("captured_at", Instant.now().toString())
            .put("summary", JSONObject().put("total_value", total).put("buying_power", cash)
                .put("investments", invested).put("unsettled", 0))
            .put("holdings", holdings)
    }

    override fun onDestroy() {
        browser.destroy()
        super.onDestroy()
    }
}
