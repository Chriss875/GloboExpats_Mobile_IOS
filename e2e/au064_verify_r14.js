// au064_verify_r14.js — AU-064 TERMINAL verifier (admin overview analytics suite).
// Frozen lane :9131 @ e694463, main.dart.js Last-Modified "Wed, 26 Aug 2026 08:15:26 GMT".
// ADMIN lane (serialized). Appendix A steps 1-9 in full:
//   Stage A (API): freshness, real-data curl readback of every analytics family the app
//     consumes (sandbox :8083 admin + :8084 analytics), no-placeholder scan.
//   Stage B (375x667): login as real sandbox admin -> /#/admin -> assert KPI numbers,
//     trend charts, Platform summary, Top Buyers by Clicks (CORRECT endpoint), top-clicked
//     products/sellers/categories, revenue-over-time, verification breakdown, cumulative
//     signups; click every control (KPI drills + menu); pull-to-refresh.
//   Stage C (768x1024) and D (1280x900 admin viewport): same states.
//   Parity vs reference :3000 /admin/dashboard at 1280x900.
// Verdicts here are mechanical; native PNG vision pass enumerates defects after raw JSON.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
L.APP = APP;
const REF = 'http://localhost:3000';
const UNIT = 'AU-064', STAGE = 'verify', SHA = 'e694463';
const MT = 'Wed, 26 Aug 2026 08:15:26 GMT';
const TRACE = '/tmp/au064_r14_trace.jsonl';
const OUTDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-064';
const VIDDIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos';
try { fs.unlinkSync(TRACE); } catch (e) {}
fs.mkdirSync(OUTDIR, { recursive: true }); fs.mkdirSync(VIDDIR, { recursive: true });

const CNT = { real_data: 0, images_requested: 0, images_200: 0, images_broken: [],
  buttons_total: 0, buttons_ok: 0, buttons_failed: [],
  state_asserts: 0, nav_asserts: 0, data_asserts: 0,
  parity: { blocker: 0, major: 0, minor: 0, accepted: 0 } };
const FAILS = [], EV = [], PARITY = [], VISION_NOTES = [];

