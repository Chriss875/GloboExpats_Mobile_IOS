// au049_skeptic_r14b.js — SKEPTIC pass v2 for AU-049, PER-ATTACK ISOLATION.
// v1 (au049_skeptic_r14.js) found that the sheet RETAINS draft values across
// reopen, so sequential attacks contaminated each other (garbage price from one
// attack leaked into the next -> 400s that were not caused by the attack under
// test). v2 reloads the app fresh before EVERY attack and uses a robust
// liveness probe (Filters chrome control reachable + semantics tree populated).
const fs = require('fs');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-049';
const BUILD_SHA = 'e694463', BUILD_MT = 'Wed, 26 Aug 2026 08:15:26 GMT';
const SHOT = `${ROOT}/e2e/shots/${UNIT}`;
const VIDEO = `${ROOT}/e2e/videos/${UNIT}-skeptic-r14b.webm`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T0 = Date.now();

const R = {
  ts: new Date().toISOString(), unit: UNIT, wave: 'skeptic', agent: 'skeptic-AU-049',
  build_sha: BUILD_SHA, build_mtime: BUILD_MT, run: 'r14b-isolated',
  freshness: null, attacks_attempted: 0, attacks_broken: 0,
  findings: [], evidence: [], asserts: [],
};
function note(id, cls, verdict, steps, observed, evidence) {
  R.findings.push({ id, class: cls, verdict, steps, observed, evidence });
  console.log(`[${verdict}] ${id} (${cls}) :: ${observed}`);
  if (verdict === 'BROKEN') R.attacks_broken++;
}
async function assert_(a, pass, value) { R.asserts.push({ a, pass: !!pass }); console.log((pass ? 'PASS ' : 'FAIL ') + a); }
async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n')); }
// LIVENESS: browse chrome still interactive (Filters button resolvable) + tree populated
async function alive(p) {
  try {
    const ok = await Promise.race([
      p.evaluate(() => {
        let n = 0, filt = false;
        document.querySelectorAll('flt-semantics').forEach(e => {
          n++;
          if ((e.textContent || '').trim() === 'Filters') filt = true;
        });
        return n >= 10 && filt;
      }),
      sleep(8000).then(() => false),
    ]);
    return !!ok;
  } catch (e) { return false; }
}
async function shot(p, name) { const f = `${SHOT}/AU-049-sk2-${name}.png`; await L.screenshot(p, f); R.evidence.push(f); return f; }
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
// FRESH boot of browse for isolation
async function boot(page) {
  await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(page, 'Buy now', 60000).catch(() => {});
  await sleep(3500);
  await L.clickBtn(page, 'Marketplace'); await sleep(4500);
}
async function layout(p) {
  return p.evaluate(() => {
    const cands = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '');
      if (!t.includes('TSh')) return;
      if (e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (r.width < 120 || r.height < 60 || r.bottom < 0 || r.top > innerHeight || !isFinite(r.x)) return;
      cands.push({ x: r.x, y: r.y });
    });
    cands.sort((a, b) => 0);
    const kept = [];
    for (const c of cands) { if (!kept.some(k => Math.abs(k.x - c.x) < 30 && Math.abs(k.y - c.y) < 40)) kept.push(c); if (kept.length >= 12) break; }
    const rows = {};
    for (const k of kept) { const ry = Math.round(k.y / 60); rows[ry] = rows[ry] || new Set(); rows[ry].add(Math.round(k.x / 60)); }
    return { n: kept.length, maxRowCols: Math.max(0, ...Object.values(rows).map(s => s.size)) };
  });
}

