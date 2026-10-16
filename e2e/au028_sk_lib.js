// au028_sk_lib.js — shared helpers for the AU-028 skeptic stages.
// Findings append to /tmp/au028_sk_findings.jsonl (one json per finding).
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9112';
const SHOT_DIR = 'e2e/shots/AU-028';
const fx = JSON.parse(fs.readFileSync('/tmp/au028_fixtures.json', 'utf8'));
const PROBE1 = `AU028 Guard Tote ${fx.stamp}`;
const PROBE2 = `AU028 Plain Mat ${fx.stamp}`;
const P1 = 15000, P2 = 25000, FEE = 8000;
const STAMP_OK = 'Tue, 25 Aug 2026 08:11:40 GMT';
const fmt = (n) => Number(n).toLocaleString('en-US');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function F(cls, result, detail, ev) {
  const line = { ts: new Date().toISOString(), class: cls, result, detail, evidence: ev || [] };
  fs.appendFileSync('/tmp/au028_sk_findings.jsonl', JSON.stringify(line) + '\n');
  console.log(`FINDING ${result} [${cls}] ${detail}`);
  return result;
}
function log(m) { console.log('SK ' + m); }
async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => ''); }
async function alive(p) { return p.evaluate(() => document.querySelectorAll('flt-semantics').length).catch(() => 0); }

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

async function uiLogin(p) {
  await L.waitText(p, 'Buy now', 45000);
  let ok = await isLoggedIn(p);
  if (!ok) {
    await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
    await p.locator('input[type="text"]').first().click({ force: true }).catch(() => {}); await sleep(400);
    await p.keyboard.type(fx.buyer.email, { delay: 10 });
    await p.locator('input[type="password"]').first().click({ force: true }).catch(() => {}); await sleep(400);
    await p.keyboard.type(fx.buyer.pw, { delay: 10 });
    await L.clickBtn(p, 'Log in');
    for (let i = 0; i < 40 && !ok; i++) { await sleep(700); ok = await isLoggedIn(p); }
  }
  for (let i = 0; i < 24; i++) { if (await alive(p) > 30) break; await sleep(600); }
  return ok;
}
async function hashNav(p, r) { await p.evaluate((x) => { location.hash = x; }, r); await sleep(1400); }

// smallest visible role=button whose trimmed text equals/contains label
async function btnBox(p, label, mode) {
  return p.evaluate(([lbl, m]) => {
    let best = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      const t = (e.textContent || '').trim();
      const match = m === 'exact' ? t === lbl : t.includes(lbl);
      if (!match) return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.bottom < 30 || r.top > innerHeight - 4 || r.y < 0) return;
      if (!best || r.width * r.height < best.area)
        best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    return best;
  }, [label, mode || 'includes']);
}
async function clickBtnVisible(p, label, mode) {
  const b = await btnBox(p, label, mode);
  if (!b) return false;
  await p.mouse.click(b.x, b.y); await sleep(800);
  return true;
}