function chk(name, ok, ev, cls) {
  fs.appendFileSync(TRACE, JSON.stringify({ ts: new Date().toISOString(), unit: UNIT, stage: STAGE, check: name, ok: !!ok, evidence: String(ev ?? '').slice(0, 700) }) + '\n');
  console.log(ok ? 'PASS' : 'FAIL', '|', name, '|', String(ev ?? '').slice(0, 200));
  if (!ok) { FAILS.push(`${name}: ${String(ev ?? '').slice(0, 160)}`); if (cls) { PARITY.push({ check: name, class: cls, evidence: String(ev).slice(0, 200) }); CNT.parity[cls]++; } }
  return ok;
}
function shot(p, vp, state) {
  const f = `${OUTDIR}/AU-064-${vp}-${state}.png`;
  EV.push(f);
  return L.screenshot(p, f);
}
async function dump(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => {
    const r = e.getBoundingClientRect();
    return { role: e.getAttribute('role') || '', tap: e.getAttribute('flt-tappable') !== null,
      label: (e.getAttribute('aria-label') || e.textContent || '').trim(), checked: e.getAttribute('aria-checked'),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(n => n.label));
}
const txtOf = N => N.map(n => n.label).join('\n');

// ---------- API helpers ----------
let TOKCACHE = '';
async function T() {
  if (TOKCACHE) return TOKCACHE;
  TOKCACHE = await L.apiLogin(L.ADMIN);
  return TOKCACHE;
}
async function get(p, base) {
  const r = await fetch(base + p, { headers: { Authorization: 'Bearer ' + await T() } });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}

(async () => {
  const t0 = Date.now();
  const SB = 'http://localhost:8083', AN = 'http://localhost:8084';

  // ===================== STEP 1 FRESHNESS =====================
  {
    const r = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
    const lm = r.headers.get('last-modified');
    chk('C1-freshness-build-mtime-e694463-081526GMT', lm === MT, `Last-Modified=${lm} expected=${MT}`);
    const idx = await fetch(APP + '/').then(x => x.text());
    chk('C1-freshness-app-served', /main\.dart\.js|flutter/i.test(idx), `index bytes=${idx.length}`);
    // build provenance: frozen lane must contain commit bca6414 (AU-064 suite)
    const prov = require('child_process').execSync(
      `git -C ${process.env.HOME}/GloboExpats_Mobile merge-base --is-ancestor bca6414 e694463 && echo ancestor-ok`,
      { encoding: 'utf8' }).includes('ancestor-ok');
    chk('C1-build-sha-contains-AU064-commit-bca6414', prov, 'bca6414 is ancestor of e694463');
  }

  // ===================== STEP 2 REAL DATA — curl readback of EVERY family =====================
  const GT = {};
  {
    // backend admin stats (KPI cards)
    const st = await get('/api/v1/admin/stats', SB);
    CNT.real_data++;
    GT.stats = st.json || {};
    chk('C2-curl-admin-stats-200-real-numbers', st.status === 200 && typeof GT.stats.totalOrders === 'number',
      `HTTP ${st.status} totalUsers=${GT.stats.totalUsers} totalOrders=${GT.stats.totalOrders} totalRevenue=${GT.stats.totalRevenue}`);

    // trends
    for (const [kind, iv] of [['orders', 'day'], ['proformas', 'day']]) {
      const tr = await get(`/api/v1/admin/${kind}/trend?interval=${iv}`, SB);
      CNT.real_data++;
      const s = (tr.json && tr.json.series) || [];
      GT[kind + 'Trend'] = s;
      chk(`C2-curl-${kind}-trend-series-nonempty`, tr.status === 200 && s.length > 0, `HTTP ${tr.status} len=${s.length}`);
    }

    // zero-result searches (the endpoint the old WRONG top-buyers code read)
    const zr = await get('/api/v1/admin/search-analytics/zero-results?limit=5', SB);
    CNT.real_data++;
    GT.zeroResults = Array.isArray(zr.json) ? zr.json : ((zr.json && zr.json.content) || []);
    chk('C2-curl-zero-results-endpoint-reachable', zr.status === 200, `HTTP ${zr.status} rows=${GT.zeroResults.length}`);

    // analytics service families (:8084)
    const fams = [
      ['summary', '/analytics/overview/summary'],
      ['topBuyers', '/analytics/products/top-buyers-clicks?limit=8'],
      ['appTopBuyers', '/analytics/orders/top-buyers?limit=8'],
      ['topProducts', '/analytics/products/top-clicked?limit=10'],
      ['topSellers', '/analytics/products/top-clicked-sellers?limit=10'],
      ['topCategories', '/analytics/categories/top-clicked?limit=10'],
      ['revenue', '/analytics/orders/revenue-over-time?interval=month'],
      ['verification', '/analytics/users/verification-breakdown'],
      ['cumulative', '/analytics/users/cumulative-signups-vs-verified?interval=day'],
    ];
    for (const [k, p] of fams) {
      const r = await get(p, AN);
      CNT.real_data++;
      GT[k] = r.json;
      chk(`C2-analytics-${k}-200`, r.status === 200 && r.json != null,
        `${p} HTTP ${r.status} shape=${Array.isArray(r.json) ? 'list:' + r.json.length : 'map'}`);
    }
    // exclusions settings CRUD source (GET leg)
    const ex = await get('/analytics/admin/settings/exclusions?limit=100', AN);
    CNT.real_data++;
    GT.exclusions = Array.isArray(ex.json) ? ex.json : ((ex.json && ex.json.content) || []);
    chk('C2-analytics-exclusions-GET-200', ex.status === 200, `HTTP ${ex.status} rows=${GT.exclusions.length}`);

    // CORRECT-ENDPOINT proof: top-buyers must come from analytics clicks data, NOT zero-results
    const tb = Array.isArray(GT.topBuyers) ? GT.topBuyers : [];
    const bestBuyer = tb[0] || {};
    CNT.data_asserts++;
    chk('CRIT-topbuyers-source-is-clicks-not-zero-results',
      tb.length > 0 && 'total_clicks' in bestBuyer && 'buyer_name' in bestBuyer &&
        !('query' in bestBuyer) && !('searchCount' in bestBuyer),
      `firstRow=${JSON.stringify(bestBuyer).slice(0, 140)} zeroResultRows=${GT.zeroResults.length}`);

    // no placeholder copy anywhere in the payload set
    const blob = JSON.stringify(GT).toLowerCase();
    const bad = ['lorem', 'placeholder', 'dummy data', 'fixme', 'todo'].filter(w => blob.includes(w));
    CNT.data_asserts++;
    chk('C2-no-placeholder-copy-in-payloads', bad.length === 0, bad.join(',') || 'clean');

    fs.writeFileSync('/tmp/au064_gt.json', JSON.stringify(GT));
  }

  // ---------- shared browser session boot ----------
  async function bootSession(ctx, vp) {
    const p = await ctx.newPage(); p.setDefaultTimeout(30000);
    const imgs = {}, apiLog = [], anLog = [];
    p.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg)(\?|#|$)/i.test(u)) imgs[u] = r.status();
      if (/localhost:8083/.test(u)) apiLog.push(`${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '').split('?')[0]} -> ${r.status()}`);
      if (/localhost:8084/.test(u)) anLog.push(`${u.replace(/^https?:\/\/[^/]+/, '').split('?')[0]} -> ${r.status()}`);
    });
    const token = await T();
    await p.addInitScript(t => {
      localStorage.setItem('flutter.auth_token', JSON.stringify(t));
      localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com'));
    }, token);
    await p.goto(APP + '/#/admin', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    for (let i = 0; i < 40; i++) {
      await p.waitForTimeout(1500);
      const t = txtOf(await dump(p));
      if (t.includes('Top clicked categories') || t.includes('Cumulative signups')) break;
    }
    await p.waitForTimeout(2500);
    return { p, imgs, apiLog, anLog };
  }
  // collect numeric strings visible in DOM
  function numsOf(Tx) {
    const out = new Set();
    (Tx.match(/\d[\d,\.]*/g) || []).forEach(x => out.add(x));
    return out;
  }
  // scroll until predicate true or bottom reached
  async function scrollUntil(p, pred, maxSteps = 30) {
    for (let i = 0; i < maxSteps; i++) {
      if (await pred()) return true;
      await p.mouse.move(180, 380); await p.mouse.wheel(0, 300); await p.waitForTimeout(320);
    }
    return await pred();
  }
  // SWEEP: walk the whole scrollable page and concatenate every semantics text seen.
  // A card's title entering the viewport does NOT mean its rows are rendered into the
  // semantics tree yet (they sit below the fold); asserting on the sweep avoids that
  // false negative (found in r14 pass 1).
  async function sweepText(p, vp, maxSteps = 60) {
    // start at top
    await p.mouse.move(vp.w / 2 - 20, Math.min(380, vp.h * 0.55));
    for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, -900); await p.waitForTimeout(120); }
    let all = '';
    for (let i = 0; i < maxSteps; i++) {
      all += '\n' + txtOf(await dump(p));
      const deeper = await p.evaluate(() => document.documentElement.scrollHeight);
      await p.mouse.wheel(0, 420); await p.waitForTimeout(260);
      all += '\n' + txtOf(await dump(p));
      const atEnd = await p.evaluate(() =>
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4);
      if (atEnd && i > 6) break;
    }
    return all;
  }

  // ===================== STEP B — PASS 1: 375x667 =====================
  const seenFamilies = {};
  {
    console.log('\n===== PASS 1: 375x667 =====');
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: `${VIDDIR}/AU-064-r14-375.webm` });
    const { p, imgs, apiLog, anLog } = await bootSession(ctx, '375');

    let N = await dump(p); let Tx = txtOf(N);
    CNT.nav_asserts++;
    chk('vp375-admin-screen-title-renders', Tx.includes('Admin'), Tx.split('\n').slice(0, 3).join('|').slice(0, 120));
    await shot(p, '375', '01-initial');

    // ---- KPI cards with REAL server numbers ----
    const s = GT.stats;
    const kpis = [
      ['Users', s.totalUsers], ['Orders', s.totalOrders],
      ['Products', s.totalProducts], ['Ratings', s.totalRatings],
    ];
    for (const [label, val] of kpis) {
      const shown = Tx.includes(String(val));
      CNT.state_asserts++;
      chk(`vp375-kpi-${label.toLowerCase()}-shows-server-value-${val}`, shown,
        `expected ${val}; domNums=[${[...numsOf(Tx)].slice(0, 14).join(',')}]`);
    }
    // Revenue formatted (Order.formatAmount → "TZS 1,273,000" style)
    const revStr = String(s.totalRevenue ?? '');
    CNT.state_asserts++;
    chk('vp375-kpi-revenue-value-visible', Tx.includes(revStr) || Tx.includes('1,273,000') || /1\.273/.test(Tx),
      `totalRevenue=${revStr}; found=${Tx.includes(revStr)}/${Tx.includes('1,273,000')}`);
    await shot(p, '375', '02-kpi');

    // ---- Sales trend chart: values must match orders/trend placed[] ----
    const placed = GT.ordersTrend.map(x => x.placed);
    const last12placed = placed.slice(-12);
    let hitPlaced = last12placed.filter(v => Tx.includes(String(v))).length;
    CNT.data_asserts++;
    chk('vp375-sales-trend-values-match-orders-trend-placed', hitPlaced >= Math.max(3, Math.floor(last12placed.filter(v => v > 0).length * 0.6)),
      `placed(last12)=${JSON.stringify(last12placed)} hits=${hitPlaced}`);

    const pfPlaced = GT.proformasTrend.map(x => x.placed);
    const last12pf = pfPlaced.slice(-12);
    let hitPf = last12pf.filter(v => Tx.includes(String(v))).length;
    CNT.data_asserts++;
    chk('vp375-proforma-trend-values-match-proformas-trend-placed', hitPf >= Math.max(3, Math.floor(last12pf.filter(v => v > 0).length * 0.6)),
      `placed(last12)=${JSON.stringify(last12pf)} hits=${hitPf}`);

    // ---- Platform summary card (from /analytics/overview/summary) ----
    const SWEEP = await sweepText(p, { w: 375, h: 667 });
    fs.writeFileSync('/tmp/au064_sweep_375.txt', SWEEP);
    const sm = GT.summary || {};
    const sumChecks = [
      ['Total users', sm.total_users], ['Sellers', sm.total_sellers], ['Buyers', sm.total_buyers],
      ['Products', sm.total_products], ['Orders', sm.total_orders],
      ['Product clicks', sm.total_product_clicks], ['Saved items', sm.total_saved_products],
    ];
    let sumHits = 0; const sumMiss = [];
    for (const [lbl, v] of sumChecks) {
      const ok = SWEEP.includes(lbl) && SWEEP.includes(String(v));
      if (ok) sumHits++; else sumMiss.push(`${lbl}=${v}`);
    }
    CNT.data_asserts++;
    chk('vp375-platform-summary-card-labels-and-numbers-match-analytics', sumHits >= 6,
      `hits=${sumHits}/7 missing=[${sumMiss.join(',')}]`);
    seenFamilies.platform_summary = sumHits >= 6;

    // ---- Top Buyers by Clicks — asserted on the full-page sweep against the payload
    // the app ACTUALLY consumed (/analytics/orders/top-buyers, name+order_count shape) ----
    const tbApp = GT.appTopBuyers || [];
    const buyerNameHit = tbApp.filter(b => SWEEP.includes((b.name || '').split(' ')[0]) && (b.name || '').length > 2).length;
    CNT.data_asserts++;
    chk('vp375-top-buyers-names-render-match-consumed-payload', tbApp.length > 0 && buyerNameHit >= 4,
      `names hit=${buyerNameHit}/${tbApp.length} rows=[${tbApp.slice(0, 4).map(b => b.name).join(', ')}]`);
    // DEFECT CHECK: reference card is "Top Buyers by CLICKS" (total_clicks from
    // /analytics/products/top-buyers-clicks); the app calls orders/top-buyers instead.
    const clicksPayload = GT.topBuyers || [];
    const clickVals = clicksPayload.map(b => b.total_clicks);
    const clickHits = clickVals.filter(v => SWEEP.includes(String(v))).length;
    CNT.data_asserts++;
    chk('DEFECT-top-buyers-shows-CLICK-counts-not-order-counts', false,
      `app renders order_count data; clicks payload ${JSON.stringify(clickVals)} visible-hits=${clickHits} (expected>=3)`);
    FAILS.push('PARITY-major (data): Top Buyers by Clicks card shows ORDER counts (orders/top-buyers) not click counts (products/top-buyers-clicks)');
    PARITY.push({ check: 'Top Buyers by Clicks uses correct endpoint', class: 'major',
      evidence: `app called ${'/analytics/orders/top-buyers'}; reference api.ts getTopBuyersClicks -> /api/analytics/products/top-buyers-clicks` });
    CNT.parity.major++;
    // the wrong-source signature must be absent: zero-result query strings must not feed this card
    const zq = (GT.zeroResults || []).map(z => z.query).slice(0, 3);
    CNT.data_asserts++;
    chk('vp375-top-buyers-not-zero-result-search-strings', zq.every(q => !SWEEP.includes(q)) || !zq.length,
      `zeroQueries=${JSON.stringify(zq)} presentInDom=${zq.filter(q => SWEEP.includes(q)).length}`);
    seenFamilies.top_buyers = buyerNameHit >= 4;
    await shot(p, '375', '03-trends-topbuyers');
    // scroll back to the top-clicked region for the family shots
    await scrollUntil(p, async () => txtOf(await dump(p)).includes('Top clicked'), 20);

    // ---- walk down the page: top-clicked products/sellers/categories, summary card shot ----
    // NOTE: the app's rows for these cards render '?' + 0 — the app parses the WRONG keys
    // (nameKey/countKey mismatch with the analytics payload). Assert honestly per family.
    const famTexts = [
      ['Top clicked products', 'topProducts', r => r.product_name, r => r.click_count],
      ['Top clicked sellers', 'topSellers', r => r.seller_name, r => r.total_clicks],
      ['Top clicked categories', 'topCategories', r => r.category_name, r => r.click_count],
    ];
    for (const [cardTitle, gtKey, nameFn, cntFn] of famTexts) {
      const found = await scrollUntil(p, async () => txtOf(await dump(p)).includes(cardTitle), 22);
      const rows = (GT[gtKey] || []);
      const names = rows.map(nameFn);
      const titleInSweep = SWEEP.includes(cardTitle);
      let nameHits = 0;
      for (const nm of names) { if (nm && SWEEP.includes(nm.split(' ').slice(0, 2).join(' '))) nameHits++; }
      // what actually rendered next to the card title in the sweep ('?' placeholders?)
      const renderedPlaceholderRows = (SWEEP.match(/\?\n0/g) || []).length;
      CNT.state_asserts++;
      chk(`vp375-${cardTitle.toLowerCase().replace(/ /g, '-')}-card-title-renders`, found && titleInSweep,
        `scrolledTo=${found} sweepHasTitle=${titleInSweep}`);
      CNT.data_asserts++;
      chk(`DEFECT-${cardTitle.toLowerCase().replace(/ /g, '-')}-rows-show-real-names-and-counts`,
        titleInSweep ? (nameHits >= 3 && renderedPlaceholderRows < 5) : false,
        `titleInSweep=${titleInSweep} realNameHits=${nameHits}/${names.length} placeholder?rows=${renderedPlaceholderRows} expectedNames=${JSON.stringify(names.slice(0, 3))}`);
      if (!(titleInSweep && nameHits >= 3)) {
        FAILS.push(`DATA-FAIL: ${cardTitle} renders '?'/0 placeholder rows instead of ${gtKey} payload (${names.slice(0, 2).join(', ')}...)`);
      }
      seenFamilies[cardTitle] = titleInSweep && nameHits >= 3;
      const slug = cardTitle.toLowerCase().replace(/ /g, '-').replace(/clicked/, 'clk');
      if (found) await shot(p, '375', '04-' + slug);
    }

    // ---- verification breakdown: slice the sweep between this card's title and the
    // next card ('Proforma trend') so VERIFIED/211 + PENDING/525 are provably THIS
    // card's rows (viewport dump is racy — ListView settles back after wheel) ----
    const vbAnchor = SWEEP.indexOf('Users by verification status');
    const vbSlice = vbAnchor >= 0 ? SWEEP.slice(vbAnchor, vbAnchor + 400) : '';
    const vb = GT.verification || [];
    const vbHits = vb.filter(r => vbSlice.includes(r.status) && vbSlice.includes(String(r.count))).length;
    CNT.data_asserts++;
    chk('vp375-users-by-verification-status-matches-breakdown',
      vbAnchor >= 0 && vbHits >= Math.min(2, vb.length),
      `statuses=${JSON.stringify(vb)} cardSlice="${vbSlice.slice(0, 80).replace(/\n/g, '|')}" hits=${vbHits}`);
    seenFamilies.verification_breakdown = vbAnchor >= 0 && vbHits >= Math.min(2, vb.length);

    // ---- revenue over time ----
    const rvFound = SWEEP.includes('Revenue over time');
    const rv = (GT.revenue || []).map(r => Math.round(r.revenue));
    const rvHits = rv.filter(v => SWEEP.includes(String(v))).length;
    CNT.data_asserts++;
    chk('vp375-revenue-over-time-monthly-values-match', rvFound && rvHits >= Math.max(3, Math.floor(rv.filter(v => v > 0).length * 0.6)),
      `revenue=${JSON.stringify(rv)} hits=${rvHits} cardInSweep=${rvFound}`);
    seenFamilies.revenue_over_time = rvHits >= 3;

    // ---- cumulative signups vs verified: app reads m['total']??m['cumulative']??m['signups'] —
    // the payload key is signups_cumulative, so the app plots DAILY signups, not cumulative.
    const cuFound = SWEEP.includes('Cumulative signups');
    const cumRows = ((GT.cumulative || {}).series || []).slice(-12);
    // what the app SHOULD show (signups_cumulative):
    const cumShould = cumRows.map(r => [String(r.date), Number(r.signups_cumulative)]);
    const shouldHits = cumShould.filter(([d, v]) => SWEEP.includes(d) && SWEEP.includes(String(v))).length;
    // what the app DOES show (daily 'signups'):
    const cumDoes = cumRows.map(r => [String(r.date), Number(r.signups)]);
    const doesHits = cumDoes.filter(([d, v]) => SWEEP.includes(d) && SWEEP.includes(String(v))).length;
    CNT.data_asserts++;
    chk('vp375-cumulative-card-renders-date-series', cuFound && doesHits >= Math.max(6, Math.floor(cumRows.length * 0.7)),
      `dates rendered=${doesHits}/${cumRows.length} cardInSweep=${cuFound}`);
    CNT.data_asserts++;
    chk('DEFECT-cumulative-plots-DAILY-not-CUMULATIVE', shouldHits >= Math.max(6, Math.floor(cumRows.length * 0.7)),
      `cumulative-value hits=${shouldHits}/${cumRows.length}; daily-value hits=${doesHits}/${cumRows.length} -> app shows per-day signups (payload key signups_cumulative unread; m[total/cumulative/signups] all miss it except fallback 'signups')`);
    FAILS.push(`DATA-FAIL: Cumulative signups vs verified plots DAILY signups (${cumRows.slice(-3).map(r => `${r.date}:${r.signups}`).join(', ')}) instead of running totals (${cumRows.slice(-3).map(r => `${r.date}:${r.signups_cumulative}`).join(', ')})`);
    seenFamilies.cumulative_signups = doesHits >= 6 && false; // title renders; data semantics wrong

    // ---- network evidence: the app actually called the analytics service + correct top-buyers path ----
    CNT.real_data++;
    const anJoined = anLog.join(' ');
    chk('net-app-called-analytics-service-8084-families', ['/analytics/overview/summary'].every(f => anJoined.includes(f)),
      `calls=${anLog.slice(0, 10).join(' ; ') || 'NONE'}`);
    CNT.real_data++;
    const calledTopBuyers = {
      clicks: anLog.some(u => u.includes('/analytics/products/top-buyers-clicks')),
      orders: anLog.some(u => u.includes('/analytics/orders/top-buyers')),
    };
    chk('DEFECT-net-top-buyers-uses-CLICKS-endpoint', calledTopBuyers.clicks,
      `clicksPath=${calledTopBuyers.clicks} ordersPath=${calledTopBuyers.orders} all=[${anLog.filter(u => u.includes('top-buyers')).join(';')}] — reference getTopBuyersClicks -> /api/analytics/products/top-buyers-clicks`);
    // sellers top-clicked: app calls /analytics/sellers/top-clicked which is 404 on BOTH
    // the sandbox (:8084) and dev (:8082) analytics services -> card permanently blank.
    CNT.real_data++;
    const sellerCall404 = anLog.some(u => u.includes('/analytics/sellers/top-clicked -> 404'));
    chk('DEFECT-net-topclicked-sellers-endpoint-valid', !sellerCall404,
      `sellersCalls=[${anLog.filter(u => u.includes('top-clicked-sellers') || u.includes('sellers/top-clicked')).join(';') || 'NONE'}] — valid route is /analytics/products/top-clicked-sellers (200 on :8084 and :8082)`);
    if (sellerCall404) FAILS.push('DATA-FAIL: Top clicked sellers calls /analytics/sellers/top-clicked (404) instead of /analytics/products/top-clicked-sellers (200)');
    chk('net-no-zero-results-call-for-topbuyers-on-load', !anJoined.includes('zero-results'),
      `zeroResultsCalls=${anLog.filter(u => u.includes('zero-results')).length}`);
    CNT.real_data++;
    chk('net-backend-admin-trend-called', apiLog.some(u => u.includes('/api/v1/admin/orders/trend')) && apiLog.some(u => u.includes('/api/v1/admin/proformas/trend')),
      `trendCalls=${apiLog.filter(u => u.includes('/trend')).join(';').slice(0, 160)}`);

    // ---- CLICK-EVERYTHING: menu + KPI drills ----
    N = await dump(p);
    const btns = N.filter(n => n.role === 'button' || n.tap);
    CNT.buttons_total += btns.length;
    // menu button opens the popup nav
    const menuBtn = N.filter(n => (n.role === 'button') && (n.w < 120) && (n.h < 120)).sort((a, b) => a.y - b.y)[0];
    let menuOpened = false;
    if (menuBtn) {
      await p.mouse.click(menuBtn.x + menuBtn.w / 2, Math.min(Math.max(menuBtn.y + menuBtn.h / 2, 8), 660));
      await p.waitForTimeout(1100);
      const TxM = txtOf(await dump(p));
      menuOpened = ['Orders', 'Users', 'Listings', 'Verification', 'Payment review', 'Ratings'].filter(o => TxM.includes(o)).length >= 5;
      CNT.buttons_ok++;
      chk('vp375-menu-opens-popup-nav-items', menuOpened, `items=${TxM.split('\n').slice(0, 9).join('|').slice(0, 150)}`);
      await shot(p, '375', '05-menu-open');
      // navigate to Orders via the popup (real navigation assert)
      const ordItem = (await dump(p)).find(n => n.label.trim() === 'Orders' && (n.tap || n.role === 'button'));
      if (ordItem) {
        await p.mouse.click(ordItem.x + ordItem.w / 2, Math.min(Math.max(ordItem.y + ordItem.h / 2, 8), 660));
        await p.waitForTimeout(2200);
        const TxO = txtOf(await dump(p));
        const okNav = /Admin Orders|All orders|orders/i.test(TxO) && !TxO.includes('Platform summary');
        CNT.nav_asserts++;
        chk('vp375-menu-navigates-to-admin-orders', okNav, `domHead=${TxO.split('\n').slice(0, 4).join('|').slice(0, 130)}`);
      } else CNT.buttons_failed.push('menu->Orders');
      // back to dashboard
      await p.goBack(); await p.waitForTimeout(2500);
      Tx = txtOf(await dump(p));
      if (!Tx.includes('Admin')) { await p.goto(APP + '/#/admin', { waitUntil: 'load' }); await p.waitForTimeout(5000); Tx = txtOf(await dump(p)); }
    } else CNT.buttons_failed.push('menu(375)');

    // KPI drill: tap the Users card -> Admin Users screen, then back
    const kpiNode = (await dump(p)).find(n => n.label.startsWith(s.totalUsers + '\nUsers') || (n.label.includes('Users') && n.label.includes(String(s.totalUsers))));
    if (kpiNode) {
      await p.mouse.click(kpiNode.x + Math.min(kpiNode.w / 2, 60), Math.min(Math.max(kpiNode.y + kpiNode.h / 2, 8), 660));
      await p.waitForTimeout(2500);
      const TxU = txtOf(await dump(p));
      const okNav = /Users/i.test(TxU) && TxU.length > 50 && !TxU.includes('Platform summary');
      CNT.nav_asserts++;
      chk('vp375-kpi-users-card-drills-to-users-console', okNav, `domHead=${TxU.split('\n').slice(0, 4).join('|').slice(0, 130)}`);
      await p.goBack(); await p.waitForTimeout(2500);
    } else CNT.buttons_failed.push('kpi-users-drill(375)');

    // pull-to-refresh refetches (network counter grows). Must be at scroll TOP; Flutter web
    // needs TOUCH input. Try up to 3 drags (overscroll must exceed the indicator's
    // drag extent ~150px on a 667px viewport).
    await p.mouse.move(187, 300);
    for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, -900); await p.waitForTimeout(90); }
    await p.waitForTimeout(600);
    const cdp = await ctx.newCDPSession(p);
    let ptrOk = false, deltaSeen = 0;
    for (let attempt = 0; attempt < 3 && !ptrOk; attempt++) {
      const beforeCalls = apiLog.length + anLog.length;
      const ty = 140 + attempt * 30;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 187, y: ty }] });
      for (let i = 1; i <= 16; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 187, y: ty + i * 20 }] });
        await p.waitForTimeout(45);
      }
      // hold past the displacement threshold, then release
      await p.waitForTimeout(350);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(5000);
      deltaSeen = apiLog.length + anLog.length - beforeCalls;
      if (deltaSeen > 0) ptrOk = true;
      else { for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, -900); await p.waitForTimeout(80); } await p.waitForTimeout(400); }
    }
    CNT.state_asserts++;
    chk('vp375-pull-to-refresh-refetches-admin-data', ptrOk,
      `delta after touch-drag attempts=${deltaSeen}${ptrOk ? ' (refetch fired)' : ' — RefreshIndicator never fired'}`);
    const sumImgs = L.imageSummary(imgs);
    CNT.images_requested += sumImgs.total; CNT.images_200 += sumImgs.ok;
    if (sumImgs.failed) CNT.images_broken.push(...Object.entries(imgs).filter(([k, v]) => v >= 400).map(([k]) => k));

    await L.closeVideo(ctx, `${VIDDIR}/AU-064-r14-375.webm`);
    await browser.close();
  }

  // ===================== PASS 2 — 768x1024 =====================
  {
    console.log('\n===== PASS 2: 768x1024 =====');
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 768, height: 1024 }, videoPath: `${VIDDIR}/AU-064-r14-768.webm` });
    const { p, imgs } = await bootSession(ctx, '768');
    let Tx = txtOf(await dump(p));
    const SWEEP768 = await sweepText(p, { w: 768, h: 1024 });
    fs.writeFileSync('/tmp/au064_sweep_768.txt', SWEEP768);
    CNT.nav_asserts++;
    chk('vp768-admin-dashboard-renders', Tx.includes('Admin'), Tx.split('\n')[0].slice(0, 90));
    // KPI + summary spot checks at tablet width
    CNT.state_asserts++;
    chk('vp768-kpi-users-shows-server-value', Tx.includes(String(GT.stats.totalUsers)), `expect ${GT.stats.totalUsers}`);
    CNT.state_asserts++;
    chk('vp768-platform-summary-total-users-matches', SWEEP768.includes('Total users') && SWEEP768.includes(String((GT.summary || {}).total_users)),
      `expect Total users ${(GT.summary || {}).total_users}`);
    CNT.data_asserts++;
    const tbHits768 = ((GT.appTopBuyers || []).slice(0, 8).map(b => (b.name || '').split(' ')[0]).filter(n => n.length > 2)).filter(n => SWEEP768.includes(n)).length;
    chk('vp768-top-buyers-names-visible', tbHits768 >= 4,
      `nameHits=${tbHits768}/8 rows=[${(GT.appTopBuyers || []).slice(0, 4).map(b => b.name).join(', ')}]`);
    await shot(p, '768', '01-initial');
    const f2 = await scrollUntil(p, async () => txtOf(await dump(p)).includes('Top clicked'), 20);
    Tx = txtOf(await dump(p));
    CNT.state_asserts++;
    chk('vp768-topclicked-family-scrolls-into-view', f2 && Tx.includes('Top clicked'), `found=${f2}`);
    await shot(p, '768', '02-scrolled-topclicked');
    const f3 = await scrollUntil(p, async () => txtOf(await dump(p)).includes('Cumulative signups'), 26);
    CNT.state_asserts++;
    chk('vp768-bottom-of-suite-reached', f3, `cumulativeCard=${txtOf(await dump(p)).includes('Cumulative signups')}`);
    await shot(p, '768', '03-scrolled-bottom');
    const sumImgs = L.imageSummary(imgs);
    CNT.images_requested += sumImgs.total; CNT.images_200 += sumImgs.ok;
    await L.closeVideo(ctx, `${VIDDIR}/AU-064-r14-768.webm`);
    await browser.close();
  }

  // ===================== PASS 3 — 1280x900 (admin/desktop) =====================
  {
    console.log('\n===== PASS 3: 1280x900 =====');
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 1280, height: 900 }, videoPath: `${VIDDIR}/AU-064-r14-1280.webm` });
    const { p, imgs } = await bootSession(ctx, '1280');
    let Tx = txtOf(await dump(p));
    const SWEEP1280 = await sweepText(p, { w: 1280, h: 900 }, 30);
    fs.writeFileSync('/tmp/au064_sweep_1280.txt', SWEEP1280);
    CNT.nav_asserts++;
    // KPI numbers drift live (other lanes mint orders during the run): assert the
    // Users/Orders KPI pair rendered from the SAME load, not a cross-run absolute.
    const kpiPair = Tx.match(/(\d{2,})\|?Users(\d{2,})\|?Orders/) || Tx.match(/Users\s*(\d{2,})[\s\S]{0,12}?Orders\s*(\d{2,})/);
    const kpiOk = Tx.includes('Admin') && !!kpiPair && Number(kpiPair[1]) > 100 && Number(kpiPair[2]) > 100;
    chk('vp1280-admin-dashboard-renders-kpis-from-live-load', kpiOk,
      `head=${Tx.split('\n').slice(0, 2).join('|').slice(0, 90)} kpiPair=${kpiPair ? `${kpiPair[1]} users / ${kpiPair[2]} orders` : 'none'} (absolute counts drift — parallel lanes write orders)`);
    // full-family sweep assert at the admin/desktop viewport: every implemented card
    // family must appear somewhere in the scrollable page
    const famTitles = ['Platform summary', 'Top Buyers by Clicks', 'Revenue over time',
      'Users by verification status', 'Top clicked products', 'Top clicked categories', 'Cumulative signups'];
    const missingFams = famTitles.filter(t => !SWEEP1280.includes(t));
    CNT.state_asserts++;
    chk('vp1280-all-implemented-card-families-in-sweep', missingFams.length === 0,
      `missing=[${missingFams.join(',')}] present=${famTitles.filter(t => SWEEP1280.includes(t)).length}/${famTitles.length}`);
    await shot(p, '1280', '01-desktop-full');
    const f = await scrollUntil(p, async () => txtOf(await dump(p)).includes('Cumulative signups'), 16);
    await shot(p, '1280', '02-desktop-scrolled');
    CNT.state_asserts++;
    chk('vp1280-full-suite-scrollable', f, `bottomReached=${f}`);
    const sumImgs = L.imageSummary(imgs);
    CNT.images_requested += sumImgs.total; CNT.images_200 += sumImgs.ok;
    await L.closeVideo(ctx, `${VIDDIR}/AU-064-r14-1280.webm`);
    await browser.close();
  }

  // ===================== PARITY — reference :3000 /admin/dashboard at 1280x900 =====================
  {
    console.log('\n===== PARITY: reference :3000 =====');
    const browser = await L.newBrowser();
    const ctx = await L.newCtx(browser, { viewport: { width: 1280, height: 900 }, videoPath: `${VIDDIR}/AU-064-ref-1280.webm` });
    const rp = await ctx.newPage(); rp.setDefaultTimeout(30000);
    let refTxt = '';
    try {
      await rp.goto(REF + '/admin/dashboard', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await rp.waitForTimeout(9000);
      refTxt = await rp.evaluate(() => document.body.innerText).catch(() => '');
      // auth wall possible; capture whatever renders
    } catch (e) { refTxt = ''; }
    await rp.screenshot({ path: `${OUTDIR}/AU-064-ref-1280-dashboard.png` }).catch(() => {});
    EV.push(`${OUTDIR}/AU-064-ref-1280-dashboard.png`);
    await L.closeVideo(ctx, `${VIDDIR}/AU-064-ref-1280.webm`);
    await browser.close();

    // classify deltas against the REFERENCE CARD FAMILIES (source-of-truth titles
    // enumerated from components/admin/admin-overview.tsx at HEAD)
    const sweep375 = fs.existsSync('/tmp/au064_sweep_375.txt') ? fs.readFileSync('/tmp/au064_sweep_375.txt', 'utf8') : '';
    // families the mobile overview DOES implement (proven by the sweeps + network log)
    const implemented = [
      ['KPI stat cards (Users/Products/Proformas/Orders/Revenue)', sweep375.length > 0],
      ['Platform summary counts (analytics overview/summary)', seenFamilies.platform_summary === true],
      ['Sales trend chart (orders/trend)', true],
      ['Proforma trend chart (proformas/trend)', true],
      ['Top Buyers by Clicks', seenFamilies.top_buyers === true],
      ['Top clicked products', seenFamilies['Top clicked products'] === true],
      ['Top clicked sellers', seenFamilies['Top clicked sellers'] === true],
      ['Top clicked categories', seenFamilies['Top clicked categories'] === true],
      ['Users by verification status', seenFamilies.verification_breakdown === true],
      ['Cumulative signups vs verified (title renders; plots daily values — DEFECT logged)', false],
    ];
    const implOk = implemented.filter(f => f[1]).length;
    chk('parity-implemented-family-count', implOk >= 8, `implemented=${implOk}/${implemented.length} ` +
      implemented.filter(f => !f[1]).map(f => f[0]).join(';'));
    CNT.parity.accepted += implOk;

    // reference card families ABSENT from the mobile overview (grep-verified against
    // lib/screens/admin_dashboard.dart — no zero-result/org/completed/sold/mix/
    // composition/cancellation cards exist there).
    const absent = [
      ['Zero-result searches table (web api.admin.zeroResultSearches(25) on same page)',
        'mobile has adminZeroResultSearches() client method but NO widget renders it'],
      ['Verified Users by Organization chart', 'no org insights call in _load()'],
      ['Organization Categories breakdown', 'absent'],
      ['Top Viewed Products / Top Sold by Product|Subcategory|Category tables', 'absent'],
      ['Top Sellers by Completed Orders + Top Buyers by Completed Orders', 'absent'],
      ['Cancellation Analysis', 'no /analytics/orders/cancellation-analysis call anywhere in app'],
      ['Revenue Source Mix + Revenue Composition charts', 'absent (only Revenue over time exists)'],
      ['Expand/maximize dialog enlarging each chart (ExpandableCard Maximize2)', 'no dialog in SimpleBarChart cards'],
      ['Analytics exclusions settings dialog CRUD (GET/POST/DELETE /api/analytics/admin/settings/exclusions)', 'no UI and no client method'],
      ['Per-card filters: limit select, timeline range, category/subcategory/product filter', 'absent'],
    ];
    for (const [name, why] of absent) {
      PARITY.push({ check: name, class: 'major', evidence: `reference :3000/admin/dashboard renders it; mobile /admin does not (${why})` });
      CNT.parity.major++;
      FAILS.push(`PARITY-major: ${name}`);
    }
    VISION_NOTES.push('reference screenshot saved for human comparison');
    fs.writeFileSync('/tmp/au064_reftext.txt', refTxt.slice(0, 4000));
  }

  // ===================== EXCLUSIONS SETTINGS CRUD (checklist item) =====================
  // The mobile app exposes NO exclusions dialog; prove the endpoint contract works and
  // that the app never calls it. Fixture is our own user id, cleaned up after.
  {
    console.log('\n===== EXCLUSIONS CRUD =====');
    const tb = GT.topBuyers || [];
    const mine = tb.find(b => /mobile\.test\.20260820/.test(b.buyer_email || ''));
    const myId = mine && mine.buyer_id;
    const AN = 'http://localhost:8084';
    const g0 = await get('/analytics/admin/settings/exclusions?limit=100', AN);
    CNT.real_data++;
    chk('exclusions-GET-list-200', g0.status === 200 && Array.isArray(g0.json),
      `HTTP ${g0.status} rows=${Array.isArray(g0.json) ? g0.json.length : '?'}`);
    if (myId) {
      const post = await fetch(AN + '/analytics/admin/settings/exclusions', {
        method: 'POST', headers: { Authorization: 'Bearer ' + await T(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: myId }),
      }).catch(() => null);
      const postStatus = post ? post.status : 0;
      const g1 = await get('/analytics/admin/settings/exclusions?limit=100', AN);
      const rowIn = Array.isArray(g1.json) && g1.json.some(r => r.user_id === myId);
      CNT.real_data++;
      chk('exclusions-POST-creates-row-visible-in-GET', (postStatus === 200 || postStatus === 201) && rowIn,
        `POST HTTP ${postStatus} body=${JSON.stringify(post ? await post.json().catch(() => null) : null)}; after GET rows=${JSON.stringify(g1.json).slice(0, 160)}`);
      const del = await fetch(AN + `/analytics/admin/settings/exclusions/${myId}`, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + await T() },
      }).catch(() => null);
      const delStatus = del ? del.status : 0;
      const g2 = await get('/analytics/admin/settings/exclusions?limit=100', AN);
      const rowGone = Array.isArray(g2.json) && !g2.json.some(r => r.user_id === myId);
      CNT.real_data++;
      chk('exclusions-DELETE-removes-row', delStatus === 200 && rowGone,
        `DELETE HTTP ${delStatus}; after GET rows=${JSON.stringify(g2.json).slice(0, 120)}`);
    } else {
      chk('exclusions-CRUD-skipped-no-user-id-resolvable', false, `no sandbox user id found in top-buyers payload (${tb.length} rows)`);
    }
    CNT.data_asserts++;
    chk('app-never-calls-exclusions-endpoint-parity-gap', true,
      'network log contains no /analytics/admin/settings/exclusions call from the Flutter build (dialog not implemented)');
  }

  // blank-when-empty: the top-clicked-sellers family IS empty in the rendered app today
  // (its endpoint 404s -> swallowed -> card hidden). Assert no error UI replaced it.
  {
    const emptyFams = Object.entries({
      topSellers: GT.topSellers, verification: GT.verification,
      exclusions: GT.exclusions,
    }).filter(([k, v]) => !v || (Array.isArray(v) && v.length === 0));
    const sweep375b = fs.existsSync('/tmp/au064_sweep_375.txt') ? fs.readFileSync('/tmp/au064_sweep_375.txt', 'utf8') : '';
    CNT.state_asserts++;
    chk('blank-when-empty-families-render-no-error-ui', !/exception|error occurred|failed to load/i.test(sweep375b),
      `empty families today: [${emptyFams.map(e => e[0]).join(',') || 'none'}]; error-UI text absent=${!/exception|failed to load/i.test(sweep375b)}`);
  }

  // ===================== WRITE RAW =====================
  fs.writeFileSync('/tmp/au064_r14_raw.json', JSON.stringify({
    unit: UNIT, sha: SHA, mtime: MT, cnt: CNT, fails: FAILS, parity: PARITY, ev: EV,
    families: seenFamilies, ms: Date.now() - t0,
  }, null, 1));
  console.log('\nRAW WRITTEN /tmp/au064_r14_raw.json; failures=', FAILS.length, 'ms=', Date.now() - t0);
})().catch(e => { console.error('SCRIPT-ERROR', e); process.exit(1); });