(async () => {
  async function bf(b) {
    const r = await fetch(`${L.API}/api/v1/displayItem/filter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    return { status: r.status, j: await r.json() };
  }
  const T = {};
  T.unfiltered = (await bf({ page: 0, size: 1 })).j.totalElements;
  T.band = (await bf({ minPrice: 10000, maxPrice: 50000, page: 0, size: 1 })).j.totalElements;
  T.zero = (await bf({ minPrice: 10000, maxPrice: 50000, conditionFilter: 'LIKE_NEW', neighbourhood: 'Oyster Bay', page: 0, size: 5 })).j.totalElements;

  const head = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  R.freshness = head.headers.get('last-modified') === BUILD_MT;
  assert_('SK0-freshness-e694463', R.freshness, head.headers.get('last-modified'));

  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: VIDEO });
  const page = await ctx.newPage();
  let reqs = [], resps = [];
  function wire(pageObj) {
    pageObj.on('request', r => {
      if (/displayItem\/filter/.test(r.url())) {
        let b = {}; try { b = JSON.parse(r.postData() || '{}'); } catch (e) { }
        reqs.push({ body: b });
      }
    });
    pageObj.on('response', r => {
      if (/displayItem\/filter/.test(r.url())) {
        r.json().then(j => resps.push({ status: r.status(), total: j && j.totalElements })).catch(() => resps.push({ status: r.status(), total: null }));
      }
    });
  }
  wire(page);

  // ================= ATTACK 1: rapid DOUBLE-TAP Apply =================
  R.attacks_attempted++;
  try {
    await boot(page);
    await openSheet(page);
    await typeBand(page, '10000', '50000');
    const n0 = reqs.length;
    await tapNode(page, 'Apply filters');
    await sleep(250);
    await tapNode(page, 'Apply filters');
    await sleep(4500);
    const burst = reqs.slice(n0);
    const lastResp = resps.slice(n0).pop();
    const okAlive = await alive(page);
    await shot(page, 'atk1-double-tap-apply');
    // GOOD: <=2 requests, last is 200 with the right narrowed total, app alive
    const ok = okAlive && burst.length >= 1 && burst.length <= 2 && lastResp && lastResp.status === 200 && lastResp.total === T.band;
    note('ATK1-double-tap-apply', 'rapid-double-tap', ok ? 'HELD' : 'BROKEN',
      'type band 10000/50000, tap Apply twice 250ms apart',
      `requests=${burst.length} bodies=${JSON.stringify(burst.map(b => b.body))} last=${JSON.stringify(lastResp)} truth=${T.band} alive=${okAlive}`,
      R.evidence.slice(-1)[0]);
  } catch (e) { note('ATK1-double-tap-apply', 'rapid-double-tap', 'BROKEN', 'double-tap', e.message, ''); }

  // ================= ATTACK 2: APPLY WITH NO FILTERS (fresh boot, clean sheet) =================
  R.attacks_attempted++;
  try {
    await boot(page);
    await openSheet(page);
    const sheetTxt = await txt(page);
    const preDirty = sheetTxt.includes('10000') || sheetTxt.includes('10,000');
    const n0 = reqs.length;
    await apply(page);
    const body = reqs.slice(n0).pop();
    const resp = resps.slice(n0).pop();
    const leakKeys = body ? Object.keys(body.body).filter(k => ['minPrice', 'maxPrice', 'conditionFilter', 'neighbourhood', 'productSource'].includes(k)) : ['NO-REQ'];
    const okAlive = await alive(page);
    const ok = okAlive && resp && resp.status === 200 && resp.total === T.unfiltered && leakKeys.length === 0;
    note('ATK2-fresh-boot-apply-empty-clean', 'stale-params', ok ? 'HELD' : 'BROKEN',
      'fresh boot -> open sheet -> Apply with nothing set',
      `preDirtySheet=${preDirty} body=${JSON.stringify(body && body.body)} resp=${JSON.stringify(resp)} truth=${T.unfiltered} alive=${okAlive}`, '');
  } catch (e) { note('ATK2-fresh-boot-apply-empty-clean', 'stale-params', 'BROKEN', 'empty apply', e.message, ''); }

  // ================= ATTACK 3: CLEAR ALL leaves no stale params =================
  R.attacks_attempted++;
  try {
    await boot(page);
    await openSheet(page);
    await typeBand(page, '10000', '50000');
    await scrollSheet(page); await sleep(400);
    await tapNode(page, 'Community'); await sleep(400);
    await tapNode(page, 'Clear all'); await sleep(900);
    const sheetTxt = await txt(page);
    const inputsCleared = !sheetTxt.includes('10000') && !sheetTxt.includes('10,000');
    const n0 = reqs.length;
    await apply(page);
    const body = reqs.slice(n0).pop(); const resp = resps.slice(n0).pop();
    const stale = body ? Object.keys(body.body).filter(k => !['page', 'size', 'priceSort', 'seed', 'trackSearch'].includes(k)) : ['NO-REQ'];
    const badLabels = sheetTxt.includes('Local') || sheetTxt.includes('INTERNATIONAL');
    const okAlive = await alive(page);
    await shot(page, 'atk3-after-clearall');
    const ok = okAlive && resp && resp.status === 200 && resp.total === T.unfiltered && stale.length === 0 && !badLabels;
    note('ATK3-clear-all-no-stale-wire-params', 'state-retention', ok ? 'HELD' : 'BROKEN',
      'set band+Community, Clear all, Apply',
      `inputsCleared=${inputsCleared} staleKeys=${JSON.stringify(stale)} resp=${JSON.stringify(resp)} truth=${T.unfiltered} badLabels=${badLabels}`,
      R.evidence.slice(-1)[0]);
  } catch (e) { note('ATK3-clear-all-no-stale-wire-params', 'state-retention', 'BROKEN', 'clear-all', e.message, ''); }

  // ================= ATTACK 4: HOSTILE PRICE INPUTS (isolated per case) =================
  R.attacks_attempted++;
  try {
    const cases = [['abc', 'xyz', 'nonnumeric'], ['-5000', '-100', 'negative'], ['999999999999', '999999999999', 'huge'], ['50000', '10000', 'maxltmin']];
    const obs = []; let brokenCount = 0;
    for (const [mn, mx, label] of cases) {
      await boot(page);
      await openSheet(page);
      const n0 = reqs.length;
      await typeBand(page, mn, mx);
      const wireReq = reqs.slice(n0 + 1); // none yet until apply
      await apply(page);
      const resp = resps.slice(n0).pop();
      const sentBody = reqs.slice(n0).pop();
      await sleep(1200);
      const okAlive = await alive(page);
      const feed = await txt(page);
      const tshGone = !feed.includes('TSh');
      await shot(page, `atk4-${label}`);
      // ACCEPTABLE: app alive afterwards AND either graceful empty/error UI or sane handling.
      // BROKEN: app wedged (chrome dead) OR silent fake results (200 w/ unfiltered total for garbage).
      const silentFake = resp && resp.status === 200 && resp.total === T.unfiltered && mn !== '' ;
      const detail = { case: label, sent: sentBody && { min: sentBody.body.minPrice, max: sentBody.body.maxPrice }, resp, aliveAfter: okAlive, feedLostProducts: tshGone };
      obs.push(detail);
      if (!okAlive || silentFake) brokenCount++;
      console.log(`  atk4 ${label}: ${JSON.stringify(detail)}`);
    }
    note('ATK4-hostile-price-inputs-isolated', 'invalid-input', brokenCount ? 'BROKEN' : 'HELD',
      'per-case fresh boot: type abc/xyz | negatives | 12-digit | max<min, Apply each time',
      JSON.stringify(obs), R.evidence.slice(-1)[0]);
  } catch (e) { note('ATK4-hostile-price-inputs-isolated', 'invalid-input', 'BROKEN', 'hostile inputs', e.message, ''); }

  // ================= ATTACK 5: LOCALE COMMA NUMBERS =================
  R.attacks_attempted++;
  try {
    await boot(page);
    await openSheet(page);
    const n0 = reqs.length;
    await typeBand(page, '10,000', '50,000');
    await apply(page);
    const req = reqs.slice(n0).pop(); const resp = resps.slice(n0).pop();
    const sentMin = req ? req.body.minPrice : 'NO-REQ';
    const okAlive = await alive(page);
    await shot(page, 'atk5-comma-price');
    // HELD if parsed correctly (10000) or dropped cleanly; BROKEN if garbage reaches wire / app dies
    const ok = okAlive && resp && resp.status === 200 && (sentMin === undefined || sentMin === 10000);
    note('ATK5-locale-comma-price-input', 'locale-formats', ok ? 'HELD' : (resp && resp.status === 400 ? 'BROKEN' : 'DISPUTED'),
      'type "10,000"/"50,000" (comma thousands separators) and Apply',
      `wireMin=${JSON.stringify(sentMin)} wireMax=${JSON.stringify(req && req.body.maxPrice)} resp=${JSON.stringify(resp)} alive=${okAlive}`,
      R.evidence.slice(-1)[0]);
  } catch (e) { note('ATK5-locale-comma-price-input', 'locale-formats', 'BROKEN', 'comma input', e.message, ''); }

  // ================= ATTACK 6: ZERO-RESULT COMBINATION (clean state) =================
  R.attacks_attempted++;
  try {
    await boot(page);
    await openSheet(page);
    await typeBand(page, '10000', '50000');
    await tapNode(page, 'like new'); await sleep(500);
    await scrollSheet(page); await sleep(600);
    await tapNode(page, 'Neighbourhood', 80, 34); await sleep(1900);
    const picked = await tapNode(page, 'Oyster Bay', 40, 18); await sleep(900);
    const n0 = reqs.length;
    await apply(page);
    await sleep(2000);
    const resp = resps.slice(n0).pop();
    const feed = await txt(page);
    const emptyMsg = /no (products|results|items)|nothing (to )?(show|see)|found|try (adjusting|different)/i.test(feed);
    const okAlive = await alive(page);
    await shot(page, 'atk6-zero-results');
    const tog = await L.clickBtn(page, 'List view'); await sleep(1800);
    const listLay = await layout(page);
    const back = await L.clickBtn(page, 'Grid view'); await sleep(1600);
    const ok = picked && okAlive && tog && back && resp && resp.status === 200 && resp.total === T.zero && (emptyMsg || listLay.n === 0);
    note('ATK6-zero-result-band+likenew+oysterbay', 'empty-states', ok ? 'HELD' : 'DISPUTED',
      'band 10k-50k + LIKE_NEW + Oyster Bay (curl truth total=0), inspect empty UI, toggle views',
      `resp=${JSON.stringify(resp)} truth=${T.zero} explicitEmptyMsg=${emptyMsg} alive=${okAlive} toggles=${tog}/${back}`,
      R.evidence.slice(-1)[0]);
  } catch (e) { note('ATK6-zero-result-band+likenew+oysterbay', 'empty-states', 'BROKEN', 'zero results', e.message, ''); }

  // ================= ATTACK 7: OFFLINE MID-REQUEST + RETRY =================
  R.attacks_attempted++;
  try {
    await boot(page);
    await openSheet(page);
    await typeBand(page, '10000', '50000');
    await ctx.setOffline(true);
    const r0 = resps.length;
    await apply(page);
    await sleep(9000);
    const okAliveOffline = await alive(page);
    const feedOffline = await txt(page);
    await shot(page, 'atk7-offline');
    await ctx.setOffline(false); await sleep(1500);
    const n1 = reqs.length; const rr1 = resps.length;
    await openSheet(page); // sheet should still be up; re-apply
    await apply(page);
    await sleep(4200);
    const rec = resps.slice(rr1).find(r => r.status === 200);
    const okAliveBack = await alive(page);
    await shot(page, 'atk7-recovered');
    const ok = okAliveOffline && rec && rec.status === 200 && okAliveBack;
    note('ATK7-offline-mid-request-then-retry', 'offline-retry', ok ? 'HELD' : 'BROKEN',
      'offline -> Apply band (observe) -> online -> Apply again',
      `aliveOffline=${okAliveOffline} respWhileOffline=${JSON.stringify(resps.slice(r0))} recovered=${JSON.stringify(rec)} aliveBack=${okAliveBack}`,
      R.evidence.slice(-2)[0] || '');
  } catch (e) { await ctx.setOffline(false).catch(() => { }); note('ATK7-offline-mid-request-then-retry', 'offline-retry', 'BROKEN', 'offline', e.message, ''); }

  // ================= ATTACK 8: SESSION TOKEN STRIPPED MID-FLOW =================
  R.attacks_attempted++;
  try {
    await boot(page);
    await page.evaluate(() => localStorage.removeItem('flutter.auth_token'));
    await sleep(600);
    const sheetOk = await openSheet(page);
    const n0 = reqs.length;
    await typeBand(page, '10000', '50000');
    await apply(page);
    const resp = resps.slice(n0).pop();
    const okAlive = await alive(page);
    // restore auth state
    const tok = await L.apiLogin();
    await page.evaluate(t => localStorage.setItem('flutter.auth_token', t), tok);
    await shot(page, 'atk8-token-stripped');
    const ok = sheetOk && okAlive && resp && resp.status === 200 && resp.total === T.band;
    note('ATK8-token-stripped-filter-still-public-200', 'session-expiry', ok ? 'HELD' : 'BROKEN',
      'delete flutter.auth_token mid-session, open sheet, apply band (filter endpoint is permitAll)',
      `sheetOpened=${sheetOk} resp=${JSON.stringify(resp)} truth=${T.band} alive=${okAlive} (token restored after)`,
      R.evidence.slice(-1)[0]);
  } catch (e) { note('ATK8-token-stripped-filter-still-public-200', 'session-expiry', 'BROKEN', 'token strip', e.message, ''); }

  // ================= ATTACK 9: TRIPLE GRID/LIST TOGGLE =================
  R.attacks_attempted++;
  try {
    await boot(page);
    const g0 = await layout(page);
    await L.clickBtn(page, 'List view'); await sleep(350);
    await L.clickBtn(page, 'Grid view'); await sleep(350);
    await L.clickBtn(page, 'List view'); await sleep(1700);
    const listAfterChurn = await layout(page);
    await shot(page, 'atk9-list-after-triple-toggle');
    await L.clickBtn(page, 'Grid view'); await sleep(1600);
    const gridBack = await layout(page);
    const ok = g0.maxRowCols >= 2 && listAfterChurn.maxRowCols === 1 && gridBack.maxRowCols >= 2;
    note('ATK9-rapid-triple-gridlist-toggle', 'rapid-toggle', ok ? 'HELD' : 'BROKEN',
      'List->Grid->List 350ms apart, measure, back to Grid',
      `grid0=${g0.maxRowCols}cols churnedList=${listAfterChurn.maxRowCols}cols(n=${listAfterChurn.n}) gridBack=${gridBack.maxRowCols}cols`, '');
  } catch (e) { note('ATK9-rapid-triple-gridlist-toggle', 'rapid-toggle', 'BROKEN', 'triple toggle', e.message, ''); }

  // ================= ATTACK 10: DEFECT RE-CHECKS (verifier's D1/D2) =================
  R.attacks_attempted++;
  try {
    await boot(page);
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
    await shot(page, 'sk2-chipbar-empty-cats');
    note('D1-recheck-empty-category-chips-shown', 'defect-dispute', shownEmpty.length ? 'CONFIRMED-BROKEN' : 'NOT-REPRODUCED',
      'horizontal chip-bar sweep looking for categories with zero available items',
      `emptyPerAvailability=${JSON.stringify(emptyCats)} renderedOnMobile=${JSON.stringify(shownEmpty)}`, R.evidence.slice(-1)[0]);

    await openSheet(page);
    await typeBand(page, '10000', '50000');
    await apply(page);
    await openSheet(page);
    const s2 = await txt(page);
    const retainedShown = s2.includes('10,000') || s2.includes('10000');
    await shot(page, 'sk2-sheet-reopen-retention');
    note('D2-recheck-sheet-reopens-with-retained-price', 'defect-dispute', retainedShown ? 'NOT-REPRODUCED' : 'CONFIRMED-BROKEN',
      'apply band, reopen Filters, inspect Min/Max field text',
      `valuesRedisplayed=${retainedShown}`, R.evidence.slice(-1)[0]);
  } catch (e) { note('D-rechecks', 'defect-dispute', 'DISPUTED', 're-check', e.message, ''); }

  // ---- wrap ----
  await L.closeVideo(ctx, VIDEO);
  R.evidence.push(VIDEO);
  await browser.close();

  const brokenFindings = R.findings.filter(f => f.verdict === 'BROKEN' || f.verdict === 'CONFIRMED-BROKEN');
  R.verdict = brokenFindings.some(f => f.class !== 'defect-dispute') ? 'BROKEN'
    : brokenFindings.length ? 'DISPUTED'
      : R.findings.some(f => f.verdict.startsWith('DISPUTED')) ? 'DISPUTED' : 'HELD';

  const shard = {
    ts: new Date().toISOString(), unit: UNIT, wave: 'skeptic', agent: 'skeptic-AU-049',
    build_sha: BUILD_SHA, build_mtime: BUILD_MT,
    attacks_attempted: R.attacks_attempted, attacks_broken: R.attacks_broken,
    findings: R.findings, verdict: R.verdict,
    truth: T, evidence: R.evidence.slice(0, 34),
    asserts_passed: R.asserts.filter(a => a.pass).length, asserts_total: R.asserts.length,
    runtime_ms: Date.now() - T0,
  };
  fs.appendFileSync(`${ROOT}/e2e/results/shards/AU-049-skeptic.jsonl`, JSON.stringify(shard) + '\n');
  console.log('\nSKEPTIC-v2 VERDICT ' + R.verdict + ' attempted=' + R.attacks_attempted + ' broken=' + R.attacks_broken);
  console.log(R.findings.map(f => `${f.verdict} ${f.id}`).join('\n'));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
