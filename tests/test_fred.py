import subprocess
from unittest.mock import Mock

import numpy as np
import pandas as pd
import pytest

from macro.data_sources.fred import download_series


def fred_csv(date_column="observation_date"):
    dates = pd.bdate_range("2024-01-01", periods=262)
    frame = pd.DataFrame({date_column: dates, "DGS2": ["4.25"] * len(dates)})
    frame.loc[0, "DGS2"] = "."
    frame = pd.concat([frame.iloc[::-1], frame.iloc[[1]].assign(DGS2="4.50")])
    return frame.to_csv(index=False)


@pytest.mark.parametrize("date_column", ["observation_date", "DATE"])
def test_curl_download_and_csv_normalization(monkeypatch, date_column):
    execute = Mock(return_value=subprocess.CompletedProcess(
        ["curl"], 0, stdout=fred_csv(date_column), stderr="",
    ))
    monkeypatch.setattr("macro.data_sources.fred.subprocess.run", execute)
    result = download_series("DGS2")
    assert len(result) == 261
    assert result.index.is_monotonic_increasing
    assert not result.index.duplicated().any()
    assert result.iloc[0] == 4.50
    assert result.name == "DGS2"
    assert np.isfinite(result).all()
    args, kwargs = execute.call_args
    command = args[0]
    assert command[0] == "curl"
    assert command[-1] == "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS2"
    for flag in ["--fail", "--location", "--retry", "--max-time", "--connect-timeout"]:
        assert flag in command
    assert kwargs["check"] is True
    assert kwargs["timeout"] == 100
    assert not kwargs.get("shell", False)


@pytest.mark.parametrize("error, message", [
    (FileNotFoundError(), "requires curl"),
    (subprocess.CalledProcessError(22, ["curl"], stderr="HTTP 503"), "curl exit 22.*HTTP 503"),
    (subprocess.TimeoutExpired(["curl"], 100), "timed out"),
])
def test_download_failures_are_explicit(monkeypatch, error, message):
    monkeypatch.setattr("macro.data_sources.fred.subprocess.run", Mock(side_effect=error))
    with pytest.raises(RuntimeError, match=message):
        download_series("DGS2")


@pytest.mark.parametrize("csv, message", [
    ("wrong,DGS2\n2024-01-01,4.0\n", "Unexpected FRED schema"),
    ("observation_date,DGS2\n2024-01-01,4.0\n", "Insufficient FRED history"),
    ("observation_date,DGS2\n,4.0\n", "Missing FRED observation dates"),
])
def test_invalid_responses_are_rejected(monkeypatch, csv, message):
    monkeypatch.setattr("macro.data_sources.fred.subprocess.run", Mock(
        return_value=subprocess.CompletedProcess(["curl"], 0, stdout=csv, stderr=""),
    ))
    with pytest.raises(RuntimeError, match=message):
        download_series("DGS2")


@pytest.mark.parametrize("csv", [
    "observation_date,DGS2\nnot-a-date,4.0\n",
    "observation_date,DGS2\n2024-01-01,not-a-number\n",
])
def test_malformed_values_are_not_silently_discarded(monkeypatch, csv):
    monkeypatch.setattr("macro.data_sources.fred.subprocess.run", Mock(
        return_value=subprocess.CompletedProcess(["curl"], 0, stdout=csv, stderr=""),
    ))
    with pytest.raises(ValueError):
        download_series("DGS2")
