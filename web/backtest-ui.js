(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const number = (value, digits = 2) => value === null || !Number.isFinite(value)
    ? 'N/A' : value.toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  const percent = value => value === null || !Number.isFinite(value) ? 'N/A' : `${number(100 * value)}%`;
  let payload = null;
  function chart(id, dates, strategy, benchmark, isDrawdown) {
    const W = 820, H = 270, left = 75, right = 18, top = 15, bottom = 35;
    const values = [...strategy, ...benchmark];
    const min = Math.min(...values), max = Math.max(...values), span = Math.max(max - min, 0.0001);
    const x = i => left + i * (W - left - right) / (dates.length - 1);
    const y = value => top + (max - value) * (H - top - bottom) / span;
    const path = series => series.map((value, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(value).toFixed(2)}`).join(' ');
    const ticks = Array.from({length: 5}, (_, i) => {
      const value = min + i * span / 4, yy = y(value);
      return `<line x1="${left}" x2="${W - right}" y1="${yy}" y2="${yy}" stroke="#283644"/>
        <text x="${left - 8}" y="${yy + 4}" fill="#8b9aa8" text-anchor="end" font-size="11">${isDrawdown ? percent(value) : number(value, 0)}</text>`;
    }).join('');
    const labels = [0, Math.floor((dates.length - 1) / 2), dates.length - 1].map(i =>
      `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" fill="#8b9aa8" font-size="11">${dates[i]}</text>`).join('');
    $(id).innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${isDrawdown ? 'Drawdown' : 'Equity in USD'}: strategy in gold, GLD benchmark in green">
      ${ticks}${labels}<path d="${path(benchmark)}" fill="none" stroke="#7bd8bb" stroke-width="2"/>
      <path d="${path(strategy)}" fill="none" stroke="#d7ad63" stroke-width="2"/></svg>`;
  }
  function render(result) {
    chart('bt-equity', result.dates, result.equity, result.benchmark, false);
    chart('bt-drawdown', result.dates, result.strategy.drawdowns, result.benchmarkStats.drawdowns, true);
    const a = result.strategy, b = result.benchmarkStats;
    const metrics = [
      ['Final equity (USD)', number(result.equity.at(-1)), number(result.benchmark.at(-1))],
      ['Total return', percent(a.totalReturn), percent(b.totalReturn)],
      ['CAGR', percent(a.cagr), percent(b.cagr)],
      ['Sharpe ratio (RF = 0)', number(a.sharpe), number(b.sharpe)],
      ['Maximum drawdown', percent(a.maxDrawdown), percent(b.maxDrawdown)],
      ['SPX correlation (SPY proxy)', number(a.spxCorrelation), number(b.spxCorrelation)],
      ['Matched SPY return observations', number(a.correlationObservations, 0), number(b.correlationObservations, 0)],
      ['Transaction costs (USD)', number(result.fees), number(result.benchmarkFees)],
    ];
    $('bt-metrics').innerHTML = metrics.map(([label, strategy, benchmark]) =>
      `<tr><th scope="row">${label}</th><td>${strategy}</td><td>${benchmark}</td></tr>`).join('');
    $('bt-results').classList.remove('hidden');
    $('bt-status').textContent = `Completed: ${result.dates[0]} to ${result.dates.at(-1)} (${result.dates.length - 1} daily returns).`;
  }
  function showError(error) {
    $('bt-error').textContent = `Backtest unavailable: ${error.message}`;
    $('bt-error').classList.remove('hidden');
    $('bt-results').classList.add('hidden');
  }
  $('backtest-form').addEventListener('submit', event => {
    event.preventDefault();
    $('bt-error').classList.add('hidden');
    try {
      render(MacroBacktest.run(payload, {
        start: $('bt-start').value, end: $('bt-end').value,
        capital: $('bt-capital').valueAsNumber, costBps: $('bt-cost').valueAsNumber,
      }));
    } catch (error) {
      $('bt-status').textContent = 'Run failed. Check the message below.';
      showError(error);
    }
  });
  $('backtest-form').addEventListener('input', () => {
    $('bt-results').classList.add('hidden');
    $('bt-error').classList.add('hidden');
    if (payload) $('bt-status').textContent = 'Settings changed. Click Run backtest to recalculate.';
  });
  async function load() {
    try {
      const response = await fetch('./data/backtest.json', {cache: 'no-store'});
      if (!response.ok) throw Error(`HTTP ${response.status} loading historical data. Run the daily pipeline.`);
      const data = await response.json();
      if (data.schema_version !== 1 || !Array.isArray(data.history) || data.history.length < 3) {
        throw Error('Invalid or insufficient historical inputs. Run the daily pipeline.');
      }
      payload = data;
      const min = data.history[1].date, max = data.history.at(-1).date;
      for (const id of ['bt-start', 'bt-end']) { $(id).min = min; $(id).max = max; }
      $('bt-start').value = min; $('bt-end').value = max;
      $('bt-run').disabled = false;
      $('bt-status').textContent = `Available: ${min} to ${max}. Click Run backtest.`;
    } catch (error) {
      $('bt-status').textContent = 'Historical data could not be loaded.';
      showError(error);
    }
  }
  load();
})();
