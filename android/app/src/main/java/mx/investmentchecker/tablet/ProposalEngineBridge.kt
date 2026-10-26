package mx.investmentchecker.tablet

import android.app.Activity
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import org.json.JSONTokener

/** Executes the audited, pure Brave proposal function in an offline JS sandbox. */
class ProposalEngineBridge(private val activity: Activity) {
    fun calculate(inputs: ProposalInputs, result: (JSONObject) -> Unit) {
        val view = WebView(activity)
        view.settings.javaScriptEnabled = true
        view.settings.blockNetworkLoads = true
        view.settings.allowFileAccess = false
        view.settings.allowContentAccess = false
        view.webViewClient = object : WebViewClient() {
            override fun onPageFinished(v: WebView, url: String) {
                val engine = activity.assets.open("order-engine.js").bufferedReader().use { it.readText() }
                val script = engine + "\nJSON.stringify(orderDrafts(JSON.parse(" +
                    JSONObject.quote(inputs.quotes.toString()) + "), JSON.parse(" +
                    JSONObject.quote(inputs.portfolio.toString()) + "), orderCSV(" +
                    JSONObject.quote(inputs.rankingCsv) + "), Date.now()));"
                v.evaluateJavascript(script) { raw ->
                    try {
                        val json = JSONTokener(raw).nextValue() as String
                        result(JSONObject(json))
                    } catch (_: Exception) {
                        result(JSONObject().put("ok", false).put("reason", "No pudo ejecutarse el cálculo de propuestas."))
                    } finally { v.destroy() }
                }
            }
        }
        view.loadDataWithBaseURL("https://localhost.invalid/", "<html><body></body></html>", "text/html", "UTF-8", null)
    }
}
