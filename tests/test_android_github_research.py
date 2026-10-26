"""The tablet consumes already-computed PC research from GitHub without credentials."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
JAVA = ROOT / 'android/app/src/main/java/mx/investmentchecker/tablet'


class ResearchBridge(unittest.TestCase):
    def test_public_research_requires_no_private_git_access(self):
        source = (JAVA / 'ResearchSources.kt').read_text()
        self.assertIn('output/analisis-diario.md', source)
        self.assertIn('output/status.json', source)
        self.assertNotIn('Authorization', source)
        self.assertNotIn('actinver/portfolio-latest.json', source)

    def test_home_can_refresh_pc_research(self):
        home = (JAVA / 'MainActivity.kt').read_text()
        self.assertIn('Actualizar análisis de la PC (GitHub)', home)
        self.assertIn('ResearchSources.load()', home)
        self.assertIn('research_cache', home)

    def test_overlay_displays_historical_research_without_order_buttons(self):
        overlay = (JAVA / 'OverlayService.kt').read_text()
        self.assertIn('ANÁLISIS DE LA PC', overlay)
        self.assertIn('NO ES UNA ORDEN DE COMPRA', overlay)
        self.assertIn('research_cache', overlay)
        self.assertIn('DRAFTS_READY_FOR_REVIEW', overlay)


if __name__ == '__main__':
    unittest.main()
