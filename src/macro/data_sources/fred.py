"""FRED public CSV via system curl; DGS2 is quoted in percentage points."""
from __future__ import annotations
from io import StringIO
import subprocess
from urllib.parse import urlencode
import pandas as pd


def download_series(series_id: str) -> pd.Series:
    url = "https://fred.stlouisfed.org/graph/fredgraph.csv?" + urlencode({"id": series_id})
    try:
        response = subprocess.run(
            [
                "curl", "--location", "--fail", "--silent", "--show-error",
                "--connect-timeout", "10", "--max-time", "30",
                "--retry", "2", "--retry-delay", "1", "--url", url,
            ],
            check=True, capture_output=True, text=True, encoding="utf-8", timeout=100,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("FRED download requires curl installed and available on PATH") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"FRED download timed out for {series_id} after 100 seconds") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            f"FRED download failed for {series_id} (curl exit {exc.returncode}): "
            f"{(exc.stderr or '').strip()}"
        ) from exc
    df = pd.read_csv(StringIO(response.stdout))
    date_col = "observation_date" if "observation_date" in df.columns else "DATE"
    if date_col not in df or series_id not in df:
        raise RuntimeError(f"Unexpected FRED schema for {series_id}: {list(df)}")
    dates = pd.to_datetime(df[date_col], errors="raise")
    if dates.isna().any():
        raise RuntimeError(f"Missing FRED observation dates for {series_id}")
    values = pd.to_numeric(df[series_id].replace(".", float("nan")), errors="raise")
    series = pd.Series(values.to_numpy(), index=dates, name=series_id).dropna()
    series.index = series.index.normalize()
    series = series[~series.index.duplicated(keep="last")].sort_index()
    if len(series) < 260:
        raise RuntimeError(f"Insufficient FRED history for {series_id}")
    return series
