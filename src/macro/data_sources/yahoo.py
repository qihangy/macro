"""Daily adjusted ETF prices from Yahoo (via yfinance)."""
from __future__ import annotations
import pandas as pd
import yfinance as yf


def download_prices(ticker: str, period: str = "5y") -> pd.Series:
    frame = yf.download(ticker, period=period, interval="1d", auto_adjust=True,
                        progress=False, threads=False, timeout=25)
    if frame is None or frame.empty:
        raise RuntimeError(f"No Yahoo rows for {ticker}")
    price = frame["Close"]
    if isinstance(price, pd.DataFrame):
        price = price.iloc[:, 0]
    s = pd.to_numeric(price, errors="coerce").dropna()
    s.index = pd.to_datetime(s.index).tz_localize(None).normalize()
    s = s[~s.index.duplicated(keep="last")].sort_index()
    if len(s) < 260:
        raise RuntimeError(f"Insufficient history for {ticker}: {len(s)} rows")
    s.name = ticker
    return s
