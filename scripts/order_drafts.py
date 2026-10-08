"""Generate *non-executable* limit-order DRAFTS from Actinver quote snapshots.
No credentials, API orders, or portfolio mutations.
Do not treat a stored snapshot as a live executable quote."""
import csv
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"output"
CAPITAL=1_000_000
FEE_RATE=0.00116
MAX_SPREAD_PCT=1.5
MIN_BID_DEPTH=10
MIN_ASK_DEPTH=10
MAX_POSITION_PCT=0.20
CASH_RESERVE=0.10
# Diversified as far as executable quote depth allows. Strong technology overlap remains.
SLEEVES=[
    ("Healthcare",["ABBV","PFE"],0.18),
    ("Semiconductors",["TSM N","NVDA"],0.18),
    ("Technology ETF",["VGT","XLK"],0.18),
    ("Broad equity ETF",["SPY","QQQ"],0.18),
    ("Consumer / diversified",["AAPL","EWZ"],0.18),
]

def f(v):
    try: return float(str(v).replace(",","").replace("$","").strip())
    except (TypeError,ValueError): return None

def plan(quotes, ranked):
    result=[];total=0
    for sleeve,candidates,target in SLEEVES:
        viable=[]
        for symbol in candidates:
            q=quotes.get(symbol)
            if not q:continue
            bid,ask=f(q.get("bid")),f(q.get("ask"))
            av,bv=f(q.get("ask_volume")),f(q.get("bid_volume"))
            if not all(x is not None and x>0 for x in [bid,ask,av,bv]):continue
            if ask<bid:continue
            spread=100*(ask-bid)/((ask+bid)/2)
            if spread>MAX_SPREAD_PCT or av<MIN_ASK_DEPTH or bv<MIN_BID_DEPTH:continue
            score=f(ranked.get(symbol,{}).get("research_score"))
            if score is None:continue
            viable.append((score,symbol,ask,int(av),spread))
        if not viable:
            result.append(dict(sleeve=sleeve,status="NO_ELIGIBLE_QUOTE",alternatives=candidates))
            continue
        viable.sort(reverse=True)
        score,sym,ask,available,spread=viable[0]
        budget=min(CAPITAL*target,CAPITAL*MAX_POSITION_PCT)
        quantity=max(0,min(math.floor(budget/(ask*(1+FEE_RATE))),available))
        gross=round(quantity*ask,2)
        fee=round(gross*FEE_RATE,2)
        total+=gross+fee
        result.append(dict(sleeve=sleeve,status="DRAFT_NOT_LIVE",symbol=sym,
            quantity=quantity,limit_price_mxn=ask,gross_mxn=gross,
            estimated_fee_mxn=fee,total_mxn=round(gross+fee,2),
            spread_pct=round(spread,3),score=score,
            available_ask_volume=available))
    if total>CAPITAL*(1-CASH_RESERVE)+0.01:
        raise AssertionError("Cash reserve exceeded")
    return result,round(total,2)

def main():
    # A scheduled job must never re-label an old quote snapshot as actionable.
    quote_path=ROOT/"data/quotes-snapshot.csv"
    approval=os.environ.get("ALLOW_SNAPSHOT_DRAFTS")=="1"
    if not approval:
        warning={
            "status":"BLOCKED_STALE_QUOTES",
            "message":"Historical snapshot is not a live Actinver market quote. Import a fresh CSV, verify timestamp, and explicitly approve quote use.",
            "requires":"ALLOW_SNAPSHOT_DRAFTS=1 after manually updating data/quotes-snapshot.csv",
        }
        (OUT/"ordenes-borrador.json").write_text(json.dumps(warning,indent=2,ensure_ascii=False),encoding="utf-8")
        (OUT/"ordenes-borrador.md").write_text(
            "# Órdenes bloqueadas: cotizaciones no verificadas\\n\\n"
            "Las cotizaciones guardadas son antiguas. No hay órdenes ejecutables.\\n\\n"
            "Actualiza `data/quotes-snapshot.csv` con el monitor de Actinver, "
            "comprueba la fecha y ejecuta manualmente con aprobación explícita.\\n",
            encoding="utf-8")
        print("BLOCKED_STALE_QUOTES: refusing to present stored snapshot as fresh")
        return
    with quote_path.open(encoding="utf-8-sig",newline="") as h:
        quotes={q["symbol"].replace("*","").strip().upper():q for q in csv.DictReader(h)}
    with (OUT/"ranking.csv").open(encoding="utf-8-sig",newline="") as h:
        ranks={r["simbolo_actinver"].strip().upper():r for r in csv.DictReader(h)}
    drafts,total=plan(quotes,ranks)
    summary=dict(as_of_quote="2026-10-08 uploaded snapshot; verify date with simulator",
        created_utc=datetime.now(timezone.utc).isoformat(),capital_mxn=CAPITAL,
        maximum_position_pct=MAX_POSITION_PCT*100,cash_reserve_target_pct=CASH_RESERVE*100,
        total_estimated_mxn=total,remaining_cash_estimated_mxn=round(CAPITAL-total,2),
        stale_quote_warning="Quotes are a snapshot, not live. Reconfirm price and depth before every order.",
        candidates=drafts)
    (OUT/"ordenes-borrador.json").write_text(json.dumps(summary,indent=2,ensure_ascii=False),encoding="utf-8")
    lines=["# Borrador de operaciones — NO ejecutar automáticamente","",
       "**Advertencia:** cotizaciones de una captura/exportación anterior; actualizar antes de operar.",
       f"Capital simulado: ${CAPITAL:,.0f}; costo estimado por operación: {FEE_RATE*100:.3f}%; reserva mínima: {CASH_RESERVE*100:.0f}%.","",
       "| Bloque | Emisora | Cantidad máxima* | Precio límite de referencia (MXN) | Costo total estimado | Spread |",
       "|---|---|---:|---:|---:|---:|"]
    for item in drafts:
        if item["status"]=="DRAFT_NOT_LIVE":
            lines.append(f'| {item["sleeve"]} | {item["symbol"]} | {item["quantity"]} | ${item["limit_price_mxn"]:,.2f} | ${item["total_mxn"]:,.2f} | {item["spread_pct"]:.2f}% |')
        else:
            lines.append(f'| {item["sleeve"]} | Sin cotización aceptable | — | — | — | — |')
    lines += ["",f"**Total previsto:** ${total:,.2f}. **Efectivo restante:** ${CAPITAL-total:,.2f}.",
      "","*Cantidad limitada por dinero asignado y volumen visible de venta. No garantiza ejecución.",
      "La comisión es una hipótesis que debe cotejarse con las reglas vigentes.",
      "Evitar duplicar exposición tecnológica; confirmar riesgo, noticias, horarios y reglas del Reto.",
      "No se han creado órdenes ni se ha comprado nada."]
    (OUT/"ordenes-borrador.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
    print("Order DRAFTS generated:",len(drafts),"total",total)
if __name__=="__main__":
    main()
