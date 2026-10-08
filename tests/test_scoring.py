import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from scoring import score_universe


def row(symbol, momentum, risk, trend=True):
    return dict(simbolo_actinver=symbol,
                close=110 if trend else 90, sma_20=100, sma_50=95,
                macd=2 if trend else 0, macd_signal=1,
                return_20d_pct=momentum, return_60d_pct=momentum,
                annual_volatility_pct=risk,
                trailing_drawdown_pct=-risk,
                volume_5d_vs_20d=1.0)


class RankingTests(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(score_universe([]), [])

    def test_scores_not_all_saturated(self):
        ranked = score_universe([
            row("A", 15, 20),
            row("B", 5, 40),
            row("C", -10, 90, False),
        ])
        scores = [x["research_score"] for x in ranked]
        self.assertEqual(len(set(scores)), 3)
        self.assertLess(scores[0], 100)
        self.assertEqual(ranked[-1]["risk_label"], "high")

    def test_comparative_risk(self):
        ranked = score_universe([
            row("LOW", 8, 20),
            row("HIGH", 8, 80),
        ])
        self.assertEqual(ranked[0]["simbolo_actinver"], "LOW")


if __name__ == "__main__":
    unittest.main()
