// AU-002 storage layer + cart persistence — real-browser verification (pass 3).
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
const SHOTS = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-002';
const VID = '/tmp/wf-videos-AU-002';
const log = (...a) => console.log('###', ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = { checks: {}, ls: {}, notes: [], failures: [] };

async function shot(p, name) { await lib.screenshot(p, `${SHOTS}/${name}.png`); }

async function cartLS(p) {
  return p.evaluate(() => {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/expatCartItems|auth_email/.test(k)) {
        try { o[k] = JSON.parse(localStorage.getItem(k)); } catch (e) { o[k] = localStorage.getItem(k); }
      }
    }
    return o;
  });
}
function cartKeyOf(ls) { return Object.keys(ls).find(k => k.endsWith('expatCartItems_' + lib.BUYER.email)); }

const visRect = e => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0 && r.height > 0 ? { cx: r.x + r.width / 2, cy: r.y + r.height / 2 } : null; };

// find a leaf semantics node whose text matches re; if none, find smallest container with that text
async function findNode(p, re, opts = {}) {
  const maxLen = (opts && opts.maxLen) || 60;
  return p.evaluate(([src, maxLen]) => {
    const DBG = window.__AUDBG || false;
    const rx = new RegExp(src);
    const els = [...document.querySelectorAll('flt-semantics')];
    let best = null;
    const seen = [];
    for (const e of els) {
      const tt = (e.textContent || '').trim();
      if (rx.test(tt)) seen.push({ t: tt.slice(0, 50), role: e.getAttribute('role'), tap: e.hasAttribute('flt-tappable'), x: Math.round(e.getBoundingClientRect().x), y: Math.round(e.getBoundingClientRect().y), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) });
      const t = (e.textContent || '').trim();
      const exact = rx.test(t) && t.length < maxLen;
      if (!exact) continue;
      // skip whole-screen containers
      const rr = e.getBoundingClientRect();
      if (rr.width >= innerWidth - 2 && rr.height > innerHeight * 0.7) continue;
      if (/^Cart$|^Search$|^Login$/.test(t)) return { cx: rr.x + rr.width/2, cy: rr.y + rr.height/2, label: t, clickable: true, role: e.getAttribute('role'), w: Math.round(rr.width), h: Math.round(rr.height) };
      const r = e.getBoundingClientRect();
      if (!(r.bottom > 0 && r.top < innerHeight && r.width > 0)) continue;
      const clickable = e.hasAttribute('flt-tappable') || e.getAttribute('role') === 'button';
      const score = (clickable ? 0 : 1000) + t.length * 3 + r.width + r.height / 10;
      if (!best || score < best.score) best = { score, clickable, cx: r.x + r.width / 2, cy: r.y + r.height / 2, label: t.slice(0, 70), role: e.getAttribute('role'), w: r.width, h: r.height };
    }
    if (!best && seen.length) return { debug: seen.slice(0, 8) };
    return best ? { cx: best.cx, cy: best.cy, label: best.label, clickable: best.clickable, role: best.role, w: Math.round(best.w), h: Math.round(best.h) } : null;
  }, [re.source, maxLen]);
}

async function scrollUntilVisible(p, re, maxSteps = 16) {
  for (const dir of [1, -1]) {
    for (let i = 0; i < maxSteps; i++) {
      const b = await findNode(p, re);
      if (b && !b.debug) return b;
      if (dir === 1) { await p.mouse.move(187, 400); await p.mouse.wheel(0, 240); } else { await p.mouse.move(187, 400); await p.mouse.wheel(0, -260); }
      await sleep(300);
    }
  }
  return null;
}
async function tapNode(p, re) {
  const b = await findNode(p, re);
  if (!b) { log('MISS node', re); return false; }
  await p.mouse.click(b.cx, b.cy); return true;
}

