const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {run} = require('../web/backtest.js');

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function data(prices, weights = prices.map(() => 0.15), spy = prices) {
  return {schema_version: 1, max_weight: 0.15, history: prices.map((price, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    price, target_weight: weights[i], spy_price: spy[i],
  }))};
}
const options = {start: '2024-01-02', end: '2024-01-06', capital: 1000, costBps: 0};

test('prior-close signal executes at next close, not on the signal day', () => {
  const result = run(data([100, 200, 400, 200], [0, 0.15, 0, 0]), options);
  assert.deepEqual(result.equity, [1000, 1000, 925]);
  near(result.benchmark[1], 1150);
  near(result.benchmark[2], 1063.75);
  near(result.strategy.maxDrawdown, -0.075);
});
test('benchmark rebalances to 15% GLD; cash strategy earns zero', () => {
  const result = run(data([100, 100, 110, 99], [0, 0, 0, 0]), options);
  assert.deepEqual(result.equity, [1000, 1000, 1000]);
  near(result.benchmark[1], 1015);
  near(result.benchmark[2], 999.775);
  assert.equal(result.strategy.sharpe, null);
  assert.equal(result.strategy.spxCorrelation, null);
  near(result.benchmarkStats.maxDrawdown, -0.015);
  near(result.benchmarkStats.spxCorrelation, 1);
});
test('costs charge actual traded dollars including entry and drift rebalancing', () => {
  const result = run(data([100, 100, 110, 99]), {...options, costBps: 100});
  const initialBuy = 150 / 1.0015;
  const nav = 1000 - initialBuy * 0.01 + initialBuy * 0.1;
  const sell = (0.15 * nav - initialBuy * 1.1) / (1 - 0.15 * 0.01);
  near(result.fees, (initialBuy - sell) * 0.01);
  near(result.equity[1], nav);
  near(result.equity[2], (nav - Math.abs(sell) * 0.01) * (1 - 0.15 * 0.1));
  near(result.benchmarkFees, result.fees);
  near(result.benchmark.at(-1), result.equity.at(-1));
});
test('date selection starts in cash with the immediately prior signal and no future dependence', () => {
  const payload = data([10, 100, 110, 121, 10000]);
  const result = run(payload, {...options, end: '2024-01-04'});
  near(result.equity.at(-1), 1000 * 1.015 ** 2);
  payload.history[4].price = 0.01;
  payload.history[3].target_weight = 0;
  assert.deepEqual(run(payload, {...options, end: '2024-01-04'}), result);
  const sub = run(payload, {...options, start: '2024-01-03', end: '2024-01-04'});
  near(sub.equity.at(-1), 1015);
});
test('Sharpe uses sample deviation and CAGR uses holding intervals', () => {
  const result = run(data([100, 100, 110, 104.5]), options);
  const r1 = 0.015, r2 = -0.0075, avg = (r1 + r2) / 2;
  near(result.strategy.sharpe, avg / Math.sqrt((r1 - avg) ** 2 + (r2 - avg) ** 2) * Math.sqrt(252));
  near(result.strategy.cagr, (1.015 * 0.9925) ** 126 - 1);
});
test('exiting to cash pays costs and constant prices do not generate benchmark churn', () => {
  const result = run(data([100, 100, 100, 100], [0.15, 0, 0, 0]), {...options, costBps: 100});
  const buy = 150 / 1.0015;
  near(result.equity.at(-1), 1000 - 2 * buy * 0.01);
  near(result.fees, 2 * buy * 0.01);
  near(result.benchmarkFees, buy * 0.01);
  near(result.strategy.maxDrawdown, -2 * buy * 0.01 / 1000);
});
test('missing SPY intervals are excluded, never forward-filled', () => {
  const result = run(data([100, 100, 110, 99, 120], undefined, [100, 100, null, 120, 110]), options);
  assert.equal(result.strategy.correlationObservations, 1);
  assert.equal(result.strategy.spxCorrelation, null);
  assert.equal(run(data([100, 100, 110], undefined, [null, null, null]), options).strategy.correlationObservations, 0);
});
test('missing signal is rejected instead of skipping a daily return', () => {
  assert.throws(() => run(data([100, 100, 110], [null, 0, 0]), options), /prior-close signal/);
});
test('invalid inputs and insufficient ranges fail explicitly', () => {
  for (const capital of [0, -1, NaN, Infinity]) assert.throws(() => run(data([100, 100, 110]), {...options, capital}));
  for (const costBps of [-1, NaN, 10001]) assert.throws(() => run(data([100, 100, 110]), {...options, costBps}));
  assert.throws(() => run(data([100, 100, 110]), {...options, start: '2024-01-01'}));
  assert.throws(() => run(data([100, 100, 110]), {...options, start: '2024-01-03'}));
  assert.throws(() => run(data([100, 100, 110], [-0.1, 0, 0]), options));
  assert.throws(() => run(data([100, 100, 110], [0.2, 0, 0]), options));
});

