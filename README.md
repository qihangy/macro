# macro — Multi-Asset Systematic Strategy Dashboard

A **ready-to-deploy static dashboard** driven by a daily **Python batch pipeline**. Four top-level asset classes (Equity, Rates, Commodity, FX). Gold Allocation is the first implemented strategy; other asset-class pages display daily ETF market history but **do not claim to have completed signals**.

## Architecture

```
market data (Yahoo / FRED) → raw Parquet → indicators → signals
    → strategy → position sizing → JSON → static website → GitHub Pages
```

- `config/` — assets, strategy registration, and position parameters.
- `src/macro/data_sources/` — download adapters; `yahoo.py` + `fred.py`.
- `src/macro/indicators/` — standardized returns and realized volatility.
- `src/macro/signals/` — reusable momentum, nominal-yield filter and vol scaling.
- `src/macro/strategies/` — combines signals; currently `gold.py`.
- `src/macro/portfolio/` — round-to-integer target positions and proposed trade sizing.
- `src/macro/publishing/` — transforms research outputs to JSON.
- `data_engineering/daily_update.py` — single local/production pipeline entrypoint.
- `web/` — framework-free static HTML, CSS, JS; no JS dependencies.
- `site/` — build output that GitHub Pages deploys.
- `data/raw/`, `data/processed/` — local Parquet, intentionally ignored by Git.
- `tests/` — simple unit tests.
- `.github/workflows/deploy.yml` — GitHub Pages build/deploy on pushes to `main`, manual runs, and weekdays at 09:00 America/New_York.

## Step 1 — run locally (macOS/Linux)

```bash
cd macro
python3.13 -m venv .venv
source .venv/bin/activate
pip install -e '.[test]'
python data_engineering/daily_update.py
python -m http.server 8000 --directory site
```

Open <http://localhost:8000>. For Windows activate with `.venv\\Scripts\\activate` (PowerShell) and run the same Python commands. **Opening `site/index.html` directly via `file://` does not let JavaScript fetch local JSON.**

Use Python 3.13 for the current pandas dependency set; the local Python 3.15
environment crashed in pandas datetime parsing. On this machine the working
environment is `.venv-py313`:

```bash
.venv-py313/bin/python data_engineering/daily_update.py
```

Yahoo retrieval still uses `yfinance`. FRED retrieval uses the system `curl`
command against the official public CSV endpoint because Python HTTP requests
timed out locally. No FRED API key is required. Install `curl` if it is not on
`PATH` (it is included on macOS and the usual GitHub Ubuntu runners).
Downloads follow redirects, fail on HTTP errors, use a 10-second connection
timeout and 30-second per-attempt limit, and retry transient failures twice
with a one-second delay (100-second total subprocess limit). CSV schema,
dates, numeric values and minimum history are validated before saving Parquet;
FRED's `.` missing observations are omitted, not filled.
Errors are reported explicitly; existing required-series cache/freshness checks
and `--offline` behavior are unchanged. Update any external scheduled commands
to use `data_engineering/daily_update.py` instead of the former script path.

The project ships WITHOUT fake market quotes. The first successful pipeline downloads actual Yahoo GLD/SPY/IEF/UUP ETF prices and FRED DGS2, caches Parquet locally, generates the JSON, and publishes the site. Internet/network access is necessary for the first download. If the first run fails, the UI remains in an explicit **SETUP REQUIRED** state, not an invented 'live' signal.

### Recalculate using cached local data

```bash
python data_engineering/daily_update.py --offline
```

The raw Parquet files need to exist under `data/raw/`; offline mode is still subject to freshness checks. Update data on a networked machine if the cache is old.

### Run tests

```bash
pytest -q
```

## Step 2 — create the GitHub Pages site

1. Go to https://github.com/new and create a **public** repository named **macro**. Use an empty repo (no starter README). GitHub's Free plan generally requires public repos for Pages.
2. With terminal in this extracted folder:

   ```bash
   git init
   git add .
   git commit -m "Initialize multi-asset macro dashboard"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/macro.git
   git push -u origin main
   ```

   Substitute your actual GitHub username. GitHub authentication may use browser/credential manager or `gh auth login`.
