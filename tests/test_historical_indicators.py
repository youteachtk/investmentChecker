"""Three-year historical analysis must use actual current drawdown and FX."""
import sys
import types
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.modules.setdefault("yfinance", types.ModuleType("yfinance"))
import analyze


class HistoryTests(unittest.TestCase):
    def test_current_drawdown_and_multiyear_mxn_returns(self):
        self.assertTrue(hasattr(analyze, "historical_mxn_metrics"),
                        "historical analysis must expose long-period FX-adjusted metrics")
        dates = pd.date_range(end="2026-10-23", periods=760, freq="B")
        usd = pd.Series([100.0] * 508 + [110.0] * 126 +
                        [130.0] * 125 + [120.0], index=dates)
        fx = pd.Series([18.0] * 760, index=dates)
        result = analyze.historical_mxn_metrics(usd, fx)
        self.assertAlmostEqual(result["mxn_return_126d_pct"], 9.09091, places=4)
        self.assertAlmostEqual(result["mxn_return_252d_pct"], 20.0, places=4)
        self.assertAlmostEqual(result["mxn_return_750d_pct"], 20.0, places=4)
        self.assertAlmostEqual(result["mxn_current_drawdown_252d_pct"], -7.69231, places=4)
        self.assertEqual(result["mxn_above_sma_50"], 0)

    def test_missing_forex_never_counts_as_verified_history(self):
        dates = pd.date_range(end="2026-10-23", periods=755, freq="B")
        usd = pd.Series([100.0] * 755, index=dates)
        fx = pd.Series([np.nan] * 755, index=dates)
        self.assertIsNone(analyze.historical_mxn_metrics(usd, fx))

    def test_exchanges_with_different_timezones_align_by_session_date(self):
        dates_us = pd.date_range(end="2026-10-23", periods=755, freq="B",
                                 tz="America/New_York")
        dates_fx = pd.date_range(end="2026-10-23", periods=755, freq="B",
                                 tz="Europe/London")
        usd = pd.Series([100.0 + i / 100 for i in range(755)], index=dates_us)
        fx = pd.Series([18.0] * 755, index=dates_fx)
        result = analyze.historical_mxn_metrics(usd, fx)
        self.assertIsNotNone(result,
                             "An FX date must match the stock session regardless of timezone")

    def test_newer_fx_quote_does_not_invalidate_friday_stock_history(self):
        dates=pd.date_range(end="2026-10-23", periods=755, freq="B")
        usd=pd.Series([100.0+i/100 for i in range(755)],index=dates)
        fx_dates=pd.date_range(end="2026-10-26", periods=756, freq="B")
        fx=pd.Series([18.0]*756,index=fx_dates)
        result=analyze.historical_mxn_metrics(usd,fx)
        self.assertIsNotNone(result)
        self.assertEqual(result["fx_validated_date"],"2026-10-23")


if __name__ == "__main__":
    unittest.main()
