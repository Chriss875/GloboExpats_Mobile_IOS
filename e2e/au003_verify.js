// AU-003 router/deep-links — full verify (375x667 + 768x1024), video, vision PNGs, parity refs.
const fs = require('fs');
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const SHOT = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-003/';
const VDIR = '/tmp/wf-videos-AU-003-v2/';
const REF = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-003-ref/';
fs.mkdirSync(SHOT, { recursive: true }); fs.mkdirSync(VDIR, { recursive: true }); fs.mkdirSync(REF, { recursive: true });
const R = { routes: [], gate: {}, notFound: {}, buttons: [], imgs: {}, consoleErrors: [], parity: [] };
const log = (...a) => console.log('AU003:', ...a);

function imgWatch(p) {
  p.on('response', r => {
    const u = r.url();
    if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)) {
      const cl = parseInt(r.headers()['content-length'] || '-1', 10);
      const a = (R.imgs[u] = R.imgs[u] || []); a.push({ s: r.status(), cl });
    }
  });
  p.on('console', m => { if (m.type() === 'error' && !/ERR_SSL_UNRECOGNIZED/.test(m.text())) R.consoleErrors.push(m.text().slice(0, 140)); });
  p.on('pageerror', e => R.consoleErrors.push('PAGEERROR ' + String(e).slice(0, 140)));
}
async function gotoHash(p, hash, marker, ms = 28000) {
  await p.goto(lib.APP + '#' + hash, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  const ok = await lib.waitText(p, marker, ms);
  await p.waitForTimeout(700);
  return ok;
}
async function hashNav(p, hash) { await p.evaluate(h => { location.hash = h; }, hash).catch(() => {}); await p.waitForTimeout(1100); }
async function text(p) { return lib.allText(p); }

// click-everything with observable-effect assertion
async function clickPhase(p, name, hash, capBtn = 16, capTap = 6) {
  await hashNav(p, hash);
  for (const [kind, sel, cap] of [['button', 'flt-semantics[role="button"]', capBtn], ['tappable', 'flt-semantics[flt-tappable]', capTap]]) {
    let els = []; try { els = await p.locator(sel).all(); } catch (e) { continue; }
    const n = Math.min(els.length, cap);
    for (let i = 0; i < n; i++) {
      // re-resolve element each time (tree rebuilds after nav)
      await hashNav(p, hash);
      let list = []; try { list = await p.locator(sel).all(); } catch (e) { continue; }
      if (i >= list.length) break;
      const el = list[i];
      const label = ((await el.textContent().catch(() => '')) || '').trim().slice(0, 60);
      const disabled = (await el.getAttribute('aria-disabled').catch(() => null)) === 'true';
      const box = await el.boundingBox().catch(() => null);
      if (!box || box.width < 2 || box.height < 2) {
        R.buttons.push({ route: name, kind, label: label || '(unlabeled)', disabled, clicked: false, effect: false, note: 'offscreen/zero-size' });
        continue;
      }
      if (disabled) { R.buttons.push({ route: name, kind, label, disabled: true, clicked: false, effect: false, note: 'disabled control' }); continue; }
      const baseTxt = (await text(p)).slice(0, 260); const baseUrl = p.url();
      let dlg = false; const dh = d => { dlg = true; d.dismiss().catch(() => {}); }; p.on('dialog', dh);
      let clicked = false;
      try { await el.click({ timeout: 3500, trial: false }); clicked = true; } catch (e) { try { await el.click({ force: true, timeout: 2500 }); clicked = true; } catch (e2) {} }
      await p.waitForTimeout(800);
      const afterTxt = (await text(p)).slice(0, 260);
      p.removeListener('dialog', dh);
      const effect = dlg || p.url() !== baseUrl || afterTxt !== baseTxt;
      R.buttons.push({ route: name, kind, label: label || '(unlabeled)', disabled: false, clicked, effect, note: '' });
      log(`  ${name} ${kind}[${i}] "${label}" clicked=${clicked} effect=${effect}`);
      if (!clicked) continue;
      await hashNav(p, hash);
    }
  }
}

async function probe(p, vp, name, hash, marker, checks = []) {
  const ok = await gotoHash(p, hash, marker);
  const txt = await text(p);
  const rec = { name, vp, hash, url: p.url(), markerSeen: ok, realDataHits: checks.filter(c => c.re.test(txt)).map(c => c.name), junk: /lorem ipsum|dummy data|\bTODO\b/i.test(txt) };
  R.routes.push(rec);
  log(`${vp} ${name} url=${rec.url} marker=${ok} hits=[${rec.realDataHits}]`);
  await lib.screenshot(p, SHOT + `flutter-${vp}-${name}.png`);
  if (vp === '375x667') await clickPhase(p, name, hash, 16, 6);
  return rec;
}

(async () => {
  const b = await lib.newBrowser();

  /* ---------- mobile pass ---------- */
  const ctx = await lib.newCtx(b, { viewport: { width: 375, height: 667 }, videoPath: VDIR + 'au003-mobile.webm' });
  const p = await ctx.newPage(); imgWatch(p);

  // AUTH GATE — acceptance criterion
  await gotoHash(p, '/checkout', 'Welcome back', 30000);
  const gateUrl = p.url(), gateTxt = await text(p);
  R.gate = { opened: '/checkout', landedUrl: gateUrl, loginShown: gateTxt.includes('Welcome back'),
    redirectedOk: /login\?returnUrl=/.test(gateUrl), encodedForm: /returnUrl=%2Fcheckout/i.test(gateUrl) };
  log('GATE:', gateUrl, JSON.stringify(R.gate));
  await lib.screenshot(p, SHOT + 'flutter-375x667-gate-checkout-to-login.png');
  await p.waitForTimeout(500);

  const ei = p.locator('input[type="text"]').first(), pi = p.locator('input[type="password"]').first();
  await ei.click({ force: true }).catch(() => {}); await p.waitForTimeout(400); await pageType(p, lib.BUYER.email);
  await pi.click({ force: true }).catch(() => {}); await p.waitForTimeout(400); await pageType(p, lib.BUYER.pw);
  await lib.clickBtn(p, 'Log in');
  const resumed = await lib.waitText(p, 'Delivery address', 35000);
  await p.waitForTimeout(1200);
  R.gate.resumeUrl = p.url(); R.gate.resumeRendered = resumed;
  log('RESUME:', R.gate.resumeUrl, 'rendered=', resumed);
  await lib.screenshot(p, SHOT + 'flutter-375x667-gate-resume-checkout.png');

  // unknown route
  await gotoHash(p, '/nope', 'Page not found', 20000);
  R.notFound = { url: p.url(), friendly: (await text(p)).includes('Page not found'), crashed: !(await p.evaluate(() => !!document.querySelector('flt-semantics'))) };
  log('NOTFOUND:', JSON.stringify(R.notFound));
  await lib.screenshot(p, SHOT + 'flutter-375x667-notfound-nope.png');

  const FEAT = [{ name: 'Indian Folk Art', re: /Indian Folk Art/ }];
  await probe(p, '375x667', 'home-root', '/', 'Buy now', FEAT, );
  await probe(p, '375x667', 'browse', '/browse', 'Marketplace', [{ name: 'prices-TSh', re: /TSh|TZS/ }]);
  await probe(p, '375x667', 'search-q-apartment', '/search?q=apartment', 'Search', [{ name: 'Kawe Beach apt', re: /Kawe Beach/ }]);
  await probe(p, '375x667', 'seller-57', '/seller/57', 'Seller', [{ name: 'Rupal Dubal', re: /Rupal Dubal/ }]);
  await probe(p, '375x667', 'product-623', '/product/623', 'Kawe Beach', [{ name: 'title', re: /Kawe Beach/ }]);
  await probe(p, '375x667', 'cart', '/cart', 'Cart');
  await probe(p, '375x667', 'help', '/help', 'Help');
  await probe(p, '375x667', 'about', '/about', 'About');
  await probe(p, '375x667', 'faq', '/faq', 'FAQ');
  await probe(p, '375x667', 'notifications', '/notifications', 'Notifications', [{ name: 'empty-state', re: /No notifications yet|No new/ }]);

  // authed-only routes in same session (logged in already)
  let orderId = null;
  try {
    const tok = await lib.apiLogin(lib.BUYER);
    const or = await lib.api(tok, 'GET', '/api/v1/orders?page=0&size=5');
    orderId = or.json && or.json.content && or.json.content[0] ? (or.json.content[0].orderId ?? or.json.content[0].id) : null;
    R.gate.apiOrderProbe = { status: or.status, orderId };
  } catch (e) { log('orders api failed', String(e).slice(0, 60)); }
  await probe(p, '375x667', 'authed-orders', '/orders', 'My orders', [{ name: 'orders-or-empty', re: /Total:|No orders yet|Order #/ }]);
  if (orderId) await probe(p, '375x667', 'authed-order-' + orderId, '/orders/' + orderId, 'Order', [{ name: 'order-id', re: new RegExp(String(orderId)) }]);
  await probe(p, '375x667', 'terms', '/terms', 'Terms of service');
  await probe(p, '375x667', 'privacy', '/privacy', 'Privacy policy');
  await probe(p, '375x667', 'contact', '/contact', 'Contact');
  await probe(p, '375x667', 'reset-password', '/reset-password', 'Reset password');
  await probe(p, '375x667', 'verify-email', '/verify-email', 'Verify account');
  await probe(p, '375x667', 'register', '/register', 'Sign up');
  await probe(p, '375x667', 'insights', '/insights', 'Insights');
  await probe(p, '375x667', 'admin', '/admin', 'Admin');

  await lib.closeVideo(ctx, VDIR + 'au003-mobile.webm').then(async () => {
    try { fs.renameSync(VDIR + 'au003-mobile.webm', '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-003.webm'); log('video saved'); } catch (e) { log('vidmove', String(e).slice(0, 60)); }
  });

  /* ---------- tablet pass (no clicks, shots + markers only) ---------- */
  const ctx2 = await lib.newCtx(b, { viewport: { width: 768, height: 1024 }, videoPath: VDIR + 'au003-tablet.webm' });
  const q = await ctx2.newPage(); imgWatch(q);
  await gotoHash(q, '/', 'Buy now', 30000);
  await lib.screenshot(q, SHOT + 'flutter-768x1024-home-root.png');
  for (const [name, hash, marker] of [
    ['browse', '/browse', 'Marketplace'], ['search-q-apartment', '/search?q=apartment', 'Search'],
    ['seller-57', '/seller/57', 'Seller'], ['product-623', '/product/623', 'Kawe Beach'],
    ['cart', '/cart', 'Cart'], ['gate-checkout-to-login', '/checkout-guestprobe', 'Welcome back'],
  ]) { await hashNav(q, hash); await lib.waitText(q, marker, 20000); await lib.screenshot(q, SHOT + `flutter-768x1024-${name}.png`); }
  // gate on tablet properly
  await hashNav(q, '/checkout'); await lib.waitText(q, 'Welcome back', 20000);
  R.gate.tabletUrl = q.url();
  await lib.screenshot(q, SHOT + 'flutter-768x1024-auth-gate.png');
  await lib.closeVideo(ctx2, VDIR + 'au003-tablet.webm').then(async () => {
    try { fs.renameSync(VDIR + 'au003-tablet.webm', '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-003-tablet.webm'); } catch (e) {}
  });

  /* ---------- reference parity shots on :3000 (structural only) ---------- */
  const ctxr = await b.newContext({ viewport: { width: 375, height: 667 } });
  const rp = await ctxr.newPage();
  for (const [state, path] of [['product', '/product/623'], ['search', '/search?q=apartment'], ['checkout-gate', '/checkout'], ['notfound', '/nope']]) {
    try {
      await rp.goto('http://localhost:3000' + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await rp.waitForTimeout(3500);
      await rp.screenshot({ path: REF + `ref-375x667-${state}.png` }).catch(() => {});
      R.parity.push({ state, refUrl: rp.url(), status: 'captured' });
    } catch (e) { R.parity.push({ state, error: String(e).slice(0, 80) }); }
  }
  await ctxr.close();
  await b.close();

  fs.writeFileSync('/tmp/au003_v2.json', JSON.stringify(R, null, 1));
  log('DONE routes=', R.routes.length, 'buttons=', R.buttons.length, 'imgs=', Object.keys(R.imgs).length);
})().catch(e => { console.error('AU003 FATAL', String(e).slice(0, 400)); fs.writeFileSync('/tmp/au003_v2.json', JSON.stringify(R, null, 1)); process.exit(1); });

function pageType(p, s) { return p.keyboard.type(s, { delay: 8 }); }
