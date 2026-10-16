// au005_skeptic.js — adversarial overturn attempt for AU-005 (error_taxonomy_empty_states).
// Bundle under attack: FROZEN http://localhost:9121 @ git b56e345 (main.dart.js mtime 2026-08-25T20:08:09Z).
// Prior PASS was on build 3912b72 — everything re-proven here against the CURRENT bundle.
// Attacks: A0 regression happy-path | A1 rapid double-taps | A2 out-of-order/back-out |
// A3 empty states (blocks hide) | A4 offline abort + retry | A5 invalid input (500ch/emoji/UTF-8/script) |
// A6 locale/number formats (TZS) | A7 role probes (buyer->admin, unauth deep links) |
// A8 session expiry mid-flow (corrupt token) | A9 stale-cache reload after mutation.
const path = require('path');
const fs = require('fs');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9121';
const UNIT = 'AU-005';
const SHOT_DIR = 'e2e/shots/AU-005';
const VID = '/tmp/wf-videos-AU-005-sk';
fs.mkdirSync(SHOT_DIR, { recursive: true });
fs.mkdirSync(VID, { recursive: true });

const R = { ts: new Date().toISOString(), unit: 'AU-005', stage: 'skeptic-backfill', wave: 'skeptic',
  build_sha: 'b56e345', bundle_url: APP, attacks_attempted: 0, attacks_broken: 0,
  findings: [], evidence: [], consoleErrors: [], network: [] };
function finding(cls, result, detail, ev) {
  R.findings.push({ class: cls, result, detail, evidence: ev || [] });
  R.attacks_attempted++;
  if (result === 'BROKEN') R.attacks_broken++;
  console.log(result.padEnd(9), '|', cls, '|', detail.slice(0, 190));
}
async function shot(p, name) {
  const f = `${SHOT_DIR}/sk-${name}.png`;
  await L.screenshot(p, f);
  const rel = `e2e/shots/AU-005/${path.basename(f)}`;
  R.evidence.push(rel);
  return rel;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => ''); }
async function hasText(p, n) { return (await txt(p)).includes(n); }
async function waitText(p, n, tries = 25, ms = 1000) { for (let i = 0; i < tries; i++) { if ((await txt(p)).includes(n)) return true; await sleep(ms); } return false; }

async function findNode(p, label, opts = {}) {
  return p.evaluate(({ lbl, exact }) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (exact ? t !== lbl : !t.includes(lbl)) return;
      const isCtl = e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null;
      if (!isCtl) return;
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
      if (!best || r.width * r.height < best.area)
        best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    return best;
  }, { lbl: label, exact: !!opts.exact });
}
async function tap(p, label, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const hit = await findNode(p, label);
    if (hit) { await p.mouse.click(Math.max(4, Math.min(hit.x, 371)), Math.max(24, Math.min(hit.y, 663))); await sleep(900); return true; }
    await p.mouse.move(187, 350); await p.mouse.wheel(0, 260); await sleep(320);
  }
  return false;
}
async function tapXY(p, x, y) { await p.mouse.click(x, y); await sleep(700); }
async function isLoggedIn(p) { try { return !!(await p.evaluate(() => localStorage.getItem('flutter.auth_token') || '')); } catch (e) { return false; } }
async function hashNav(p, hash, settle = 4200) {
  await p.evaluate(h => { window.location.hash = h; }, hash).catch(() => {});
  await sleep(settle);
}
async function openApp(p) {
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000).catch(() => {});
  await p.evaluate(() => { if (window.location.hash && window.location.hash !== '#/') window.location.hash = '#/'; }).catch(() => {});
  await sleep(1200);
}
async function loginUi(p, email, pw) {
  if (!(await hasText(p, 'Welcome back'))) {
    await L.clickBtn(p, 'Login'); await waitText(p, 'Welcome back', 20);
  }
  const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300);
  await p.keyboard.type(email, { delay: 12 });
  const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300);
  await p.keyboard.type(pw, { delay: 12 });
  await L.clickBtn(p, 'Log in');
  let ok = false; for (let i = 0; i < 30 && !ok; i++) { await sleep(1000); ok = await isLoggedIn(p); }
  return ok;
}
function watchApi(p) {
  p.on('response', r => { const u = r.url(); if (u.includes(':8083/api/')) R.network.push(`${r.request().method()} ${u.split(':8083')[1].slice(0, 90)} -> ${r.status()}`); });
  p.on('console', m => { if (m.type() === 'error') R.consoleErrors.push(m.text().slice(0, 160)); });
}

