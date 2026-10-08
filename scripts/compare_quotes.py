"""Join a browser-exported Actinver quote CSV to the GitHub historical ranking.
This script never places trades. CSV format: category,symbol,last,bid,ask,bid_volume,ask_volume."""
import csv
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def number(v):
    try: return float(str(v).replace(",","").replace("$","").replace("%","").strip())
    except (TypeError,ValueError): return None
def analyze(quote_file, ranking_file, output_file):
    ranking={r["simbolo_actinver"].strip().upper():r for r in csv.DictReader(open(ranking_file,encoding="utf-8-sig",newline=""))}
    rows=[]
    for q in csv.DictReader(open(quote_file,encoding="utf-8-sig",newline="")):
        sym=q.get("symbol","").strip().upper()
        if not sym: continue
        a=number(q.get("ask"));b=number(q.get("bid"));last=number(q.get("last"))
        spread=(a-b)/((a+b)/2)*100 if a and b and a>=b else None
        rank=ranking.get(sym)
        rows.append(dict(category=q.get("category"),symbol=sym,last_mxn=last,bid_mxn=b,ask_mxn=a,
            ask_volume=number(q.get("ask_volume")),spread_pct=round(spread,3) if spread is not None else None,
            historical_score=number(rank["research_score"]) if rank else None,
            quote_status="review" if not a or not b or a<b else ("wide_spread" if spread>2 else "check_freshness")))
    rows.sort(key=lambda r:(r["spread_pct"] is None,r["spread_pct"] or 999))
    Path(output_file).parent.mkdir(parents=True,exist_ok=True)
    Path(output_file).write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding="utf-8")
    print("Processed",len(rows),"instruments; matched historical ranking",sum(r["historical_score"] is not None for r in rows))
if __name__=="__main__":
    if len(sys.argv)!=3: raise SystemExit("Usage: python scripts/compare_quotes.py quotes.csv output/quote-comparison.json")
    analyze(sys.argv[1],ROOT/"output/ranking.csv",sys.argv[2])
