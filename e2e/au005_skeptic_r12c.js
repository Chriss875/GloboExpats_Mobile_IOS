// au005_skeptic_r12c.js — PHASE 3 CLEAN ROOM.
// Rule: NO attack trusts a UI assertion unless netHealthy==true (>=1 :8083 response
// observed since the last navigation/reload). Offline is confined to its own
// browser instance so emulation can never contaminate later phases.
const path = require('path'); const fs = require('fs');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131';
const VPm = { width: 375, height: 667 }, VPt = { width: 768, height: 1024 };
const OUT = [];
function rec(o) { OUT.push(o); console.log('REC', JSON.stringify(o).slice(0, 600)); }
const LEAK = /(ApiException|Exception:|Stack trace|SocketException|ClientException|failed: HTTP|HTTP \d{3}\b|Internal Server Error|Failed host lookup)/i;
const TOK = fs.readFileSync('/tmp/au5sk_tok.txt', 'utf8').trim();

async function text(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => ''); }
async function settle(p, re, ms = 30000) {
  for (let i = 0; i < ms / 400; i++) { const t = await text(p); if (re.test(t)) return true; await new Promise(r => setTimeout(r, 400)); }
  return false;
}
async function shot(p, name) { await L.screenshot(p, `e2e/shots/AU-005/AU-005-sk2-${name}.png`); }
function monitor(p) {
  const net = []; let last = null;
  p.on('response', r => { if (r.url().includes(':8083/api/')) { const s = `${r.request().method()} ${r.url().split(':8083')[1].slice(0, 55)} -> ${r.status()}`; net.push(s); last = r.status(); } });
  return { net, get healthy() { return net.length > 0 && net.some(x => x.endsWith('-> 200') || x.endsWith('-> 304')); } };
}
async function launch() { return L.newBrowser(); }