// Add one product through the REAL purchase path. ALWAYS start from home so
// the product deep link remounts the detail screen (direct pid->pid nav keeps
// the old page mounted — found in skeptic probing).
async function addProduct(p, pid, pickSize) {
  await hashNav(p, '#/');
  await p.evaluate((id) => { location.hash = '#/product/' + id; }, pid);
  let T = '';
  for (let i = 0; i < 14; i++) { await sleep(800); T = await txt(p); if (T.includes(PROBE1) || T.includes(PROBE2)) break; }
  const wantTitle = pid === fx.productId1 ? PROBE1 : PROBE2;
  if (!T.includes(wantTitle)) { log(`detail ${pid} title not rendered`); return false; }
  if (pickSize) {
    let chip = null;
    for (let i = 0; i < 7 && !chip; i++) {
      chip = await p.evaluate(() => {
        let b = null;
        document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
          if ((e.textContent || '').trim() !== 'L') return;
          const r = e.getBoundingClientRect();
          if (r.y > 50 && r.bottom < innerHeight - 40 && r.width > 5 && r.height > 5)
            b = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        });
        return b;
      });
      if (!chip) { await p.mouse.move(190, 340); await p.mouse.wheel(0, 220); await sleep(550); }
    }
    if (!chip) { log('L chip never visible'); return false; }
    await p.mouse.click(chip.x, chip.y); await sleep(900);
  }
  let add = null;
  for (let i = 0; i < 8 && !add; i++) {
    add = await btnBox(p, 'Add to cart', 'exact');
    if (!add) { await p.mouse.move(190, 340); await p.mouse.wheel(0, -170); await sleep(500); }
  }
  if (!add) { log('Add to cart not clickable'); return false; }
  const before = await persistedCart(p);
  await p.mouse.click(add.x, add.y);
  let done = false;
  for (let i = 0; i < 8 && !done; i++) { await sleep(700); const now = await persistedCart(p); done = now.length > before.length || now.some(l => l.productId === pid); }
  return done;
}
async function fillBothLines(p) {
  // clear any leftovers
  for (let i = 0; i < 4; i++) {
    const lines = await persistedCart(p);
    if (!lines.length) break;
    await hashNav(p, '#/cart'); await sleep(1200);
    if (!(await clickBtnVisible(p, 'Remove'))) { await p.mouse.move(190, 300); await p.mouse.wheel(0, 200); await sleep(400); await clickBtnVisible(p, 'Remove'); }
    await sleep(700);
  }
  const okA = await addProduct(p, fx.productId1, true);
  const okB = await addProduct(p, fx.productId2, false);
  await hashNav(p, '#/cart'); await sleep(1500);
  const lines = await persistedCart(p);
  const good = okA && okB && lines.length === 2 &&
    lines.some(l => l.productId === fx.productId1) && lines.some(l => l.productId === fx.productId2);
  log(`fillBoth ok=${good} lines=${lines.map(l => l.productId + '@' + l.price + 'x' + l.quantity).join(',')}`);
  return good;
}
async function goToReview(p, { waitTotals = true } = {}) {
  await hashNav(p, '#/cart'); await sleep(1300);
  if (!(await clickBtnVisible(p, 'Go to checkout'))) { log('Go to checkout missing'); return false; }
  await sleep(1600);
  let T = await txt(p);
  if (!T.includes('Order Summary')) { log('no Order Summary on step1'); return false; }
  let clickedContinue = false;
  for (let i = 0; i < 6 && !clickedContinue; i++) {
    // Continue sits at the very bottom: wheel down in small steps so the
    // footer button enters the semantics snapshot, then click by box.
    // btnBox() rejects boxes whose center is within 30px of the top or 4px of
    // the bottom edge — at y=633 on a 667 viewport it passes, but a wheel
    // overshoot can push it out again, hence the retry loop.
    for (let s = 0; s < 8; s++) { await p.mouse.move(190, 340); await p.mouse.wheel(0, 130); await sleep(110); }
    await sleep(400);
    clickedContinue = await clickBtnVisible(p, 'Continue to review');
    if (!clickedContinue) {
      const probe = await btnBox(p, 'Continue to review');
      log(`continue attempt ${i}: box=${JSON.stringify(probe)}`);
      if (!probe) { for (let s = 0; s < 10; s++) { await p.mouse.move(190, 340); await p.mouse.wheel(0, -220); await sleep(90); } await sleep(300); }
      else { await p.mouse.click(probe.x, probe.y); await sleep(900); clickedContinue = true; }
    }
  }
  if (!clickedContinue) { log('Continue missing'); return false; }
  let at2 = false;
  for (let i = 0; i < 20 && !at2; i++) { await sleep(800); T = await txt(p); at2 = T.includes('Order totals') || T.includes('Delivery Destination'); }
  if (waitTotals) { for (let i = 0; i < 14; i++) { T = await txt(p); if (T.includes(fmt(FEE))) break; await sleep(800); } }
  return at2;
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
    if (!st) { await L.scrollToBottom(p, 12); await sleep(600); continue; }
    if (String(st.chk) !== 'true') { await p.mouse.click(st.x + 18, Math.min(Math.max(st.y + st.h / 2, 25), 1010)); await sleep(750); }
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
async function radioStates(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .filter(e => e.getAttribute('role') === 'radio').map(e => e.getAttribute('aria-checked')));
}
async function toggleRadioIdx(p, idx) {
  let st = await p.evaluate((i) => {
    const rows = [...document.querySelectorAll('flt-semantics')]
      .filter(e => e.getAttribute('role') === 'radio')
      .map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height }; });
    return rows[i] || null;
  }, idx);
  if (!st) return false;
  if (st.y < 30 || st.y + st.h > 640) { await p.mouse.move(190, 380); await p.mouse.wheel(0, Math.max(-600, Math.min(600, st.y - 330))); await sleep(700); }
  const t2 = await p.evaluate((i) => {
    const rows = [...document.querySelectorAll('flt-semantics')]
      .filter(e => e.getAttribute('role') === 'radio')
      .map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height }; });
    const k = rows[i]; if (!k) return null;
    if (k.y < 20 || k.y + k.h > innerHeight) return null;
    return { x: k.x + 18, y: k.y + k.h / 2 };
  }, idx);
  if (!t2) return false;
  await p.mouse.click(t2.x, t2.y); await sleep(750);
  return true;
}
async function patchPrice(pid, asking, orig, qty) {
  const f = new FormData();
  const body = { askingPrice: asking, originalPrice: orig };
  if (qty != null) body.productQuantity = qty;
  f.append('product', new Blob([JSON.stringify(body)], { type: 'application/json' }), 'product.json');
  const r = await fetch(`${L.API}/api/v1/products/update/${pid}`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + fx.seller.token }, body: f });
  return r.status;
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

module.exports = {
  APP, SHOT_DIR, fx, PROBE1, PROBE2, P1, P2, FEE, STAMP_OK, fmt, sleep,
  F, log, txt, watchCalls, persistedCart, isLoggedIn, uiLogin, hashNav,
  btnBox, clickBtnVisible, addProduct, fillBothLines, goToReview,
  ensureChecked, radioStates, toggleRadioIdx, patchPrice, cancelAllPending, L,
};