3. On the GitHub repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Go to **Actions → Update and deploy dashboard → Run workflow**. Confirm the `build` job (**Run tests**, **Download data, calculate signals, build site**) and the `deploy` job succeed. If `deploy` fails with `Get Pages site failed ... Not Found`, Pages is not enabled yet: re-do step 3 and make sure the choice is saved. Pushes to `main` also trigger deployment. The workflow uses Python 3.13 and publishes only `site/`; local environments, downloaded data, generated site files, and `.env` files are excluded from Git by `.gitignore`.
5. Share `https://YOUR_USERNAME.github.io/macro/` after successful deployment. This URL is a template, not a pre-existing page.

### How updates work

The workflow runs on **pushes to `main`, manual dispatch, and a schedule of 09:00 `America/New_York` Monday–Friday** (the cron entry uses GitHub's `timezone` key, so DST is handled automatically; GitHub may start scheduled runs a few minutes late). Scheduled runs only fire from the default branch. On each successful run, the workflow downloads market data, computes signals, regenerates JSON, and publishes the `site/` directory as a GitHub Pages artifact. **No local computer needs to stay on.** The workflow does not upload raw Parquet to Git; GitHub runner storage is temporary, so the cloud job redownloads history on each run. The local files remain on your computer only. Consider private object storage (e.g., S3) if data volume grows.

**Important:** At 9 a.m. the US market is not yet closed. Signals are computed using the last *completed* US trading day; current-day incomplete Yahoo candle is excluded. FRED values are forward-aligned only to dates after their observation (up to seven days). When GLD is older than 6 calendar days or DGS2 older than 10, the pipeline **fails rather than pretending data is current**. Publishing may also fail if public data providers throttle GitHub Actions. Failed jobs leave the previously deployed page available; its `data_asof_date` remains visible. The dashboard currently does not show a separate automatic browser stale-data warning after an old deployment. Monitor GitHub Actions failures.

## Gold strategy (fully specified)

- Instrument: **GLD adjusted close**, not spot XAU/USD. All returns below are GLD total-return proxies under auto-adjusted Yahoo prices.
- Momentum: sign of 126-trading-day GLD return × 0.5 plus sign of 252-day GLD return × 0.5. Outcomes: −1, −0.5, 0, +0.5, +1.
- Rate hurdle: `1{GLD trailing 252-session return > nominal US Treasury 2Y yield}`; DGS2 quoted in percentage points is converted into decimal. This is a rough nominal opportunity-cost filter, **not** Sharpe-vs-yield (which would be dimensionally invalid) and **not** a real-yield model.
- Annualized volatility: rolling 63-session std of daily log returns × sqrt(252).
- Vol multiplier: `min(1, 0.15 / realized_vol)`; missing or zero volatility is invalid, not an aggressive leverage signal.
- Long-only target weight: `0.15 × max(0, momentum_score) × rate_flag × vol_multiplier`; range `[0, 0.15]`.
- Target shares: `floor(NAV × target_weight / GLD_price)`; trade shares = target shares − existing shares. Example NAV = $20,000. Existing holdings entered in browser; no brokerage connection or trading.
- Transaction costs, holidays, signal lags from FRED revisions, benchmark comparisons, realized portfolio P&L, and slippage are not currently modeled. Prices and yields may have different publication lags.

## How to extend

1. Add an asset to `config/assets.yaml` and a downloader adapter if Yahoo/FRED cannot serve it.
2. Write an indicator in `src/macro/indicators/` (pure transformations of `pandas.Series`).
3. Write a reusable signal in `src/macro/signals/` (return a `pandas.Series` with date index and explicit missing-value policy).
4. Write a strategy in `src/macro/strategies/<asset_class>/` or a module next to `gold.py` that combines signals and outputs a standard date-indexed dataframe.
5. Register it in `config/strategies.yaml` and call it from `data_engineering/daily_update.py`.
6. Publish a new JSON file under `site/data/` and extend `web/app.js`'s strategy catalog. This version's catalog is partly static; **new strategies do not appear automatically without this UI integration**.

## Data, licensing, and privacy

- Yahoo Finance via `yfinance` is for **research/prototyping**. Before sharing a public website that redistributes historical price observations, review Yahoo's data terms and any relevant data-provider licenses; swap to an authorized public-display feed if needed. FRED series may have their own source attribution requirements.
- Never put tokens, brokerage credentials, personal holdings, or private portfolio data into `site/`, public GitHub commits or public JSON.
- Any portfolio NAV and holdings typed in the site stay in browser memory; there is no form submission.
- No ChatGPT account or chatbot is embedded. To add an AI explainer in a later phase, put API keys behind a server-side endpoint, **never** in GitHub Pages JavaScript. A simple static page cannot securely call private LLM APIs by itself.
