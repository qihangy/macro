"""Publish full daily inputs; portfolio simulation runs in the browser."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


def write_backtest_payload(
    path: Path,
    prices: pd.Series,
    frame: pd.DataFrame,
    spy: pd.Series | None,
    max_weight: float,
) -> dict:
    if frame.empty:
        raise ValueError("Backtest requires valid strategy history")
    history = pd.DataFrame({"price": prices.loc[frame.index[0]:]})
    history["target_weight"] = frame["target_weight"].reindex(history.index)
    history["spy_price"] = spy.reindex(history.index) if spy is not None else float("nan")
    if len(history) < 3:
        raise ValueError("Backtest requires a signal close and at least two execution closes")
    if not history.index.is_unique or not history.index.is_monotonic_increasing:
        raise ValueError("Backtest dates must be unique and increasing")
    if not (history["price"].gt(0) & history["price"].lt(float("inf"))).all():
        raise ValueError("Backtest GLD prices must be finite and positive")
    weights = history["target_weight"].dropna()
    if not weights.between(0, max_weight).all():
        raise ValueError("Backtest weights exceed the long-only allocation limits")
    payload = {
        "schema_version": 1,
        "strategy_id": "gold_allocation",
        "max_weight": max_weight,
        "correlation_proxy": "SPY",
        "history": [
            {
                "date": date.strftime("%Y-%m-%d"),
                "price": float(row["price"]),
                "target_weight": None if pd.isna(row["target_weight"]) else float(row["target_weight"]),
                "spy_price": None if pd.isna(row["spy_price"]) else float(row["spy_price"]),
            }
            for date, row in history.iterrows()
        ],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, allow_nan=False), encoding="utf-8")
    return payload