async function loadUI(payload, status = 200) {
  const html = fs.readFileSync(path.join(__dirname, '../web/index.html'), 'utf8');
  const elements = new Map([...html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)].map(([tag, id]) => {
    const classes = new Set((tag.match(/class="([^"]*)"/)?.[1] || '').split(' '));
    const value = tag.match(/value="([^"]*)"/)?.[1] || '';
    return [id, {
      value, valueAsNumber: Number(value), disabled: tag.includes(' disabled'),
      textContent: '', innerHTML: '', listeners: {},
      classList: {add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name)},
      addEventListener(name, callback) { this.listeners[name] = callback; },
    }];
  }));
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/backtest-ui.js'), 'utf8'), {
    document: {getElementById(id) {
      assert(elements.has(id), `Missing HTML element ${id}`);
      return elements.get(id);
    }},
    MacroBacktest: {run},
    fetch: async url => {
      assert.equal(url, './data/backtest.json');
      return {ok: status === 200, status, json: async () => payload};
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  return id => elements.get(id);
}

test('Run button renders both charts and all metrics using the real calculation result', async () => {
  const ui = await loadUI(data([100, 100, 110, 99]));
  assert.equal(ui('bt-run').disabled, false);
  assert.equal(ui('bt-cost').valueAsNumber, 0);
  ui('backtest-form').listeners.submit({preventDefault() {}});
  assert.equal(ui('bt-error').classList.contains('hidden'), true, ui('bt-error').textContent);
  assert.equal(ui('bt-results').classList.contains('hidden'), false);
  assert.match(ui('bt-status').textContent, /Completed: 2024-01-02 to 2024-01-04/);
  assert.match(ui('bt-equity').innerHTML, /<svg/);
  assert.match(ui('bt-drawdown').innerHTML, /<svg/);
  for (const label of ['Sharpe ratio', 'Maximum drawdown', 'SPX correlation', 'Total return']) {
    assert.ok(ui('bt-metrics').innerHTML.includes(label), label);
  }
  ui('backtest-form').listeners.input();
  assert.equal(ui('bt-results').classList.contains('hidden'), true);
  assert.match(ui('bt-status').textContent, /Click Run backtest/);
  ui('bt-cost').valueAsNumber = 5;
  ui('backtest-form').listeners.submit({preventDefault() {}});
  assert.equal(ui('bt-results').classList.contains('hidden'), false);
});

test('UI reports simulation errors instead of showing old results', async () => {
  const ui = await loadUI(data([100, 100, 110, 99]));
  ui('bt-capital').valueAsNumber = -1;
  ui('backtest-form').listeners.submit({preventDefault() {}});
  assert.equal(ui('bt-results').classList.contains('hidden'), true);
  assert.equal(ui('bt-error').classList.contains('hidden'), false);
  assert.match(ui('bt-error').textContent, /capital must be greater than zero/);
});

test('UI keeps Run disabled and reports a historical-data download error', async () => {
  const ui = await loadUI(null, 404);
  assert.equal(ui('bt-run').disabled, true);
  assert.equal(ui('bt-error').classList.contains('hidden'), false);
  assert.match(ui('bt-error').textContent, /HTTP 404/);
});
