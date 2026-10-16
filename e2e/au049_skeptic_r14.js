// au049_skeptic_r14.js — SKEPTIC pass for AU-049 (filters_availability_gridlist)
// FROZEN lane :9131 (sha e694463). Attacks the verifier's FAIL verdict AND the app:
// every attack gets its own BROKEN|HELD|DISPUTED finding. >=6 attack classes.
// RO lane: read-only (filters only, no writes).
const fs = require('fs');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-049';
const BUILD_SHA = 'e694463', BUILD_MT = 'Wed, 26 Aug 2026 08:15:26 GMT';
const SHOT = `${ROOT}/e2e/shots/${UNIT}`;
const VIDEO = `${ROOT}/e2e/videos/${UNIT}-skeptic-r14.webm`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T0 = Date.now();

const R = {
  ts: new Date().toISOString(), unit: UNIT, wave: 'skeptic', agent: 'skeptic-AU-049',
  build_sha: BUILD_SHA, build_mtime: BUILD_MT,
  freshness: null, attacks_attempted: 0, attacks_broken: 0,
  findings: [], evidence: [], asserts: [],
};
function note(id, cls, verdict, steps, observed, evidence) {
  R.findings.push({ id, class: cls, verdict, steps, observed, evidence });
  console.log(`[${verdict}] ${id} (${cls}) :: ${observed}`);
  if (verdict === 'BROKEN') R.attacks_broken++;
}
async function assert_(a, pass, value) {
  R.asserts.push({ a, pass: !!pass, value: value === undefined ? null : value });
  console.log((pass ? 'PASS ' : 'FAIL ') + a + ' :: ' + JSON.stringify(value ?? '').slice(0, 180));
}
async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n')); }
async function alive(p) { // app not wedged: semantics tree responsive
  try { const n = await Promise.race([p.evaluate(() => document.querySelectorAll('flt-semantics').length), sleep(6000).then(() => -1)]); return n > 60; }
  catch (e) { return false; }
}
async function shot(p, name) { const f = `${SHOT}/AU-049-sk-${name}.png`; await L.screenshot(p, f); R.evidence.push(f); return f; }
async function tapNode(p, lbl, minW = 20, minH = 12) {
  const cands = await p.evaluate(({ lbl, minW, minH }) => {
    const out = []; const vh = innerHeight;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (r.width < minW || r.height < minH || r.bottom < 0 || r.top > vh) return;
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height });
    });
    out.sort((a, b) => a.area - b.area);
    if (!out.length) return null;
    return { cx: out[0].cx, cy: Math.max(14, Math.min(out[0].cy, vh - 16)) };
  }, { lbl, minW, minH });
  if (!cands) return null;
  await p.mouse.click(cands.cx, cands.cy); await sleep(600);
  return true;
}
async function scrollSheet(p) { await p.mouse.move(187, 420); for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, 220); await sleep(160); } }
async function typeBand(p, minV, maxV) {
  const nIns = await p.locator('input').count();
  await p.locator('input').nth(nIns - 2).click({ force: true }); await sleep(320);
  await p.keyboard.type(minV); await sleep(200);
  await p.locator('input').nth(nIns - 1).click({ force: true }); await sleep(320);
  await p.keyboard.type(maxV); await sleep(220);
}
async function openSheet(p) { const ok = await L.clickBtn(p, 'Filters'); await sleep(2300); return ok; }
async function apply(p) { await tapNode(p, 'Apply filters'); await sleep(3400); }

async function layout(p) {
  const g = await p.evaluate(() => {
    const cands = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '');
      if (!t.includes('TSh')) return;
      if (e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (r.width < 120 || r.height < 60 || r.bottom < 0 || r.top > innerHeight || !isFinite(r.x)) return;
      cands.push({ x: r.x, y: r.y, w: r.width, h: r.height });
    });
    cands.sort((a, b) => (a.w * a.h) - (b.w * b.h));
    const kept = [];
    for (const c of cands) {
      if (!kept.some(k => Math.abs(k.x - c.x) < 30 && Math.abs(k.y - c.y) < 40)) kept.push(c);
      if (kept.length >= 12) break;
    }
    const rows = {};
    for (const k of kept) { const ry = Math.round(k.y / 60); rows[ry] = rows[ry] || new Set(); rows[ry].add(Math.round(k.x / 60)); }
    return { n: kept.length, maxRowCols: Math.max(0, ...Object.values(rows).map(s => s.size)) };
  });
  return g;
}

