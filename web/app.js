(() => {
  'use strict';
  let gold = null, market = {}, tab = 'Overview';
  const $ = (id) => document.getElementById(id);
  const money = (x, decimals=2) => Number.isFinite(+x) ? (+x).toLocaleString('en-US', {style:'currency',currency:'USD',minimumFractionDigits:decimals,maximumFractionDigits:decimals}) : '—';
  const pct = (x,d=1) => Number.isFinite(+x) ? (100*(+x)).toFixed(d)+'%' : '—';
  const dec = (x,d=2) => Number.isFinite(+x) ? (+x).toFixed(d) : '—';
  const setText = (id, s) => { $(id).textContent = s; };
  function signalHtml(title, sub, value){return `<div class="signal"><div><b>${title}</b><small>${sub}</small></div><strong>${value}</strong></div>`;}
  const assets = [ ['Equity','SPY','Equity Trend','Market data only'],['Rates','IEF','Duration Timing','Market data only'],['Commodity','GLD','Gold Allocation','Strategy active'],['FX','UUP','FX Carry','Market data only'] ];
  function drawChart(rows, field) {
    const el = $('chart');
    if (!rows || rows.length<2){el.innerHTML='<div class="empty">No market data available for this asset class yet.</div>';return;}
    const arr=rows.filter(r => r[field]!=null && Number.isFinite(r[field]));
    if(arr.length<2){el.innerHTML='<div class="empty">Insufficient history.</div>';return;}
    const v=arr.map(r=>r[field]), max=Math.max(...v), min=Math.min(...v), span=Math.max(max-min, .0001);
    const W=820,H=290,l=55,r=16,t=18,b=33;
    const x=i=>l+i*(W-l-r)/(arr.length-1), y=k=>t+(max-k)*(H-t-b)/span;
    const line=arr.map((r,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(r[field]).toFixed(1)}`).join(' ');
    const area=line+` L${x(arr.length-1)},${H-b} L${l},${H-b} Z`;
    const ticks=Array.from({length:5},(_,i)=>{const val=min+(4-i)*span/4, yy=y(val);return `<line x1="${l}" y1="${yy}" x2="${W-r}" y2="${yy}" stroke="#283644" stroke-dasharray="3 5"/><text x="${l-9}" y="${yy+4}" fill="#80909e" text-anchor="end" font-size="11">${field==='price'?val.toFixed(0):(val*100).toFixed(0)+'%'}</text>`}).join('');
    const xdates=[0,Math.floor((arr.length-1)/2),arr.length-1].map(i=>`<text x="${x(i)}" y="${H-7}" text-anchor="middle" font-size="11" fill="#80909e">${arr[i].date.slice(0,7)}</text>`).join('');
    el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Historical daily close line chart" preserveAspectRatio="none"><defs><linearGradient id="fillG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d7ad63" stop-opacity=".19"/><stop offset="1" stop-color="#d7ad63" stop-opacity="0"/></linearGradient></defs>${ticks}<path d="${area}" fill="url(#fillG)"/><path d="${line}" fill="none" stroke="#d7ad63" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>${xdates}</svg>`;
    setText('chart-range',`${arr[0].date} – ${arr[arr.length-1].date}`);
  }
  function updateTrade(){
    if(!gold || gold.status!=='ok')return;
    const nav=+$('nav-input').value,held=+$('shares-input').value,p=+gold.price,w=+gold.signals.target_weight;
    if(!Number.isFinite(nav)||nav<0||!Number.isInteger(held)||!Number.isFinite(p)||p<=0){$('trade-output').innerHTML='<div>Enter a valid nonnegative NAV and an integer number of shares.</div>';return;}
    const target=Math.floor(nav*w/p+1e-10),delta=target-held,action=delta>0?'BUY':delta<0?'SELL':'HOLD';
    $('trade-output').innerHTML=`<div><span>Target allocation</span><b>${pct(w,2)}</b></div><div><span>Target market value</span><b>${money(nav*w)}</b></div><div><span>Target GLD shares</span><b>${target.toLocaleString()}</b></div><div class="trade-action"><span>Suggested change</span><strong>${action} ${Math.abs(delta).toLocaleString()} shares · ${money(Math.abs(delta)*p)}</strong></div>`;
  }
  function renderCatalog(){ $('catalog').innerHTML=assets.map(a=>`<div class="asset"><strong>${a[0]}</strong><span>${a[1]} · ${a[2]}</span><span class="${a[0]==='Commodity'&&gold?'ready':''}">${a[0]==='Commodity'&&gold?'● '+a[3]:'○ '+a[3]}</span></div>`).join(''); }
  function render(){
    document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    setText('breadcrumb',tab);
    setText('page-title',tab==='Overview'?'Multi-Asset Overview':tab==='Commodity'?'Commodity Strategies':tab==='Equity'?'Equity Strategies':tab==='Rates'?'Rates Strategies':'FX Strategies');
    setText('page-subtitle',tab==='Overview'?'Cross-asset market context and systematic signal allocations.':tab==='Commodity'?'Gold allocation signal and volatility-targeted sizing.':`Daily market data for ${tab}. Strategy engines can be added independently.`);
    const a=tab==='Overview'||tab==='Commodity'?assets[2]:assets.find(e=>e[0]===tab);
    const m=market[a[1]], isGold=(a[1]==='GLD'), hasGold=isGold&&gold;
    setText('chart-title',`${a[2]==='Gold Allocation'?'Gold ETF':a[0]+' ETF'} · ${a[1]}`);
    setText('chart-legend','Adjusted close');
    setText('chart-source','Source: Yahoo Finance · daily adjusted prices');
    drawChart(m?.history || (hasGold?gold.history:[]),'price');
    const price=hasGold?gold.price:m?.last_price;
    const cards=[['MARKET PRICE',money(price),`${a[1]} · ${m?.last_date||gold?.data_asof_date||'awaiting data'}`],
      ['MOMENTUM',hasGold?dec(gold.signals.momentum,2):'—',hasGold?'126D + 252D':'Not implemented'],
      ['TARGET WEIGHT',hasGold?pct(gold.signals.target_weight,2):'—',hasGold?'Maximum 15%':'Not implemented'],
      ['STRATEGY STATUS',hasGold?'Active':'Planned',hasGold?'Calculated on daily data':'Market data only']];
    $('metrics').innerHTML=cards.map(c=>`<div class="metric"><span>${c[0]}</span><strong>${c[1]}</strong><small>${c[2]}</small></div>`).join('');
    setText('signal-title',hasGold?'Gold allocation signals':`${tab==='Overview'?'Gold':'New'} strategy signals`);
    setText('strategy-state',hasGold?'CALCULATED':'NOT IMPLEMENTED');
    if(hasGold){const s=gold.signals,c=gold.momentum_components;
      $('signal-details').innerHTML=signalHtml('Momentum · 6M / 12M',`6M ${pct(c.return_6m)} · 12M ${pct(c.return_12m)}`,dec(s.momentum,2))+
      signalHtml('Nominal 2Y rate filter',`Trailing 12M ${pct(s.return_12m)} vs 2Y ${pct(s.treasury_yield)}`,dec(s.rate_filter,0))+
      signalHtml('Volatility multiplier',`63D realized ${pct(s.realized_vol)} · target 15%`,dec(s.vol_multiplier,2)+'×');
      setText('signal-note','Weight = 15% × max(0, momentum) × rate filter × min(1, 15% / realized vol). Momentum is ±0.5 per lookback. Non-positive signals produce zero long exposure.');
    }else{$('signal-details').innerHTML=signalHtml('Strategy module','Add a Python strategy and register its JSON output','—');setText('signal-note','Market prices are available where downloaded; models and trading signals for this class are not yet implemented.');}
    document.querySelector('.lower').style.display=hasGold?'grid':'none';
    renderCatalog(); if(hasGold)updateTrade();
  }
  async function getJson(url){const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error(`HTTP ${response.status} for ${url}`);return response.json();}
  async function init(){
    document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;render();}));
    ['nav-input','shares-input'].forEach(id=>$(id).addEventListener('input',updateTrade));
    try{
      const [g,m]=await Promise.all([getJson('./data/gold_allocation.json'),getJson('./data/market.json')]);
      if(g.status!=='ok')throw Error('Strategy output not valid');gold=g;market=m;
      setText('asof',`Data as of ${g.data_asof_date}`);setText('status-badge','DATA LOADED');$('status-badge').classList.add('ok');
      setText('pipeline-label','Data loaded');$('pipeline-dot').classList.add('ok');
      $('nav-input').value=g.default_portfolio_nav||20000;
    }catch(err){
      setText('asof','No published market data');setText('status-badge','SETUP REQUIRED');setText('pipeline-label','Awaiting first update');
      $('error-banner').classList.remove('hidden');$('error-banner').textContent='No real market data has been published yet. Run: python data_engineering/daily_update.py. Local file:// previews cannot fetch JSON; serve site/ with python -m http.server.';
      console.warn(err);
    }
    render();
  }
  init();
})();
