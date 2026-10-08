"""Compare imported Actinver simulator bid/ask quotes to historical ranking; no trading."""
import csv
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def number(v):
    try:
        n=float(str(v).replace(",","").replace("$","").replace("%","").strip())
        return n if n==n else None
    except (TypeError, ValueError):
        return None

def analyze(quote_file, ranking_file, output_file):
    with open(ranking_file,encoding="utf-8-sig",newline="") as f:
        ranking={r["simbolo_actinver"].strip().upper():r for r in csv.DictReader(f)}
    rows=[]
    with open(quote_file,encoding="utf-8-sig",newline="") as f:
        for q in csv.DictReader(f):
            sym=q.get("symbol","").replace("*","").strip().upper()
            if not sym or q.get("category","").upper()=="FONDOS": continue
            ask,bid=number(q.get("ask")),number(q.get("bid"))
            last=number(q.get("last"))
            av,bv=number(q.get("ask_volume")),number(q.get("bid_volume"))
            spread=(ask-bid)/((ask+bid)/2)*100 if ask and bid and ask>=bid else None
            item=ranking.get(sym)
            status=("invalid_quote" if spread is None else
                    "thin_depth" if (av or 0)<10 or (bv or 0)<10 else
                    "wide_spread" if spread>2 else "review")
            rows.append(dict(category=q.get("category"),symbol=sym,last_mxn=last,
                bid_mxn=bid,ask_mxn=ask,ask_volume=av,bid_volume=bv,
                spread_pct=round(spread,3) if spread is not None else None,
                historical_score=number(item["research_score"]) if item else None,
                quote_status=status))
    rows.sort(key=lambda r:(r["spread_pct"] is None,r["spread_pct"] or 999))
    Path(output_file).parent.mkdir(parents=True,exist_ok=True)
    Path(output_file).write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding="utf-8")
    print("Processed",len(rows),"quotes; history matches",sum(r["historical_score"] is not None for r in rows))
    return rows

if __name__=="__main__":
    if len(sys.argv)!=3:
        raise SystemExit("Usage: python scripts/compare_quotes.py quotes.csv output/quote-comparison.json")
    analyze(sys.argv[1],ROOT/"output/ranking.csv",sys.argv[2])
