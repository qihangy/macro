from __future__ import annotations
import pandas as pd
from macro.signals.momentum import momentum
from macro.signals.rate_filter import nominal_yield_hurdle
from macro.signals.volatility import vol_multiplier


def calculate(prices: pd.Series, dgs2: pd.Series, config: dict) -> pd.DataFrame:
    signals = config["signals"]
    m_cfg = signals["momentum"]
    momentum_score, comps = momentum(prices, m_cfg["windows"], m_cfg["weights"])
    rate_flag, return_12m, aligned_rate = nominal_yield_hurdle(
        prices, dgs2, window=signals["rate_filter"]["return_window"])
    vol_cfg = signals["volatility"]
    vol_factor, realized = vol_multiplier(prices, vol_cfg["window"], vol_cfg["target_vol"])
    max_weight = config["sizing"]["max_weight"]
    # Long-only: negative trend means no allocation, never a short position.
    weight = max_weight * momentum_score.clip(lower=0) * rate_flag * vol_factor
    out = pd.DataFrame(dict(price=prices, momentum=momentum_score, rate_filter=rate_flag,
                            realized_vol=realized, vol_multiplier=vol_factor,
                            return_12m=return_12m, treasury_yield=aligned_rate,
                            target_weight=weight), index=prices.index)
    for key, value in comps.items():
        out[key] = value
    return out.dropna(subset=["momentum", "rate_filter", "realized_vol", "target_weight"])
