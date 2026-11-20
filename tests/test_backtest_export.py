import json

import pandas as pd
import pytest

from macro.publishing.backtest_export import write_backtest_payload


def test_full_history_and_exact_date_alignment(tmp_path):
    dates = pd.bdate_range("2020-01-01", periods=900)
    prices = pd.Series(100.0, index=dates)
    # Keep a missing signal as null, not an omitted trading day or forward-filled weight.
    frame = pd.DataFrame({"target_weight": 0.15}, index=dates[252:].delete(10))
    spy = pd.Series([300.0, 301.0], index=dates[[252, 254]])
    path = tmp_path / "data/backtest.json"
    payload = write_backtest_payload(path, prices, frame, spy, 0.15)
    rows = json.loads(path.read_text())["history"]
    assert len(rows) == 648  # Full history, not the dashboard's 600-point chart window.
    assert rows[0] == {"date": "2020-12-18", "price": 100.0, "target_weight": 0.15, "spy_price": 300.0}
    assert rows[1]["spy_price"] is None
    assert rows[2]["spy_price"] == 301.0
    assert rows[10]["target_weight"] is None
    assert payload["correlation_proxy"] == "SPY"


def test_missing_spy_still_allows_backtest(tmp_path):
    dates = pd.bdate_range("2020-01-01", periods=4)
    payload = write_backtest_payload(
        tmp_path / "backtest.json", pd.Series(100.0, index=dates),
        pd.DataFrame({"target_weight": 0.0}, index=dates), None, 0.15,
    )
    assert all(row["spy_price"] is None for row in payload["history"])


@pytest.mark.parametrize("price,weight", [(0, 0.1), (float("inf"), 0.1), (100, -0.1), (100, 0.2)])
def test_invalid_inputs_fail_explicitly(tmp_path, price, weight):
    dates = pd.bdate_range("2020-01-01", periods=4)
    with pytest.raises(ValueError):
        write_backtest_payload(
            tmp_path / "backtest.json", pd.Series(price, index=dates),
            pd.DataFrame({"target_weight": weight}, index=dates), None, 0.15,
        )
