"""Ingest browser-captured public quotes from an Actions workflow_dispatch input.
Does not handle account balances, cookies, login credentials, or order execution."""
import csv
import json
import math
import os
from collections import Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"output"
EXPECTED={"ACCIONES":145,"ETFs":56,"FONDOS":25}
FIELDS=("category","symbol","last","variation","bid_volume","bid","ask_volume","ask")

def parse_num(raw):
    try:
        s=str(raw).strip().replace("$","").replace(",","").replace("%","")
        n=float(s)
        return n if math.isfinite(n) else None
    except (ValueError,TypeError):
        return None

def validate(payload, universe_path):
    if not isinstance(payload,dict) or not isinstance(payload.get("rows"),list):
        raise ValueError("Missing rows")
    dt=datetime.fromisoformat(payload["captured_at"].replace("Z","+00:00"))
    now=datetime.now(timezone.utc)
    if dt.utcoffset() is None or dt>now+timedelta(minutes=5) or dt<now-timedelta(hours=4):
        raise ValueError("Capture timestamp invalid or stale")
    rows=payload["rows"]
    if len(rows)!=sum(EXPECTED.values()):
        raise ValueError(f"Expected 226 rows, got {len(rows)}")
    with universe_path.open(encoding="utf-8-sig",newline="") as f:
        universe={(r["tipo"],r["simbolo_actinver"].strip().upper()) for r in csv.DictReader(f)}
    found=set()
    counts=Counter()
    cleaned=[]
    for r in rows:
        if not isinstance(r,dict) or any(k not in r for k in FIELDS):
            raise ValueError("Malformed row")
        cat=r["category"]
        sym=str(r["symbol"]).replace("*","").strip().upper()
        key=(cat,sym)
        if key not in universe or key in found:
            raise ValueError(f"Invalid or duplicate catalog item: {key}")
        found.add(key)
        counts[cat]+=1
        entry={"category":cat,"symbol":sym}
        for k in FIELDS[2:]:
            entry[k]=parse_num(r[k])
        cleaned.append(entry)
    if dict(counts)!=EXPECTED or found!=universe:
        raise ValueError(f"Unverified category membership: {dict(counts)}")
    return {"captured_at":payload["captured_at"],"validated_at":now.isoformat(),
        "total":len(cleaned),"counts":dict(counts),"quotes":cleaned}

def compare(snapshot, ranking_path):
    with ranking_path.open(encoding="utf-8-sig",newline="") as f:
        ranked={r["simbolo_actinver"].strip().upper():r for r in csv.DictReader(f)}
    rows=[]
    for r in snapshot["quotes"]:
        if r["category"]=="FONDOS":
            continue
        a,b=r["ask"],r["bid"]
        av,bv=r["ask_volume"],r["bid_volume"]
        spread=100*(a-b)/((a+b)/2) if a and b and a>=b else None
        score=parse_num(ranked.get(r["symbol"],{}).get("research_score"))
        if spread is None: status="INVALID_QUOTE"
        elif min(av or 0,bv or 0)<10: status="THIN_DEPTH"
        elif spread>1: status="WIDE_SPREAD"
        elif score is None: status="NO_HISTORICAL_SCORE"
        else: status="REVIEW"
        rows.append({"symbol":r["symbol"],"category":r["category"],
            "ask_mxn":a,"bid_mxn":b,"ask_volume":av,"bid_volume":bv,
            "spread_pct":round(spread,3) if spread is not None else None,
            "historical_score":score,"status":status})
    rows.sort(key=lambda x:(x["status"]!="REVIEW",-(x["historical_score"] or -1)))
    return {"captured_at":snapshot["captured_at"],
        "note":"Public quote snapshot; not live orders or investment recommendations.",
        "candidates":rows}

def main():
    raw=os.environ.get("ACTINVER_PAYLOAD","")
    if len(raw)>65000:
        raise ValueError("Input too large")
    snapshot=validate(json.loads(raw),ROOT/"data/universe.csv")
    compared=compare(snapshot,OUT/"ranking.csv")
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/"actinver_quotes.json").write_text(
        json.dumps(snapshot,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (OUT/"actinver_quote_opportunities.json").write_text(
        json.dumps(compared,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"VALIDATED: {snapshot['total']} quotes: {snapshot['counts']}")
    print("Research review:",sum(x["status"]=="REVIEW" for x in compared["candidates"]))

if __name__=="__main__":
    main()
