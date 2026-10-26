"""Cross-sectional risk-aware research scores; no predictive probabilities."""
import numpy as np
import pandas as pd


def score_universe(rows):
    if not rows:
        return rows
    frame = pd.DataFrame(rows)
    # Rank percentiles avoid 100-point saturation and compare volatility fairly.
    metrics = [
        ("return_20d_pct", 0.06, True),
        ("return_60d_pct", 0.07, True),
        ("return_126d_pct", 0.12, True),
        ("return_252d_pct", 0.14, True),
        ("mxn_return_126d_pct", 0.15, True),
        ("mxn_return_252d_pct", 0.15, True),
        ("mxn_return_750d_pct", 0.10, True),
        ("annual_volatility_pct", 0.07, False),
        ("mxn_current_drawdown_252d_pct", 0.08, True),
        ("volume_5d_vs_20d", 0.02, True),
    ]
    score = pd.Series(0.0, index=frame.index)
    weights = pd.Series(0.0, index=frame.index)
    for name, weight, ascending in metrics:
        values = pd.to_numeric(frame.get(name, pd.Series(index=frame.index, dtype=float)),
                               errors="coerce")
        valid = values.notna() & np.isfinite(values)
        if valid.any():
            ranks = values[valid].rank(pct=True, ascending=ascending)
            score.loc[valid] += ranks * weight
            weights.loc[valid] += weight
    trend = (
        (frame["close"] > frame["sma_20"]).astype(float) +
        (frame["sma_20"] > frame["sma_50"]).astype(float) +
        (frame["macd"] > frame["macd_signal"]).astype(float)
    ) / 3
    score += 0.04 * trend
    weights += 0.04
    frame["research_score"] = (100 * score / weights).round(2)
    # Elevated volatility means larger risk, even if return momentum is high.
    frame["risk_label"] = np.select(
        [frame["annual_volatility_pct"] >= 60,
         frame["annual_volatility_pct"] >= 35],
        ["high", "moderate"], default="lower"
    )
    return frame.sort_values(["research_score", "simbolo_actinver"], ascending=[False, True]).to_dict("records")
