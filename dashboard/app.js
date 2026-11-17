// Token Radar's dashboard, model radar-2. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail view with the
// model's own inputs and the protocol's farm plan, and a live-token view set apart. No network:
// every byte it shows is in data.js. The page recomputes a row's implied value from the snapshot
// figures and checks the number board.json carries, so the page's code and the board's data are
// visibly the same arithmetic; the farm plan is the same derivation main.ts writes to board.json.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var params = new URLSearchParams(window.location.search || '');
  var app = document.getElementById('board');
  var state = {
    q: params.get('q') || '',
    category: params.get('category') || 'all',
    watchlistOnly: params.get('watchlist') === '1',
    tab: params.get('tab') === 'live' ? 'live' : 'pre-token',
    sort: params.get('sort') || 'implied',
    dir: params.get('dir') === 'asc' ? 1 : -1,
    selected: params.get('slug') || null,
  };
  var WATCH = {};
  (DATA.rows || []).forEach(function (r, i) { WATCH[r.slug] = i < DATA.watchlist_size; });

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var extra = Math.min(Math.max((row.chains || []).length - 1, 0), model.breadth_max_chains);
    var breadth = 1 + extra * model.breadth_step;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * breadth));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('privacy') >= 0) return 'Deposit $' + capital + " into " + name + "'s private pool on " + chain + ' and keep the receipt.';
    if (c.indexOf('gaming') >= 0 || c.indexOf('nft') >= 0) return 'Buy or mint $' + capital + " of " + name + "'s in-app asset on " + chain + ' and use it in the app.';
    if (c.indexOf('ai') >= 0 || c.indexOf('social') >= 0) return 'Deposit $' + capital + ' and complete one task on ' + name + ' on ' + chain + '.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var half = Math.max(25, Math.floor(capital / 2));
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Borrow $' + half + ' against the deposit on ' + name + ' and use it once, then repay it the same week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return 'Swap $' + half + " through " + name + "'s own router on " + chain + ' once a week.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + half + ' back through ' + name + ' once, so the round trip is on record.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Restake the receipt token once through ' + name + ' if it offers a second layer.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close the hedge, then open one fresh small position on ' + name + ' the next week.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + half + ' into a second ' + name + ' vault on ' + chain + ' and keep both shares.';
    return 'Use $' + half + ' in a second feature of ' + name + ' on ' + chain + ', such as its swap or rewards page.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = capital >= 150 ? 8 : 4;
    var gas2 = capital >= 150 ? 6 : 3;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about $' + gas2 + ' of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: "Open the protocol's own points, quests or rewards page once a week and check the position is counted.", cost: 'no fee to check', time: '5 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, and revoke any approval you no longer need.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Unwind in stages over a week instead of all at once, and write the wallet, the dates and every transaction in a farm log.', cost: 'about $4 of gas to exit', time: '10 minutes to unwind' },
    ].map(stepText);
  }
  function parseStep(s) {
    var m = s.match(/^(.*) Cost: (.*)\. Time: (.*)\.$/);
    if (!m) return { text: s, cost: '', time: '' };
    return { text: m[1], cost: m[2], time: m[3] };
  }

  var categories = [];
  (DATA.rows || []).forEach(function (r) { if (r.category && categories.indexOf(r.category) < 0) categories.push(r.category); });
  categories.sort();

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = (DATA.rows || []).filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.watchlistOnly && !WATCH[r.slug]) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'change') { av = a.change_7d === null ? -1e9 : a.change_7d; bv = b.change_7d === null ? -1e9 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      return (av - bv) * dir || (a.slug < b.slug ? -1 : 1);
    });
    return rows;
  }

  function sortButton(label, key) {
    var arrow = state.sort === key ? (state.dir === -1 ? ' ▼' : ' ▲') : '';
    return el('button', { text: label + arrow, onclick: function () {
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'rank' ? 1 : -1; }
      render();
    } });
  }

  function render() {
    app.setAttribute('aria-busy', 'false');
    while (app.firstChild) app.removeChild(app.firstChild);
    var shell = el('div', { 'class': 'shell' });
    app.appendChild(shell);

    var top = el('div', { 'class': 'top' },
      el('div', { 'class': 'brand' }, el('span', { 'class': 'mark' }), el('span', { 'class': 'brand-name', text: 'TOKEN RADAR · MODEL ' + DATA.model_version.toUpperCase() })),
      el('div', { 'class': 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: DATA.watchlist_size + ' on the watchlist' }),
        el('span', { text: DATA.board_size + ' ranked' })));
    shell.appendChild(top);

    var lede = el('div', { 'class': 'lede' },
      el('div', null,
        el('h1', { text: 'Pre-token protocols, ranked by what their token could be worth' }),
        el('p', { text: 'Every protocol below records no token yet. The board values each one from the snapshot itself: its TVL times the market’s own multiple for its category, adjusted for seven-day growth, for how long it has run with no token, and for how many chains it reaches. Live-token protocols are set apart, at the market’s own prices, never mixed into the ranking.' })),
      el('div', { 'class': 'facts' },
        el('div', { 'class': 'fact' }, el('span', { text: 'Top implied value' }), el('b', { 'class': 'num', text: fmtUsd(DATA.rows[0] ? DATA.rows[0].implied_value_usd : 0) })),
        el('div', { 'class': 'fact' }, el('span', { text: 'Watchlist floor' }), el('b', { 'class': 'num', text: fmtUsd(DATA.floor_usd) })),
        el('div', { 'class': 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { 'class': 'num', text: String(DATA.early_size) })),
        el('div', { 'class': 'fact' }, el('span', { text: 'Live tokens set aside' }), el('b', { 'class': 'num', text: String(DATA.live_size) }))));
    shell.appendChild(lede);

    var modelBox = el('section', { 'class': 'model' },
      el('h2', { text: 'How the value is worked out' }),
      el('p', { html: 'Implied value = TVL × category multiple × growth × maturity × breadth. The <b>category multiple</b> is the median market-cap-per-TVL of the live-token protocols in that category, read from this same snapshot — the market’s own price for that kind of protocol, not a number we chose. Growth is the seven-day TVL change, clamped to −50%…+100% and weighted 0.6. Maturity rises with the days a protocol has run with no token, from 0.70 to 1.20 over three years. Breadth adds 5% per extra chain, up to four.' }),
      el('p', { html: 'Global median multiple: <code>' + DATA.global_multiple.toFixed(2) + '×</code>. Categories with fewer than four live protocols use it.' }));
    var calib = el('table', { 'class': 'calib' });
    calib.appendChild(el('tr', null, el('th', { text: 'Category' }), el('th', { text: 'Live protocols' }), el('th', { text: 'Multiple' })));
    (DATA.calibration || []).slice(0, 8).forEach(function (c) {
      calib.appendChild(el('tr', null,
        el('td', { text: c.category }),
        el('td', { 'class': 'num', text: String(c.live_count) }),
        el('td', { 'class': 'num', text: c.multiple.toFixed(2) + '×' })));
    });
    modelBox.appendChild(calib);
    shell.appendChild(modelBox);

    var controls = el('div', { 'class': 'controls' });
    var search = el('input', { type: 'search', placeholder: 'Search a protocol…', value: state.q, 'aria-label': 'Search protocols' });
    search.addEventListener('input', function () { state.q = search.value; renderTable(); });
    controls.appendChild(el('div', { 'class': 'field' }, el('label', { text: 'Search' }), search));
    var sel = el('select', { 'aria-label': 'Category' });
    sel.appendChild(el('option', { value: 'all', text: 'All categories' }));
    categories.forEach(function (c) { sel.appendChild(el('option', { value: c, text: c })); });
    sel.value = state.category;
    sel.addEventListener('change', function () { state.category = sel.value; renderTable(); });
    controls.appendChild(el('div', { 'class': 'field' }, el('label', { text: 'Category' }), sel));
    var wl = el('input', { type: 'checkbox', checked: state.watchlistOnly ? true : null, 'aria-label': 'Watchlist only' });
    wl.addEventListener('change', function () { state.watchlistOnly = wl.checked; renderTable(); });
    controls.appendChild(el('label', { 'class': 'check' }, wl, document.createTextNode(' Watchlist only')));
    var tabs = el('div', { 'class': 'tabs' },
      el('button', { 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre-token'; render(); } }),
      el('button', { 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live tokens', onclick: function () { state.tab = 'live'; render(); } }));
    controls.appendChild(tabs);
    var count = el('span', { 'class': 'count', id: 'row-count' });
    controls.appendChild(count);
    shell.appendChild(controls);

    var panel = el('div', { 'class': 'panel' }, el('div', { 'class': 'table-wrap' }, el('table', { id: 'board-table' })));
    shell.appendChild(panel);
    shell.appendChild(el('p', { 'class': 'note', html: '<b>Read it as a claim, not a promise:</b> “records no token” means the snapshot carries no token for the protocol, not that it has none, and an implied value is this radar’s own model, never a market price. A token may never be issued, and farming costs gas and can lose money.' }));
    shell.appendChild(el('p', { 'class': 'foot', text: 'Source: ' + DATA.source + ' · Floor ' + fmtUsd(DATA.floor_usd) + ' · Model ' + DATA.model_version + ' · No network: every byte shown is in data.js.' }));

    renderTable();
    if (state.selected) showDetail(state.selected);
  }

  function renderTable() {
    var table = document.getElementById('board-table');
    if (!table) return;
    while (table.firstChild) table.removeChild(table.firstChild);
    var count = document.getElementById('row-count');
    var maxImplied = (DATA.rows[0] || {}).implied_value_usd || 1;
    if (state.tab === 'live') {
      table.appendChild(el('thead', null, el('tr', null,
        el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { text: 'TVL' }),
        el('th', { text: 'Market cap' }), el('th', { text: '7d' }))));
      var lb = el('tbody');
      (DATA.live || []).forEach(function (p) {
        lb.appendChild(el('tr', null,
          el('td', null, el('span', { 'class': 'proto-name', text: p.name }), el('div', { 'class': 'proto-sub', text: p.chains.join(', ') })),
          el('td', { text: p.category || '—' }),
          el('td', { 'class': 'num', text: fmtUsd(p.tvl_usd) }),
          el('td', null, el('span', { 'class': 'badge live', text: 'live' }), document.createTextNode(' ' + fmtUsd(p.mcap_usd))),
          el('td', { 'class': 'num ' + (p.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(p.change_7d) })));
      });
      table.appendChild(lb);
      if (count) count.textContent = DATA.live.length + ' live-token protocols · market prices, not implied values';
      return;
    }
    var rows = filteredRows();
    var head = el('tr', null,
      el('th', null, sortButton('Rank', 'rank')),
      el('th', { text: 'Protocol' }),
      el('th', null, sortButton('Implied value', 'implied')),
      el('th', null, sortButton('TVL', 'tvl')),
      el('th', null, sortButton('7d', 'change')),
      el('th', null, sortButton('Age', 'age')));
    table.appendChild(el('thead', null, head));
    var body = el('tbody');
    rows.forEach(function (r) {
      var pct = Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100));
      var tr = el('tr', { 'class': state.selected === r.slug ? 'selected' : null, onclick: function () { state.selected = r.slug; render(); } },
        el('td', { 'class': 'rank', text: String(r.rank) }),
        el('td', null,
          el('span', { 'class': 'proto-name', text: r.name }),
          el('div', { 'class': 'proto-sub', text: (r.category || '—') + ' · ' + r.chains.join(', ') + (WATCH[r.slug] ? ' · watchlist' : '') })),
        el('td', null,
          el('div', { 'class': 'num', text: fmtUsd(r.implied_value_usd) }),
          el('div', { 'class': 'bar' }, el('i', { style: 'width:' + pct + '%' }))),
        el('td', { 'class': 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { 'class': 'num ' + (r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) }),
        el('td', { 'class': 'num', text: fmtAge(r.age_days) }));
      body.appendChild(tr);
    });
    if (rows.length === 0) body.appendChild(el('tr', null, el('td', { colspan: 6, 'class': 'empty', text: 'No protocols match this filter.' })));
    table.appendChild(body);
    if (count) count.textContent = rows.length + ' of ' + DATA.rows.length + ' pre-token protocols';
  }

  function showDetail(slug) {
    var row = null;
    (DATA.rows || []).forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    var old = document.querySelector('.detail');
    if (old) old.remove();
    var recomputed = impliedOf(row, DATA.model);
    var match = recomputed === row.implied_value_usd;
    var detail = el('section', { 'class': 'detail', id: 'detail' },
      el('header', null,
        el('h2', { text: '#' + row.rank + ' · ' + row.name }),
        el('button', { 'class': 'close', text: 'Close', onclick: function () { state.selected = null; render(); } })),
      el('div', { 'class': 'stats' },
        el('div', { 'class': 'stat' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
        el('div', { 'class': 'stat' }, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', { 'class': 'stat' }, el('span', { text: '7-day change' }), el('b', { text: fmtPct(row.change_7d) })),
        el('div', { 'class': 'stat' }, el('span', { text: 'Age, no token' }), el('b', { text: fmtAge(row.age_days) })),
        el('div', { 'class': 'stat' }, el('span', { text: 'Category' }), el('b', { text: row.category || '—' })),
        el('div', { 'class': 'stat' }, el('span', { text: 'Chains' }), el('b', { text: row.chains.join(', ') }))),
      el('p', { 'class': 'breakdown', html: 'Model: ' + fmtUsd(row.tvl_usd) + ' TVL × <code>' + row.category_multiple.toFixed(2) + '×</code> ' + (row.category || 'category') + ' multiple × <code>' + row.growth_multiplier.toFixed(2) + '×</code> growth × <code>' + row.maturity_multiplier.toFixed(2) + '×</code> maturity × <code>' + row.breadth_multiplier.toFixed(2) + '×</code> breadth = <code>' + fmtUsd(row.implied_value_usd) + '</code>. The page recomputes it as ' + fmtUsd(recomputed) + (match ? ' — it matches.' : ' — it does not match.') }),
      el('h3', { text: 'How to farm it' }),
      el('ol', { 'class': 'steps' }));
    var list = detail.querySelector('.steps');
    farmSteps(row).forEach(function (s) {
      var p = parseStep(s);
      var li = el('li', null, el('div', null, el('p', { text: p.text }), el('div', { 'class': 'chips' }, el('span', { 'class': 'chip', text: 'Cost: ' + p.cost }), el('span', { 'class': 'chip', text: 'Time: ' + p.time }))));
      list.appendChild(li);
    });
    document.querySelector('.shell').appendChild(detail);
    detail.scrollIntoView({ block: 'start' });
  }

  render();
})();
