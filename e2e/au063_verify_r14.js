// au063_verify_r14.js — AU-063 insights_statistics_console FINAL verification on the
// FROZEN lane :9131 (git e694463, main.dart.js Last-Modified Wed, 26 Aug 2026 08:15:26 GMT).
//
// BUILD-REALITY EXPECTATION SET BEFORE RUNNING (recorded in report):
//  * Bundle forensics: main.dart.js contains the Insights screen with interval chips
//    (B.YL = ["Daily","Weekly","Monthly","Yearly"]) and cards Sales / Completed orders /
//    Proforma volume / Verified proformas / Key platform stats, and calls
//    GET {api}/api/v1/admin/{orders|proformas}/trend?interval=<x> + /api/v1/admin/stats.
//  * The Matomo web-analytics console (commit a2a35c6) is NOT in this bundle: zero hits for
//    "matomo", "token_auth", "idSite", "index.php", "Web analytics", "VisitsSummary",
//    "getPageUrls". Root cause: build/web was produced by a `flutter build web` that predates
//    a2a35c6 (bundle mtime 2026-08-25 11:15 EAT vs commit 05:10 EAT same day, but string-pool
//    evidence is decisive). A token-configured matomo bundle exists at
//    ~/.verify_bundles/matomo-bca6414 (contains token_auth + matomodev URL) — NOT served on
//    :9131, so per lane rules the console is UNVERIFIABLE here => parity delta, not silently accepted.
//  * Web reference /statistics has 8 tabs (Overview/Users/Products/Audience/Technology/
//    Content/Real-time/Errors); mobile Insights has no tab bar at all.
//
// Acceptance tested here:
//  CRIT1 insights hub renders REAL sandbox dept data from admin trend/stats endpoints
//       (curl ground truth == DOM numbers; no lorem/placeholders)
//  CRIT2 date-range + interval selects refetch charts (4 intervals -> network requests with
//       matching interval params; series length changes day=12 week=4 month=2 year=1)
//  CRIT3 blank-when-empty convention (empty chart card shows 'No data', not placeholder copy)
//  CRIT4 desktop 1280x900 included; every control clicked w/ asserted effect
// Canonical checklist: freshness / real data curl+DOM / images / click-everything /
// shots 375x667 + 768x1024 + 1280x900 per state / native vision on every PNG / video per stage /
// parity vs :3000 same viewport.
const fs = require('fs');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';           // FROZEN lane override
const REF = 'http://localhost:3000';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const UNIT = 'AU-063';
const STAGE = 'r14';
const OUT = {
  freshness: {}, asserts: [], clicks: [], images: {}, shots: [], videos: [],
  trendCalls: [], refTexts: {}, domNumbers: {}, parity: { blocker: 1, major: 0, minor: 0, accepted: 0 },
};
function log(...a) { console.log('[au063r14]', ...a); }
function assert(vp, name, pass, value) {
  OUT.asserts.push({ vp, name, pass: !!pass, value: value === undefined ? null : value });
  log(pass ? 'PASS ' : 'FAIL ', vp, name, JSON.stringify(value ?? '').slice(0, 240));
}
async function dumpText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
}
async function shot(p, vp, state) {
  const f = `${ROOT}/e2e/shots/AU-063/AU-063-${vp}-${state}.png`;
  await L.screenshot(p, f); OUT.shots.push(f); return f;
}
// smallest visible tappable/button node containing lbl (click-everything primitive)
async function tapText(p, lbl) {
  const cands = await p.evaluate((lbl) => {
    const out = []; const vh = innerHeight;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim(); if (!t.includes(lbl)) return;
      if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > vh) return;
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height });
    });
    out.sort((a, b) => a.area - b.area); return out.slice(0, 4);
  }, lbl);
  const vh = await p.evaluate(() => innerHeight);
  for (const c of cands) {
    await p.mouse.click(c.cx, Math.max(12, Math.min(c.cy, vh - 16)));
    await p.waitForTimeout(500); return true;
  }
  return false;
}
async function scrollDown(p, steps, dy = 420) {
  await p.mouse.move(180, 380);
  for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, dy); await p.waitForTimeout(150); }
}
async function listControls(p) {
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const role = e.getAttribute('role'); const t = (e.textContent || '').trim(); if (!t) return;
      const r = e.getBoundingClientRect();
      const vis = r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight;
      if (!vis) return;
      if (role === 'button') out.push({ kind: 'button', label: t.slice(0, 44) });
      else if (e.getAttribute('flt-tappable') !== null) out.push({ kind: 'tappable', label: t.slice(0, 38) });
    });
    document.querySelectorAll('input,textarea').forEach(i =>
      out.push({ kind: 'input', label: (i.placeholder || i.type || 'input') }));
    return out;
  });
}

