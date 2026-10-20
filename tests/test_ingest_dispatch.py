import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from ingest_dispatch import validate, compare

def payload():
    import csv
    with (ROOT/"data/universe.csv").open(encoding="utf-8-sig",newline="") as f:
        source=list(csv.DictReader(f))
    return {
        "captured_at":datetime.now(timezone.utc).isoformat(),
        "rows":[{
            "category":item["tipo"],
            "symbol":item["simbolo_actinver"],
            "last":"$100.00","variation":"1.0%",
            "bid_volume":"1000","bid":"$99.90",
            "ask_volume":"1000","ask":"$100.10"
        } for item in source]
    }

class IngestTests(unittest.TestCase):
    def test_complete_catalog(self):
        result=validate(payload(),ROOT/"data/universe.csv")
        self.assertEqual(result["total"],226)
        self.assertEqual(result["counts"],{"ACCIONES":145,"ETFs":56,"FONDOS":25})
    def test_nine_column_funds_and_historical_returns(self):
        data=payload()
        funds=[r for r in data["rows"] if r["category"]=="FONDOS"]
        self.assertEqual(len(funds),25)
        for r in funds:
            r.update({"last":"$123.45","variation":"","bid_volume":"",
                      "bid":"","ask_volume":"","ask":"",
                      "fund_category":"Renta variable",
                      "return_1y":"8.25%","return_3y":"19.50%",
                      "return_5y":"27.10%"})
        result=validate(data,ROOT/"data/universe.csv")
        funds_clean=[r for r in result["quotes"] if r["category"]=="FONDOS"]
        self.assertEqual(len(funds_clean),25)
        self.assertEqual(funds_clean[0]["last"],123.45)
        self.assertIsNone(funds_clean[0]["ask"])
        self.assertEqual(funds_clean[0]["return_1y"],8.25)
        self.assertEqual(funds_clean[0]["return_3y"],19.5)
        self.assertEqual(funds_clean[0]["return_5y"],27.1)
        self.assertEqual(funds_clean[0]["fund_category"],"Renta variable")

    def test_duplicate_instead_of_etf_is_rejected(self):
        data=payload()
        data["rows"][-1]=dict(data["rows"][0])
        with self.assertRaises(ValueError):
            validate(data,ROOT/"data/universe.csv")
    def test_wrong_category_is_rejected(self):
        data=payload()
        data["rows"][0]["category"]="ETFs"
        with self.assertRaises(ValueError):
            validate(data,ROOT/"data/universe.csv")
    def test_older_capture_is_rejected(self):
        data=payload()
        data["captured_at"]="2020-01-01T00:00:00Z"
        with self.assertRaises(ValueError):
            validate(data,ROOT/"data/universe.csv")

if __name__=="__main__":
    unittest.main()
