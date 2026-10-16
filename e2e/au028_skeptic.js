// au028_skeptic.js — SKEPTIC for AU-028 proforma_payload_price_guard.
// Mission: OVERTURN the verifier PASS. >=6 attack classes against
//   C1 (§5.1 payload 1:1) and C2 (§5.3 grand-total guard, tolerance 0.01).
// Frozen lane :9112 (sha 858b0ef, main.dart.js Last-Modified
// Tue, 25 Aug 2026 08:11:40 GMT asserted). Sandbox :8083. RW discipline:
// only this unit's fixtures (/tmp/au028_fixtures.json) are mutated.
//
// Attack classes:
//  A1 rapid double-tap on Confirm            -> exactly ONE proforma POST
//  A2 out-of-order clicks / mid-flow back-outs (pickup<->delivery, cart detour,
//     delivery-quote aborted -> Confirm must stay blocked)
//  A3 empty state (empty cart -> checkout blocked entirely)
//  A4 offline mid-request then retry         -> never fake success; retry 201
//  A5 invalid input (500-char, emoji, <script>, Swahili; readOnly email;
//     wire still §5.1-clean; server reject handled gracefully)
//  A6 locale/number formats (de-DE locale, Africa/Nairobi tz; TZS + window dates)
//  A7 role/permission probes (logged-out #/checkout gate) + session expiry
//     mid-flow (proforma forced 401 -> error, stays on review, cart intact)
//  A8 stale-cache guard BOTH directions: bump price (trip up), restore price,
//     confirm again WITHOUT touching cart (server now CHEAPER than reviewed)
//     -> guard must cancel + resync DOWN + message. Never pay a stale total.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9112';
const UNIT = 'AU-028';
const SHOT_DIR = 'e2e/shots/AU-028';
const fx = JSON.parse(fs.readFileSync('/tmp/au028_fixtures.json', 'utf8'));
const PROBE1 = `AU028 Guard Tote ${fx.stamp}`;
const PROBE2 = `AU028 Plain Mat ${fx.stamp}`;
const P1 = 15000, P2 = 25000, FEE = 8000;
const fmt = (n) => Number(n).toLocaleString('en-US');
const STAMP_OK = 'Tue, 25 Aug 2026 08:11:40 GMT';

const findings = [], failures = [], notes = [];
function F(cls, result, detail, ev) { findings.push({ class: cls, result, detail, evidence: ev || [] }); console.log(`FINDING ${result} [${cls}] ${detail}`); }
function log(m) { console.log(m); notes.push(m); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => ''); }