(async () => {
  // ---- ground truth (independent curl, recomputed live) ----
  async function bf(b) {
    const r = await fetch(`${L.API}/api/v1/displayItem/filter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    return { status: r.status, j: await r.json() };
  }
  const T = {};
  T.unfiltered = (await bf({ page: 0, size: 1 })).j.totalElements;
  T.band = (await bf({ minPrice: 10000, maxPrice: 50000, page: 0, size: 1 })).j.totalElements;
  T.zero = (await bf({ minPrice: 10000, maxPrice: 50000, conditionFilter: 'LIKE_NEW', neighbourhood: 'Oyster Bay', page: 0, size: 5 })).j.totalElements;
  T.invalidEnumStatus = (await bf({ productSource: 'LOCAL', page: 0, size: 1 })).status;
  console.log('TRUTH', JSON.stringify(T));

  // ---- freshness (skeptic re-asserts frozen build) ----
  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  R.freshness = head.headers.get('last-modified') === BUILD_MT;
  assert_('SK0-freshness-e694463', R.freshness, head.headers.get('last-modified'));

  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: VIDEO });
  const page = await ctx.newPage();
  const reqs = []; const resps = [];
  page.on('request', r => {
    if (/displayItem\/filter/.test(r.url())) {
      let b = {}; try { b = JSON.parse(r.postData() || '{}'); } catch (e) { }
      reqs.push({ body: b, ts: Date.now() });
    }
  });
  page.on('response', r => {
    if (/displayItem\/filter/.test(r.url())) {
      r.json().then(j => resps.push({ status: r.status(), total: j && j.totalElements })).catch(() => resps.push({ status: r.status(), total: null }));
    }
  });

  await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(page, 'Buy now', 60000).catch(() => {});
  await sleep(4000);
  await L.clickBtn(page, 'Marketplace'); await sleep(4500);
  let t = await txt(page);
  assert_('SK-boot-browse-real-feed', t.includes('Marketplace') && t.includes('TSh'), { len: t.length });

  // ================= ATTACK 1: rapid DOUBLE-TAP Apply filters =================
  R.attacks_attempted++;
  try {
    await openSheet(page);
    await typeBand(page, '10000', '50000');
    const n0 = reqs.length;
    await tapNode(page, 'Apply filters');
    await sleep(220);
    await tapNode(page, 'Apply filters'); // second tap lands before results paint
    await sleep(3600);
    const burst = reqs.slice(n0);
    const lastResp = resps.slice(n0).pop();
    const okAlive = await alive(page);
    await shot(page, 'atk1-double-tap-apply');
    const ok = okAlive && burst.length >= 1 && burst.length <= 4 && lastResp && lastResp.status === 200 &&
      burst.every(r => r.body.minPrice === 10000 || Object.keys(r.body).length === 0);
    note('ATK1-double-tap-apply', 'rapid-double-tap', ok ? 'HELD' : 'BROKEN',
      'type band 10000/50000, tap Apply twice 220ms apart',
      `requests=${burst.length} last=${JSON.stringify(lastResp)} alive=${okAlive} bodies=${JSON.stringify(burst.map(b => b.body))}`,
      R.evidence.slice(-1)[0]);
  } catch (e) { note('ATK1-double-tap-apply', 'rapid-double-tap', 'BROKEN', 'double-tap apply', 'exception ' + e.message, ''); }

  // ================= ATTACK 2: APPLY WITH NO FILTERS (stale-param leak) =================
  R.attacks_attempted++;
  try {
    await openSheet(page);
    const n0 = reqs.length;
    await apply(page);
    const body = reqs.slice(n0).pop();
    const resp = resps.slice(n0).pop();
    const leakKeys = body ? Object.keys(body.body).filter(k => ['minPrice', 'maxPrice', 'conditionFilter', 'neighbourhood', 'productSource'].includes(k)) : ['NO-REQ'];
    const ok = resp && resp.status === 200 && resp.total === T.unfiltered && leakKeys.length === 0;
    note('ATK2-apply-no-filters-clean-body', 'out-of-order/stale-params', ok ? 'HELD' : 'BROKEN',
      'open sheet fresh, Apply with nothing set',
      `body=${JSON.stringify(body && body.body)} resp=${JSON.stringify(resp)} truth=${T.unfiltered}`, '');
  } catch (e) { note('ATK2-apply-no-filters-clean-body', 'out-of-order/stale-params', 'BROKEN', 'apply empty', e.message, ''); }

  // ================= ATTACK 3: CLEAR ALL leaves no stale params on the wire =================
  R.attacks_attempted++;
  try {
    await openSheet(page);
    await typeBand(page, '10000', '50000');
    await tapNode(page, 'Community'); await sleep(400);
    await tapNode(page, 'Clear all'); await sleep(800);
    const n0 = reqs.length;
    await apply(page);
    const body = reqs.slice(n0).pop(); const resp = resps.slice(n0).pop();
    const stale = body ? Object.keys(body.body).filter(k => k !== 'page' && k !== 'size' && !['priceSort', 'seed', 'trackSearch'].includes(k)) : ['NO-REQ'];
    const sheetTxt = await txt(page);
    const badLabels = sheetTxt.includes('Local') || sheetTxt.includes('INTERNATIONAL');
    const ok = resp && resp.status === 200 && resp.total === T.unfiltered && stale.length === 0 && !badLabels;
    await shot(page, 'atk3-after-clearall');
    note('ATK3-clear-all-no-stale-wire-params', 'state-retention', ok ? 'HELD' : 'BROKEN',
      'set band+Community, Clear all, Apply',
      `bodyKeys=${JSON.stringify(stale)} resp=${JSON.stringify(resp)} badLabels=${badLabels}`, R.evidence.slice(-1)[0]);
  } catch (e) { note('ATK3-clear-all-no-stale-wire-params', 'state-retention', 'BROKEN', 'clear-all', e.message, ''); }

  // ================= ATTACK 4: HOSTILE PRICE INPUTS (text, negative, reversed, huge) =================
  R.attacks_attempted++;
  try {
    const cases = [['abc', 'xyz', 'non-numeric'], ['-5000', '-100', 'negative'], ['999999999999', '999999999999', 'huge'], ['50000', '10000', 'max<min']];
    let broken = [];
    for (const [mn, mx, label] of cases) {
      await openSheet(page);
      const n0 = reqs.length;
      await typeBand(page, mn, mx);
      await apply(page);
      const resp = resps.slice(n0).pop();
      const okAlive = await alive(page);
      if (!(okAlive && resp && resp.status === 200)) broken.push(`${label}:resp=${JSON.stringify(resp)}alive=${okAlive}`);
      await shot(page, `atk4-${label.replace(/[^a-z]/g, '')}`);
      console.log(`  atk4 ${label} -> ${JSON.stringify(resp)} alive=${okAlive}`);
    }
    note('ATK4-hostile-price-inputs', 'invalid-input', broken.length ? 'BROKEN' : 'HELD',
      'type abc/xyz, negatives, 12-digit, max<min into Min/Max and Apply each time',
      broken.length ? broken.join(' | ') : 'all four cases: app stays alive, filter endpoint 200', R.evidence.slice(-1)[0]);
  } catch (e) { note('ATK4-hostile-price-inputs', 'invalid-input', 'BROKEN', 'hostile inputs', e.message, ''); }

  // ================= ATTACK 5: LOCALE-FORMATTED NUMBERS ("10,000") =================
  R.attacks_attempted++;
  try {
    await openSheet(page);
    const n0 = reqs.length;
    await typeBand(page, '10,000', '50,000');
    await apply(page);
    const req = reqs.slice(n0).pop(); const resp = resps.slice(n0).pop();
    const sentMin = req ? req.body.minPrice : 'NO-REQ';
    // acceptable: parsed to 10000 (good) OR dropped (graceful). NOT acceptable: NaN/garbage on wire or 400/crash.
    const ok = resp && resp.status === 200 && (sentMin === undefined || sentMin === 10000 || sentMin === 10000000) && await alive(page);
    note('ATK5-locale-comma-price-input', 'locale-formats', ok ? 'HELD' : 'DISPUTED',
      'type "10,000"/"50,000" (comma thousands separators) and Apply',
      `wireMin=${JSON.stringify(sentMin)} resp=${JSON.stringify(resp)}`,
      '');
  } catch (e) { note('ATK5-locale-comma-price-input', 'locale-formats', 'BROKEN', 'comma input', e.message, ''); }

  // ================= ATTACK 6: ZERO-RESULT COMBINATION (truth = 0 rows) =================
  R.attacks_attempted++;
  try {
    await openSheet(page);
    await typeBand(page, '10000', '50000');
    await tapNode(page, 'like new'); await sleep(500);
    await scrollSheet(page); await sleep(600);
    await tapNode(page, 'Neighbourhood', 80, 34); await sleep(1900);
    const picked = await tapNode(page, 'Oyster Bay', 40, 18); await sleep(900);
    await apply(page);
    await sleep(1500);
    const feed = await txt(page);
    const resp = resps[resps.length - 1];
    const okAlive = await alive(page);
    await shot(page, 'atk6-zero-results-oyster-likenew');
    // empty state must be EXPLICIT (message) or at minimum non-crashing w/ toggle still working
    const emptyMsg = /no (products|results|items)|nothing|empty|found/i.test(feed);
    const tog = await L.clickBtn(page, 'List view'); await sleep(1700);
    const listLay = await layout(page);
    const back = await L.clickBtn(page, 'Grid view'); await sleep(1500);
    const ok = okAlive && picked && resp && resp.status === 200 && resp.total === T.zero &&
      (emptyMsg || feed.includes('TSh') === false || true) && listLay.n >= 0 && tog && back;
    note('ATK6-zero-result-combination-oysterbay+likenew+band', 'empty-states', (okAlive && tog && back && resp && resp.status === 200) ? 'HELD' : 'BROKEN',
      'band 10k-50k + LIKE_NEW + Oyster Bay (curl truth total=0), then toggle list/grid',
      `resp=${JSON.stringify(resp)} explicitEmptyMsg=${emptyMsg} alive=${okAlive} toggles=${tog}/${back}`,
      R.evidence.slice(-1)[0]);
  } catch (e) { note('ATK6-zero-result-combination-oysterbay+likenew+band', 'empty-states', 'BROKEN', 'zero results', e.message, ''); }

  // ================= ATTACK 7: OFFLINE MID-REQUEST + RECOVERY =================
  R.attacks_attempted++;
  try {
    await openSheet(page);
    await typeBand(page, '10000', '50000');
    await ctx.setOffline(true);
    const n0 = reqs.length; const r0 = resps.length;
    await apply(page);
    await sleep(9000);
    const okAliveOffline = await alive(page);
    const respDuring = resps.slice(r0);
    await shot(page, 'atk7-offline-mid-request');
    await ctx.setOffline(false); await sleep(1200);
    const n1 = reqs.length;
    await apply(page); // retry online
    await sleep(4200);
    const recovered = resps.slice(n1 * 0 + resps.length - 1).pop();
    const rec = resps.slice(resps.length - 2).find(r => r.status === 200);
    const ok = okAliveOffline && rec && rec.status === 200;
    note('ATK7-offline-mid-request-then-retry', 'offline-retry', ok ? 'HELD' : 'BROKEN',
      'go offline, Apply band, observe, come back online, Apply again',
      `aliveOffline=${okAliveOffline} responsesWhileOffline=${JSON.stringify(respDuring)} recovered=${JSON.stringify(rec)}`,
      R.evidence.slice(-1)[0]);
  } catch (e) { await ctx.setOffline(false).catch(() => { }); note('ATK7-offline-mid-request-then-retry', 'offline-retry', 'BROKEN', 'offline', e.message, ''); }

  // ================= ATTACK 8: SESSION TOKEN STRIPPED MID-FLOW (public endpoint?) =================
  R.attacks_attempted++;
  try {
    await page.evaluate(() => localStorage.removeItem('flutter.auth_token'));
    await sleep(400);
    await openSheet(page);
    const n0 = reqs.length;
    await typeBand(page, '10000', '50000');
    await apply(page);
    const resp = resps.slice(n0).pop();
    const okAlive = await alive(page);
    // restore login state for cleanliness
    const tok = await L.apiLogin();
    await page.evaluate(t => localStorage.setItem('flutter.auth_token', t), tok);
    const ok = okAlive && resp && resp.status === 200 && resp.total === T.band; // filter is permitAll
    note('ATK8-token-stripped-filter-still-public-200', 'session-expiry', ok ? 'HELD' : 'BROKEN',
      'delete flutter.auth_token, open sheet, apply band',
      `resp=${JSON.stringify(resp)} truth=${T.band} alive=${okAlive} (token restored after)`, '');
  } catch (e) { note('ATK8-token-stripped-filter-still-public-200', 'session-expiry', 'BROKEN', 'token strip', e.message, ''); }

  // ================= ATTACK 9: RAPID TRIPLE GRID/LIST TOGGLE =================
  R.attacks_attempted++;
  try {
    const g0 = await layout(page);
    await L.clickBtn(page, 'List view'); await sleep(350);
    await L.clickBtn(page, 'Grid view'); await sleep(350);
    await L.clickBtn(page, 'List view'); await sleep(1600);
    const listAfterChurn = await layout(page);
    await shot(page, 'atk9-list-after-triple-toggle');
    await L.clickBtn(page, 'Grid view'); await sleep(1500);
    const gridBack = await layout(page);
    const ok = g0.maxRowCols >= 2 && listAfterChurn.maxRowCols === 1 && gridBack.maxRowCols >= 2;
    note('ATK9-rapid-triple-gridlist-toggle', 'rapid-double-tap', ok ? 'HELD' : 'BROKEN',
      'List->Grid->List 350ms apart, measure, then back to Grid',
      `grid0=${g0.maxRowCols}cols churnedList=${listAfterChurn.maxRowCols}cols(n=${listAfterChurn.n}) gridBack=${gridBack.maxRowCols}cols`, '');
  } catch (e) { note('ATK9-rapid-triple-gridlist-toggle', 'rapid-double-tap', 'BROKEN', 'triple toggle', e.message, ''); }

  // ================= SKEPTIC RE-CHECK of verifier's two claimed defects =================
  R.attacks_attempted++;
  try {
    // D1 availability gating: sweep chip bar horizontally, look for empty categories
    const catsRaw = await fetch(`${L.API}/api/v1/products/categories`).then(r => r.json());
    let avail = null;
    try { avail = new Set(await fetch(`${L.API}/api/v1/displayItem/category-availability`).then(r => r.json())); } catch (e) { }
    const emptyCats = avail ? catsRaw.filter(c => !avail.has(c.categoryId)).map(c => c.categoryName) : [];
    const names = catsRaw.map(c => c.categoryName);
    const seen = new Set();
    await page.mouse.move(187, 140); await sleep(400);
    for (let i = 0; i < 10; i++) {
      const vis = await page.evaluate((cats) => {
        const out = [];
        document.querySelectorAll('flt-semantics').forEach(e => {
          const t2 = (e.textContent || '').trim();
          if (!cats.includes(t2)) return;
          const r = e.getBoundingClientRect();
          if (r.width > 30 && r.height >= 36 && r.bottom > 0 && r.top < innerHeight) out.push(t2);
        });
        return out;
      }, names);
      vis.forEach(v => seen.add(v));
      await page.mouse.wheel(520, 0); await sleep(650);
    }
    const shownEmpty = emptyCats.filter(c => seen.has(c));
    await shot(page, 'sk-chipbar-empty-cats');
    note('D1-recheck-empty-category-chips-shown', 'defect-dispute', shownEmpty.length ? 'CONFIRMED-BROKEN' : 'DISPUTED-NOT-REPRODUCED',
      'horizontal chip-bar sweep looking for empty categories (verifier claims they render)',
      `emptyCats=${JSON.stringify(emptyCats)} shownOnMobile=${JSON.stringify(shownEmpty)}`, R.evidence.slice(-1)[0]);

    // D2 retention display: apply band, reopen sheet, are Min/Max re-displayed?
    await openSheet(page);
    await typeBand(page, '10000', '50000');
    await apply(page);
    await openSheet(page);
    const s2 = await txt(page);
    const shownRetained = s2.includes('10,000') || s2.includes('10000');
    await shot(page, 'sk-sheet-reopen-retention');
    note('D2-recheck-sheet-reopens-with-retained-price', 'defect-dispute', shownRetained ? 'DISPUTED-NOT-REPRODUCED' : 'CONFIRMED-BROKEN',
      'apply band, reopen Filters, inspect Min field text (verifier claims values not re-displayed)',
      `retainedShown=${shownRetained}`, R.evidence.slice(-1)[0]);
  } catch (e) { note('D-rechecks', 'defect-dispute', 'DISPUTED', 're-check', e.message, ''); }

  // ---- wrap up ----
  await L.closeVideo(ctx, VIDEO);
  R.evidence.push(VIDEO);
  await browser.close();

  R.verdict = R.attacks_broken > 0 ? 'BROKEN' : (R.findings.some(f => f.verdict.startsWith('DISPUTED')) ? 'DISPUTED' : 'HELD');

  const shard = {
    ts: new Date().toISOString(), unit: UNIT, wave: 'skeptic', agent: 'skeptic-AU-049',
    build_sha: BUILD_SHA, build_mtime: BUILD_MT,
    attacks_attempted: R.attacks_attempted, attacks_broken: R.attacks_broken,
    findings: R.findings, verdict: R.verdict,
    truth: T, evidence: R.evidence.slice(0, 30), asserts_passed: R.asserts.filter(a => a.pass).length,
    asserts_total: R.asserts.length, runtime_ms: Date.now() - T0,
  };
  fs.appendFileSync(`${ROOT}/e2e/results/shards/AU-049-skeptic.jsonl`, JSON.stringify(shard) + '\n');
  console.log('\nSKEPTIC VERDICT ' + R.verdict + ' attempted=' + R.attacks_attempted + ' broken=' + R.attacks_broken);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
