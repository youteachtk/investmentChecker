"""Checks the Android overlay source contract without an Android SDK."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1] / 'android'


class OverlayContract(unittest.TestCase):
    def test_overlay_permission_and_service(self):
        manifest = (ROOT / 'app/src/main/AndroidManifest.xml').read_text()
        self.assertIn('android.permission.SYSTEM_ALERT_WINDOW', manifest)
        self.assertIn('android:foregroundServiceType="specialUse"', manifest)
        self.assertIn('android:exported="false"', manifest)

    def test_float_without_keyboard_focus(self):
        service = (ROOT / 'app/src/main/java/mx/investmentchecker/tablet/OverlayService.kt').read_text()
        self.assertIn('TYPE_APPLICATION_OVERLAY', service)
        self.assertIn('FLAG_NOT_FOCUSABLE', service)
        self.assertIn('MotionEvent.ACTION_MOVE', service)
        self.assertIn('manager.updateViewLayout(root, p)', service)
        self.assertIn('Ajustar ancho', service)
        self.assertIn('saveGeometry(p)', service)

    def test_explicit_unverified_status_and_no_trading_actions(self):
        service = (ROOT / 'app/src/main/java/mx/investmentchecker/tablet/OverlayService.kt').read_text()
        self.assertIn('SIN SINCRONIZAR', service)
        self.assertIn('Aún no hay propuestas vigentes', service)
        self.assertNotIn('Comprar', service)

    def test_brave_is_first_browser_choice(self):
        activity = (ROOT / 'app/src/main/java/mx/investmentchecker/tablet/MainActivity.kt').read_text()
        self.assertIn('setPackage("com.brave.browser")', activity)


if __name__ == '__main__':
    unittest.main()
