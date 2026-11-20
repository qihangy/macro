"""Single entry point. Fails closed: stale/live data cannot silently masquerade as today's signal."""
from __future__ import annotations
import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from macro.data_sources.yahoo import download_prices
from macro.data_sources.fred import download_series
from macro.strategies.gold import calculate
from macro.publishing.json_export import write_gold_payload
from macro.publishing.backtest_export import write_backtest_payload


def run(offline=False):
    config = yaml.safe_load((ROOT / "config/strategies.yaml").read_text())
    assets = yaml.safe_load((ROOT / "config/assets.yaml").read_text())["assets"]
    raw = ROOT / "data/raw"
    raw.mkdir(parents=True, exist_ok=True)
    prices = {}
    errors = []
    for symbol, details in assets.items():
        if not details.get("active", False):
            continue
        filename = raw / f"{symbol}.parquet"
        try:
            if offline:
                if not filename.exists():
                    raise RuntimeError("No local cached Parquet")
                series = pd.read_parquet(filename).iloc[:, 0]
            else:
                series = download_prices(symbol) if details["source"] == "yahoo" else download_series(symbol)
                series.to_frame("value").to_parquet(filename)
            prices[symbol] = series
            print(f"{symbol}: {len(series)} rows through {series.index[-1].date()}")
        except Exception as e:
            errors.append(f"{symbol}: {e}")
            print(f"WARN {symbol}: {e}", file=sys.stderr)
            if symbol in ("GLD", "DGS2") and filename.exists():
                series = pd.read_parquet(filename).iloc[:, 0]
                prices[symbol] = series
                print(f"Using cached {symbol} and verifying freshness", file=sys.stderr)

    site = ROOT / "site"
    site.mkdir(exist_ok=True)
    shutil.copy2(ROOT / "web/index.html", site / "index.html")
    shutil.copy2(ROOT / "web/style.css", site / "style.css")
    shutil.copy2(ROOT / "web/app.js", site / "app.js")
    shutil.copy2(ROOT / "web/backtest.js", site / "backtest.js")
    shutil.copy2(ROOT / "web/backtest-ui.js", site / "backtest-ui.js")
    (site / ".nojekyll").touch()

    if "GLD" not in prices or "DGS2" not in prices:
        raise RuntimeError("Required GLD/DGS2 datasets missing; existing public site must not be overwritten")

    # At 9am ET, today's ETF close doesn't exist. Even for intraday/manual runs,
    # avoid using any current-day partial daily candle in the signal engine.
    et_today = pd.Timestamp(datetime.now(ZoneInfo("America/New_York")).date())
    gld = prices["GLD"].loc[lambda s: s.index < et_today]
    dgs2 = prices["DGS2"].loc[lambda s: s.index < et_today]
    if gld.empty or dgs2.empty:
        raise RuntimeError("No completed-day data")

    # Do not publish a 'fresh' signal if GLD or FRED is excessively stale.
    latest_gld = gld.index.max()
    latest_fred = dgs2.index.max()
    if (et_today - latest_gld).days > 6 or (et_today - latest_fred).days > 10:
        raise RuntimeError(f"Stale data: GLD {latest_gld.date()}, DGS2 {latest_fred.date()}")

    strat = config["strategies"]["gold_allocation"]
    frame = calculate(gld, dgs2, strat)
    if frame.empty:
        raise RuntimeError("No valid gold signal")
    output = ROOT / "data/processed/gold_allocation.parquet"
    output.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(output)
    payload = write_gold_payload(site / "data/gold_allocation.json", frame, strat,
                                 config["portfolio"]["default_nav"])
    write_backtest_payload(site / "data/backtest.json", gld, frame, prices.get("SPY"),
                           strat["sizing"]["max_weight"])
    # Each registered asset gets its own price curve. Other strategies stay clearly disabled.
    market = {}
    for symbol, series in prices.items():
        if symbol == "DGS2":
            continue
        p = series.loc[lambda s: s.index < et_today].dropna()
        market[symbol] = {"name": assets[symbol]["name"], "asset_class": assets[symbol]["asset_class"],
                          "last_date": p.index[-1].strftime("%Y-%m-%d"),
                          "last_price": float(p.iloc[-1]),
                          "history": [{"date": d.strftime("%Y-%m-%d"), "price": round(float(v), 6)}
                                      for d, v in p.tail(600).items()]}
    (site / "data/market.json").write_text(json.dumps(market, allow_nan=False), encoding="utf-8")
    print(f"Published Gold signal for {payload['data_asof_date']} to {site}")
    if errors:
        print("Optional source warnings: " + "; ".join(errors), file=sys.stderr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true", help="Recompute using locally cached Parquet")
    args = ap.parse_args()
    run(args.offline)


if __name__ == "__main__":
    main()
