"""Nominal yield hurdle: 12m ETF return > latest available US 2Y nominal yield."""
from __future__ import annotations
import pandas as pd
from macro.indicators.returns import trailing_return


def nominal_yield_hurdle(price: pd.Series, yield_pct: pd.Series, window=252, max_staleness_days=7):
    ret = trailing_return(price, window)
    # no forward information: use observations on or before ETF date; cap stale FRED points
    aligned = yield_pct.reindex(price.index, method="ffill", tolerance=pd.Timedelta(days=max_staleness_days)) / 100
    passed = (ret > aligned).astype(float).where(ret.notna() & aligned.notna())
    return passed, ret, aligned
