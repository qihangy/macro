from __future__ import annotations
import numpy as np
import pandas as pd
from macro.indicators.returns import trailing_return


def momentum(price: pd.Series, windows=(126, 252), weights=(0.5, 0.5)):
    if len(windows) != len(weights) or abs(sum(weights) - 1) > 1e-8:
        raise ValueError("Momentum windows and weights mismatch")
    components = {}
    score = pd.Series(0.0, index=price.index)
    valid = pd.Series(True, index=price.index)
    for n, w in zip(windows, weights):
        r = trailing_return(price, n)
        valid &= r.notna()
        direction = pd.Series(np.where(r > 0, 1.0, np.where(r < 0, -1.0, 0.0)), index=price.index)
        score += direction * w
        components[f"return_{n}d"] = r
        components[f"direction_{n}d"] = direction.where(r.notna())
    return score.where(valid), components
