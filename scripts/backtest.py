"""Walk-forward monthly rebalance research. Uses only prior closes for signals.
Outputs a historical experiment, not an estimate of future Reto results."""
import json
from pathlib import Path
import numpy as np
import pandas as pd
import yfinance as yf

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"output"
OUT.mkdir(exist_ok=True)

# Small, explicitly defined benchmark universe with reliable US-listed symbols.
# This tests a research rule, NOT the full Actinver selection universe.
SYMBOLS=["SPY","QQQ","VGT","XLK","EWZ","NVDA","MSFT","AMD","ABBV","TSM","PG","XOM","PFE","AAPL","AMZN","META"]
COST_BPS=11.6  # indicative 0.10% + 16% VAT per executed notional, check actual contest terms


def simulate(close, rebalance_days=21, top_n=5, cost_bps=COST_BPS):
    close=close.sort_index().ffill()
    close=close.dropna(axis=1, thresh=180)
    if len(close)<260 or close.shape[1]<top_n:
        raise ValueError("Not enough history or instruments")
    daily=close.pct_change(fill_method=None)
    equity=1.0
    curve=[]
    trades=0
    prev={}
    records=[]
    # initial 126 observations only for training; first decision at close t
    for t in range(126,len(close)-1):
        day=close.index[t]
        if (t-126)%rebalance_days==0:
            hist=close.iloc[:t+1]
            mom=hist.iloc[-1]/hist.iloc[-64]-1
            vol=daily.iloc[t-62:t+1].std()*np.sqrt(252)
            trend=(hist.iloc[-1]>hist.iloc[-50:].mean())
            valid=(mom/vol.replace(0,np.nan)).where(trend).replace([np.inf,-np.inf],np.nan).dropna()
            chosen=valid.nlargest(top_n).index.tolist()
            weights={s:1/top_n for s in chosen}
            turnover=sum(abs(weights.get(s,0)-prev.get(s,0)) for s in set(weights)|set(prev))
            equity*=1-turnover*cost_bps/10000
            trades+=1
            prev=weights
            records.append({"date":str(day.date()),"symbols":chosen,"turnover":round(turnover,3)})
        # use decision at previous close for the next close-to-close return
        next_returns=daily.iloc[t+1]
        period_return=sum(w*float(next_returns.get(s,0)) for s,w in prev.items()
                          if pd.notna(next_returns.get(s,np.nan)))
        equity*=1+period_return
        curve.append({"date":str(close.index[t+1].date()),"equity":equity})
    values=pd.Series([r["equity"] for r in curve],dtype=float)
    if values.empty:
        raise ValueError("empty backtest")
    start=close.index[126]; end=close.index[-1]
    years=max((end-start).days/365.25,0.01)
    benchmark=close["SPY"].iloc[-1]/close["SPY"].iloc[126]-1 if "SPY" in close else np.nan
    return {
        "start":str(start.date()),"end":str(end.date()),"universe":list(close.columns),
        "method":"monthly rebalanced top-5 trend-filtered 63d risk-adjusted momentum, equal-weight, cash if fewer than five qualify",
        "total_return_pct":round((equity-1)*100,2),
        "annualized_return_pct":round((equity**(1/years)-1)*100,2),
        "max_drawdown_pct":round(((values/values.cummax()-1).min())*100,2),
        "benchmark_spy_pct":round(float(benchmark)*100,2) if pd.notna(benchmark) else None,
        "rebalance_count":trades,"indicative_cost_bps_per_notional":cost_bps,
        "notes":["Survivorship/selection bias: fixed known 2026 tickers, not point-in-time constituents.",
                 "Signals use historical closes; trading assumed at next close-to-close without slippage.",
                 "Not an out-of-sample validated model or a simulation of Actinver execution.",
                 "Exchange rates, spreads and local SIC liquidity not modeled.",
                 "Only this subset of tickers tested, not all 226."],
        "rebalance_log":records[-12:]
    }


def main():
    raw=yf.download(SYMBOLS,period="3y",interval="1d",auto_adjust=True,progress=False,threads=False)
    closes=raw["Close"]
    if isinstance(closes,pd.Series):
        closes=closes.to_frame()
    closes=closes.reindex(columns=SYMBOLS)
    result=simulate(closes)
    (OUT/"backtest.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
    print("Backtest:", {k:v for k,v in result.items() if k not in ("notes","rebalance_log","universe")})


if __name__=="__main__":
    main()
