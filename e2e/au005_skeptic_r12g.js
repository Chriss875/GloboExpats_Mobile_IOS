// au005_skeptic_r12g.js — PHASE 7 (final, fixed):
//  * BB had a precedence bug producing '#//orders' (invalid) — now plain literals.
//  * Full-text heads captured on every state so an unmatched settle is diagnosable.
//  * Offline raw-leak probe now uses an AUTHED session (the error branch only fires
//    when a token exists; anon short-circuits to the empty state).
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

(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const m = monitor(p);

  // warm + authed
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 40 && !m.h.ok; i++) await new Promise(r => setTimeout(r, 2500));
  await p.evaluate(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, TOK);
  await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
  m.net.length = 0;
  for (let i = 0; i < 30 && !m.h.ok; i++) await new Promise(r => setTimeout(r, 2000));
  rec({ step: 'warm-authed', ok: m.h.ok });
  if (!m.h.ok) process.exit(2);

  // sanity: payout-details ONLINE renders rows
  await p.evaluate(() => { window.location.hash = '#/account/payout-details'; }).catch(() => {});
  let tPayOn = '';
  for (let i = 0; i < 20; i++) { tPayOn = await text(p); if (/M-PESA|Mobile money|Could not load payout details|No payout details/.test(tPayOn)) break; await new Promise(r => setTimeout(r, 800)); }
  rec({ step: 'payout-online-sanity', rows: /M-PESA|Mobile money/.test(tPayOn), err: /Could not load payout details/.test(tPayOn), head: tPayOn.slice(0, 140).replace(/\n+/g, ' | ') });

  // ---------- OFFLINE with AUTHED session ----------
  await ctx.setOffline(true);
  for (const [label, route, markers] of [
    ['payout-details', '/account/payout-details', ['Could not load payout details']],
    ['orders-control', '/orders', ['Could not load orders', 'No orders yet']],
    ['notifications-control', '/notifications', ['Could not load notifications', 'No notifications yet']],
  ]) {
    await p.evaluate(() => { window.location.hash = '#/'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    m.net.length = 0;
    await p.evaluate(h => { window.location.hash = h; }, '#' + route).catch(() => {});
    let t = '';
    for (let i = 0; i < 22; i++) {
      t = await text(p);
      if (markers.some(x => t.includes(x))) break;
      await new Promise(r => setTimeout(r, 700));
    }
    const segs = markers.map(mk => (t.match(new RegExp(mk + '[^\\n]*')) || [''])[0]).filter(Boolean);
    rec({ attack: 'OFFLINE-' + label, rawLeakInSeg: segs.some(s => LEAK.test(s)), segs: segs.map(s => s.slice(0, 210)), anyMarker: segs.length > 0, head: t.slice(0, 150).replace(/\n+/g, ' | ') });
    await shot(p, 'm-p7-offline-' + label);
  }
  await ctx.setOffline(false);

  // recovery proof
  await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
  m.net.length = 0;
  for (let i = 0; i < 25 && !m.h.ok; i++) await new Promise(r => setTimeout(r, 2000));
  rec({ step: 'recovered-online-after-offline', ok: m.h.ok });

  // ---------- TRUE SESSION EXPIRY (dead token + reload) ----------
  await p.evaluate(() => localStorage.setItem('flutter.auth_token', JSON.stringify('garbage.token.sig')));
  await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 6000));
  for (const [route, markers] of [
    ['/orders', ['Could not load orders', 'Login', 'My orders']],
    ['/notifications', ['Could not load notifications', 'No notifications yet']],
    ['/admin', ['Admin data unavailable', 'Sales trend', 'Users']],
  ]) {
    await p.evaluate(() => { window.location.hash = '#/'; }).catch(() => {});
    await new Promise(r => setTimeout(r, 1200));
    await p.evaluate(h => { window.location.hash = h; }, '#' + route).catch(() => {});
    let t = '';
    for (let i = 0; i < 22; i++) {
      t = await text(p);
      if (markers.some(x => t.includes(x))) break;
      await new Promise(r => setTimeout(r, 700));
    }
    const segs = markers.map(mk => (t.match(new RegExp(mk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\n]*')) || [''])[0]).filter(Boolean);
    rec({ attack: 'EXPIRY-' + route, rawLeakInSeg: segs.some(s => LEAK.test(s)), segs: segs.map(s => s.slice(0, 190)), anyMarker: segs.length > 0, head: t.slice(0, 150).replace(/\n+/g, ' | ') });
    await shot(p, 'm-p7-expiry-' + route.replace(/\//g, ''));
  }

  fs.writeFileSync('/tmp/au5sk_findings7.json', JSON.stringify(OUT, null, 1));
  console.log('PHASE7_DONE');
  await ctx.close();
  await b.close().catch(() => {});
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
