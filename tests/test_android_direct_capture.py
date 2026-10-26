"""Contract: tablet account capture is local, optional, and never needs GitHub credentials."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
JAVA = ROOT / 'android/app/src/main/java/mx/investmentchecker/tablet'


class AndroidDirectCapture(unittest.TestCase):
    def test_home_has_no_repo_or_pat_prompt(self):
        home = (JAVA / 'MainActivity.kt').read_text()
        self.assertNotIn('SecureTokenStore(', home)
        self.assertNotIn('Repositorio privado:', home)
        self.assertNotIn('Token de acceso', home)
        self.assertIn('ActinverCaptureActivity', home)

    def test_capture_requires_user_login_and_button(self):
        collector = (JAVA / 'ActinverCaptureActivity.kt').read_text()
        self.assertIn('https://www.retoactinver.com/inicio-sesion/', collector)
        self.assertIn('Leer cartera de esta página', collector)
        self.assertIn('evaluateJavascript', collector)
        self.assertIn('startsWith("https://www.retoactinver.com/")', collector)
        self.assertNotIn('addJavascriptInterface', collector)

    def test_private_portfolio_stays_on_device(self):
        collector = (JAVA / 'ActinverCaptureActivity.kt').read_text()
        self.assertIn('MODE_PRIVATE', collector)
        self.assertNotIn('api.github.com', collector)
        self.assertNotIn('POST', collector)

    def test_public_sources_do_not_require_token(self):
        sources = (JAVA / 'ProposalSources.kt').read_text()
        self.assertIn('fun loadPublic(', sources)
        self.assertNotIn('Bearer $token', sources)


if __name__ == '__main__':
    unittest.main()
