// au032_sk_lib.js — shared helpers for the AU-032 skeptic pass (bundle :9121, sha b56e345).
const fs = require('fs');
const path = require('path');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9121';
const UNIT = 'AU-032';
const SHOT_DIR = `e2e/shots/${UNIT}`;
const fx = JSON.parse(fs.readFileSync('/tmp/au032_fixtures.json', 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => ''); }
function mkRec(stage) {
  const rec = { ts: new Date().toISOString(), unit: UNIT, stage, wave: 'skeptic', build_sha: 'b56e345',
    bundle_lm: null, attacks: [], asserts: [], shots: [], notes: [], verdict: null };
  return rec;
}
async function findNode(p, label) {
  return p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
      if (!best || r.width * r.height < best.area)
        best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), t: t.slice(0, 60) };
    });
    return best;
  }, label);
}
async function tapExact(p, label, maxX = 371, maxY = 663) {
  const hit = await p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (t !== lbl) return;
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
      if (!best || r.width * r.height < best.area) best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    return best;
  }, label);
  if (!hit) return false;
  await p.mouse.click(Math.max(3, Math.min(hit.x, maxX)), Math.max(20, Math.min(hit.y, maxY)));
  await sleep(900);
  return true;
}
async function tap(p, label, tries = 3, maxX = 371, maxY = 663) {
  for (let i = 0; i < tries; i++) {
    const hit = await findNode(p, label);
    if (hit) { await p.mouse.click(Math.max(3, Math.min(hit.x, maxX)), Math.max(20, Math.min(hit.y, maxY))); await sleep(900); return true; }
    await p.mouse.move(190, 350); await p.mouse.wheel(0, 240); await sleep(300);
  }
  return false;
}
async function visible(p, needle) {
  return p.evaluate((n) => {
    let r = false;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (r) return;
      if ((e.textContent || '').includes(n)) { const b = e.getBoundingClientRect(); if (b.bottom > 0 && b.top < innerHeight && b.height > 2) r = true; }
    });
    return r;
  }, needle);
}
async function waitTextIn(p, needle, tries = 20) {
  for (let i = 0; i < tries; i++) { if ((await txt(p)).includes(needle)) return true; await sleep(1000); }
  return false;
}
async function clickCheckbox(p, which) {
  const target = await p.evaluate((w) => {
    const boxes = [...document.querySelectorAll('flt-semantics')].filter(e => e.getAttribute('role') === 'checkbox');
    if (!boxes.length) return null;
    const b = w === 'first' ? boxes[0] : boxes[boxes.length - 1];
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, which);
  if (!target) return { clicked: false, checked: null };
  await p.mouse.click(target.x, target.y);
  await sleep(800);
  const checked = await p.evaluate((w) => {
    const boxes = [...document.querySelectorAll('flt-semantics')].filter(e => e.getAttribute('role') === 'checkbox');
    const b = w === 'first' ? boxes[0] : boxes[boxes.length - 1];
    return b ? b.getAttribute('aria-checked') : null;
  }, which);
  return { clicked: true, checked: checked === 'true' };
}
async function isLoggedIn(p) { try { return !!(await p.evaluate(() => localStorage.getItem('flutter.auth_token') || '')); } catch (e) { return false; } }
async function loginUi(p) {
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000);
  if (await isLoggedIn(p)) return true;
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
  const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(320); await p.keyboard.type(fx.buyer.email, { delay: 12 });
  const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(320); await p.keyboard.type(fx.buyer.pw, { delay: 12 });
  await L.clickBtn(p, 'Log in');
  let li = false; for (let i = 0; i < 30 && !li; i++) { await sleep(1000); li = await isLoggedIn(p); }
  return li;
}
async function shot(p, vp, state) { const f = `${SHOT_DIR}/${UNIT}-${vp}-sk-${state}.png`; await L.screenshot(p, f); return f; }
// stock via public itemDetails
async function qty(tok, pid) {
  const d = await L.api(tok, 'GET', `/api/v1/displayItem/itemDetails/${pid}`);
  return d.status === 200 ? d.json.productQuantity : null;
}
async function topUpStock(pid, n) {
  const f = new FormData();
  f.append('product', new Blob([JSON.stringify({ productQuantity: n })], { type: 'application/json' }), 'product.json');
  const up = await fetch(`${L.API}/api/v1/products/update/${pid}`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + fx.seller.token }, body: f });
  return up.status;
}
module.exports = { APP, UNIT, SHOT_DIR, fx, sleep, txt, mkRec, findNode, tapExact, tap, visible, waitTextIn,
  clickCheckbox, isLoggedIn, loginUi, shot, qty, topUpStock, L };
