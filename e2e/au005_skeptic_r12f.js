// au005_skeptic_r12f.js — PHASE 6: controlled reproduction + true-expiry battery.
//  B-A: isolated browser warms ONLINE, then setOffline(true) inside THAT instance
//       only -> cold-nav to /account/payout-details (RAW-LEAK suspect),
//       /orders (control: must be friendly), /notifications (control).
//       Then recover online.
//  B-B: TRUE session expiry: garbage token injected + RELOAD (so AuthStore picks
//       it up) -> /orders, /notifications, /admin -> assert friendly-only copy.
const path = require('path'); const fs = require('fs');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131';
const TOK = fs.readFileSync('/tmp/au5sk_tok.txt', 'utf8').trim();
const OUT = [];
function rec(o) { OUT.push(o); console.log('REC', JSON.stringify(o).slice(0, 700)); }
const LEAK = /(ApiException|Exception:|Stack trace|SocketException|ClientException|failed: HTTP|HTTP \d{3}\b|Internal Server Error|Failed host lookup)/i;

async function text(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => ''); }
async function shot(p, name) { await L.screenshot(p, `e2e/shots/AU-005/AU-005-sk2-${name}.png`); }
function monitor(p) {
  const net = []; const h = { ok: false };
  p.on('response', r => { if (/localhost:8083\/api\//.test(r.url())) net.push(`${r.request().method()} ${r.url().split('/api/')[1].slice(0, 44)} -> ${r.status()}`); h.ok = net.some(x => /-> (200|304)$/.test(x)); });
  return { net, h };
}
async function warmHome(b, vps, tok) {
  const ctx = await L.newCtx(b, { viewport: vps });
  const p = await ctx.newPage();
  const m = monitor(p);
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 40 && !m.h.ok; i++) await new Promise(r => setTimeout(r, 2500));
  if (tok) {
    await p.evaluate(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, tok);
    await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
    m.net.length = 0;
    for (let i = 0; i < 30 && !m.h.ok; i++) await new Promise(r => setTimeout(r, 2000));
  }
  return { ctx, p, m };
}

(async () => {
  // ================= B-A: OFFLINE CONTROLLED =================
  {
    const b = await L.newBrowser();
    const { ctx, p, m } = await warmHome(b, { width: 375, height: 667 }, null);
    rec({ step: 'BA-warm-online', ok: m.h.ok, api: m.net.slice(0, 3) });
    if (!m.h.ok) process.exit(2);

    await ctx.setOffline(true);
    // cold-nav to payout details while offline
    await p.evaluate(() => { window.location.hash = '#/'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    await p.evaluate(() => { window.location.hash = '#/account/payout-details'; }).catch(() => {});
    let tPay = '';
    for (let i = 0; i < 24; i++) { tPay = await text(p); if (/Could not load payout details|M-PESA|Mobile money|No payout details/.test(tPay)) break; await new Promise(r => setTimeout(r, 700)); }
    rec({ attack: 'BA-offline-payout-details', rawLeak: LEAK.test((tPay.match(/Could not load payout details[^\n]*/) || [''])[0]),
      copyHead: (tPay.match(/Could not load payout details[^\n]*/) || [''])[0].slice(0, 220) });
    await shot(p, 'm-p6-offline-payout-RAWDUMP');

    // control: orders offline must be friendly
    await p.evaluate(() => { window.location.hash = '#/'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    await p.evaluate(() => { window.location.hash = '#/orders'; }).catch(() => {});
    let tOrd = '';
    for (let i = 0; i < 24; i++) { tOrd = await text(p); if (/Could not load orders|No orders yet|ORD-/.test(tOrd)) break; await new Promise(r => setTimeout(r, 700)); }
    rec({ attack: 'BA-offline-orders-control', rawLeak: LEAK.test((tOrd.match(/Could not load orders[^\n]*/) || [''])[0]), copyHead: (tOrd.match(/Could not load orders[^\n]*/) || [''])[0].slice(0, 160) });
    await shot(p, 'm-p6-offline-orders-control');

    // control: notifications offline
    await p.evaluate(() => { window.location.hash = '#/'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    await p.evaluate(() => { window.location.hash = '#/notifications'; }).catch(() => {});
    let tN = '';
    for (let i = 0; i < 24; i++) { tN = await text(p); if (/Could not load notifications|No notifications yet/.test(tN)) break; await new Promise(r => setTimeout(r, 700)); }
    rec({ attack: 'BA-offline-notifications-control', rawLeak: LEAK.test((tN.match(/Could not load notifications[^\n]*/) || [''])[0]), copyHead: (tN.match(/Could not load notifications[^\n]*/) || [''])[0].slice(0, 160) });
    await shot(p, 'm-p6-offline-notifications-control');

    // recovery
    await ctx.setOffline(false);
    await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
    m.net.length = 0;
    for (let i = 0; i < 25 && !m.h.ok; i++) await new Promise(r => setTimeout(r, 2000));
    rec({ step: 'BA-recovered-online', ok: m.h.ok });
    await b.close();
  }

  // ================= B-B: TRUE SESSION EXPIRY =================
  {
    const b = await L.newBrowser();
    const { ctx, p, m } = await warmHome(b, { width: 375, height: 667 }, TOK);
    rec({ step: 'BB-warm-authed', ok: m.h.ok });

    // kill token AND reload so AuthStore restores the dead token
    await p.evaluate(() => localStorage.setItem('flutter.auth_token', JSON.stringify('garbage.token.sig')));
    await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 6000));

    for (const [route, marker] of [['/orders', 'Could not load orders'], ['/notifications', 'Could not load notifications'], ['/admin', 'Admin']]) {
      await p.evaluate(() => { window.location.hash = '#/'; }).catch(() => {});
      await new Promise(r => setTimeout(r, 1200));
      await p.evaluate(h => { window.location.hash = h; }, '#/' + route.replace(/^\//, '') === '#' ? '#' : '#/' + route).catch(() => {});
      let t = '';
      for (let i = 0; i < 22; i++) { t = await text(p); if (new RegExp(marker).test(t)) break; await new Promise(r => setTimeout(r, 700)); }
      const seg = (t.match(new RegExp(marker + '[^\\n]*')) || [''])[0];
      rec({ attack: 'BB-expiry-' + route, rawLeak: LEAK.test(seg), copy: seg.slice(0, 170),
        adminUnavailable: route === '/admin' ? /Admin data unavailable/.test(t) : undefined,
        sessionExpiredCopy: route === '/admin' ? undefined : /session has expired|log in/i.test(seg) });
      await shot(p, 'm-p6-expiry' + route.replace('/', '-'));
    }
    await b.close();
  }

  fs.writeFileSync('/tmp/au5sk_findings6.json', JSON.stringify(OUT, null, 1));
  console.log('PHASE6_DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
