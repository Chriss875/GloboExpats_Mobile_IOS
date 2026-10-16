// au005_skeptic_r12d.js — PHASE 4: warm-start protocol.
// Lesson from r12c: a COLD first load on this box can miss its API window
// (CanvasKit + service-worker + JIT contention). Every phase now:
//   1. loads home, waits for >=1 observed :8083 API 200 (netWarm gate)
//   2. only then runs the attack, and asserts healthy==true for any UI claim
// Phases here: empty-search settle | admin valid token + chart titles |
// payout-details valid token (raw-leak probe) | TZS price parity.
const path = require('path'); const fs = require('fs');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131';
const TOK = fs.readFileSync('/tmp/au5sk_tok.txt', 'utf8').trim();
const OUT = [];
function rec(o) { OUT.push(o); console.log('REC', JSON.stringify(o).slice(0, 600)); }
const LEAK = /(ApiException|Exception:|Stack trace|SocketException|ClientException|failed: HTTP|HTTP \d{3}\b|Internal Server Error|Failed host lookup)/i;

async function text(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => ''); }
async function settle(p, re, ms = 30000) {
  for (let i = 0; i < ms / 400; i++) { const t = await text(p); if (re.test(t)) return true; await new Promise(r => setTimeout(r, 400)); }
  return false;
}
async function shot(p, name) { await L.screenshot(p, `e2e/shots/AU-005/AU-005-sk2-${name}.png`); }
function monitor(p) {
  const net = [];
  const h = { ok: false };
  p.on('response', r => { if (/localhost:8083\/api\//.test(r.url())) net.push(`${r.request().method()} ${r.url().split('/api/')[1].slice(0, 48)} -> ${r.status()}`); h.ok = net.some(x => /-> (200|304)$/.test(x)); });
  return { net, h };
}

(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const m = monitor(p);

  // ---- WARM START ----
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 40 && !m.h.ok; i++) await new Promise(r => setTimeout(r, 2500));
  rec({ step: 'warm-home', apiObserved: m.net.length, ok: m.h.ok });
  if (!m.h.ok) { console.log('WARM FAIL — aborting'); process.exit(2); }

  // ---- P1: true-empty search with network proof ----
  m.net.length = 0;
  await p.evaluate(() => { window.location.hash = '#/search?q=xqzjvkwq'; }).catch(() => {});
  let settledEmpty = false, sawApi = false, tEmpty = '';
  for (let i = 0; i < 70; i++) {
    tEmpty = await text(p);
    if (m.net.some(x => x.includes('displayItem/filter'))) sawApi = true;
    if (/No results found/i.test(tEmpty)) { settledEmpty = true; break; }
    if (/Search failed/i.test(tEmpty)) break;
    await new Promise(r => setTimeout(r, 500));
  }
  rec({ attack: 'A0-search-empty', vp: 'm', settledEmpty, sawFilterApi: sawApi, api: m.net.slice(0, 6), leak: LEAK.test(tEmpty), copy: (tEmpty.match(/No results found|Search failed[^\n]*/) || [''])[0] });
  await shot(p, 'm-a0-search-empty-r12d');

  // ---- P2: login token -> reload -> admin dashboard ----
  await p.evaluate(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, TOK);
  await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 40 && !m.h.ok; i++) await new Promise(r => setTimeout(r, 2500));
  rec({ step: 'post-login-warm', ok: m.h.ok, api: m.net.slice(0, 4) });

  m.net.length = 0;
  await p.evaluate(() => { window.location.hash = '#/admin'; }).catch(() => {});
  let tAdmin = '';
  for (let i = 0; i < 60; i++) {
    tAdmin = await text(p);
    if (/Sales trend|Order trend|Top Buyers by Clicks/.test(tAdmin)) break;
    await new Promise(r => setTimeout(r, 700));
  }
  rec({ attack: 'A6-admin-valid-token', apiCount: m.net.length, apiSample: [...new Set(m.net)].slice(0, 12),
    chartTitles: ['Top Buyers by Clicks', 'Sales trend', 'Order trend', 'Proforma trend'].filter(x => tAdmin.includes(x)),
    adminUnavailable: /Admin data unavailable/.test(tAdmin), leak: LEAK.test(tAdmin),
    head: tAdmin.slice(0, 260).replace(/\n+/g, ' | ') });
  await shot(p, 'm-a6-admin-valid-r12d');

  // ---- P3: payout details with valid token (the raw ${snap.error} branch must NOT fire) ----
  m.net.length = 0;
  await p.evaluate(() => { window.location.hash = '#/account/payout-details'; }).catch(() => {});
  await new Promise(r => setTimeout(r, 9000));
  const tPay = await text(p);
  rec({ attack: 'A6-payout-valid-token', api: m.net.slice(0, 4), errShown: /Could not load payout details/.test(tPay),
    hasRows: /M-PESA|\+255712000111|Mobile Test/i.test(tPay), leak: LEAK.test(tPay),
    copyHead: (tPay.match(/Could not load payout details[^\n]*/) || [''])[0].slice(0, 170) });
  await shot(p, 'm-a6-payout-valid-r12d');

  // ---- P4: session expiry mid-flow on the same screen (dead token injected, refetch via pull path) ----
  await p.evaluate(() => localStorage.setItem('flutter.auth_token', JSON.stringify('garbage.token.sig')));
  // trigger the screen's RefreshIndicator reload by re-entering the route
  await p.evaluate(() => { window.location.hash = '#/account/payments'; }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));
  await p.evaluate(() => { window.location.hash = '#/account/payout-details'; }).catch(() => {});
  await new Promise(r => setTimeout(r, 9000));
  const tDead = await text(p);
  rec({ attack: 'A7-session-expiry-midflow-payout', rawLeak: /Could not load payout details:\s*\S*(ClientException|ApiException|Request failed \(HTTP)/i.test(tDead),
    copyHead: (tDead.match(/Could not load payout details[^\n]*/) || [])[0] ? (tDead.match(/Could not load payout details[^\n]*/)[0]).slice(0, 200) : '',
    hasCopyAtAll: /Could not load payout details/.test(tDead), head: tDead.slice(0, 160).replace(/\n+/g, ' | ') });
  await shot(p, 'm-a7-payout-deadtoken-r12d');

  // ---- P5: TZS price format on browse vs reference ----
  m.net.length = 0;
  await p.evaluate(() => { window.location.hash = '#/browse'; }).catch(() => {});
  for (let i = 0; i < 30; i++) { const t = await text(p); if ((t.match(/TZS/g) || []).length >= 3) break; await new Promise(r => setTimeout(r, 800)); }
  const tBrowse = await text(p);
  const samples = (tBrowse.match(/TZS\s?[\d,\.]+/g) || []).slice(0, 10);
  rec({ attack: 'A5-tzs-format-mobile', count: (tBrowse.match(/TZS/g) || []).length, samples });
  await shot(p, 'm-a5-tzs-browse-r12d');

  await ctx.close();

  // ---- tablet admin charts ----
  const ctxT = await L.newCtx(b, { viewport: { width: 768, height: 1024 } });
  const pt = await ctxT.newPage();
  const mt = monitor(pt);
  await pt.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await pt.evaluate(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, TOK);
  await pt.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 40 && !mt.h.ok; i++) await new Promise(r => setTimeout(r, 2500));
  mt.net.length = 0;
  await pt.evaluate(() => { window.location.hash = '#/admin'; }).catch(() => {});
  let tAdT = '';
  for (let i = 0; i < 50; i++) { tAdT = await text(pt); if (/Sales trend|Order trend/.test(tAdT)) break; await new Promise(r => setTimeout(r, 800)); }
  rec({ attack: 'A6-admin-tablet', ok: mt.h.ok, chartTitles: ['Top Buyers by Clicks', 'Sales trend', 'Order trend', 'Proforma trend'].filter(x => tAdT.includes(tAdT) && x) .filter(x => tAdT.includes(x)), adminUnavailable: /Admin data unavailable/.test(tAdT) });
  await shot(pt, 't-a6-admin-charts-r12d');
  await ctxT.close();

  fs.writeFileSync('/tmp/au5sk_findings4.json', JSON.stringify(OUT, null, 1));
  console.log('PHASE4_DONE');
  await b.close().catch(() => {});
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
