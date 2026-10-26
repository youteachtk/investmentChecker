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
import android.text.InputType
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
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
        content.addView(line("Propuestas de solo lectura. Requieren cotizaciones, clasificación y portafolio vigentes. La captura de Actinver desde Android sigue pendiente.", 16f))
        val tokenStore = SecureTokenStore(this)
        val repoInput = EditText(this).apply {
            hint = "Repositorio privado: usuario/repositorio"
            setSingleLine(true)
            setText(tokenStore.repo())
        }
        val tokenInput = EditText(this).apply {
            hint = "Token de acceso (solo la primera vez)"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setSingleLine(true)
        }
        val status = line("Estado: sin sincronizar", 15f)
        content.addView(repoInput)
        content.addView(tokenInput)
        content.addView(Button(this).apply {
            text = "Guardar conexión privada"
            setOnClickListener {
                try {
                    tokenStore.save(repoInput.text.toString().trim(), tokenInput.text.toString().trim())
                    tokenInput.text.clear()
                    status.text = "Conexión configurada."
                } catch (_: Exception) { status.text = "Formato de repositorio no válido." }
            }
        })
        content.addView(Button(this).apply {
            text = "Actualizar propuestas"
            setOnClickListener {
                val token = tokenStore.token()
                val repo = tokenStore.repo()
                if (token == null || repo.isBlank()) {
                    status.text = "Primero configura el repositorio privado y el token."
                } else {
                    status.text = "Leyendo datos y comprobando vigencia..."
                    Thread {
                        try {
                            val inputs = ProposalSources.load(repo, token)
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
