import numpy as np
import pandas as pd
from macro.signals.momentum import momentum
from macro.signals.rate_filter import nominal_yield_hurdle
from macro.signals.volatility import vol_multiplier
from macro.portfolio.sizing import sizing
from macro.strategies.gold import calculate


def test_momentum_positive_and_negative():
    idx = pd.bdate_range("2024-01-01", periods=400)
    up = pd.Series(np.arange(400) + 100.0, index=idx)
    down = pd.Series(500.0 - np.arange(400), index=idx)
    assert momentum(up)[0].iloc[-1] == 1
    assert momentum(down)[0].iloc[-1] == -1


def test_rate_filter_and_position_size():
    idx = pd.bdate_range("2024-01-01", periods=400)
    p = pd.Series(np.linspace(100, 200, 400), index=idx)
    rates = pd.Series(4.0, index=idx)
    filt, _, _ = nominal_yield_hurdle(p, rates)
    assert filt.iloc[-1] == 1
    s = sizing(200, 0.15, 20000, 4)
    assert (s["target_shares"], s["trade_shares"], s["action"]) == (15, 11, "BUY")


def test_composite_weight_is_bounded():
    idx = pd.bdate_range("2024-01-01", periods=500)
    p = pd.Series(100 * np.exp(np.linspace(0, .7, 500)), index=idx)
    r = pd.Series(4.0, index=idx)
    cfg = {"signals": {"momentum": {"windows": [126, 252], "weights": [0.5, 0.5]},
                       "rate_filter": {"return_window": 252},
                       "volatility": {"window": 63, "target_vol": .15}},
           "sizing": {"max_weight": .15}}
    frame = calculate(p, r, cfg)
    assert not frame.empty
    assert (frame.target_weight >= 0).all() and (frame.target_weight <= .15).all()
