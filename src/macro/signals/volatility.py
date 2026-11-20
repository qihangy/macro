from __future__ import annotations
import numpy as np
from macro.indicators.returns import realized_vol


def vol_multiplier(price, window=63, target_vol=0.15):
    sigma = realized_vol(price, window)
    factor = (target_vol / sigma.replace(0, np.nan)).clip(upper=1.0)
    factor = factor.where(sigma > 0)
    return factor, sigma
