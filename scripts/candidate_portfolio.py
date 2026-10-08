"""Create an actionable *review list* without inventing simulator prices.
This is a research proposal, not automatic orders."""
import csv
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"output"
OUT.mkdir(exist_ok=True)
RANK=OUT/"ranking.csv"
UNIVERSE=ROOT/"data"/"universe.csv"

# Distinct risk buckets reduce accidental mega-cap technology duplication.
BUCKETS=[
    ("Health care",["ABBV","PFE","TMO","XLV"],20),
    ("Technology equity",["MSFT","NVDA","AAPL","AMD","TSM N"],20),
    ("Technology ETF",["VGT","XLK","QQQ"],20),
    ("International",["EWZ","ACWI","EEM","VEA"],20),
    ("Broad market",["SPY","IVV","VOO","VTI"],20),
]
# Reject leveraged/inverse and any ticker without successful downloaded series.
def main():
    universe={r["simbolo_actinver"]:r for r in csv.DictReader(UNIVERSE.open(encoding="utf-8"))}
    rank={r["simbolo_actinver"]:r for r in csv.DictReader(RANK.open(encoding="utf-8"))}
    choices=[]
    for bucket, options, percent in BUCKETS:
        found=[rank[s] for s in options if s in rank
               and universe[s]["riesgo_especial"]=="none"
               and universe[s]["estado_mapeo"]=="candidate"]
        if not found:
            raise RuntimeError("No eligible candidates in bucket: "+bucket)
        found.sort(key=lambda r:float(r["research_score"]),reverse=True)
        selected=found[0]
        choices.append((bucket,selected,percent))
    if len({v["simbolo_actinver"] for _,v,_ in choices})!=len(choices):
        raise RuntimeError("Duplicate instruments across buckets")
    lines=["# Actinver — candidate watchlist","",
           "Research-only draft based on latest downloaded daily histories. NOT buy orders.","",
           "Equal-weight candidate allocation: 20% each. Total 100%; 5 different securities.","",
           "| Sleeve | Instrument | Allocation (actipesos) | Relative score | Risk | Last external close |",
           "|---|---|---:|---:|---|---:|"]
    for bucket,v,pct in choices:
        lines.append(f'| {bucket} | {v["simbolo_actinver"]} | {pct*10000:,} | {v["research_score"]} | {v["risk_label"]} | {v["close"]} |')
    lines += ["","## Required checks before trading","",
              "1. Check each security actually appears in Actinver and is eligible under current contest rules.",
              "2. Get fresh **Actinver buy/ask quote in MXN**; external USD closes above are NOT order limits.",
              "3. Check spread, market depth, local trading hours, and commissions; reject illiquid listings.",
              "4. Reassess sector overlap; QQQ, VGT and large technology stocks can be highly correlated.",
              "5. Do not place orders automatically; user decides and confirms each trade.",
              "6. Review potential market-moving news and earnings before entering.",
              "",
              "The suggested percentages are an initial experimental allocation, not optimized for a 6-week contest.",
              "Generated (UTC): "+datetime.now(timezone.utc).isoformat()]
    (OUT/"cartera-candidata.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
    print("Generated watchlist:",[(v["simbolo_actinver"],p) for _,v,p in choices])
if __name__=="__main__":
    main()
