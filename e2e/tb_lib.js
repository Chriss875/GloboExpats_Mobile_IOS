// tb_lib.js — AU-046 tie-breaker shared helpers. Lane :9121 (CORS-cleared,
// byte-identical frozen bundle as :9130 md5 e999122d…).
const path = require('path');
const fs = require('fs');
const LV = require('./lib_verify.js');
const APP = 'http://localhost:9121';
const API = 'http://localhost:8083';
const OUT = path.join(__dirname, 'tmp', 'AU-046-tiebreak');
const SHOTS = path.join(__dirname, 'shots', 'AU-046');
const VID = path.join(__dirname, 'videos');

async function gotoHome(p) {
  await p.goto(APP + '/#/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  const ok = await LV.waitText(p, 'Buy now', 45000);
  await p.waitForTimeout(1500);
  return ok;
}

// Scroll the horizontal rails band into view, then coordinate-click the
// SMALLEST flt-tappable node whose text includes `label`, clamped to viewport.
async function tapChip(p, label) {
  for (let i = 0; i < 14; i++) {
    const pos = await p.evaluate((lbl) => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if ((e.textContent || '').trim().includes(lbl) && e.getAttribute('flt-tappable') !== null) {
          const r = e.getBoundingClientRect();
          if (r.width < 40 || r.width > 220 || r.height < 60 || r.height > 160) return;
          if (!best || r.width * r.height < best.area)
            best = { x: r.x + r.width / 2, y: r.y + r.height / 2, area: r.width * r.height };
        }
      });
      return best ? { x: best.x, y: best.y } : null;
    }, label);
    if (pos && pos.y > 10 && pos.y < 667 - 20 && pos.x > 10 && pos.x < 375 - 10) {
      await p.mouse.click(Math.round(pos.x), Math.round(pos.y));
      return true;
    }
    await p.mouse.move(187, Math.min(pos ? pos.y : 500, 667 - 80));
    await p.mouse.wheel(0, pos && pos.y > 667 - 100 ? 180 : -180);
    await p.waitForTimeout(160);
  }
  return false;
}

// Generic tappable-node click for cards (smallest node, scroll-into-view loop).
async function tapCard(p, label, maxScrolls = 16) {
  for (let i = 0; i < maxScrolls; i++) {
    const hit = await p.evaluate((lbl) => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (!(e.textContent || '').includes(lbl)) return;
        if (e.getAttribute('flt-tappable') === null) return;
        const r = e.getBoundingClientRect();
        if (r.width < 60 || r.height < 60) return;
        out.push({ x: r.x + r.width / 2, y: r.y + r.height / 2, area: r.width * r.height,
          vis: r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth });
      });
      out.sort((a, b) => a.area - b.area);
      return out[0] || null;
    }, label);
    if (hit && hit.vis && hit.y > 10 && hit.y < 667 - 30) {
      await p.mouse.click(Math.round(hit.x), Math.round(hit.y));
      return true;
    }
    await p.mouse.move(187, 333);
    await p.mouse.wheel(0, 240);
    await p.waitForTimeout(150);
  }
  return false;
}

async function categories() {
  const r = await fetch(API + '/api/v1/products/categories');
  const j = await r.json().catch(() => null);
  const arr = Array.isArray(j) ? j : (j && (j.content || j.categories)) || [];
  return arr.map(c => ({ id: c.id ?? c.categoryId, name: c.categoryName || c.name, slug: c.slug }));
}

async function filterByCategory(catId) {
  const r = await fetch(API + '/api/v1/displayItem/filter', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoryIds: [catId] }) });
  const b = await r.json().catch(() => null);
  const content = (b && b.content) || [];
  return { status: r.status, totalElements: b ? b.totalElements : null,
    items: content.map(c => ({ id: c.id ?? c.productId, title: String(c.title || c.name || '') })) };
}

async function clicksTotal(id) {
  const r = await fetch(`${API}/api/v1/products/${id}/clicks/total`);
  if (!r.ok) return null;
  const b = await r.json();
  return { total: b.totalClickCount, anon: b.anonymousTotalClickCount, loggedIn: b.loggedInTotalClickCount };
}

module.exports = { LV, APP, API, OUT, SHOTS, VID, gotoHome, tapChip, tapCard,
  categories, filterByCategory, clicksTotal };
