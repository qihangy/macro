from __future__ import annotations
import json
import math
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
from macro.portfolio.sizing import sizing


def safe(value):
    if value is None or pd.isna(value):
        return None
    if isinstance(value, (bool, str)):
        return value
    if isinstance(value, (float, int)):
        return float(value) if math.isfinite(float(value)) else None
    return str(value)


def write_gold_payload(path: Path, frame: pd.DataFrame, cfg: dict, nav: float):
    latest = frame.iloc[-1]
    recent = frame.tail(600)
    series_fields = ["price", "momentum", "rate_filter", "realized_vol", "vol_multiplier",
                     "return_12m", "treasury_yield", "target_weight"]
    payload = {
        "schema_version": 1, "status": "ok", "strategy_id": "gold_allocation",
        "label": "Gold Allocation", "asset": "GLD", "asset_class": "Commodity",
        "calculated_at_utc": datetime.now(timezone.utc).isoformat(),
        "data_asof_date": frame.index[-1].strftime("%Y-%m-%d"),
        "price": safe(latest["price"]),
        "signals": {k: safe(latest[k]) for k in series_fields if k != "price"},
        "momentum_components": {
            "return_6m": safe(latest["return_126d"]),
            "return_12m": safe(latest["return_252d"]),
            "direction_6m": safe(latest["direction_126d"]),
            "direction_12m": safe(latest["direction_252d"]),
        },
        "parameters": {"max_weight": cfg["sizing"]["max_weight"],
                       "target_vol": cfg["signals"]["volatility"]["target_vol"],
                       "realized_vol_window": cfg["signals"]["volatility"]["window"],
                       "nominal_yield_hurdle": True},
        "default_portfolio_nav": nav,
        "example_trade": sizing(float(latest["price"]), float(latest["target_weight"]), nav),
        "history": [{"date": dt.strftime("%Y-%m-%d"),
                     **{k: safe(row[k]) for k in series_fields}} for dt, row in recent.iterrows()],
        "methodology": "GLD adjusted closing price; nominal 2Y Treasury yield compared with 252-session GLD trailing return; 63-session annualized log-return volatility; signals use prior completed close."
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, allow_nan=False), encoding="utf-8")
    return payload
