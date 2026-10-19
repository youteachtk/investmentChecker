"""Build an automatic, read-only intraday decision sheet after each validated quote upload.

Quotes come from the public monitor. No account balances, holdings, tokens, trade
execution or user-specific assumptions enter the public report.
"""
from __future__ import annotations
import csv
import json
import math
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
PUBLIC = BASE / "output"
MIN_VOLUME = 100
MAX_SPREAD_PERCENT = 0.90
MIN_SCORE = 60.0
MAX_POSITIVE_MOVE = 3.0
EXCLUDE_LEVERAGED = {"SOXL", "SOXS", "TQQQ", "SQQQ", "SPXL", "SPXS",
                     "TECL", "TECS", "TNA", "TZA", "QLD", "FAS", "FAZ", "PSQ"}

def number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None

def watch(snapshot, ranking):
    at = datetime.fromisoformat(snapshot["captured_at"].replace("Z", "+00:00"))
    if at.tzinfo is None:
        raise ValueError("Capture timestamp must be timezone aware")
    as_of = datetime.now(timezone.utc)
    minutes = max(0, round((as_of-at).total_seconds()/60, 1))
    ranked = {}
    for item in ranking:
        s = (item.get("simbolo_actinver") or "").strip().upper()
        score = number(item.get("research_score"))
        if s and score is not None:
            ranked[s] = score
    candidates = []
    skipped = {"invalid_quote": 0, "illiquid": 0, "wide_spread": 0,
               "high_momentum": 0, "excluded_or_unranked": 0}
    for item in snapshot["quotes"]:
        symbol = item.get("symbol", "")
        if item.get("category") == "FONDOS" or symbol in EXCLUDE_LEVERAGED or symbol not in ranked:
            skipped["excluded_or_unranked"] += 1
            continue
        bid = number(item.get("bid"))
        ask = number(item.get("ask"))
        bid_volume = number(item.get("bid_volume"))
        ask_volume = number(item.get("ask_volume"))
        change = number(item.get("variation"))
        if any(v is None for v in (bid, ask, bid_volume, ask_volume, change)) or bid <= 0 or ask <= 0 or ask < bid:
            skipped["invalid_quote"] += 1
            continue
        spread = 200 * (ask - bid)/(ask + bid)
        if min(bid_volume, ask_volume) < MIN_VOLUME:
            skipped["illiquid"] += 1
            continue
        if spread > MAX_SPREAD_PERCENT:
            skipped["wide_spread"] += 1
            continue
        if change > MAX_POSITIVE_MOVE:
            skipped["high_momentum"] += 1
            continue
        score = ranked[symbol]
        if score < MIN_SCORE:
            skipped["excluded_or_unranked"] += 1
            continue
        candidates.append({
            "symbol": symbol, "category": item["category"],
            "change_pct": round(change, 2), "historical_score": round(score, 2),
            "bid_mxn": round(bid, 2), "ask_mxn": round(ask, 2),
            "spread_pct": round(spread, 3),
            "bid_volume": int(bid_volume), "ask_volume": int(ask_volume),
            "decision": "REVIEW_ONLY"
        })
    candidates.sort(key=lambda v: (-v["historical_score"], v["spread_pct"]))
    return {
        "captured_at": snapshot["captured_at"], "generated_at": as_of.isoformat(),
        "snapshot_age_minutes_at_generation": minutes,
        "snapshot_is_recent_at_generation": minutes <= 15,
        "eligible_for_order_execution": False,
        "message": "Research watchlist only: no private holdings, cash balance, current live depth, or automatic trades.",
        "ranking_warning": "Historical scores are not an intraday forecast; check their generation date.",
        "criteria": {
            "minimum_bid_and_ask_volume": MIN_VOLUME,
            "maximum_spread_pct": MAX_SPREAD_PERCENT,
            "minimum_historical_score": MIN_SCORE,
            "maximum_same_day_positive_change_pct": MAX_POSITIVE_MOVE,
            "exclude_leveraged_and_inverse": True
        },
        "skipped": skipped, "candidates": candidates[:20]
    }

def markdown(result):
    lines = [
        "# Actinver — vigilancia automática de oportunidades",
        "",
        f"Captura validada (UTC): **{result['captured_at']}**",
        f"Generado (UTC): **{result['generated_at']}**",
        f"Edad de la captura al generar: {result['snapshot_age_minutes_at_generation']} min",
        "",
        "**No son órdenes ni precios en vivo.** Reconfirmar profundidad y precios en Actinver antes de operar.",
        "Sin posiciones y efectivo privados no se proponen cantidades para evitar duplicar operaciones.",
        "",
        "| Instrumento | Tipo | Cambio % | Límite vendedor MXN | Comprador MXN | Spread % | Profundidad venta | Profundidad compra | Puntaje histórico |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for c in result["candidates"]:
        lines.append(
            f"| {c['symbol']} | {c['category']} | {c['change_pct']:+.2f} | "
            f"${c['ask_mxn']:,.2f} | ${c['bid_mxn']:,.2f} | {c['spread_pct']:.3f} | "
            f"{c['ask_volume']:,} | {c['bid_volume']:,} | {c['historical_score']:.2f} |"
        )
    if not result["candidates"]:
        lines.append("| Sin candidatos que cumplan los filtros | — | — | — | — | — | — | — | — |")
    lines.extend(["", "Actualización automática después de cada captura completa de 226 instrumentos.",
                  "Sin compras, ventas, folios, saldos personales ni credenciales."])
    return "\n".join(lines)+"\n"

def main():
    snapshot = json.loads((PUBLIC/"actinver_quotes.json").read_text(encoding="utf-8"))
    if snapshot.get("total") != 226 or len(snapshot.get("quotes", [])) != 226:
        raise ValueError("A full, validated 226-instrument capture is required")
    with (PUBLIC/"ranking.csv").open(encoding="utf-8-sig", newline="") as f:
        ranking = list(csv.DictReader(f))
    result = watch(snapshot, ranking)
    (PUBLIC/"session_watch.json").write_text(json.dumps(result, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    (PUBLIC/"session_watch.md").write_text(markdown(result), encoding="utf-8")
    print(f"Watchlist built from {snapshot['captured_at']} ({len(result['candidates'])} candidates)")

if __name__ == "__main__":
    main()