(async () => {
  const browser = await L.newBrowser();
  const ctxA = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: path.join(VID, 'AU-005-skeptic-375.webm') });
  const ctxB = await L.newCtx(browser, { viewport: { width: 768, height: 1024 } });
  const p = await ctxA.newPage();
  watchApi(p);

  // ================= A0 REGRESSION PROBE — the unit's core flows on the CURRENT bundle =====
  await openApp(p);
  const homeOk = await hasText(p, "Tanzania's expat marketplace");
  await shot(p, 'a0-home');

  // A0.1 product 404 -> friendly not-found UI
  await hashNav(p, '#/product/999999');
  const t404 = await txt(p);
  const nfCopy = t404.includes('Product not found');
  const deadBar = ['Buy now', 'Add to cart'].filter(b => t404.includes(b));
  let ev = await shot(p, 'a0-product404-375');
  finding('A0-regression-404-friendly', (homeOk && nfCopy && deadBar.length === 0 && !t404.includes('Exception') && !t404.toLowerCase().includes('stack')) ? 'HELD' : 'BROKEN',
    `/product/999999 on b56e345: homeLoaded=${homeOk} notFoundCopy=${nfCopy} deadCommerceButtons=[${deadBar}] rawLeak=${/Exception|Stack trace|DartError/i.test(t404)}; text="${t404.slice(0,140).replace(/\n+/g,' | ')}"`, [ev]);

  // Back to Browse button works (regression of the CTA)
  const bb = await findNode(p, 'Back to Browse', { exact: true });
  if (bb) { await p.mouse.click(bb.x, bb.y); await sleep(2500); }
  const browseTxt = await txt(p);
  const browseLanded = /Electronics|Clothing|Furniture|products match|No products/.test(browseTxt) || (await hasText(p, 'Marketplace'));
  ev = await shot(p, 'a0-back-to-browse');
  finding('A0-regression-notfound-CTA', browseLanded ? 'HELD' : 'DISPUTED',
    `'Back to Browse' from not-found navigates: landed=${browseLanded}; text="${browseTxt.slice(0,120).replace(/\n+/g,' | ')}"`, [ev]);

  // A0.2 true-empty search -> 'No results found.'
  await hashNav(p, '#/search?q=xqzjvkw');
  const emptySearch = await waitText(p, 'No results found.', 22);
  ev = await shot(p, 'a0-search-empty-375');
  const tES = await txt(p);
  finding('A0-regression-search-empty', emptySearch ? 'HELD' : 'BROKEN',
    `/search?q=xqzjvkw (backend 0 rows, curl-proven): 'No results found.' rendered=${emptySearch}; leak=${/Exception|HTTP \d{3}/i.test(tES)}`, [ev]);

  // A0.3 notifications screen reachable with real account rows
  const tok = fs.readFileSync('/tmp/au005_admin_tok.txt', 'utf8').trim();
  await p.evaluate(t => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, tok);
  await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000).catch(() => {});
  await hashNav(p, '#/notifications');
  const tNotif = await txt(p);
  const notifData = tNotif.includes('New Request Posted');
  const notifEmptyOrData = notifData || tNotif.includes('No notifications yet.');
  ev = await shot(p, 'a0-notifications-375');
  finding('A0-regression-notifications', notifEmptyOrData && !/Could not load notifications/.test(tNotif) ? 'HELD' : 'DISPUTED',
    `notifications with real admin token: dataRows=${notifData} emptyState=${tNotif.includes('No notifications yet.')} errBanner=${/Could not load notifications/.test(tNotif)}`, [ev]);

  // ================= A7 ROLE PROBES (before other attacks mutate state) ===================
  // A7.1 buyer-only throwaway hits ADMIN deep link
  const fx = fs.readFileSync('/tmp/au005_throwaway.txt', 'utf8').split(' ');
  const bEmail = fx[0], bPw = fx[1], bTok = fx[2].trim();
  await p.evaluate(({ t, em }) => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify(em)); }, { t: bTok, em: bEmail });
  await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000).catch(() => {});
  await hashNav(p, '#/admin');
  await sleep(3500);
  const tAdmin = await txt(p);
  ev = await shot(p, 'a7-buyer-admin-deeplink');
  const adminBlockedFriendly = /Admin data unavailable|do not have permission|log in/i.test(tAdmin) && !/Access Denied|FORBIDDEN|Exception/i.test(tAdmin);
  finding('A7-buyer-to-admin-route', adminBlockedFriendly ? 'HELD' : 'BROKEN',
    `throwaway BUYER deep-links #/admin: friendlyGate=${adminBlockedFriendly}; rawLeak=${/FORBIDDEN|Access Denied|Exception/i.test(tAdmin)}; text="${tAdmin.slice(0,150).replace(/\n+/g,' | ')}"`, [ev]);

  // A7.2 same buyer on /admin/payments-review and /admin/ratings (sub-routes)
  await hashNav(p, '#/admin/payments-review');
  await sleep(3000);
  const tPR = await txt(p);
  ev = await shot(p, 'a7-buyer-payments-review');
  const prFriendly = !/FORBIDDEN|Access Denied|Exception/i.test(tPR);
  finding('A7-buyer-admin-payments-review', prFriendly ? 'HELD' : 'BROKEN',
    `BUYER on #/admin/payments-review: no raw backend error surfaced (${prFriendly}); text="${tPR.slice(0,130).replace(/\n+/g,' | ')}"`, [ev]);

  // A7.3 unauthenticated deep links (no token at all)
  await p.evaluate(() => { localStorage.clear(); });
  await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000).catch(() => {});
  await hashNav(p, '#/orders');
  await sleep(2500);
  const tUnauthOrders = await txt(p);
  ev = await shot(p, 'a7-unauth-orders');
  finding('A7-unauth-gated-deeplink', (tUnauthOrders.includes('Welcome back') || /log in|Login/i.test(tUnauthOrders)) ? 'HELD' : 'DISPUTED',
    `anon deep-link #/orders -> login gate=${tUnauthOrders.includes('Welcome back')}; text="${tUnauthOrders.slice(0,110).replace(/\n+/g,' | ')}"`, [ev]);

  // anon on a PUBLIC route must still render (not a crash)
  await hashNav(p, '#/seller/67');
  await sleep(4000);
  const tSeller = await txt(p);
  ev = await shot(p, 'a7-anon-public-seller');
  finding('A7-anon-public-route-ok', !/Exception/i.test(tSeller) ? 'HELD' : 'BROKEN',
    `anon #/seller/67 public route renders without exception leak; text="${tSeller.slice(0,120).replace(/\n+/g,' | ')}"`, [ev]);

  // ================= A8 SESSION EXPIRY MID-FLOW (corrupt token while browsing) ===========
  await p.evaluate(() => localStorage.removeItem('flutter.auth_token'));
  // sign in as the shared admin/buyer account through the REAL login form
  await openApp(p);
  const li1 = await loginUi(p, 'mobile.test.20260820@gmail.com', 'StrongPass!1');
  await hashNav(p, '#/product/338');
  await waitText(p, 'HUNTRX TOY SET', 20);
  // mid-flow corrupt the stored token then hit an AUTHED surface (save toggle)
  await p.evaluate(t => {
    const cur = JSON.parse(localStorage.getItem('flutter.auth_token') || '"x"');
    localStorage.setItem('flutter.auth_token', JSON.stringify(cur.replace(/.$/, c => (c === 'a' ? 'b' : 'a'))));
  });
  const saveHit = await findNode(p, 'Save');
  if (saveHit) { await p.mouse.click(saveHit.x, saveHit.y); await sleep(2200); }
  const tExp = await txt(p);
  const snackbarShot = await shot(p, 'a8-expired-token-save');
  // detect dark snackbar band via pixel scan (Flutter web does not expose toast text)
  const sb = await L.hasSnackBar(p);
  finding('A8-session-expiry-midflow', (!tExp.includes('Exception') ) ? 'HELD' : 'BROKEN',
    `expired-token Save tap on live detail page: no exception leak=${!tExp.includes('Exception')} snackBandDetected=${sb.found} authStillShown=${!/Welcome back/.test(tExp)}; page="${tExp.slice(0,100).replace(/\n+/g,' | ')}"`, [snackbarShot]);

  // ================= A1 RAPID DOUBLE-TAPS ON EVERY CTA ==================================
  await openApp(p);
  await hashNav(p, '#/product/338');
  await waitText(p, 'HUNTRX TOY SET', 25);
  // rapid-fire taps on Add to cart / Buy now / Save within 300ms windows
  const addBtn = await findNode(p, 'Add to cart', { exact: true });
  const buyBtn = await findNode(p, 'Buy now', { exact: true });
  const before = await txt(p);
  if (addBtn && buyBtn) {
    for (let i = 0; i < 3; i++) { await p.mouse.click(addBtn.x, addBtn.y); await sleep(120); }
    for (let i = 0; i < 3; i++) { await p.mouse.click(buyBtn.x, buyBtn.y); await sleep(120); }
  }
  await sleep(2500);
  const afterRapid = await txt(p);
  ev = await shot(p, 'a1-rapid-taps-detail');
  const checkoutOpened = /Checkout|Delivery address|Order summary/i.test(afterRapid);
  const crashed = afterRapid.trim().length < 40;
  finding('A1-rapid-double-taps', (!crashed && !/Exception/i.test(afterRapid)) ? 'HELD' : 'BROKEN',
    `6 rapid taps (3x Add-to-cart + 3x Buy-now, ~120ms apart): appStable=${!crashed}, checkoutOpened=${checkoutOpened} (single navigation is acceptable; crash/dup-nav would break), textLen=${afterRapid.length}`, [ev]);

  // recover to a clean state for later attacks
  await openApp(p);

  // ================= A2 OUT-OF-ORDER CLICK SEQUENCES / MID-FLOW BACK-OUT ================
  // search-first flow: type query but hit Back before results settle, then re-enter
  await hashNav(p, '#/search?q=');
  await sleep(1500);
  const sInp = p.locator('input[type="text"]').first();
  await sInp.click({ force: true }).catch(() => {}); await sleep(300);
  await p.keyboard.type('toy', { delay: 14 });
  await p.keyboard.press('Enter');
  await sleep(700); // leave mid-request
  const backBtn = await findNode(p, 'Back');
  if (backBtn) { await p.mouse.click(backBtn.x, backBtn.y); await sleep(1200); }
  // immediately re-enter the same search (out-of-order re-entry)
  await hashNav(p, '#/search?q=toy');
  const toyResults = await waitText(p, 'TOY', 22);
  ev = await shot(p, 'a2-search-backout-reenter');
  finding('A2-out-of-order-backout', toyResults ? 'HELD' : 'DISPUTED',
    `mid-request Back during search then immediate re-entry: results render=${toyResults}; text="${(await txt(p)).slice(0,120).replace(/\n+/g,' | ')}"`, [ev]);
  await openApp(p);

  // ================= A4 OFFLINE MID-REQUEST (route-abort :8083) + RETRY =================
  await p.route('**localhost:8083/**', r => r.abort()).catch(() => {});
  await hashNav(p, '#/product/338');
  await sleep(6000);
  const tOffline = await txt(p);
  ev = await shot(p, 'a4-offline-detail');
  const offlineHandled = /Could not load product|couldn't find that|Product not found|Network problem|try again/i.test(tOffline) && !/Exception|SocketException|Failed host lookup/i.test(tOffline);
  finding('A4-offline-midrequest-copy', offlineHandled ? 'HELD' : (tOffline.trim().length > 40 ? 'DISPUTED' : 'BROKEN'),
    `all :8083 requests aborted -> detail page copy: handled=${offlineHandled}; leakRawNet=${/SocketException|Failed host lookup|Connection refused/i.test(tOffline)}; text="${tOffline.slice(0,150).replace(/\n+/g,' | ')}"`, [ev]);

  // retry after restoring the network
  await p.unroute('**localhost:8083/**').catch(() => {});
  const retryBtn = await findNode(p, 'Retry', { exact: true });
  if (retryBtn) { await p.mouse.click(retryBtn.x, retryBtn.y); await sleep(3500); }
  else { await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(() => {}); await sleep(3000); await hashNav(p, '#/product/338', 5000); }
  const tRecovered = await txt(p);
  ev = await shot(p, 'a4-recovered-after-retry');
  finding('A4-offline-retry-recovers', tRecovered.includes('HUNTRX TOY SET') ? 'HELD' : 'DISPUTED',
    `network restored + reload/retry: product loads again=${tRecovered.includes('HUNTRX TOY SET')}`, [ev]);

  // ================= A5 INVALID INPUT ===================================================
  // 500-char query, emoji, Swahili UTF-8, script tag — each through the real search field
  const cases = [
    ['q500', 'a'.repeat(500)],
    ['emoji', '🚀🔥👍'.repeat(3)],
    ['swahili', 'Chakula cha mchuzi wa nyama na wali'],
    ['scripttag', '<script>alert(1)</script>'],
  ];
  for (const [name, val] of cases) {
    await hashNav(p, '#/search?q=');
    await sleep(1200);
    const inp = p.locator('input[type="text"]').first();
    await inp.click({ force: true }).catch(() => {}); await sleep(250);
    await inp.fill('').catch(() => {});
    await p.keyboard.type(val, { delay: 2 });
    await p.keyboard.press('Enter');
    await sleep(5500);
    const t = await txt(p);
    const okState = /No results found\.|results|TSh/.test(t) && !/Exception|RangeError/i.test(t);
    const echoSafe = !t.includes('<script>');
    ev = await shot(p, 'a5-' + name);
    finding('A5-invalid-input-' + name, okState ? 'HELD' : 'BROKEN',
      `query len=${val.length} first16="${val.slice(0, 16)}": clean terminal state=${okState}, scriptEcho=${!echoSafe ? t.includes('<script>') : false}; text="${t.slice(0,110).replace(/\n+/g,' | ')}"`, [ev]);
    await openApp(p);
  }

  // ================= A6 LOCALE / NUMBER FORMATS =========================================
  await hashNav(p, '#/product/338');
  await waitText(p, 'HUNTRX TOY SET', 22);
  const tPrice = await txt(p);
  const m = tPrice.match(/TSh\s?[\d,]+(\.\d+)?/g) || [];
  const priceOk = m.some(s => /^TSh\s?\d{1,3}(,\d{3})*$/.test(s.replace(/\s+/g, ' ')));
  ev = await shot(p, 'a6-price-format');
  finding('A6-locale-number-format', priceOk ? 'HELD' : 'DISPUTED',
    `TZS formatting on detail: prices=[${m.slice(0, 4).join(' ; ')}] thousandsSeparatorsConsistent=${priceOk}`, [ev]);

  // tablet viewport spot-check of the two canonical states
  const q = await ctxB.newPage();
  watchApi(q);
  await q.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(q, 'Buy now', 45000).catch(() => {});
  await q.evaluate(() => { window.location.hash = '#/product/999999'; }).catch(() => {});
  await sleep(5000);
  const tq = await txt(q);
  ev = await shot.call(null, q, 'a10-tablet-404');
  finding('A10-tablet-404-parity', tq.includes('Product not found') ? 'HELD' : 'DISPUTED',
    `768x1024 #/product/999999: notFound copy present=${tq.includes('Product not found')}; text="${tq.slice(0,110).replace(/\n+/g,' | ')}"`, [ev]);
  await q.close();

  await L.closeVideo(ctxA, path.join(VID, 'AU-005-skeptic-375.webm'));
  await ctxB.close().catch(() => {});
  await browser.close();

  fs.writeFileSync('/tmp/au005_skeptic_stage1.json', JSON.stringify(R, null, 2));
  console.log('\nSTAGE1 attacks=', R.attacks_attempted, 'broken=', R.attacks_broken);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
