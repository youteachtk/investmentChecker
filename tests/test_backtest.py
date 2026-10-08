import sys
import unittest
from pathlib import Path
import pandas as pd
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from backtest import simulate


class BacktestTests(unittest.TestCase):
    def test_future_shock_does_not_affect_earlier_selection(self):
        idx=pd.bdate_range("2024-01-01",periods=320)
        base=np.arange(320,dtype=float)
        frame=pd.DataFrame({s:100+(i+1)*base/9 for i,s in enumerate(
            ["SPY","QQQ","VGT","XLK","EWZ","NVDA"])},index=idx)
        a=simulate(frame)
        altered=frame.copy()
        altered.iloc[-1,1]*=100
        b=simulate(altered)
        self.assertEqual(a["rebalance_log"],b["rebalance_log"])

    def test_transaction_cost_reduces_result(self):
        idx=pd.bdate_range("2024-01-01",periods=300)
        frame=pd.DataFrame({s:100+(i+1)*np.arange(300)/10 for i,s in enumerate(
            ["SPY","QQQ","VGT","XLK","EWZ","NVDA"])},index=idx)
        with_cost=simulate(frame,cost_bps=11.6)
        no_cost=simulate(frame,cost_bps=0)
        self.assertLess(with_cost["total_return_pct"],no_cost["total_return_pct"])


if __name__=="__main__":
    unittest.main()
