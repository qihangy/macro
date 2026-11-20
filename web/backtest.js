(function (root) {
  'use strict';
  const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
  function rebalance(cash, shares, price, weight, cost) {
    const position = shares * price, nav = cash + position;
    // Solve for a target weight of post-cost NAV, including drift in existing holdings.
    const delta = weight * nav - position;
    const trade = delta / (1 + Math.sign(delta) * weight * cost);
    const fee = Math.abs(trade) * cost;
    return {cash: cash - trade - fee, shares: shares + trade / price, fee};
  }
  function correlation(pairs) {
    if (pairs.length < 2) return null;
    const mx = mean(pairs.map(p => p[0])), my = mean(pairs.map(p => p[1]));
    let xx = 0, yy = 0, xy = 0;
    for (const [x, y] of pairs) {
      xx += (x - mx) ** 2; yy += (y - my) ** 2; xy += (x - mx) * (y - my);
    }
    return xx > 0 && yy > 0 ? Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))) : null;
  }
  function statistics(equity, returns, spyReturns) {
    const avg = mean(returns);
    const variance = returns.length > 1
      ? returns.reduce((sum, r) => sum + (r - avg) ** 2, 0) / (returns.length - 1) : 0;
    let peak = equity[0], maxDrawdown = 0;
    const drawdowns = equity.map(value => {
      peak = Math.max(peak, value);
      const dd = value / peak - 1;
      maxDrawdown = Math.min(maxDrawdown, dd);
      return dd;
    });
    const pairs = returns.flatMap((r, i) => spyReturns[i] === null ? [] : [[r, spyReturns[i]]]);
    return {
      totalReturn: equity[equity.length - 1] / equity[0] - 1,
      cagr: (equity[equity.length - 1] / equity[0]) ** (252 / returns.length) - 1,
      sharpe: variance > 1e-24 ? avg / Math.sqrt(variance) * Math.sqrt(252) : null,
      maxDrawdown, drawdowns, spxCorrelation: correlation(pairs), correlationObservations: pairs.length,
    };
  }
  function run(payload, options) {
    const {start, end, capital, costBps} = options;
    if (!Number.isFinite(capital) || capital <= 0) throw Error('Starting capital must be greater than zero.');
    if (!Number.isFinite(costBps) || costBps < 0 || costBps > 10000) throw Error('Costs must be between 0 and 10,000 bps.');
    if (!start || !end || start > end) throw Error('Choose a valid start and end date.');
    if (payload?.schema_version !== 1 || !Array.isArray(payload.history) ||
        !Number.isFinite(payload.max_weight) || payload.max_weight < 0 || payload.max_weight > 1) {
      throw Error('Invalid backtest dataset. Rebuild the dashboard.');
    }
    const all = payload.history;
    for (let i = 0; i < all.length; i++) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(all[i].date) || (i > 0 && all[i].date <= all[i - 1].date) ||
          !Number.isFinite(all[i].price) || all[i].price <= 0) throw Error('Invalid daily price history.');
    }
    const first = all.findIndex(row => row.date >= start);
    let last = all.length - 1;
    while (last >= 0 && all[last].date > end) last--;
    if (first < 1 || last <= first) throw Error('Choose at least two trading closes after the first available signal.');
    const rows = all.slice(first, last + 1), cost = costBps / 10000;
    let cash = capital, shares = 0, benchmarkCash = capital, benchmarkShares = 0, fees = 0, benchmarkFees = 0;
    const equity = [capital], benchmark = [capital], returns = [], benchmarkReturns = [], spyReturns = [];
    for (let i = 0; i < rows.length - 1; i++) {
      const current = rows[i], next = rows[i + 1], signal = all[first + i - 1].target_weight;
      if (!Number.isFinite(signal) || signal < 0 || signal > payload.max_weight + 1e-12) {
        throw Error(`Missing or invalid prior-close signal for ${current.date}. Select a different range.`);
      }
      const allocation = rebalance(cash, shares, current.price, signal, cost);
      cash = allocation.cash; shares = allocation.shares; fees += allocation.fee;
      const baseline = rebalance(benchmarkCash, benchmarkShares, current.price, 0.15, cost);
      benchmarkCash = baseline.cash; benchmarkShares = baseline.shares; benchmarkFees += baseline.fee;
      const value = cash + shares * next.price;
      const benchmarkValue = benchmarkCash + benchmarkShares * next.price;
      if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(benchmarkValue) || benchmarkValue <= 0) {
        throw Error('Simulation produced an invalid portfolio value.');
      }
      returns.push(value / equity[equity.length - 1] - 1);
      benchmarkReturns.push(benchmarkValue / benchmark[benchmark.length - 1] - 1);
      spyReturns.push(Number.isFinite(current.spy_price) && current.spy_price > 0 &&
        Number.isFinite(next.spy_price) && next.spy_price > 0 ? next.spy_price / current.spy_price - 1 : null);
      equity.push(value); benchmark.push(benchmarkValue);
    }
    return {
      dates: rows.map(r => r.date), equity, benchmark, fees, benchmarkFees,
      strategy: statistics(equity, returns, spyReturns),
      benchmarkStats: statistics(benchmark, benchmarkReturns, spyReturns),
    };
  }
  root.MacroBacktest = {run};
  if (typeof module !== 'undefined' && module.exports) module.exports = {run};
})(globalThis);
