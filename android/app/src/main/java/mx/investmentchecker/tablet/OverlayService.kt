package mx.investmentchecker.tablet

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
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
        root.addView(TextView(this).apply {
            text = "SIN SINCRONIZAR\nAún no hay propuestas vigentes."
            textSize = 15f
            setTextColor(Color.WHITE)
            setPadding(4, 10, 4, 16)
        })
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
