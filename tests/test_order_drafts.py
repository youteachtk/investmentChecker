import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from order_drafts import plan,CAPITAL,MAX_POSITION_PCT,CASH_RESERVE

class OrderTests(unittest.TestCase):
    def test_bad_quotes_never_placed(self):
        quotes={"ABBV":{"bid":"100","ask":"115","bid_volume":"100","ask_volume":"100"}}
        ranks={"ABBV":{"research_score":"90"}}
        drafts,total=plan(quotes,ranks)
        self.assertEqual(total,0)
        self.assertTrue(all(x["status"]!="DRAFT_NOT_LIVE" for x in drafts))
    def test_integer_sizes_and_budget(self):
        symbols=["ABBV","TSM N","VGT","QQQ","AAPL"]
        quotes={s:{"bid":"99.8","ask":"100","bid_volume":"9999","ask_volume":"9999"} for s in symbols}
        ranks={s:{"research_score":"70"} for s in symbols}
        drafts,total=plan(quotes,ranks)
        self.assertEqual(len([d for d in drafts if d["status"]=="DRAFT_NOT_LIVE"]),5)
        self.assertLessEqual(total,CAPITAL*(1-CASH_RESERVE)+0.01)
        for d in drafts:
            self.assertIsInstance(d["quantity"],int)
            self.assertLessEqual(d["total_mxn"],CAPITAL*MAX_POSITION_PCT+0.01)
    def test_depth_caps_order(self):
        quotes={"PFE":{"bid":"99.9","ask":"100","bid_volume":"999","ask_volume":"12"}}
        drafts,total=plan(quotes,{"PFE":{"research_score":"75"}})
        d=next(x for x in drafts if x["status"]=="DRAFT_NOT_LIVE")
        self.assertEqual(d["quantity"],12)

if __name__=="__main__":
    unittest.main()
