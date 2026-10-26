"""Android uses the existing read-only proposal engine, not a second algorithm."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
ANDROID = ROOT / 'android/app/src/main/java/mx/investmentchecker/tablet'


class ProposalBridgeContract(unittest.TestCase):
    def test_engine_is_generated_from_shared_pure_functions(self):
        gradle = (ROOT / 'android/app/build.gradle.kts').read_text()
        self.assertIn('order-preflight.js', gradle)
        self.assertIn('substringBefore(marker)', gradle)
        self.assertIn('async function orderLoadPrivatePortfolio()', gradle)

    def test_private_token_kept_in_keystore(self):
        token_store = (ANDROID / 'SecureTokenStore.kt').read_text()
        self.assertIn('AndroidKeyStore', token_store)
        self.assertIn('AES/GCM/NoPadding', token_store)

    def test_network_read_only_and_no_broker_endpoint(self):
        source = (ANDROID / 'ProposalSources.kt').read_text()
        self.assertIn('getString("content")', source)
        self.assertIn('raw.githubusercontent.com', source)
        self.assertNotIn('requestMethod = "POST"', source)

    def test_copy_is_gated_by_status_and_expiration(self):
        overlay = (ANDROID / 'OverlayService.kt').read_text()
        self.assertIn('DRAFTS_READY_FOR_REVIEW', overlay)
        self.assertIn('expiry > System.currentTimeMillis()', overlay)
        self.assertIn('clipboard.setPrimaryClip', overlay)


if __name__ == '__main__':
    unittest.main()
