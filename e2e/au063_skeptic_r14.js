// au063_skeptic_r14.js — AU-063 SKEPTIC: >=8 attack classes against the insights PASS
// on FROZEN :9131 (e694463 / mtime 08:15:26 GMT). Detection-only: every attack either
// BREAKS the pass or is recorded as HELD with evidence.
// Attacks:
//  A1 freshness/staleness — mtime+length stable across run; bundle md5 recorded twice
//  A2 fabricated-data control — BLOCK all /api/v1/admin/* routes => numbers must vanish
//     (if stats still render, the "real data" claim was fake)
//  A3 interval-refetch theater — assert interval param + bucket-length change really happen;
//     tamper: force 500 on trend => UI must go EMPTY ('No data'), never stale numbers
//  A4 wrong-endpoint probe — enumerate EVERY admin/analytics request; flag zero-results /
//     8084 analytics-service hits that shouldn't exist on this screen
//  A5 placeholder scan — full DOM text greps lorem/ipsum/TODO/mock/NaN/undefined/null
//  A6 anon leak — fresh context, NO token => /insights must not render real dept numbers
//  A7 garbage-token robustness — inject junk JWT => graceful empty/error, no crash, no fake data
//  A8 number-provenance — every numeric DOM label must be explainable by API payloads
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const OUT = { attacks: [], findings: [] };
function rec(attack, broken, detail) {
  OUT.attacks.push({ attack, broken: !!broken, detail });
  console.log(broken ? 'BROKEN' : 'held  ', attack, JSON.stringify(detail).slice(0, 260));
}
async function dumpText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
}
async function tapChip(p, lbl) {
  const c = await p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim(); if (!t.includes(lbl)) return;
      if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
      const area = r.width * r.height;
      if (!best || area < best.area) best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area };
    });
    return best;
  }, lbl);
  if (!c) return false;
  await p.mouse.click(c.cx, Math.max(12, Math.min(c.cy, innerHeight - 16)));
  await p.waitForTimeout(1800);
  return true;
}
async function gotoInsights(page) {
  await page.goto(APP + '/#/insights', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(3500);
  return dumpText(page);
}

(async () => {
  fs.mkdirSync(`${ROOT}/e2e/shots/AU-063`, { recursive: true });

  // ---------- A1 freshness ----------
  const h1 = await fetch(`${APP}/main.dart.js`, { method: 'HEAD' });
  const lm1 = h1.headers.get('last-modified'); const cl1 = h1.headers.get('content-length');
  const md5a = require('child_process').execSync(
    `curl -s ${APP}/main.dart.js | md5sum`).toString().split(' ')[0];

  // ================= A6 anon leak (fresh ctx, no token) =================
  const b = await L.newBrowser();
  const anonCtx = await L.newCtx(b, { viewport: { width: 375, height: 667 }, videoPath: `${ROOT}/e2e/videos/AU-063-skeptic-anon.webm` });
  const ap = await anonCtx.newPage();
  let apiHitsAnon = [];
  ap.on('request', r => { if (/\/api\/v1\/admin\//.test(r.url())) apiHitsAnon.push(r.url()); });
  const anonT = await gotoInsights(ap);
  await ap.screenshot({ path: `${ROOT}/e2e/shots/AU-063/AU-063-sk-anon-insights.png` });
  const anonNums = (anonT.match(/^\d{1,3}(,\d{3})*$/gm) || []);
  const anonHasCards = ['Sales', 'Completed orders', 'Proforma volume'].every(x => anonT.includes(x));
  rec('A6-anon-no-admin-data-leak',
    anonHasCards && !/\[No token|Not logged in/i.test(anonT),
    { anonHasCards, apiHitsAnon: apiHitsAnon.length, sample: anonT.split('\n').slice(0, 14) });
  // If the screen renders chart cards WITHOUT a token but shows zeros/nothing, that's the
  // documented behavior (blank when no data). Real dept numbers would be a LEAK.
  const anonBigNums = anonNums.filter(n => parseInt(n.replace(/,/g, ''), 10) > 50);
  rec('A6b-anon-screen-shows-no-real-counts', anonBigNums.length > 0,
    { anonBigNums: anonBigNums.slice(0, 10) });
  await anonCtx.close();

  // ================= logged-in attacks (real session) =================
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 }, videoPath: `${ROOT}/e2e/videos/AU-063-skeptic-main.webm` });
  const p = await ctx.newPage();
  const reqLog = [];
  p.on('request', r => { if (/\/api\/v1\/admin|analytics/.test(r.url())) reqLog.push({ url: r.url(), method: r.method() }); });

  // normal login
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 120000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 60000).catch(() => {});
  let logged = await L.isLoggedIn(p);
  if (!logged) {
    await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000).catch(() => {});
    const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await p.waitForTimeout(300);
    await p.keyboard.type('mobile.test.20260820@gmail.com', { delay: 9 });
    const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await p.waitForTimeout(300);
    await p.keyboard.type('StrongPass!1', { delay: 9 });
    await L.clickBtn(p, 'Log in');
    for (let i = 0; i < 30 && !logged; i++) { await p.waitForTimeout(1000); logged = await L.isLoggedIn(p); }
  }
  rec('A0-login-baseline', !logged, { logged });

  const T0 = await gotoInsights(p);
  await p.screenshot({ path: `${ROOT}/e2e/shots/AU-063/AU-063-sk-main-initial.png` });

  // ---------- A5 placeholder scan ----------
  const badCopy = T0.match(/lorem|ipsum|TODO|mock data|placeholder|undefined|NaN|\bnull\b/gi) || [];
  rec('A5-no-placeholder-copy', badCopy.length > 0, { badCopy: [...new Set(badCopy)] });

  // ---------- A4 wrong-endpoint probe ----------
  await new Promise(r => setTimeout(r, 1500));
  const urls = [...new Set(reqLog.map(r => r.url))];
  const wrong = urls.filter(u => /zero-results|8084|search-analytics/.test(u));
  rec('A4-only-legit-admin-trend-stats-calls', wrong.length > 0,
    { calls: urls.map(u => u.replace(APP, '')), wrong });

  // ---------- A2 fabricated-data control: block admin API => numbers must vanish ----------
  await p.unrouteAll();
  await p.route(/\/api\/v1\/admin\/(stats|orders\/trend|proformas\/trend)/, r => r.abort());
  await tapChip(p, 'Weekly');           // forces refetch which now fails
  await p.waitForTimeout(2500);
  const Tblocked = await dumpText(p);
  const blockedNums = (Tblocked.match(/^\d{1,3}(,\d{3})*$/gm) || []).filter(n => parseInt(n.replace(/,/g, ''), 10) > 0);
  await p.screenshot({ path: `${ROOT}/e2e/shots/AU-063/AU-063-sk-api-blocked.png` });
  // With the API dead the charts must be EMPTY ('No data') — surviving real-looking numbers
  // would prove the earlier "real data" was client-side fiction.
  rec('A2-blocked-API-clears-numbers', blockedNums.length > 0,
    { survivingNumbers: blockedNums.slice(0, 12), hasNoDataLabel: Tblocked.includes('No data') });
  rec('A2b-empty-convention-label-shown',
    !(Tblocked.includes('No data')),
    { noDataShown: Tblocked.includes('No data') });   // held == label shown

  await p.unrouteAll();

  // ---------- A3 interval-refetch theater (network-level params + bucket change) ----------
  const seen = [];
  p.on('request', r => { const u = r.url(); if (/interval=/.test(u)) seen.push(u.split('interval=')[1].split('&')[0]); });
  for (const chip of ['Daily', 'Monthly', 'Yearly']) await tapChip(p, chip);
  await p.waitForTimeout(2000);
  const uniqIv = [...new Set(seen)];
  rec('A3-interval-param-really-changes-per-chip', uniqIv.length < 3,
    { seen, uniqIv });

  // ---------- A7 garbage-token robustness ----------
  const gctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const gp = await gctx.newPage();
  await gp.addInitScript(() => localStorage.setItem('flutter.auth_token', 'GARBAGE.JWT.TOKEN'));
  await gp.goto(APP + '/#/insights', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await gp.waitForTimeout(6000);
  const gT = await dumpText(gp);
  const gErr = await gp.evaluate(() => document.body.innerText.includes('RenderFlex') || document.body.innerText.includes('Exception')).catch(() => false);
  const gNums = (gT.match(/^\d{1,3}(,\d{3})*$/gm) || []).filter(n => parseInt(n.replace(/,/g, ''), 10) > 0);
  await gp.screenshot({ path: `${ROOT}/e2e/shots/AU-063/AU-063-sk-garbage-token.png` });
  rec('A7-garbage-token-graceful-no-fake-data', gNums.length > 0 || gErr,
    { garbageTokenNumbers: gNums.slice(0, 8), crashed: gErr, sample: gT.split('\n').slice(0, 10) });
  await gctx.close();

  // ---------- A8 number provenance ----------
  const tok = await L.apiLogin();
  const st = await L.api(tok, 'GET', '/api/v1/admin/stats');
  const tr = await L.api(tok, 'GET', '/api/v1/admin/orders/trend?interval=day');
  const pr = await L.api(tok, 'GET', '/api/v1/admin/proformas/trend?interval=day');
  const allowed = new Set();
  Object.values(st.json || {}).forEach(v => { if (typeof v === 'number') allowed.add(String(Math.round(v))); });
  (tr.json.series || []).concat(pr.json.series || []).forEach(s =>
    Object.values(s).forEach(v => { if (typeof v === 'number') allowed.add(String(Math.round(v))); }));
  // bar labels are capped at 14 buckets; collect DOM numbers again (fresh, API alive)
  const tNow = await gotoInsights(p);
  const domNums = (tNow.match(/^\d{1,3}(,\d{3})*$/gm) || []).map(n => n.replace(/,/g, ''));
  const unexplained = domNums.filter(n => !allowed.has(n));
  rec('A8-all-DOM-numbers-traceable-to-API', unexplained.length > 0,
    { domNums: domNums.slice(0, 30), unexplainedCount: unexplained.length, unexplainedSample: unexplained.slice(0, 10) });

  // ---------- A1 close ----------
  const h2 = await fetch(`${APP}/main.dart.js`, { method: 'HEAD' });
  const md5b = require('child_process').execSync(`curl -s ${APP}/main.dart.js | md5sum`).toString().split(' ')[0];
  rec('A1-build-stable-through-run',
    h2.headers.get('last-modified') !== lm1 || h2.headers.get('content-length') !== cl1 || md5a !== md5b,
    { lm1, lm2: h2.headers.get('last-modified'), cl1, cl2: h2.headers.get('content-length'), md5a, md5b });

  await ctx.close(); await b.close();

  const broken = OUT.attacks.filter(a => a.broken);
  OUT.summary = { attempted: OUT.attacks.length, broken: broken.length, verdict: broken.length ? 'BROKEN' : 'HELD' };
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-063-skeptic-r14.json`, JSON.stringify(OUT, null, 2));
  console.log('SKEPTIC SUMMARY', JSON.stringify(OUT.summary));
})().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
