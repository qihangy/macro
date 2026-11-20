from __future__ import annotations
import math

def sizing(price, weight, nav=20000.0, existing_shares=0):
    if price <= 0 or not math.isfinite(price) or nav < 0:
        raise ValueError("Invalid price or NAV")
    if not 0 <= weight <= 1:
        raise ValueError("Weight must be between 0 and 1")
    target_usd = nav * weight
    target_shares = math.floor(target_usd / price + 1e-10)
    shares_delta = target_shares - int(existing_shares)
    return dict(target_usd=round(target_usd, 2), target_shares=target_shares,
                trade_shares=shares_delta, trade_usd=round(shares_delta * price, 2),
                current_usd=round(int(existing_shares) * price, 2),
                action="BUY" if shares_delta > 0 else "SELL" if shares_delta < 0 else "HOLD")
