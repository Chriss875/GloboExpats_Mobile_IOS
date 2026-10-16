// au005_skeptic_r12e.js — PHASE 5 (final): warm-gated remaining attacks.
//   P1  404 product deep link in a WARM session (does the not-found branch fire,
//       does the dead _BottomBar stay hidden, Back to Browse present?)
//   P1b rapid double-taps on every CTA of the not-found screen
//   P2  true session expiry: valid token -> load /orders -> swap in garbage token ->
//       re-enter route -> assert copy is friendly (no raw leak)
//   P3  notifications with DEAD token (fetchNotifications error branch) + anon
//   P4  TZS price format parity mobile vs reference :3000
//   P5  tablet 404 + empty search settled states
const path = require('path'); const fs = require('fs');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131';
const TOK = fs.readFileSync('/tmp/au5sk_tok.txt', 'utf8').trim();
const OUT = [];
function rec(o) { OUT.push(o); console.log('REC', JSON.stringify(o).slice(0, 650)); }
const LEAK = /(ApiException|Exception:|Stack trace|SocketException|ClientException|failed: HTTP|HTTP \d{3}\b|Internal Server Error|Failed host lookup)/i;

async function text(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => ''); }
async function shot(p, name) { await L.screenshot(p, `e2e/shots/AU-005/AU-005-sk2-${name}.png`); }
function monitor(p) {
  const net = []; const h = { ok: false };
  p.on('response', r => { if (/localhost:8083\/api\//.test(r.url())) net.push(`${r.request().method()} ${r.url().split('/api/')[1].slice(0, 46)} -> ${r.status()}`); h.ok = net.some(x => /-> (200|304)$/.test(x)); });
  return { net, h };
}

(async () => {
  const b = await L.newBrowser();
  // ================= MOBILE WARM SESSION =================
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const m = monitor(p);
  // login FIRST so every later state is warm + authed
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 30 && !(await text(p)).includes('Buy now'); i++) await new Promise(r => setTimeout(r, 2000));
  await p.evaluate(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, TOK);
  await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 40 && !m.h.ok; i++) await new Promise(r => setTimeout(r, 2500));
  rec({ step: 'warm-authed-home', ok: m.h.ok });
  if (!m.h.ok) process.exit(2);

  // ---- P1: warm 404 product ----
  m.net.length = 0;
  await p.evaluate(() => { window.location.hash = '#/product/999999'; }).catch(() => {});
  let t404 = '';
  for (let i = 0; i < 50; i++) {
    t404 = await text(p);
    if (/Error: Product not found|couldn't find that|Could not load product/.test(t404)) break;
    await new Promise(r => setTimeout(r, 600));
  }
  const btns404 = await p.evaluate(() => [...document.querySelectorAll('flt-semantics[role="button"]')].map(e => (e.textContent || '').trim()).filter(Boolean));
  rec({ attack: 'P1-warm-product-404', api: m.net.slice(0, 4), copy: (t404.match(/Error: Product not found[^\n]*|We couldn't find that|Could not load product[^\n]*/) || [''])[0],
    hasBackToBrowse: /Back to Browse/.test(t404), buttons: [...new Set(btns404)], deadBuyControls: /Buy now|Add to cart/i.test(t404), leak: LEAK.test(t404) });
  await shot(p, 'm-p1-warm-404');

  // ---- P1b: rapid double-taps on every visible button of the 404 screen ----
  const uniqBtns = [...new Set(btns404)];
  m.net.length = 0;
  for (let round = 0; round < 2; round++) {
    for (const lbl of uniqBtns) { await L.clickBtn(p, lbl.slice(0, 18)).catch(() => {}); await new Promise(r => setTimeout(r, 130)); }
  }
  await new Promise(r => setTimeout(r, 2500));
  const tAfterTaps = await text(p);
  rec({ attack: 'P1b-rapid-taps-404', tapped: uniqBtns, leak: LEAK.test(tAfterTaps),
    stillNotFoundScreen: /Product not found|Back to Browse|Browse/.test(tAfterTaps) || !/Buy now/i.test(tAfterTaps),
    head: tAfterTaps.slice(0, 150).replace(/\n+/g, ' | ') });
  await shot(p, 'm-p1b-after-taps');

  // recover to home via Back to Browse if present
  await L.clickBtn(p, 'Back to Browse').catch(() => {});
  await new Promise(r => setTimeout(r, 2500));

  // ---- P2: true session expiry mid-flow on /orders ----
  m.net.length = 0;
  await p.evaluate(() => { window.location.hash = '#/orders'; }).catch(() => {});
  await new Promise(r => setTimeout(r, 7000));
  const tOrdersValid = await text(p);
  const ordersOk = /My orders/.test(tOrdersValid) && !/Could not load orders/.test(tOrdersValid);
  rec({ attack: 'P2-orders-valid-token', ordersLoaded: ordersOk, api: [...new Set(m.net)].slice(0, 6), head: tOrdersValid.slice(0, 120).replace(/\n+/g, ' | ') });
  await shot(p, 'm-p2-orders-valid');

  // NOW kill the token and force a refetch
  await p.evaluate(() => localStorage.setItem('flutter.auth_token', JSON.stringify('garbage.token.sig')));
  await p.evaluate(() => { window.location.hash = '#/'; }).catch(() => {});
  await new Promise(r => setTimeout(r, 1200));
  m.net.length = 0;
  await p.evaluate(() => { window.location.hash = '#/orders'; }).catch(() => {});
  await new Promise(r => setTimeout(r, 8000));
  const tDead = await text(p);
  rec({ attack: 'P2-orders-expired-token', leak: LEAK.test(tDead),
    copyHead: (tDead.match(/Could not load orders[^\n]*/) || [''])[0].slice(0, 160),
    friendlyOnly: !LEAK.test((tDead.match(/Could not load orders[^\n]*/) || [''])[0]), netCount: m.net.length });
  await shot(p, 'm-p2-orders-expired');

  // restore token
  await p.evaluate(t => localStorage.setItem('flutter.auth_token', JSON.stringify(t)), TOK);

  // ---- P3: notifications with DEAD token then VALID token ----
  await p.evaluate(() => localStorage.setItem('flutter.auth_token', JSON.stringify('garbage.token.sig')));
  await p.evaluate(() => { window.location.hash = '#/'; }).catch(() => {});
  await new Promise(r => setTimeout(r, 1200));
  m.net.length = 0;
  await p.evaluate(() => { window.location.hash = '#/notifications'; }).catch(() => {});
  await new Promise(r => setTimeout(r, 8000));
  const tNotifDead = await text(p);
  rec({ attack: 'P3-notifications-deadtoken', leak: LEAK.test(tNotifDead),
    errCopy: (tNotifDead.match(/Could not load notifications[^\n]*/) || [''])[0].slice(0, 160),
    emptyCopy: /No notifications yet/.test(tNotifDead) });
  await shot(p, 'm-p3-notifications-deadtoken');
  await p.evaluate(t => localStorage.setItem('flutter.auth_token', JSON.stringify(t)), TOK);

  // ================= TZS PARITY vs reference =================
  try {
    const refCtx = await b.newContext({ viewport: { width: 375, height: 667 } });
    const rp = await refCtx.newPage();
    await rp.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 6000));
    const refTxt = await rp.evaluate(() => document.body.innerText).catch(() => '');
    const refPrices = (refTxt.match(/(TZS|TSh)\s?[\d,\.]+|\d{1,3}(,\d{3})+(\.\d+)?/g) || []).slice(0, 8);
    rec({ attack: 'P4-reference-prices', samples: refPrices });
    await refCtx.close();
  } catch (e) { rec({ attack: 'P4-reference-prices', error: e.message }); }

  // ================= TABLET SETTLED STATES =================
  const ctxT = await L.newCtx(b, { viewport: { width: 768, height: 1024 } });
  const pt = await ctxT.newPage();
  const mt = monitor(pt);
  await pt.goto(APP + '/#/product/999999', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 30 && !mt.h.ok; i++) await new Promise(r => setTimeout(r, 2000));
  let t404t = '';
  for (let i = 0; i < 40; i++) { t404t = await text(pt); if (/Product not found|couldn't find that/.test(t404t)) break; await new Promise(r => setTimeout(r, 600)); }
  rec({ attack: 'P5-tablet-404', ok: mt.h.ok, copy: (t404t.match(/Error: Product not found|We couldn't find that/g) || [])[0] || '', hasBackToBrowse: /Back to Browse/.test(t404t), leak: LEAK.test(t404t), deadBuyControls: /Buy now|Add to cart/i.test(t404t) });
  await shot(pt, 't-p5-404');
  await pt.evaluate(() => { window.location.hash = '#/search?q=xqzjvkwq'; }).catch(() => {});
  let tEt = '';
  for (let i = 0; i < 40; i++) { tEt = await text(pt); if (/No results found|Search failed/.test(tEt)) break; await new Promise(r => setTimeout(r, 600)); }
  rec({ attack: 'P5-tablet-search-empty', ok: mt.h.ok, copy: (tEt.match(/No results found|Search failed[^\n]*/) || [''])[0], leak: LEAK.test(tEt) });
  await shot(pt, 't-p5-search-empty');
  await ctxT.close();

  fs.writeFileSync('/tmp/au5sk_findings5.json', JSON.stringify(OUT, null, 1));
  console.log('PHASE5_DONE');
  await ctx.close();
  await b.close().catch(() => {});
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