(async () => {
  // ---------- CLEAN ONLINE CONTEXT: empty-search settle + admin + charts ----------
  const b1 = await launch();
  {
    const ctx = await L.newCtx(b1, { viewport: VPm });
    const p = await ctx.newPage();
    const m = monitor(p);
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await settle(p, /Buy now|Featured|Browse/i, 60000);
    rec({ step: 'home-load', healthy: m.healthy, sample: m.net.slice(0, 4) });

    // true-empty search with network proof
    m.net.length = 0;
    await p.evaluate(() => { window.location.hash = '#/search?q=xqzjvkwq'; }).catch(() => {});
    const settled = await settle(p, /No results found|Search failed/i, 35000);
    const tEmpty = await text(p);
    rec({ attack: 'A0-search-empty-clean', vp: 'm', settled, healthy: m.healthy, leak: LEAK.test(tEmpty),
      copy: (tEmpty.match(/No results found|Search failed[^\n]*/g) || []).slice(0, 1), apiCalls: m.net.slice(0, 6) });
    await shot(p, 'm-a0-search-empty-CLEAN');

    // inject VALID token, reload, go to /admin
    await p.evaluate(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, TOK);
    await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
    const homeOk = await settle(p, /Featured|Buy now|Browse/i, 60000);
    rec({ step: 'post-login-home', healthy: m.healthy, homeOk });
    m.net.length = 0;
    await p.evaluate(() => { window.location.hash = '#/admin'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 15000));
    const tAdmin = await text(p);
    rec({ attack: 'A6-admin-valid-token-clean', healthy: m.healthy, leak: LEAK.test(tAdmin),
      chartTitles: ['Top Buyers by Clicks', 'Sales trend', 'Order trend', 'Proforma trend'].filter(x => tAdmin.includes(x)),
      adminUnavailable: /Admin data unavailable/i.test(tAdmin),
      users: /Users/.test(tAdmin), head: tAdmin.slice(0, 300).replace(/\n+/g, ' | '), apiCalls: m.net.slice(0, 10) });
    await shot(p, 'm-a6-admin-valid-CLEAN');

    // payout-details with valid token (raw ${snap.error} branch — should NOT fire)
    m.net.length = 0;
    await p.evaluate(() => { window.location.hash = '#/account/payout-details'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 9000));
    const tPay = await text(p);
    rec({ attack: 'A6-payout-valid-token-clean', healthy: m.healthy, leak: LEAK.test(tPay),
      errShown: /Could not load payout details/.test(tPay), hasRows: /M-PESA|\+255712000111|Mobile Test/i.test(tPay),
      copyHead: (tPay.match(/Could not load payout details[^\n]*/) || [''])[0].slice(0, 160) });
    await shot(p, 'm-a6-payout-valid-CLEAN');

    // tablet viewport admin charts (blank-card convention)
    const ctxT = await L.newCtx(b1, { viewport: VPt });
    const pt = await ctxT.newPage();
    const mt = monitor(pt);
    await pt.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await pt.evaluate(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, TOK);
    await pt.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await settle(pt, /Featured|Buy now|Browse/i, 60000);
    mt.net.length = 0;
    await pt.evaluate(() => { window.location.hash = '#/admin'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 15000));
    const tAdmT = await text(pt);
    rec({ attack: 'A6-admin-tablet-clean', healthy: mt.healthy,
      chartTitles: ['Top Buyers by Clicks', 'Sales trend', 'Order trend', 'Proforma trend'].filter(x => tAdmT.includes(x)),
      adminUnavailable: /Admin data unavailable/i.test(tAdmT) });
    await shot(pt, 't-a6-admin-charts-CLEAN');
    await ctx.close(); await ctxT.close();
  }

  // ---------- TZS PRICE FORMAT PARITY ----------
  {
    const b2 = await launch();
    const ctx = await L.newCtx(b2, { viewport: VPm });
    const p = await ctx.newPage();
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await settle(p, /TZS/i, 60000);
    const tHome = await text(p);
    const tzsMobile = (tHome.match(/TZS\s*[\d,\.]+/g) || []).slice(0, 8);
    rec({ attack: 'A5-tzs-mobile', samples: tzsMobile, count: (tHome.match(/TZS/g) || []).length });
    await shot(p, 'm-a5-tzs-prices');
    await b2.close();
  }

  // ---------- OFFLINE ISOLATED BROWSER (own instance, destroyed after) ----------
  {
    const b3 = await launch();
    const ctx = await L.newCtx(b3, { viewport: VPm, videoPath: 'e2e/videos/AU-005-sk2-offline-r12.webm' });
    const p = await ctx.newPage();
    const m = monitor(p);
    await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await settle(p, /Buy now|Featured/i, 60000);
    // load search online first (rows present)
    await p.evaluate(() => { window.location.hash = '#/search?q=phone'; }).catch(() => {});
    await settle(p, /No results found|iPhone|Phone|Search failed/i, 25000);
    const tOnline = await text(p);
    rec({ step: 'offline-prep-online-search', healthy: m.healthy, gotResults: !/Search failed|No results found/i.test(tOnline), head: tOnline.slice(0, 100).replace(/\n+/g, ' | ') });
    await p.context().setOffline(true);
    // force refetch: navigate away and back
    await p.evaluate(() => { window.location.hash = '#/'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    await p.evaluate(() => { window.location.hash = '#/search?q=phone'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 8000));
    const tOff = await text(p);
    rec({ attack: 'A4-offline-search-isolated', leak: LEAK.test(tOff), copy: (tOff.match(/Search failed[^\n]*|No results found/g) || []).slice(0, 1) });
    await shot(p, 'm-a4-offline-ISOLATED');
    // offline product detail
    await p.evaluate(() => { window.location.hash = '#/product/999999'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 8000));
    const tOffD = await text(p);
    rec({ attack: 'A4-offline-detail-isolated', leak: LEAK.test(tOffD), copy: (tOffD.match(/Could not load product[^\n]*|Error: Product not found/g) || []).slice(0, 1) });
    await shot(p, 'm-a4-offline-detail-ISOLATED');
    await L.closeVideo(ctx, 'e2e/videos/AU-005-sk2-offline-r12.webm');
    await b3.close();
  }

  fs.writeFileSync('/tmp/au5sk_findings3.json', JSON.stringify(OUT, null, 1));
  console.log('PHASE3_DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
