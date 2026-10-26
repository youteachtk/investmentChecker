package mx.investmentchecker.tablet

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.time.Instant

/** User-started overlay. Does not inspect Brave, capture credentials or place orders. */
class OverlayService : Service() {
    private lateinit var manager: WindowManager
    private var panel: View? = null
    private var params: WindowManager.LayoutParams? = null
    private val panelPrefs by lazy { getSharedPreferences("overlay_geometry", MODE_PRIVATE) }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val notifications = getSystemService(NotificationManager::class.java)
        notifications.createNotificationChannel(NotificationChannel("panel", "Panel visible", NotificationManager.IMPORTANCE_LOW))
        val notification = Notification.Builder(this, "panel")
            .setContentTitle("InvestmentChecker")
            .setContentText("Panel de referencia visible")
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .build()
        startForeground(1001, notification)
        manager = getSystemService(WINDOW_SERVICE) as WindowManager
        showPanel()
    }

    private fun showPanel() {
        if (panel != null) return
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(18, 12, 18, 18)
            setBackgroundColor(Color.rgb(24, 38, 60))
        }
        val title = TextView(this).apply {
            text = "☰ InvestmentChecker"
            textSize = 17f
            setTextColor(Color.WHITE)
            setPadding(4, 10, 4, 15)
        }
        root.addView(title)
        val saved = getSharedPreferences("proposal_cache", MODE_PRIVATE).getString("last_verified", null)
        val proposals = try { saved?.let { JSONObject(it) } } catch (_: Exception) { null }
        val expiry = try { Instant.parse(proposals?.optString("expires_at") ?: "").toEpochMilli() } catch (_: Exception) { 0L }
        val valid = proposals?.optBoolean("ok") == true &&
            proposals.optBoolean("copy_only") && !proposals.optBoolean("simulation_only") &&
            proposals.optString("status") == "DRAFTS_READY_FOR_REVIEW" &&
            expiry > System.currentTimeMillis()
        if (valid) {
            val orders = proposals!!.optJSONArray("orders")
            root.addView(TextView(this).apply {
                text = "PROPUESTAS VIGENTES · Copia manual"
                textSize = 14f
                setTextColor(Color.GREEN)
            })
            if (orders != null) for (i in 0 until orders.length()) {
                val order = orders.optJSONObject(i) ?: continue
                val symbol = order.optString("symbol")
                val quantity = order.optInt("quantity")
                val price = order.optDouble("limit_mxn")
                if (!Regex("^[A-Z0-9_.-]{1,25}$").matches(symbol) || quantity < 1 || !price.isFinite() || price <= 0) continue
                root.addView(TextView(this).apply {
                    text = "$symbol · $quantity títulos · Límite MXN ${"%.2f".format(price)}"
                    textSize = 14f
                    setTextColor(Color.WHITE)
                    setPadding(4, 14, 4, 4)
                })
                val buttons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                for ((label, value) in listOf("Emisora" to symbol, "Títulos" to quantity.toString(), "Precio" to "%.2f".format(java.util.Locale.US, price))) {
                    buttons.addView(Button(this).apply {
                        text = label
                        textSize = 10f
                        setOnClickListener {
                            if (System.currentTimeMillis() >= expiry) {
                                Toast.makeText(this@OverlayService, "Propuestas vencidas: actualizar primero", Toast.LENGTH_LONG).show()
                            } else {
                                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText(label, value))
                            }
                        }
                    }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                }
                root.addView(buttons)
            }
        } else {
            root.addView(TextView(this).apply {
                text = "SIN SINCRONIZAR\nAún no hay propuestas vigentes."
                textSize = 15f
                setTextColor(Color.WHITE)
                setPadding(4, 10, 4, 16)
            })
        }
        root.addView(Button(this).apply {
            text = "Ocultar panel"
            setOnClickListener { stopSelf() }
        })
        val resize = TextView(this).apply {
            text = "↘ Ajustar ancho"
            gravity = Gravity.END
            textSize = 13f
            setTextColor(Color.LTGRAY)
            setPadding(8, 12, 8, 8)
        }
        root.addView(resize)
        params = WindowManager.LayoutParams(
            panelPrefs.getInt("width", dp(340)), WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = panelPrefs.getInt("x", dp(20))
            y = panelPrefs.getInt("y", dp(60))
        }
        title.setOnTouchListener(object : View.OnTouchListener {
            private var x0 = 0
            private var y0 = 0
            private var tx = 0f
            private var ty = 0f
            override fun onTouch(v: View, event: MotionEvent): Boolean {
                val p = params ?: return false
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        x0 = p.x; y0 = p.y
                        tx = event.rawX; ty = event.rawY
                        return true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        p.x = (x0 + event.rawX - tx).toInt().coerceIn(0, (resources.displayMetrics.widthPixels - p.width).coerceAtLeast(0))
                        p.y = (y0 + event.rawY - ty).toInt().coerceIn(0, (resources.displayMetrics.heightPixels - dp(90)).coerceAtLeast(0))
                        manager.updateViewLayout(root, p)
                        return true
                    }
                    MotionEvent.ACTION_UP -> {
                        saveGeometry(p)
                        return true
                    }
                }
                return false
            }
        })
        resize.setOnTouchListener(object : View.OnTouchListener {
            private var startWidth = 0
            private var startX = 0f
            override fun onTouch(v: View, event: MotionEvent): Boolean {
                val p = params ?: return false
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> { startWidth = p.width; startX = event.rawX; return true }
                    MotionEvent.ACTION_MOVE -> {
                        p.width = (startWidth + event.rawX - startX).toInt().coerceIn(
                            dp(260), (resources.displayMetrics.widthPixels - p.x).coerceAtLeast(dp(260)))
                        manager.updateViewLayout(root, p)
                        return true
                    }
                    MotionEvent.ACTION_UP -> { saveGeometry(p); return true }
                }
                return false
            }
        })
        panel = root
        manager.addView(root, params)
    }

    private fun saveGeometry(p: WindowManager.LayoutParams) {
        panelPrefs.edit().putInt("x", p.x).putInt("y", p.y).putInt("width", p.width).apply()
    }

    override fun onDestroy() {
        panel?.let { manager.removeView(it) }
        panel = null
        super.onDestroy()
    }
}