async function watchCalls(p) {
  const c = { pf: [], cancels: [], quotes: [] };
  p.on('response', async res => {
    const url = res.url(), meth = res.request().method();
    if (url.includes('/api/v1/checkout/proforma') && meth === 'POST') {
      let body = null; try { body = await res.json(); } catch (e) {}
      c.pf.push({ status: res.status(), post: res.request().postData(), resp: body });
    }
    if (/\/api\/v1\/proformas\/[^/]+\/cancel/.test(url)) c.cancels.push({ id: decodeURIComponent(url.split('/proformas/')[1].split('/cancel')[0]), status: res.status() });
    if (url.includes('/checkout/delivery-quote') && meth === 'POST') c.quotes.push(res.status());
  });
  return c;
}
async function persistedCart(p) {
  return p.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (!k.includes('expatCartItems')) continue;
      let raw = localStorage.getItem(k);
      if (raw == null || raw === '') continue;
      for (let d = 0; d < 2 && typeof raw === 'string'; d++) { try { raw = JSON.parse(raw); } catch (e) { break; } }
      if (Array.isArray(raw)) return raw;
    }
    return [];
  });
}
async function isLoggedIn(p) { try { return !!await p.evaluate(() => localStorage.getItem('flutter.auth_token') || ''); } catch (e) { return false; } }
async function loginFlow(p) {
  await L.waitText(p, 'Buy now', 45000);
  let ok = await isLoggedIn(p);
  if (!ok) {
    await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
    const ei = p.locator('input[type="text"]').first();
    await ei.click({ force: true }).catch(() => {}); await sleep(400);
    await p.keyboard.type(fx.buyer.email, { delay: 12 });
    const pi = p.locator('input[type="password"]').first();
    await pi.click({ force: true }).catch(() => {}); await sleep(400);
    await p.keyboard.type(fx.buyer.pw, { delay: 12 });
    await L.clickBtn(p, 'Log in');
    for (let i = 0; i < 30 && !ok; i++) { await sleep(1000); ok = await isLoggedIn(p); }
  }
  for (let i = 0; i < 20; i++) {
    if (await p.evaluate(() => document.querySelectorAll('flt-semantics').length).catch(() => 0) > 30) return ok;
    await sleep(800);
  }
  return false;
}
async function hashNav(p, r) { await p.evaluate((x) => { location.hash = x; }, r); await sleep(2200); }
async function jsClickByText(p, label) {
  const hit = await p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 10 || r.height < 10 || r.bottom < 0 || r.top > innerHeight) return;
      const roleOk = e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null;
      if (!roleOk) return;
      if (!best || r.width * r.height < best.area)
        best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    return best;
  }, label);
  if (!hit) return false;
  await p.mouse.click(Math.max(4, hit.x), Math.max(20, Math.min(hit.y, 1015)));
  await sleep(900);
  return true;
}
async function confirmBtnBox(p) {
  return p.evaluate(() => {
    let b = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if ((e.textContent || '').includes('Confirm')) { const r = e.getBoundingClientRect(); if (r.width > 50) b = { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
    });
    return b;
  });
}
async function ensureChecked(p, which, tag) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const st = await p.evaluate((w) => {
      const rows = [...document.querySelectorAll('flt-semantics')]
        .filter(e => e.getAttribute('role') === 'checkbox')
        .map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height, chk: e.getAttribute('aria-checked'), vis: r.bottom > 40 && (r.y + r.height) < innerHeight - 10 && r.width > 5 }; });
      const vis = rows.filter(b => b.vis);
      if (!vis.length) return null;
      return w === 'first' ? vis[0] : vis[vis.length - 1];
    }, which);
    if (!st) { await L.scrollToBottom(p, 12); await sleep(700); continue; }
    if (String(st.chk) !== 'true') { await p.mouse.click(st.x + 18, Math.min(Math.max(st.y + st.h / 2, 25), 1015)); await sleep(850); }
    const done = await p.evaluate((w) => {
      const rows = [...document.querySelectorAll('flt-semantics')]
        .filter(e => e.getAttribute('role') === 'checkbox')
        .map(e => { const r = e.getBoundingClientRect(); return { chk: e.getAttribute('aria-checked'), vis: r.bottom > 40 && (r.y + r.height) < innerHeight - 10 && r.width > 5 }; })
        .filter(b => b.vis);
      if (!rows.length) return false;
      return String((w === 'first' ? rows[0] : rows[rows.length - 1]).chk) === 'true';
    }, which);
    if (done) { log(`checked ${tag}`); return true; }
  }
  return false;
}
async function toggleRadio(p, idx) {
  const st = await p.evaluate((i) => {
    const rows = [...document.querySelectorAll('flt-semantics')]
      .filter(e => e.getAttribute('role') === 'radio')
      .map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height }; });
    const pick = rows[i];
    if (!pick) return null;
    return pick;
  }, idx);
  if (!st) return false;
  await p.mouse.move(190, 400);
  await p.mouse.wheel(0, Math.max(-600, Math.min(600, st.y - 320))); await sleep(800);
  const t2 = await p.evaluate((i) => {
    const rows = [...document.querySelectorAll('flt-semantics')]
      .filter(e => e.getAttribute('role') === 'radio')
      .map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height }; });
    const pick = rows[i]; if (!pick) return null;
    if (pick.y < 20 || pick.y + pick.h > innerHeight) return null;
    return { x: pick.x + 18, y: pick.y + pick.h / 2 };
  }, idx);
  if (!t2) { await jsClickByText(p, idx === 0 ? "Seller's delivery" : 'Pick up myself'); return true; }
  await p.mouse.click(t2.x, t2.y); await sleep(800);
  return true;
}
async function radioStates(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .filter(e => e.getAttribute('role') === 'radio').map(e => e.getAttribute('aria-checked')));
}
async function addViaDeepLink(p, pid, title, pickSize, shots) {
  await hashNav(p, '#/product/' + pid);
  let td = '';
  for (let i = 0; i < 20; i++) { await sleep(900); td = await txt(p); if (td.includes(title)) break; }
  if (pickSize) {
    const chip = await p.evaluate(() => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        if (t !== 'L' && !/^L\b/.test(t)) return;
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
        if (!best || r.width * r.height < best.area) best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      });
      return best;
    });
    if (chip) { await p.mouse.click(chip.x, chip.y); await sleep(700); }
  }
  let clicked = await jsClickByText(p, 'Add to cart');
  if (!clicked) { await p.mouse.click(281, 621); await sleep(1200); }
  await sleep(1100);
  return true;
}
async function phoneField(p) {
  // phone = 4th text input (first/last/email readOnly precede it)
  const n = await p.locator('input[type="text"]').count();
  return n >= 4 ? p.locator('input[type="text"]').nth(3) : null;
}
async function inputValues(p) { return p.evaluate(() => [...document.querySelectorAll('input')].map(i => i.value)); }
async function patchPrice(pid, asking, orig, qty) {
  const f = new FormData();
  const body = { askingPrice: asking, originalPrice: orig };
  if (qty != null) body.productQuantity = qty;
  f.append('product', new Blob([JSON.stringify(body)], { type: 'application/json' }), 'product.json');
  return fetch(`${L.API}/api/v1/products/update/${pid}`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + fx.seller.token }, body: f });
}
async function cancelAllPending(tag) {
  const mine = await L.api(fx.buyer.token, 'GET', '/api/v1/proformas/mine').catch(() => ({ json: null }));
  const list = (mine.json && (Array.isArray(mine.json) ? mine.json : mine.json.content)) || [];
  const out = [];
  for (const o of list.filter(x => String(x.status).toUpperCase() === 'PENDING_PAYMENT')) {
    const id = o.proformaId || o.id;
    const c = await L.api(fx.buyer.token, 'POST', `/api/v1/proformas/${id}/cancel`, {});
    out.push({ id, status: c.status, tag });
  }
  return out;
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const fr = await fetch(APP + '/main.dart.js', { method: 'HEAD' });
  const lm = fr.headers.get('last-modified');
  const fresh = fr.status === 200 && lm === STAMP_OK;
  log(`freshness HEAD=${fr.status} Last-Modified=${lm} match=${fresh}`);
  if (!fresh) { F('build-freshness', 'BROKEN', `bundle stamp drifted: ${lm}`, []); }
  else F('build-freshness', 'HELD', `frozen bundle asserted: HEAD 200, Last-Modified "${lm}"`, ['curl -I :9112/main.dart.js']);

  // ============================ CTX-A ======================================
  try {
    const videoPath = 'e2e/videos/AU-028-skeptic-a.webm';
    const browser = await L.newBrowser();
    const ctx = await L.newBrowser ? null : null;
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, recordVideo: { dir: 'e2e/videos', size: { width: 375, height: 667 } } });
    const p = await context.newPage();
    const calls = await watchCalls(p);
    await p.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    const li = await loginFlow(p);
    log(`login=${li}`);
    if (!li) throw new Error('buyer login failed');

    // ---- A3: EMPTY STATE — checkout with empty cart must be blocked --------
    {
      await hashNav(p, '#/'); await sleep(900);
      // make sure cart is empty
      let lines = await persistedCart(p);
      for (let i = 0; i < 4 && lines.length; i++) { await hashNav(p, '#/cart'); await sleep(1400); await jsClickByText(p, 'Remove'); await sleep(800); lines = await persistedCart(p); }
      const pfBefore = calls.pf.length;
      await hashNav(p, '#/checkout'); await sleep(1800);
      let T = await txt(p);
      const summaryShown = T.includes('Order Summary');
      await L.scrollToBottom(p, 8); await sleep(400);
      await jsClickByText(p, 'Continue to review');
      await sleep(1500);
      T = await txt(p);
      const emptyErr = T.includes('Your cart is empty');
      const stayedStep1 = !/Amount due/.test(T) && !/Invoice\s+\S?PF-/.test(T);
      const shot = `${SHOT_DIR}/sk-mobile-00-empty-cart-blocked.png`;
      await L.screenshot(p, shot);
      const noPost = calls.pf.length === pfBefore;
      if (summaryShown && emptyErr && stayedStep1 && noPost) F('A3-empty-state-blocks-checkout', 'HELD', `empty cart: Order Summary renders, Continue yields verbatim "Your cart is empty.", stays on step 1, proforma POSTs fired=0`, [shot]);
      else F('A3-empty-state-blocks-checkout', emptyErr || !summaryShown ? 'DISPUTED' : 'BROKEN', `summaryShown=${summaryShown} emptyErr=${emptyErr} stayedStep1=${stayedStep1} noPost=${noPost}`, [shot]);
    }

    // ---- stock both lines --------------------------------------------------
    await addViaDeepLink(p, fx.productId1, PROBE1, true);
    await addViaDeepLink(p, fx.productId2, PROBE2, false);
    await hashNav(p, '#/cart'); await sleep(2000);
    let lines = await persistedCart(p);
    log(`cart lines=${lines.map(l => l.productId + '@' + l.price).join(',')}`);
    if (!(lines.length === 2)) { await addViaDeepLink(p, fx.productId1, PROBE1, true); await addViaDeepLink(p, fx.productId2, PROBE2, false); await hashNav(p, '#/cart'); await sleep(1800); lines = await persistedCart(p); }
    if (lines.length !== 2) throw new Error('fixture cart not filled: ' + JSON.stringify(lines));
    await jsClickByText(p, 'Go to checkout'); await sleep(1800);

    // ---- A5: INVALID INPUT -------------------------------------------------
    {
      const ph = await phoneField(p);
      const JUNK = `<script>alert(1)</script> 🚀 Karibu sana ` + 'x'.repeat(500);
      const before = (await inputValues(p)).join('|');
      await ph.click({ force: true }); await sleep(350);
      await p.keyboard.type(JUNK, { delay: 2 });
      const vals = await inputValues(p);
      const phoneVal = vals[3] || '';
      const held500 = phoneVal.includes('<script>alert(1)</script>') && phoneVal.includes('Karibu');
      // readOnly email probe
      const emailIdx = 2;
      await p.locator('input[type="text"]').nth(emailIdx).click({ force: true }).catch(() => {});
      await p.keyboard.type('attacker@evil.example', { delay: 4 });
      const vals2 = await inputValues(p);
      const emailUnchanged = (vals2[2] || '') === (vals[emailIdx] || '');
      const shot1 = `${SHOT_DIR}/sk-mobile-01-junk-phone.png`;
      await L.screenshot(p, shot1);
      // proceed to review with junk phone: review must echo it inertly
      await L.scrollToBottom(p, 8); await sleep(400);
      await jsClickByText(p, 'Continue to review');
      let at2 = false;
      for (let i = 0; i < 20 && !at2; i++) { await sleep(900); const t = await txt(p); at2 = t.includes('Delivery Destination') || t.includes('Order totals'); }
      const T = await txt(p);
      const echoedRaw = /Buyer phone:/.test(T);
      const shot2 = `${SHOT_DIR}/sk-mobile-02-review-junk-phone.png`;
      await L.screenshot(p, shot2);
      F('A5-invalid-input-junk-phone-readonly-email', (held500 && emailUnchanged && echoedRaw) ? 'HELD' : 'DISPUTED',
        `500-char+emoji+<script> phone accepted into field (${held500}, len=${phoneVal.length}); readOnly email resisted typing (${emailUnchanged}, value="${String(vals2[2] || '').slice(0, 24)}"); review kept Buyer phone row (${echoedRaw}) — canvas text cannot execute script`,
        [shot1, shot2]);
      // restore seeded phone
      await jsClickByText(p, 'Back'); await sleep(1200);
      const ph2 = await phoneField(p);
      await ph2.click({ force: true }); await sleep(300);
      await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace'); await sleep(250);
      await p.keyboard.type(fx.buyer.phone, { delay: 6 });
      const restored = ((await inputValues(p))[3] || '').includes(fx.buyer.phone.slice(-6));
      log(`phone restored=${restored}`);
    }

    // ---- A2a: OUT-OF-ORDER — pickup <-> delivery round trip ----------------
    {
      const d0 = await radioStates(p);
      await toggleRadio(p, 1); await sleep(600);
      const pk = await radioStates(p);
      await L.scrollToBottom(p, 8); await sleep(400);
      await jsClickByText(p, 'Continue to review');
      let at2 = false;
      for (let i = 0; i < 18 && !at2; i++) { await sleep(900); const t = await txt(p); at2 = t.includes('Order totals') || t.includes('Delivery Destination'); }
      await sleep(1500);
      const T = await txt(p);
      const pickupNoFee = T.includes(fmt(P1 + P2)) && !T.includes(fmt(FEE));
      const shot = `${SHOT_DIR}/sk-mobile-03-review-pickup-nofee.png`;
      await L.screenshot(p, shot);
      // back and restore delivery
      await jsClickByText(p, 'Back'); await sleep(1300);
      await toggleRadio(p, 0); await sleep(600);
      const dl = await radioStates(p);
      const okSeq = String(d0[0]) === 'true' && String(pk[1]) === 'true' && String(dl[0]) === 'true';
      F('A2-out-of-order-pickup-delivery-roundtrip', (okSeq && pickupNoFee) ? 'HELD' : 'DISPUTED',
        `radio seq delivery[${d0}] -> pickup[${pk}] -> delivery[${dl}]; pickup review dropped the TSh ${fmt(FEE)} fee cell and billed items only (${pickupNoFee})`, [shot]);
      await L.scrollToBottom(p, 8); await sleep(400);
      await jsClickByText(p, 'Continue to review');
      for (let i = 0; i < 18; i++) { await sleep(900); const t = await txt(p); if (t.includes('Order totals')) break; }
      await sleep(1600);
    }

    // ---- A2b: delivery-quote aborted mid-flow -> Confirm stays blocked -----
    {
      const pfBefore = calls.pf.length;
      await p.route('**/api/v1/checkout/delivery-quote*', r => r.abort());
      await hashNav(p, '#/'); await sleep(800);
      await hashNav(p, '#/cart'); await sleep(1600);
      await jsClickByText(p, 'Go to checkout'); await sleep(1700);
      await L.scrollToBottom(p, 8); await sleep(400);
      await jsClickByText(p, 'Continue to review');
      for (let i = 0; i < 16; i++) { await sleep(900); const t = await txt(p); if (t.includes('Order totals') || t.includes('couldn') || t.includes('unavailable')) break; }
      await sleep(1500);
      let T = await txt(p);
      const errCopy = (T.split('\n').find(l => /couldn|unavailable|Calculating|timeout|TIMEOUT|route/i.test(l)) || '').trim().slice(0, 140);
      await ensureChecked(p, 'first', 'window-under-aborted-quote');
      await ensureChecked(p, 'last', 'terms-under-aborted-quote');
      const box = await confirmBtnBox(p);
      if (box) { await p.mouse.click(box.x, box.y); await sleep(1600); }
      T = await txt(p);
      const stillReview = !/Amount due/.test(T);
      const blockedMsg = /couldn|unavailable|Select at least|Calculating/i.test(T);
      const shot = `${SHOT_DIR}/sk-mobile-04-quote-aborted-blocked.png`;
      await L.screenshot(p, shot);
      await p.unroute('**/api/v1/checkout/delivery-quote*');
      const noPost = calls.pf.length === pfBefore;
      F('A2-quote-aborted-confirm-blocked', (stillReview && noPost && (blockedMsg || errCopy)) ? 'HELD' : 'DISPUTED',
        `aborted delivery-quote: Confirm produced 0 proforma POSTs, stayed off payment; surfaced copy="${errCopy || '(none)'}"; post-click text gate=${blockedMsg}`, [shot]);
    }

    // ---- A7b: SESSION EXPIRY — forced 401 on proforma ----------------------
    {
      await hashNav(p, '#/'); await sleep(700);
      await hashNav(p, '#/cart'); await sleep(1600);
      await jsClickByText(p, 'Go to checkout'); await sleep(1700);
      await L.scrollToBottom(p, 8); await sleep(400);
      await jsClickByText(p, 'Continue to review');
      for (let i = 0; i < 18; i++) { await sleep(900); const t = await txt(p); if (t.includes('Order totals')) break; }
      await sleep(1800);
      const pfBefore = calls.pf.length;
      const cartBefore = await persistedCart(p);
      await p.route('**/api/v1/checkout/proforma', r => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ timestamp: '2026-08-25T00:00:00Z', status: 401, error: 'Unauthorized', path: '/api/v1/checkout/proforma' }) }));
      await ensureChecked(p, 'first', 'win-401');
      await ensureChecked(p, 'last', 'terms-401');
      const box = await confirmBtnBox(p);
      if (box) { await p.mouse.click(box.x, box.y); await sleep(2000); }
      let T = await txt(p);
      const errLine = (T.split('\n').find(l => /logged in|expire|session|ApiException|401|again/i.test(l)) || '').trim().slice(0, 140);
      const cartAfter = await persistedCart(p);
      const shot = `${SHOT_DIR}/sk-mobile-05-forced-401.png`;
      await L.screenshot(p, shot);
      await p.unroute('**/api/v1/checkout/proforma');
      const noPay = !/Amount due/.test(T);
      const cartKept = cartAfter.length === cartBefore.length;
      F('A7-session-expiry-401-on-confirm', (noPay && cartKept) ? 'HELD' : 'BROKEN',
        `forced 401 on POST proforma: no payment step (${noPay}), cart preserved ${cartAfter.length}/${cartBefore.length} lines, error surfaced="${errLine}"`, [shot]);
    }

    // ---- A4: OFFLINE mid-request then retry + A1 double-tap ----------------
    {
      const pfBefore = calls.pf.length;
      const cartBefore = await persistedCart(p);
      await context.setOffline(true);
      await ensureChecked(p, 'first', 'win-offline');
      await ensureChecked(p, 'last', 'terms-offline');
      let box = await confirmBtnBox(p);
      if (box) { await p.mouse.click(box.x, box.y); await sleep(2600); }
      let T = await txt(p);
      const errLine = (T.split('\n').find(l => /network|connection|internet|Failed|Socket|Exception|again/i.test(l)) || '').trim().slice(0, 140);
      const cartMid = await persistedCart(p);
      const shotOff = `${SHOT_DIR}/sk-mobile-06-offline-confirm-failed.png`;
      await L.screenshot(p, shotOff);
      const noFakeSuccess = !/Amount due/.test(T) && !/PF-\d{4}-\d{6}/.test(T);
      const cartKept = cartMid.length === cartBefore.length;
      // back online, RETRY with a RAPID DOUBLE-TAP (A1)
      await context.setOffline(false);
      await sleep(1200);
      box = await confirmBtnBox(p);
      const deltaStart = calls.pf.length;
      if (box) { await p.mouse.click(box.x, box.y); await p.waitForTimeout(70); await p.mouse.click(box.x, box.y); }
      let advanced = false;
      for (let i = 0; i < 22 && !advanced; i++) { await sleep(1000); T = await txt(p); advanced = /Amount due/.test(T) || /PF-\d{4}-\d{6}/.test(T); }
      const posts = calls.pf.slice(deltaStart);
      const statuses = posts.map(c => c.status);
      const onePost = posts.filter(c => [200, 201].includes(c.status)).length;
      const dupPosts = posts.length;
      const shotPay = `${SHOT_DIR}/sk-mobile-07-retry-doubletap-payment.png`;
      await L.screenshot(p, shotPay);
      const amtOk = T.includes(fmt(P1 + P2 + FEE));
      F('A4-offline-midrequest-never-fake-success', (noFakeSuccess && cartKept && errLine) ? 'HELD' : 'BROKEN',
        `offline confirm: no payment markers (${noFakeSuccess}), cart kept ${cartMid.length}/${cartBefore.length}, error="${errLine}"`, [shotOff]);
      F('A1-rapid-double-tap-single-proforma', (dupPosts === 1 && onePost === 1 && amtOk) ? 'HELD' : (onePost >= 1 && dupPosts > 1) ? 'BROKEN' : 'DISPUTED',
        `retry double-tap: proforma POSTs fired=${dupPosts} statuses=[${statuses}] expected exactly 1; payment step Amount due TSh ${fmt(P1 + P2 + FEE)} rendered=${amtOk}`, [shotPay]);
      log(`offline err line: ${errLine}`);
    }
    const dumpA = calls.pf.map(c => ({ status: c.status, totalAmount: (() => { try { return JSON.parse(c.post).buyDetails.totalAmount; } catch (e) { return null; } })(), pm: (() => { try { return JSON.parse(c.post).buyDetails.paymentMethodType; } catch (e) { return null; } })(), grand: c.resp && c.resp.grandTotal, num: c.resp && c.resp.proformaNumber }));
    fs.writeFileSync('/tmp/au028_sk_ctxA_calls.json', JSON.stringify(dumpA, null, 1));
    await cancelAllPending('post-ctxA');
    const v = p.video(); await context.close(); if (v) await v.saveAs(videoPath).catch(() => {});
    await browser.close();
  } catch (e) {
    F('ctx-A-driver', 'DISPUTED', `driver error: ${e.message}`.slice(0, 300), []);
    try { await cancelAllPending('ctxA-catch'); } catch (e2) {}
  }

  // ============================ CTX-B: guard both directions ================
  try {
    const videoPath = 'e2e/videos/AU-028-skeptic-b-guard.webm';
    const browser = await L.newBrowser();
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, recordVideo: { dir: 'e2e/videos', size: { width: 375, height: 667 } } });
    const p = await context.newPage();
    const calls = await watchCalls(p);
    await p.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    const li = await loginFlow(p);
    if (!li) throw new Error('buyer login failed (ctx B)');
    await patchPrice(fx.productId1, P1, 18000, 8); await sleep(400);
    await addViaDeepLink(p, fx.productId1, PROBE1, true);
    await addViaDeepLink(p, fx.productId2, PROBE2, false);
    await hashNav(p, '#/cart'); await sleep(1900);
    let lines = await persistedCart(p);
    if (lines.length !== 2) throw new Error('ctxB cart not filled');
    await jsClickByText(p, 'Go to checkout'); await sleep(1700);
    await L.scrollToBottom(p, 8); await sleep(400);
    await jsClickByText(p, 'Continue to review');
    for (let i = 0; i < 18; i++) { await sleep(900); const t = await txt(p); if (t.includes('Order totals')) break; }
    await sleep(1800);
    await ensureChecked(p, 'first', 'B-win');
    await ensureChecked(p, 'last', 'B-terms');

    // --- TRIP UP: 15,000 -> 65,000 -----------------------------------------
    await patchPrice(fx.productId1, 65000, 70000);
    let box = await confirmBtnBox(p);
    if (box) { await p.mouse.click(box.x, box.y); await sleep(2200); }
    let T = '';
    for (let i = 0; i < 12; i++) { await p.mouse.move(190, 300); await p.mouse.wheel(0, -380); await sleep(650); T = await txt(p); if (T.toLowerCase().includes('authoritative')) break; }
    const msgUp = (T.split('\n').find(l => /authoritative/i.test(l)) || '').trim().slice(0, 160);
    const stayedUp = !/Amount due/.test(T);
    const linesUp = await persistedCart(p);
    const toteUp = (linesUp.find(l => l.productId === fx.productId1) || {}).price;
    const shotUp = `${SHOT_DIR}/sk-mobile-08-guard-trip-up.png`;
    await L.screenshot(p, shotUp);
    const upCall = calls.pf[calls.pf.length - 1];
    const upGrand = upCall && upCall.resp && upCall.resp.grandTotal;
    const cancelAfterUp = calls.cancels.length;
    F('A8-guard-trip-up-cancel-resync', (stayedUp && msgUp && Number(toteUp) === 65000 && cancelAfterUp >= 1 && Math.abs(Number(upGrand) - (P1 + P2 + FEE)) > 0.01) ? 'HELD' : 'BROKEN',
      `UP trip: server grandTotal=${upGrand} vs reviewed ${fmt(P1 + P2 + FEE)}; message="${msgUp}"; stays off payment=${stayedUp}; tote line resynced to ${toteUp}; cancel POSTs=${cancelAfterUp}`, [shotUp]);

    // --- RESTORE price, DON'T touch cart -> server now CHEAPER than reviewed
    await patchPrice(fx.productId1, P1, 18000);
    await sleep(600);
    await ensureChecked(p, 'first', 'B-win2');
    await ensureChecked(p, 'last', 'B-terms2');
    const pfBeforeDown = calls.pf.length;
    box = await confirmBtnBox(p);
    if (box) { await p.mouse.click(box.x, box.y); await sleep(2400); }
    T = '';
    for (let i = 0; i < 12; i++) { await p.mouse.move(190, 300); await p.mouse.wheel(0, -380); await sleep(650); T = await txt(p); if (T.toLowerCase().includes('authoritative') || /Amount due/.test(T)) break; }
    const msgDown = (T.split('\n').find(l => /authoritative/i.test(l)) || '').trim().slice(0, 160);
    const advancedPaying = /Amount due/.test(T) || /PF-\d{4}-\d{6}/.test(T);
    const linesDown = await persistedCart(p);
    const toteDown = (linesDown.find(l => l.productId === fx.productId1) || {}).price;
    const downCall = calls.pf[calls.pf.length - 1];
    const downGrand = downCall && downCall.resp && downCall.resp.grandTotal;
    const shotDown = `${SHOT_DIR}/sk-mobile-09-guard-trip-down.png`;
    await L.screenshot(p, shotDown);
    const guardHeldBothWays = !advancedPaying && msgDown && Number(toteDown) === P1;
    F('A8-guard-reverse-direction-server-cheaper', guardHeldBothWays ? 'HELD' : (advancedPaying ? 'BROKEN' : 'DISPUTED'),
      `DOWN trip (reviewed ${fmt(90000 + FEE)} > server grandTotal=${downGrand}): advanced to payment=${advancedPaying}; message="${msgDown || '(NONE)'}"; tote line resynced DOWN to ${toteDown} (expect 15000); cancels total=${calls.cancels.length}`,
      [shotDown]);

    // --- clean confirm after both trips ------------------------------------
    await ensureChecked(p, 'first', 'B-win3');
    await ensureChecked(p, 'last', 'B-terms3');
    const deltaB = calls.pf.length;
    box = await confirmBtnBox(p);
    if (box) { await p.mouse.click(box.x, box.y); await sleep(2000); }
    let Tb = '';
    for (let i = 0; i < 20; i++) { await sleep(1000); Tb = await txt(p); if (/Amount due/.test(Tb) || /PF-\d{4}-\d{6}/.test(Tb)) break; }
    const cleanPosts = calls.pf.slice(deltaB);
    const cleanOk = cleanPosts.some(c => [200, 201].includes(c.status));
    const cleanBody = (() => { try { return JSON.parse(cleanPosts[cleanPosts.length - 1].post); } catch (e) { return null; } })();
    const totOk = cleanBody && Math.abs(Number(cleanBody.buyDetails.totalAmount) - (P1 + P2 + FEE)) < 0.01;
    const pmOk = cleanBody && /^(MOBILE_MONEY|BANK_TRANSFER)$/.test(cleanBody.buyDetails.paymentMethodType) && !/card/i.test(JSON.stringify(cleanBody));
    const stateCityOk = cleanBody && String(cleanBody.buyDetails.state) !== String(cleanBody.buyDetails.city);
    const winsOk = cleanBody && Array.isArray(cleanBody.buyDetails.preferredDeliveryWindows) && cleanBody.buyDetails.preferredDeliveryWindows.length >= 1;
    const shotClean = `${SHOT_DIR}/sk-mobile-10-clean-after-two-trips.png`;
    await L.screenshot(p, shotClean);
    F('A8-payload-intact-after-double-guard-trip', (cleanOk && totOk && pmOk && stateCityOk && winsOk) ? 'HELD' : 'DISPUTED',
      `clean confirm after two guard trips: HTTP=${cleanPosts.map(c => c.status)} totalAmount=${cleanBody && cleanBody.buyDetails.totalAmount} (expect 48000), paymentMethodType=${cleanBody && cleanBody.buyDetails.paymentMethodType}, state!=city=${stateCityOk}, windows=${winsOk}`,
      [shotClean, '/tmp/au028_sk_ctxB_calls.json']);
    fs.writeFileSync('/tmp/au028_sk_ctxB_calls.json', JSON.stringify(calls.pf.map(c => ({ status: c.status, grand: c.resp && c.resp.grandTotal, num: c.resp && c.resp.proformaNumber, total: (() => { try { return JSON.parse(c.post).buyDetails.totalAmount; } catch (e) { return null; } })() })), null, 1));
    await cancelAllPending('post-ctxB');
    const vb = p.video(); await context.close(); if (vb) await vb.saveAs(videoPath).catch(() => {});
    await browser.close();
  } catch (e) {
    F('ctx-B-driver', 'DISPUTED', `driver error: ${e.message}`.slice(0, 300), []);
    try { await cancelAllPending('ctxB-catch'); } catch (e2) {}
  }

  // ===================== CTX-C: logged-out gate + locale ===================
  try {
    const browser = await L.newBrowser();
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 }, locale: 'de-DE', timezoneId: 'Africa/Nairobi',
      recordVideo: { dir: 'e2e/videos', size: { width: 375, height: 667 } },
    });
    const p = await context.newPage();
    const calls = await watchCalls(p);
    await p.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await L.waitText(p, 'Buy now', 45000);
    // A7a: logged-out role probe — #/checkout must gate to login
    await hashNav(p, '#/checkout'); await sleep(2200);
    let T = await txt(p);
    const gated = !T.includes('Order Summary') && (T.includes('Log') || T.includes('Welcome'));
    const shotGate = `${SHOT_DIR}/sk-mobile-11-loggedout-gate.png`;
    await L.screenshot(p, shotGate);
    F('A7-loggedout-checkout-gate', gated ? 'HELD' : 'DISPUTED', `anonymous #/checkout deep link: Order Summary hidden=${!T.includes('Order Summary')}, auth surface shown=${gated}`, [shotGate]);
    // locale run
    const li = await loginFlow(p);
    if (!li) throw new Error('buyer login failed (ctx C)');
    await patchPrice(fx.productId1, P1, 18000, 8); await sleep(400);
    await addViaDeepLink(p, fx.productId1, PROBE1, true);
    await addViaDeepLink(p, fx.productId2, PROBE2, false);
    await hashNav(p, '#/cart'); await sleep(1800);
    await jsClickByText(p, 'Go to checkout'); await sleep(1700);
    await L.scrollToBottom(p, 8); await sleep(400);
    await jsClickByText(p, 'Continue to review');
    for (let i = 0; i < 18; i++) { await sleep(900); const t = await txt(p); if (t.includes('Order totals')) break; }
    await sleep(1800);
    T = await txt(p);
    const subOk = T.includes(fmt(P1 + P2)) || /[45]\d?\.\d{3}/.test(T.replace(/[^\d.,]/g, ' '));
    const totalShown = T.match(/4[89][.,]\d{3}/)?.[0] || '(none)';
    const todayTomorrow = /Today|Tomorrow|Leo|Kesho/.test(T);
    const winDate = T.match(/\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}/)?.[0] || '(none)';
    const shotLoc = `${SHOT_DIR}/sk-mobile-12-deDE-locale-review.png`;
    await L.screenshot(p, shotLoc);
    F('A6-locale-deDE-totals-and-windows', (subOk && todayTomorrow) ? 'HELD' : 'DISPUTED',
      `de-DE locale + Africa/Nairobi: subtotal group matched=${subOk}; total token seen="${totalShown}"; Today/Tomorrow window labels present=${todayTomorrow}; window date token="${winDate}"`, [shotLoc]);
    await cancelAllPending('post-ctxC');
    await patchPrice(fx.productId1, P1, 18000, 8);
    const vc = p.video(); await context.close(); if (vc) await vc.saveAs('e2e/videos/AU-028-skeptic-c-locale.webm').catch(() => {});
    await browser.close();
  } catch (e) {
    F('ctx-C-driver', 'DISPUTED', `driver error: ${e.message}`.slice(0, 300), []);
  }

  // ---- final cleanup + roll-up --------------------------------------------
  const cleaned = await cancelAllPending('final').catch(() => []);
  await patchPrice(fx.productId1, P1, 18000, 8).catch(() => {});
  const broken = findings.filter(f => f.result === 'BROKEN');
  const disputed = findings.filter(f => f.result === 'DISPUTED');
  const verdict = broken.length ? 'BROKEN' : disputed.length ? 'DISPUTED' : 'HELD';
  const shard = {
    ts: new Date().toISOString(), unit: UNIT, title: 'skeptic-overturn-attempt',
    agent: 'skeptic-AU-028', build_sha: '858b0ef', build_mtime: STAMP_OK,
    verdict, attacks_attempted: findings.filter(f => f.class !== 'build-freshness').length,
    attacks_broken: broken.length, disputed: disputed.length,
    findings, cleanup_cancelled: cleaned, failures, notes: notes.slice(-40),
  };
  fs.mkdirSync('e2e/results/shards', { recursive: true });
  fs.appendFileSync('e2e/results/shards/AU-028-skeptic.jsonl', JSON.stringify(shard) + '\n');
  fs.writeFileSync('/tmp/au028_sk_result.json', JSON.stringify(shard, null, 1));
  console.log('\nSKEPTIC DONE verdict=' + verdict, JSON.stringify({ attacks: shard.attacks_attempted, broken: broken.length, disputed: disputed.length }));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
