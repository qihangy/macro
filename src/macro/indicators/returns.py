from __future__ import annotations
import numpy as np
import pandas as pd


def trailing_return(price: pd.Series, window: int) -> pd.Series:
    return price / price.shift(window) - 1.0


def realized_vol(price: pd.Series, window: int = 63) -> pd.Series:
    return np.log(price).diff().rolling(window, min_periods=window).std(ddof=1) * np.sqrt(252)
