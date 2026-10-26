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
    def test_sustained_history_beats_short_term_bounce(self):
        bounce=row("WMT", 20, 20)
        bounce.update(return_60d_pct=20, return_126d_pct=-7,
                      return_252d_pct=12, mxn_return_126d_pct=-1.6,
                      mxn_return_252d_pct=12.5,
                      mxn_current_drawdown_252d_pct=-10.7)
        sustained=row("XLV", 5, 20)
        sustained.update(return_60d_pct=9, return_126d_pct=24,
                         return_252d_pct=23, mxn_return_126d_pct=32,
                         mxn_return_252d_pct=23,
                         mxn_current_drawdown_252d_pct=-1.1)
        ranked=score_universe([bounce,sustained])
        self.assertEqual(ranked[0]["simbolo_actinver"],"XLV")

    def test_three_year_history_breaks_equal_short_term_tie(self):
        weak=row("AWEAK", 5, 18)
        strong=row("ZSTRONG", 5, 18)
        weak.update(return_126d_pct=8,return_252d_pct=12,
                    mxn_return_126d_pct=10,mxn_return_252d_pct=14,
                    mxn_return_750d_pct=-30,mxn_current_drawdown_252d_pct=-3)
        strong.update(return_126d_pct=8,return_252d_pct=12,
                      mxn_return_126d_pct=10,mxn_return_252d_pct=14,
                      mxn_return_750d_pct=45,mxn_current_drawdown_252d_pct=-3)
        ranked=score_universe([weak,strong])
        self.assertEqual(ranked[0]["simbolo_actinver"],"ZSTRONG")

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
