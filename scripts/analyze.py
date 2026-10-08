#!/usr/bin/env python3
"""Research-only daily ranking. Unverified mappings excluded by default."""
import csv
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf
from scoring import score_universe

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output"
OUT.mkdir(exist_ok=True)
UNIVERSE = ROOT / "data" / "universe.csv"


def numeric(value):
    try:
        v = float(value)
        return round(v, 5) if math.isfinite(v) else None
    except (ValueError, TypeError):
        return None


def indicators(close, volume):
    if len(close) < 65:
        return None
    ret = close.pct_change()
    delta = close.diff()
    up = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
    down = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
    rs = up / down.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal = macd.ewm(span=9, adjust=False).mean()
    last = float(close.iloc[-1])
    ma20 = float(close.tail(20).mean())
    ma50 = float(close.tail(50).mean())
    momentum20 = last / float(close.iloc[-21]) - 1
    momentum60 = last / float(close.iloc[-61]) - 1
    vol = float(ret.tail(60).std() * np.sqrt(252))
    drawdown = float((close / close.cummax() - 1).tail(252).min())
    volratio = float(volume.tail(5).mean() / volume.tail(20).mean()) if volume.tail(20).mean() > 0 else None
    # Transparent heuristic; this is NOT a calibrated probability of returns.
    score = 50
    score += 12 if last > ma20 else -12
    score += 12 if ma20 > ma50 else -12
    score += 12 if macd.iloc[-1] > signal.iloc[-1] else -12
    score += float(np.clip(momentum20 * 100, -15, 15))
    score += float(np.clip(momentum60 * 40, -12, 12))
    score -= float(np.clip(vol * 10, 0, 15))
    if pd.notna(rsi.iloc[-1]) and rsi.iloc[-1] > 78:
        score -= 10
    return {
        "close": numeric(last), "return_20d_pct": numeric(momentum20 * 100),
        "return_60d_pct": numeric(momentum60 * 100),
        "rsi_14": numeric(rsi.iloc[-1]),
        "macd": numeric(macd.iloc[-1]), "macd_signal": numeric(signal.iloc[-1]),
        "sma_20": numeric(ma20), "sma_50": numeric(ma50),
        "annual_volatility_pct": numeric(vol * 100),
        "trailing_drawdown_pct": numeric(drawdown * 100),
        "volume_5d_vs_20d": numeric(volratio),
        "heuristic_score": numeric(np.clip(score, 0, 100)),
        "history_days": len(close),
        "last_market_date": str(close.index[-1].date()),
    }


def main():
    instruments = list(csv.DictReader(UNIVERSE.open(encoding="utf-8")))
    output, failures = [], []
    eligible = [i for i in instruments if i["simbolo_datos"] and i["estado_mapeo"] == "candidate" and i["riesgo_especial"] == "none"]
    # No bulk promises: fetches are individually rate-limited and failures logged.
    for idx, inst in enumerate(eligible, 1):
        symbol = inst["simbolo_datos"]
        try:
            frame = yf.download(symbol, period="3y", interval="1d", auto_adjust=True, progress=False, threads=False, timeout=20)
            if frame.empty:
                raise ValueError("no history returned")
            close = frame["Close"]
            volume = frame["Volume"]
            if isinstance(close, pd.DataFrame):
                close = close.iloc[:, 0]
            if isinstance(volume, pd.DataFrame):
                volume = volume.iloc[:, 0]
            clean = pd.DataFrame({"close": close, "volume": volume}).dropna(subset=["close"])
            stats = indicators(clean["close"], clean["volume"].fillna(0))
            if not stats:
                raise ValueError("less than 65 price observations")
            output.append({"tipo": inst["tipo"], "simbolo_actinver": inst["simbolo_actinver"],
                           "simbolo_datos": symbol, **stats})
        except Exception as e:
            failures.append({"simbolo_actinver": inst["simbolo_actinver"], "symbol": symbol,
                             "error": str(e)[:220]})
        if idx % 20 == 0:
            print(f"Processed {idx}/{len(eligible)}; successes {len(output)}; errors {len(failures)}", flush=True)
        time.sleep(0.15)

    output = score_universe(output)
    with (OUT / "ranking.csv").open("w", newline="", encoding="utf-8") as f:
        keys = ["tipo", "simbolo_actinver", "simbolo_datos", "last_market_date", "close", "return_20d_pct",
                "return_60d_pct", "rsi_14", "macd", "macd_signal", "sma_20", "sma_50",
                "annual_volatility_pct", "trailing_drawdown_pct", "volume_5d_vs_20d",
                "heuristic_score", "research_score", "risk_label", "history_days"]
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(output)
    missing = [i for i in instruments if i not in eligible]
    meta = {"updated_utc": datetime.now(timezone.utc).isoformat(), "universe": len(instruments),
            "attempted": len(eligible), "ranked": len(output), "failed": len(failures),
            "excluded_unverified_or_special": len(missing),
            "failures": failures, "unresolved_symbols": [x["simbolo_actinver"] for x in missing]}
    (OUT / "status.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    lines = ["# Actinver research snapshot", "",
             f"Generated UTC: {meta['updated_utc']}", "",
             f"Universe: {len(instruments)}. Ranked: {len(output)}. Failed downloads: {len(failures)}.",
             f"Not yet mapped or special-risk: {len(missing)}.", "",
             "Scores are relative cross-sectional ranks, not investment forecasts; compare only the same run. Symbols and currency/market differences require verification.",
             "Leveraged/inverse ETFs are excluded from rankings by default.", "",
             "## Highest-scoring instruments (NOT automatic buys)", "",
             "| Instrument | Type | Relative score | Risk | 20d % | 60d % | Volatility % |",
             "|---|---|---:|---|---:|---:|---:|"]
    for row in output[:20]:
        lines.append(f"| {row['simbolo_actinver']} | {row['tipo']} | {row['research_score']} | {row['risk_label']} | {row['return_20d_pct']} | {row['return_60d_pct']} | {row['annual_volatility_pct']} |")
    lines += ["", "## Important", "", "Validate individual listings, spreads and current Reto Actinver rules before trading.",
              "Source download failures are listed in output/status.json."]
    (OUT / "analisis-diario.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Finished: {len(output)} ranked, {len(failures)} failed, {len(missing)} excluded")
    if not output:
        raise SystemExit("No valid histories downloaded; check logs and provider limits.")


if __name__ == "__main__":
    main()
