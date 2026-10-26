package mx.investmentchecker.tablet

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.graphics.Color
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    private var awaitingOverlayPermission = false

    private fun launchPanel() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 5)
        }
        startForegroundService(Intent(this, OverlayService::class.java))
    }

    override fun onResume() {
        super.onResume()
        if (awaitingOverlayPermission && Settings.canDrawOverlays(this)) {
            awaitingOverlayPermission = false
            launchPanel()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 40, 32, 28)
            setBackgroundColor(Color.rgb(247, 249, 252))
        }
        fun line(s: String, size: Float) = TextView(this).apply {
            text = s
            textSize = size
            setTextColor(Color.rgb(25, 40, 60))
            setPadding(0, 0, 0, 20)
        }
        content.addView(line("InvestmentChecker · Tablet", 24f))
        content.addView(line("Abre Actinver aquí, inicia sesión y selecciona tu cartera. La lectura es local; no se solicitan claves de GitHub.", 16f))
        val status = line("Estado: cartera sin capturar", 15f)
        content.addView(Button(this).apply {
            text = "Actualizar análisis de la PC (GitHub)"
            setOnClickListener {
                status.text = "Consultando análisis publicado por la PC..."
                Thread {
                    try {
                        val report = ResearchSources.load()
                        getSharedPreferences("research_cache", MODE_PRIVATE).edit()
                            .putString("pc_analysis", report.toString()).apply()
                        runOnUiThread {
                            status.text = if (report.optBoolean("fresh"))
                                "Análisis de la PC actualizado. No es una orden de compra."
                            else "Análisis histórico de la PC. Requiere datos nuevos para operar."
                            if (Settings.canDrawOverlays(this@MainActivity)) {
                                stopService(Intent(this@MainActivity, OverlayService::class.java))
                                launchPanel()
                            }
                        }
                    } catch (e: Exception) {
                        runOnUiThread { status.text = "No fue posible actualizar el análisis: ${e.message?.take(80)}" }
                    }
                }.start()
            }
        })
        content.addView(Button(this).apply {
            text = "Iniciar sesión y leer cartera de Actinver"
            setOnClickListener {
                startActivity(Intent(this@MainActivity, ActinverCaptureActivity::class.java))
            }
        })
        content.addView(Button(this).apply {
            text = "Actualizar propuestas"
            setOnClickListener {
                val raw = getSharedPreferences("actinver_capture", MODE_PRIVATE).getString("portfolio", null)
                if (raw == null) {
                    status.text = "Primero lee tu cartera en Actinver desde esta tablet."
                } else {
                    status.text = "Leyendo datos y comprobando vigencia..."
                    Thread {
                        try {
                            val inputs = ProposalSources.loadPublic(org.json.JSONObject(raw))
                            runOnUiThread {
                                ProposalEngineBridge(this@MainActivity).calculate(inputs) { proposal ->
                                    val safe = proposal.optBoolean("ok") && proposal.optBoolean("copy_only") &&
                                        !proposal.optBoolean("simulation_only") &&
                                        proposal.optString("status") == "DRAFTS_READY_FOR_REVIEW"
                                    getSharedPreferences("proposal_cache", MODE_PRIVATE).edit().apply {
                                        if (safe) putString("last_verified", proposal.toString())
                                        else remove("last_verified")
                                    }.apply()
                                    status.text = if (safe) "Propuestas verificadas: ${proposal.optJSONArray("orders")?.length() ?: 0}" else
                                        "Sin propuestas: ${proposal.optString("reason", "Datos no vigentes")}" 
                                    if (Settings.canDrawOverlays(this@MainActivity)) {
                                        stopService(Intent(this@MainActivity, OverlayService::class.java))
                                        launchPanel()
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            runOnUiThread {
                                getSharedPreferences("proposal_cache", MODE_PRIVATE).edit().remove("last_verified").apply()
                                status.text = "No se completó la sincronización: ${e.message?.take(100) ?: "Error"}"
                            }
                        }
                    }.start()
                }
            }
        })
        content.addView(status)
        val openPanel = Button(this).apply {
            text = "Mostrar panel flotante"
            setOnClickListener {
                if (!Settings.canDrawOverlays(this@MainActivity)) {
                    awaitingOverlayPermission = true
                    startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName")))
                } else {
                    launchPanel()
                }
            }
        }
        content.addView(openPanel)
        content.addView(Button(this).apply {
            text = "Abrir Actinver en Brave"
            setOnClickListener {
                val url = Uri.parse("https://www.retoactinver.com/inicio-sesion/")
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, url).setPackage("com.brave.browser"))
                } catch (_: ActivityNotFoundException) {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                }
            }
        })
        content.gravity = Gravity.TOP
        setContentView(content)
    }
}
