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
        content.addView(line("Panel flotante independiente. La sincronización con Actinver todavía no está habilitada; no hay propuestas vigentes disponibles.", 16f))
        val openPanel = Button(this).apply {
            text = "Mostrar panel flotante"
            setOnClickListener {
                if (!Settings.canDrawOverlays(this@MainActivity)) {
                    startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName")))
                } else {
                    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 5)
                    }
                    startForegroundService(Intent(this@MainActivity, OverlayService::class.java))
                }
            }
        }
        content.addView(openPanel)
        content.addView(Button(this).apply {
            text = "Abrir Actinver en Brave"
            setOnClickListener {
                val url = Uri.parse("https://www.retoactinver.com/")
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
