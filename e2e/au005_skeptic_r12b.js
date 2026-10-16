// au005_skeptic_r12b.js — PHASE 2: offline mid-request + retry, invalid input,
// locale/number formats (TZS), role probes, session expiry mid-flow, plus a
// re-check of the empty-search settle with network logging.
const path = require('path'); const fs = require('fs');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131';
const VP = { m: { width: 375, height: 667 }, t: { width: 768, height: 1024 } };
const OUT = [];
function rec(o) { OUT.push(o); console.log('REC', JSON.stringify(o).slice(0, 500)); }
const LEAK = /(ApiException|Exception:|Stack trace|SocketException|ClientException|failed: HTTP|HTTP \d{3}\b|Internal Server Error|Failed host lookup)/i;

async function text(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => ''); }
async function settle(p, re, ms = 30000) {
  for (let i = 0; i < ms / 400; i++) { const t = await text(p); if (re.test(t)) return true; await new Promise(r => setTimeout(r, 400)); }
  return false;
}
async function shot(p, name) { await L.screenshot(p, `e2e/shots/AU-005/AU-005-sk2-${name}.png`); }

(async () => {
  const b = await L.newBrowser();

  // ================= OFFLINE ATTACKS (mobile viewport) =================
  {
    const ctx = await L.newCtx(b, { viewport: VP.m, videoPath: 'e2e/videos/AU-005-sk2-offline.webm' });
    const p = await ctx.newPage();
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 45000).catch(() => {});

    // --- A4a: offline SEARCH -> friendly copy; then online retry -> real rows
    await p.evaluate(() => { window.location.hash = '#/search?q=phone'; }).catch(() => {});
    await settle(p, /No results found|iPhone|Phone/i, 25000);
    await p.context().setOffline(true);
    await p.fill('input', ''); // clear query field if reachable
    await p.evaluate(() => { window.location.hash = '#/'; }).catch(() => {}); // leave so re-entry refires
    await new Promise(r => setTimeout(r, 800));
    await p.evaluate(() => { window.location.hash = '#/search?q=phone'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 6000));
    const tOffSearch = await text(p);
    rec({ attack: 'A4-offline-search', leak: LEAK.test(tOffSearch), copy: (tOffSearch.match(/Search failed[^\n]*|No results found/g) || []).slice(0, 2) });
    await shot(p, 'm-a4-offline-search');

    // retry online
    await p.context().setOffline(false);
    await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 45000).catch(() => {});
    await p.evaluate(() => { window.location.hash = '#/search?q=phone'; }).catch(() => {});
    const okSearch = await settle(p, /iPhone|Phone/i, 30000);
    const tRetry = await text(p);
    rec({ attack: 'A4-search-retry-online', recovered: okSearch && !/Search failed/i.test(tRetry) });
    await shot(p, 'm-a4-retry-online');

    // --- A4b: offline PRODUCT DETAIL deep link (fresh load while offline)
    await p.context().setOffline(true);
    await p.goto(APP + '/#/product/999999', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 45000).catch(() => {});
    await new Promise(r => setTimeout(r, 6000));
    const tOffDetail = await text(p);
    rec({ attack: 'A4-offline-detail-404id', leak: LEAK.test(tOffDetail), copyHead: tOffDetail.slice(0, 200).replace(/\n+/g, ' | ') });
    await shot(p, 'm-a4-offline-detail');

    // --- A4c: offline ORDERS (gated, has real token? none yet -> anon redirect) : do with token later
    await p.context().setOffline(false);

    // --- A5: invalid input battery on live search
    await L.waitText(p, 'Buy now', 30000).catch(() => {});
    const cases = [
      ['q500', 'x'.repeat(500)],
      ['emoji', '😀😀📱💯'],
      ['swahili', 'Chakula cha mchana bei nafuu'],
      ['scripttag', '<script>alert(1)</script>'],
      ['sqlish', "'; DROP TABLE products; --"],
    ];
    for (const [name, q] of cases) {
      await p.evaluate(u => { window.location.hash = u; }, '#/search?q=' + encodeURIComponent(q)).catch(() => {});
      await new Promise(r => setTimeout(r, name === 'q500' ? 9000 : 6500));
      const t = await text(p);
      rec({ attack: 'A5-input-' + name, leak: LEAK.test(t), noResults: /No results found/i.test(t), hasResults: !/No results found/i.test(t) && t.length > 60, head: t.slice(0, 110).replace(/\n+/g, ' | ') });
      await shot(p, 'm-a5-' + name);
    }
    await L.closeVideo(ctx, 'e2e/videos/AU-005-sk2-offline.webm');
  }

  // ================= SESSION EXPIRY / ROLE PROBES =================
  const TOK = fs.readFileSync('/tmp/au5sk_tok.txt', 'utf8').trim();
  {
    const ctx = await L.newCtx(b, { viewport: VP.m, videoPath: null });
    const p = await ctx.newPage();
    const net = [];
    p.on('response', r => { if (r.url().includes(':8083/api/')) net.push(`${r.request().method()} ${r.url().split(':8083')[1].slice(0, 55)} -> ${r.status()}`); });
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 45000).catch(() => {});

    // A7: inject GARBAGE token (= expired/dead session), then open gated /orders
    await p.evaluate(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, 'garbage.token.sig');
    net.length = 0;
    await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 45000).catch(() => {});
    await p.evaluate(() => { window.location.hash = '#/orders'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 9000));
    const tOrdersDead = await text(p);
    rec({ attack: 'A7-deadtoken-orders', leak: LEAK.test(tOrdersDead), copyHead: tOrdersDead.slice(0, 220).replace(/\n+/g, ' | '), net: net.slice(0, 6) });
    await shot(p, 'm-a7-deadtoken-orders');

    // A6: buyer-role probe on /admin with dead token then REAL token
    await p.evaluate(() => { window.location.hash = '#/admin'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 9000));
    const tAdminDead = await text(p);
    rec({ attack: 'A6-admin-deadtoken', leak: LEAK.test(tAdminDead), head: tAdminDead.slice(0, 200).replace(/\n+/g, ' | ') });
    await shot(p, 'm-a6-admin-deadtoken');

    // real token -> admin dashboard must render charts area (blank-card convention)
    await p.evaluate(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); }, TOK);
    await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 45000).catch(() => {});
    net.length = 0;
    await p.evaluate(() => { window.location.hash = '#/admin'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 14000));
    const tAdmin = await text(p);
    rec({ attack: 'A6-admin-real-token', leak: LEAK.test(tAdmin),
      chartTitles: ['Top Buyers by Clicks', 'Sales trend', 'Order trend', 'Proforma trend'].filter(x => tAdmin.includes(x)),
      adminUnavailable: /Admin data unavailable/i.test(tAdmin), head: tAdmin.slice(0, 260).replace(/\n+/g, ' | '), net: net.slice(0, 10) });
    await shot(p, 'm-a6-admin-real');

    // payout details (raw ${snap.error} branch): valid token should render data, not error.
    await p.evaluate(() => { window.location.hash = '#/account/payout-details'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 9000));
    const tPayout = await text(p);
    rec({ attack: 'A6-payout-details-valid-token', leak: LEAK.test(tPayout), errShown: /Could not load payout details/.test(tPayout), hasRows: /M-PESA|\+255712000111|Mobile Test/i.test(tPayout), head: tPayout.slice(0, 220).replace(/\n+/g, ' | ') });
    await shot(p, 'm-a6-payout-valid');

    // session expiry MID-FLOW: start on payout with valid token, kill token, pull-refresh
    await p.evaluate(() => localStorage.setItem('flutter.auth_token', JSON.stringify('garbage.token.sig')));
    await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 45000).catch(() => {});
    net.length = 0;
    await p.evaluate(() => { window.location.hash = '#/account/payout-details'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 9000));
    const tPayoutDead = await text(p);
    rec({ attack: 'A7-payout-expired-midflow', leak: LEAK.test(tPayoutDead), rawLeak: /Could not load payout details: [^]*?(ApiException|Exception|Request failed \(HTTP)/i.test(tPayoutDead), copyHead: (tPayoutDead.match(/Could not load payout details[^\n]*/) || [''])[0], net: net.slice(0, 6) });
    await shot(p, 'm-a7-payout-expired');

    await ctx.close();
  }

  console.log('PHASE2_DONE');
  fs.writeFileSync('/tmp/au5sk_findings2.json', JSON.stringify(OUT, null, 1));
  await b.close().catch(() => {});
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