(async () => {
  const browser = await lib.newBrowser();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, recordVideo: { dir: VID, size: { width: 375, height: 667 } } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  const imgs = lib.watchImages(p);

  // ---------- login ----------
  await p.goto(lib.APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  R.checks.homeLoaded = await lib.waitText(p, 'Buy now', 30000); await sleep(1500);
  await p.locator('flt-semantics[role="button"]').filter({ hasText: 'Tab 5' }).last().click({ force: true }).catch(() => {});
  await lib.waitText(p, 'Welcome back', 20000); await sleep(1200);
  await p.locator('input[type="text"]').first().click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(lib.BUYER.email);
  await p.locator('input[type="password"]').first().click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(lib.BUYER.pw);
  await p.locator('flt-semantics[role="button"]').filter({ hasText: 'Log in' }).filter({ hasNotText: 'buy and sell' }).first().click({ force: true }).catch(() => {});
  R.checks.login = await lib.waitText(p, 'My account', 30000); log('LOGIN=', R.checks.login); await sleep(1500);

  // ---------- home -> detail ----------
  await p.locator('flt-semantics[role="button"]').filter({ hasText: 'Tab 1' }).first().click({ force: true }).catch(() => {}); await sleep(3500);
  const card = await scrollUntilVisible(p, /Indian Folk Art/);
  R.checks.cardFound = !!card; log('card=', JSON.stringify(card));
  if (!card) throw new Error('featured card not reachable');
  await p.mouse.click(card.cx, card.cy); await sleep(4500);
  const dt = await lib.allText(p);
  R.checks.detailTitle = dt.includes('Indian Folk Art');
  R.checks.detailPrice = /49,000/.test(dt);
  log('detail title/price=', R.checks.detailTitle, R.checks.detailPrice);
  await shot(p, 'AU-002-375-detail');

  // ---------- add to cart x2 → merge into ONE line qty 2 ----------
  const atc = await scrollUntilVisible(p, /^Add to cart$/, 6);
  log('add-to-cart node=', JSON.stringify(atc));
  if (!atc || atc.debug) throw new Error('Add to cart control not reachable');
  for (let i = 0; i < 2; i++) { await p.mouse.click(atc.cx, atc.cy); await sleep(1900); }
  const lsAdd = await cartLS(p);
  const keyAdd = cartKeyOf(lsAdd);
  R.ls.keyAfterAdd = keyAdd;
  R.ls.payloadAfterAdd = JSON.stringify(lsAdd[keyAdd]);
  const itemsAdd = Array.isArray(lsAdd[keyAdd]) ? lsAdd[keyAdd] : [];
  R.checks.lsKeyExactFlutterPrefix = keyAdd === 'flutter.expatCartItems_' + lib.BUYER.email;
  R.checks.mergedSingleLine = itemsAdd.length === 1;
  R.checks.qty2Merged = itemsAdd.length === 1 && itemsAdd[0].quantity === 2;
  R.checks.lineIdIdentity = itemsAdd.length === 1 && itemsAdd[0].lineId === 'p314|d18:legacy-condition-314';
  R.checks.selectedTrue = itemsAdd.length === 1 && itemsAdd[0].selected === true;
  log('LS key=', keyAdd, '| lines=', itemsAdd.length, '| qty=', itemsAdd[0] && itemsAdd[0].quantity, '| lineId=', itemsAdd[0] && itemsAdd[0].lineId);

  // ---------- open Cart from header ----------
  let cartEntry = await findNode(p, /^Cart$/, { maxLen: 8 });
  log('cart entry=', JSON.stringify(cartEntry));
  if (!cartEntry || cartEntry.debug) { // fallback: header icon coordinates (x=287..327,y=6..46)
    await p.mouse.click(307, 26); log('cart entry via fixed coords'); } 
  else await p.mouse.click(cartEntry.cx, cartEntry.cy);
  await sleep(3200);
  let ct = await lib.allText(p);
  R.checks.cartScreenShowsItem = ct.includes('Indian Folk Art');
  const sub1 = (ct.split('\n').find(l => /Subtotal/.test(l)) || '').trim();
  R.checks.cartSubtotal98000 = /98,000/.test(sub1);
  R.checks.cartQtyLabel2 = /\b2\b/.test(ct);
  log('CART item=', R.checks.cartShowsItem, '| subtotal line=', sub1);
  await shot(p, 'AU-002-375-cart-initial');
  fs.writeFileSync('/tmp/au002_cartgeo.json', await p.evaluate(() =>
    JSON.stringify([...document.querySelectorAll('flt-semantics')].map(e => {
      const r = e.getBoundingClientRect(); if (!(r.bottom > 0 && r.top < innerHeight)) return null;
      return { role: e.getAttribute('role'), tap: e.hasAttribute('flt-tappable'), t: (e.textContent || '').trim().slice(0, 28), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), id: e.id };
    }).filter(Boolean))));

  // ---------- RELOAD persistence (THE acceptance criterion) ----------
  await p.reload({ waitUntil: 'load', timeout: 60000 }).catch(e => log('reload err'));
  await sleep(6000); await lib.waitText(p, 'Buy now', 25000); await sleep(1500);
  const cartBtn = await findNode(p, /^Cart$/);
  if (!cartBtn) throw new Error('cart header missing after reload');
  await p.mouse.click(cartBtn.cx, cartBtn.cy); await sleep(3200);
  const ct2 = await lib.allText(p);
  R.checks.reloadCartHasTitle = ct2.includes('Indian Folk Art');
  const sub2 = (ct2.split('\n').find(l => /Subtotal/.test(l)) || '').trim();
  R.checks.reloadQtySurvives = /\b2\b/.test(ct2);
  R.checks.reloadSubtotal98000 = /98,000/.test(sub2);
  const lsReload = await cartLS(p);
  const itemsReload = Array.isArray(lsReload[cartKeyOf(lsReload)]) ? lsReload[cartKeyOf(lsReload)] : [];
  R.checks.reloadPayloadIntact = itemsReload.length === 1 && itemsReload[0].quantity === 2 && itemsReload[0].selected === true;
  log('AFTER RELOAD: title=', R.checks.reloadCartHasTitle, '| qty label 2=', R.checks.reloadQtySurvives, '| subtotal=', sub2, '| payload intact=', R.checks.reloadPayloadIntact);
  await shot(p, 'AU-002-375-cart-after-reload');

  fs.writeFileSync('/tmp/au002_state.json', JSON.stringify(R, null, 1));
  await browser.close();
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
