// au044_r9_lib.js — shared page object for AU-044 r9 full Appendix A verification.
// Serves the FROZEN bundle at :9130 (plain http.server lane: load '/' then set hash
// — go_router uses browser history, not the hash, so we navigate by CLICKING only;
// '/' is the home route so a plain goto is correct here).
const path = require('path');
const fs = require('fs');
const L = require('./lib_verify.js');

const APP = 'http://localhost:9130';
const OUT = path.join(__dirname, 'shots', 'AU-044');
const VID = path.join(__dirname, 'videos');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(VID, { recursive: true });

async function openHome(browser, vp, { video = false } = {}) {
  const ctxOpts = { viewport: { width: vp.w, height: vp.h } };
  let ctx = await L.newCtx(browser, {
    viewport: { width: vp.w, height: vp.h },
    videoPath: video ? path.join(VID, `tmp-au044-${vp.w}.webm`) : null,
  });
  const page = await ctx.newPage();

  // Network taps
  const net = {
    filterCalls: [],   // POST /displayItem/filter with parsed body+query
    searchCalls: [],   // /products/search or searchTerm-bearing filter calls
    uploads: {},       // url -> status
    assets: {},        // url -> status
    api: {},           // all :8083 calls url->status
    consoleErrs: [],
    popups: [],
    waLaunches: [],
  };
  page.on('request', req => {
    const u = req.url();
    if (u.includes('/api/v1/displayItem/filter')) {
      let body = null; try { body = req.postData(); } catch (e) {}
      let q = {}; try { const uu = new URL(u); for (const [k, v] of uu.searchParams) q[k] = v; } catch (e) {}
      net.filterCalls.push({ url: u, query: q, postBody: body, ts: Date.now() });
    }
    if (u.includes('/api/v1/products/search') || u.includes('searchTerm=')) net.searchCalls.push({ url: u });
    if (/\/uploads\//.test(u)) net.uploads[u] = null;
    if (/\/assets\/.*\.(png|webp|jpg|jpeg)/.test(u)) net.assets[u] = null;
    if (/localhost:8083\//.test(u)) net.api[u] = null;
  });
  page.on('response', resp => {
    const u = resp.url();
    if (net.uploads[u] === null) net.uploads[u] = resp.status();
    else if (/\/uploads\//.test(u)) net.uploads[u] = resp.status();
    if (net.assets[u] === null) net.assets[u] = resp.status();
    else if (/\/assets\/.*\.(png|webp|jpg|jpeg)/.test(u)) net.assets[u] = resp.status();
    if (net.api[u] === null) net.api[u] = resp.status();
  });
  page.on('console', m => { if (m.type() === 'error') net.consoleErrs.push(m.text().slice(0, 300)); });
  page.on('popup', p => net.popups.push(p.url()));
  page.on('requestfailed', r => {
    const u = r.url();
    if (/wa\.me|whatsapp/.test(u)) net.waLaunches.push({ kind: 'requestfailed', url: u, err: r.failure() && r.failure().errorText });
  });

  await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 });
  await L.waitText(page, 'Buy now', 40000);
  await page.waitForTimeout(2500);
  return { ctx, page, net };
}

// Enumerate ALL interactive nodes with geometry + enabled state.
async function enumerate(page) {
  return page.evaluate(() => {
    const out = [];
    const seen = new Set();
    document.querySelectorAll('flt-semantics').forEach(e => {
      const role = e.getAttribute('role');
      const tappable = e.getAttribute('flt-tappable');
      const rect = e.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      const label = (e.getAttribute('aria-label') || e.textContent || '').trim();
      const disabled = e.getAttribute('aria-disabled') === 'true';
      if (role === 'button' || role === 'link' || tappable !== null) {
        // Skip ancestors that fully contain an already-listed smaller node with same text
        const key = `${label}|${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)}x${Math.round(rect.height)}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({
          kind: role === 'button' ? 'button' : 'tappable',
          label: label.slice(0, 90),
          x: Math.round(rect.x), y: Math.round(rect.y),
          w: Math.round(rect.width), h: Math.round(rect.height),
          area: Math.round(rect.width * rect.height), disabled,
        });
      }
    });
    document.querySelectorAll('input,textarea').forEach(i => out.push({
      kind: 'input', label: i.placeholder || i.type || 'input',
      x: Math.round(i.getBoundingClientRect().x), y: Math.round(i.getBoundingClientRect().y),
      w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height),
      area: 0, disabled: i.disabled,
    }));
    return out;
  });
}

// Click smallest-area node whose text/aria-label contains `label` via coordinates.
async function clickSmallest(page, label) {
  const cands = await page.evaluate(lbl => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const txt = ((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim();
      if (!txt.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      if (r.left < 0 || r.right > window.innerWidth) return;
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height, txt: txt.slice(0, 60) });
    });
    out.sort((a, b) => a.area - b.area);
    return out.slice(0, 3);
  }, label);
  for (const c of cands) {
    await page.mouse.click(c.cx, Math.max(15, Math.min(c.cy, 645)));
    await page.waitForTimeout(700);
    return { clicked: true, cand: c };
  }
  return { clicked: false, cand: null };
}

async function treeText(page) {
  return page.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n'));
}

async function shot(page, name) {
  const p = path.join(OUT, name);
  await page.screenshot({ path: p }).catch(() => {});
  return p;
}

module.exports = { APP, OUT, VID, openHome, enumerate, clickSmallest, treeText, shot };