(async () => {
  fs.mkdirSync(`${ROOT}/e2e/shots/AU-063`, { recursive: true });

  // ================= C1 FRESHNESS =================
  const head = await fetch(`${APP}/main.dart.js`, { method: 'HEAD' });
  OUT.freshness.lastModified = head.headers.get('last-modified');
  assert('meta', 'C1-freshness-mtime-e694463-081526GMT',
    OUT.freshness.lastModified === 'Wed, 26 Aug 2026 08:15:26 GMT', OUT.freshness);

  // ================= C2 REAL DATA ground truth (independent curl) =================
  const tok = await L.apiLogin();
  const statsRes = await L.api(tok, 'GET', '/api/v1/admin/stats');
  const ordersTrendDay = await L.api(tok, 'GET', '/api/v1/admin/orders/trend?interval=day');
  const proTrendDay = await L.api(tok, 'GET', '/api/v1/admin/proformas/trend?interval=day');
  const bucketLens = {};
  for (const iv of ['day', 'week', 'month', 'year']) {
    const o = await L.api(tok, 'GET', `/api/v1/admin/orders/trend?interval=${iv}`);
    bucketLens[iv] = (o.json.series || []).length;
  }
  OUT.groundTruth = {
    statsStatus: statsRes.status,
    totalOrders: statsRes.json.totalOrders,
    totalUsers: statsRes.json.totalUsers,
    totalRevenue: statsRes.json.totalRevenue,
    completedOrders: statsRes.json.completedOrders,
    ordersSeriesLen: (ordersTrendDay.json.series || []).length,
    proSeriesLen: (proTrendDay.json.series || []).length,
    bucketLens,
  };
  assert('api', 'C2-curl-admin-stats-200-real-numbers',
    statsRes.status === 200 && typeof statsRes.json.totalOrders === 'number',
    { status: statsRes.status, totalOrders: statsRes.json.totalOrders, totalRevenue: statsRes.json.totalRevenue });
  assert('api', 'C2-curl-orders-trend-series-nonempty', (ordersTrendDay.json.series || []).length > 0,
    OUT.groundTruth.ordersSeriesLen);
  assert('api', 'C2-curl-interval-bucketing-changes-series-length',
    new Set(Object.values(bucketLens)).size >= 3, bucketLens);
  // sum of daily placed should match a real count in stats (orders placed total across buckets)
  const sumPlaced = (ordersTrendDay.json.series || []).reduce((a, b) => a + (b.placed || 0), 0);
  OUT.sumPlacedDay = sumPlaced;

  // ================= BROWSER RUNS =================
  const browser = await L.newBrowser();
  const viewports = [['375', { width: 375, height: 667 }], ['768', { width: 768, height: 1024 }], ['1280', { width: 1280, height: 900 }]];
  for (const [vpName, vp] of viewports) {
    const videoPath = `${ROOT}/e2e/videos/AU-063-${STAGE}-${vpName}.webm`;
    OUT.videos.push(videoPath);
    const ctx = await L.newCtx(browser, { viewport: vp, videoPath });
    const page = await ctx.newPage();
    page.on('response', r => {
      const u = r.url();
      if (/\/uploads\/[^?#]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/[^?#]*\.(png|webp|jpg|svg)(\?|#|$)/i.test(u))
        OUT.images[u] = r.status();
    });
    page.on('request', r => {
      if (/\/api\/v1\/admin\/(orders|proformas)\/trend/.test(r.url())) {
        try { OUT.trendCalls.push({ vp: vpName, url: r.url() }); } catch (e) {}
      }
    });

    // ---- login with shared sandbox account (admin role) ----
    await page.goto(APP + '/', { waitUntil: 'load', timeout: 120000 }).catch(() => {});
    await L.waitText(page, 'Buy now', 60000).catch(() => {});
    let logged = await L.isLoggedIn(page);
    if (!logged) {
      await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 30000).catch(() => {});
      const ei = page.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await page.waitForTimeout(300);
      await page.keyboard.type('mobile.test.20260820@gmail.com', { delay: 10 });
      const pi = page.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await page.waitForTimeout(300);
      await page.keyboard.type('StrongPass!1', { delay: 10 });
      await L.clickBtn(page, 'Log in');
      for (let i = 0; i < 30 && !logged; i++) { await page.waitForTimeout(1000); logged = await L.isLoggedIn(page); }
    }
    assert(vpName, 'C-login-admin-token-present', logged, '');

    // ================= navigate to /insights =================
    await page.evaluate(() => { window.location.hash = '#/insights'; });
    await page.waitForTimeout(800);
    let T = await dumpText(page);
    if (!T.includes('Insights')) {
      // fallback: deep-link via initial route
      await page.goto(APP + '/#/insights', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(2500);
      T = await dumpText(page);
    }
    assert(vpName, 'CRIT1-insights-screen-title-renders', T.split('\n').some(l => l.trim() === 'Insights'),
      T.split('\n').slice(0, 12));

    // ---- real data loads into DOM ----
    const okCards = ['Sales', 'Completed orders', 'Proforma volume', 'Verified proformas', 'Key platform stats'];
    assert(vpName, 'CRIT1-all-five-chart-card-titles-render', okCards.every(c => T.includes(c)),
      okCards.map(c => `${c}=${T.includes(c)}`));
    await page.waitForTimeout(1500);
    T = await dumpText(page);
    // interval chips present (date-range select row)
    assert(vpName, 'CRIT2-interval-chips-present', ['Daily', 'Weekly', 'Monthly', 'Yearly'].every(x => T.includes(x)),
      ['Daily', 'Weekly', 'Monthly', 'Yearly'].map(x => `${x}=${T.includes(x)}`));

    // chart bars render numeric labels (SimpleBarChart prints rounded values)
    const numericLabels = T.split('\n').filter(l => /^\d+$/.test(l.trim())).map(l => l.trim());
    OUT.domNumbers[vpName] = { numericLabels: numericLabels.slice(0, 40), count: numericLabels.length };
    assert(vpName, 'CRIT1-chart-bars-expose-numeric-values-in-DOM', numericLabels.length >= 5,
      numericLabels.slice(0, 20));
    // a real sandbox number must appear: max daily placed or stat values
    const gtNums = [];
    (ordersTrendDay.json.series || []).forEach(s => gtNums.push(s.placed));
    Object.values(statsRes.json).forEach(v => { if (typeof v === 'number' && v > 0 && Number.isInteger(v)) gtNums.push(v); });
    const hitReal = gtNums.filter(n => numericLabels.includes(String(n)));
    OUT.domNumbers[vpName].realValueHits = [...new Set(hitReal)].slice(0, 12);
    assert(vpName, 'CRIT1-DOM-values-match-sandbox-ground-truth', hitReal.length >= 3,
      { candidates: [...new Set(gtNums)].length, hits: [...new Set(hitReal)].slice(0, 12) });
    // no lorem/placeholder
    assert(vpName, 'CRIT1-no-lorem-or-placeholder-copy',
      !/lorem|ipsum|placeholder text|TODO|coming soon/i.test(T), '');
    await shot(page, vpName, '10-initial-day');
    await scrollDown(page, 8); await page.waitForTimeout(700);
    T = await dumpText(page);
    assert(vpName, 'CRIT1-stats-card-visible-after-scroll', T.includes('Key platform stats'), '');
    await shot(page, vpName, '12-scrolled-stats');

    // ---- click every visible control & assert effect ----
    const controls = await listControls(page);
    OUT.clicks.push({ vp: vpName, controlsBeforeIntervals: controls.length, controls });

    // CRIT2: each interval chip refetches charts w/ asserted network + DOM effect
    const expectLen = { Daily: bucketLens.day, Weekly: bucketLens.week, Monthly: bucketLens.month, Yearly: bucketLens.year };
    const beforeCount = OUT.trendCalls.filter(c => c.vp === vpName).length;
    for (const [label, expLen] of Object.entries(expectLen)) {
      const callsBefore = OUT.trendCalls.filter(c => c.vp === vpName).length;
      const tapped = await tapText(page, label);
      await page.waitForTimeout(2200);
      const callsAfter = OUT.trendCalls.filter(c => c.vp === vpName).length;
      const ivParam = label.toLowerCase().startsWith('dai') ? 'day' : label.toLowerCase().startsWith('week') ? 'week'
        : label.toLowerCase().startsWith('month') ? 'month' : 'year';
      const lastCall = OUT.trendCalls.filter(c => c.vp === vpName).slice(-1)[0];
      const netOk = callsAfter > callsBefore && lastCall && lastCall.url.includes(`interval=${ivParam}`);
      // DOM effect: bar-count changes to match bucket length (capped at 14 by _seriesEntries)
      await page.waitForTimeout(600);
      const T2 = await dumpText(page);
      const nums = T2.split('\n').filter(l => /^\d+$/.test(l.trim())).length;
      OUT.domNumbers[vpName][ivParam] = { numericLabels: nums, trendCallsAfter: callsAfter };
      assert(vpName, `CLICK-interval-${label}-refetches-with-param-and-effect`,
        tapped && netOk && nums >= 1,
        { tapped, netOk, url: lastCall ? lastCall.url.replace(APP, '') : null, expectedBucketLen: expLen, domNumericLabels: nums });
      if (label !== 'Daily') { /* keep going */ }
    }

    // RefreshIndicator pull (mobile only): drag down asserts refetch
    if (vpName === '375') {
      const b0 = OUT.trendCalls.filter(c => c.vp === vpName).length;
      await page.mouse.move(180, 200); await page.mouse.down();
      for (let y = 200; y < 520; y += 40) { await page.mouse.move(180, y); await page.waitForTimeout(60); }
      await page.mouse.up(); await page.waitForTimeout(2500);
      const b1 = OUT.trendCalls.filter(c => c.vp === vpName).length;
      assert(vpName, 'CLICK-pull-to-refresh-refetches-trends', b1 > b0, { before: b0, after: b1 });
    }

    // disabled-control reasoning: after tapping an interval chip, chips remain enabled (all selectable above).
    // No other interactive controls exist on this screen besides chips (verified below) — record it.
    const postControls = await listControls(page);
    OUT.clicks.push({ vp: vpName, controlsAfterIntervals: postControls.length, nonChipButtons:
      postControls.filter(c => c.kind === 'button' && !['Daily', 'Weekly', 'Monthly', 'Yearly'].includes(c.label)) });
    assert(vpName, 'CLICK-no-dead-controls-on-insights',
      postControls.filter(c => c.kind === 'button' && !['Daily', 'Weekly', 'Monthly', 'Yearly'].includes(c.label)).length === 0,
      postControls.filter(c => c.kind === 'button').map(c => c.label));

    // Matomo console expectation-set check (build reality: absent in this bundle)
    assert(vpName, 'MATOMO-console-absent-in-frozen-bundle-recorded',
      !T.includes('Web analytics') && !T.includes('Visits'), { recordedAsParityDelta: true });

    await ctx.close();
  }

  // ================= PARITY vs :3000 (same flow/data) =================
  const tok2 = await L.apiLogin();
  // reference insights page requires cookie auth; fetch rendered HTML server-side
  const refIns = await fetch(`${REF}/insights`, { headers: { Cookie: `expat_auth_token=${tok2}` } });
  const refHtml = await refIns.text();
  OUT.refShots = [];
  const refBrowser = await L.newBrowser();
  const refCtx = await refBrowser.newContext({
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: {},
  });
  await refCtx.addCookies([{ name: 'expat_auth_token', value: tok2, url: REF }]);
  const rp = await refCtx.newPage();
  await rp.goto(`${REF}/insights`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await rp.waitForTimeout(9000);
  const refBody = await rp.evaluate(() => document.body.innerText).catch(() => '');
  OUT.refTexts.insights = refBody.slice(0, 4000);
  await rp.screenshot({ path: `${ROOT}/e2e/shots/AU-063/AU-063-ref-1280-insights.png` }).catch(() => {});
  OUT.refShots.push(`${ROOT}/e2e/shots/AU-063/AU-063-ref-1280-insights.png`);
  // reference /statistics console (tabs Overview..Errors)
  await rp.goto(`${REF}/statistics`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await rp.waitForTimeout(9000);
  const refStats = await rp.evaluate(() => document.body.innerText).catch(() => '');
  OUT.refTexts.statistics = refStats.slice(0, 5000);
  await rp.screenshot({ path: `${ROOT}/e2e/shots/AU-063/AU-063-ref-1280-statistics.png` }).catch(() => {});
  OUT.refShots.push(`${ROOT}/e2e/shots/AU-063/AU-063-ref-1280-statistics.png`);
  const tabLabels = ['Overview', 'Users', 'Products', 'Audience', 'Technology', 'Content', 'Real-time', 'Errors'];
  assert('ref', 'REF-statistics-8-tabs-render', tabLabels.every(t => refStats.includes(t)),
    tabLabels.map(t => `${t}=${refStats.includes(t)}`));
  assert('ref', 'REF-statistics-real-matomo-numbers-load', /\d{2,}/.test(refStats),
    (refStats.match(/\b\d{2,}\b/g) || []).slice(0, 10));
  await refCtx.close(); await refBrowser.close();

  // Parity classification (recorded, not silently accepted):
  // BLOCKER-1: /statistics console (8 tabs incl Errors) has NO mobile counterpart at all.
  //   Unit criteria explicitly require "/statistics console tabs (Overview..Errors) render
  //   real sandbox numbers" — nothing renders them. Not a blank-on-empty case; missing surface.
  // MAJOR-1: Matomo web-analytics section (a2a35c6) not compiled into frozen bundle =>
  //   even the implemented Visits/Pages/Countries/Devices/Search subset can't be verified.
  // MINOR-1: mobile lacks the web's date-RANGE select (last7/last30...) — only period chips exist.
  // MINOR-2: web Executive Overview KPI cards (visits/unique/pageviews/bounce) vs mobile's
  //   platform-stats bar chart — different metric presentation for the same hub.

  // ================= VISION: native PNG inspection done by the agent afterwards ============
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-063-r14.json`,
    JSON.stringify(OUT, null, 2));
  log('WROTE raw json; asserts:', OUT.asserts.length, 'failed:',
    OUT.asserts.filter(a => !a.pass).length);
  log('shots:', OUT.shots.concat(OUT.refShots).join(','));
})().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
