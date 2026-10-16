// au052_clicks_r7b.js — CLICK-EVERYTHING leg v2 for AU-052 (fixed harness).
// Fixes vs v1: (a) only role=button or flt-tappable nodes are controls;
// (b) leaf-only (containers that merely wrap a real control are excluded);
// (c) geometry re-resolved FRESH immediately before every tap (scroll-safe);
// (d) 'Add to cart' observable-effect includes SnackBar band detection
//     (Flutter web toasts are invisible to flt-semantics on this build).
process.chdir(require('path').resolve(__dirname, '..'));
const { chromium } = require('playwright');
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9121';
const API = 'http://localhost:8083';
const PID = 827;

async function snapText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
}
async function waitApp(p) {
  for (let i = 0; i < 60; i++) {
    const t = await snapText(p).catch(() => '');
    if (t.includes('GloboExpats')) return true;
    await p.waitForTimeout(1000);
  }
  return false;
}
async function openDetail(p) {
  await p.evaluate((i) => { window.location.hash = '#/product/' + i; }, PID);
  for (let i = 0; i < 30; i++) {
    const t = await snapText(p).catch(() => '');
    if (t.includes('You Might Also Like') && t.includes('Add to cart')) return true;
    await p.waitForTimeout(700);
  }
  return false;
}
// Leaf interactive controls: role=button or flt-tappable, on-screen, and NOT
// a container of another interactive node.
async function leafControls(p) {
  return p.evaluate(() => {
    const nodes = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const role = e.getAttribute('role');
      const tap = e.getAttribute('flt-tappable');
      if (role !== 'button' && tap === null) return;
      let r; try { r = e.getBoundingClientRect(); } catch (_) { return; }
      if (!r || r.width < 5 || r.height < 5) return;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
      nodes.push({ role: role || '', label: (e.textContent || '').trim(), x: r.x, y: r.y, w: r.width, h: r.height, area: r.width * r.height });
    });
    // leaf = no OTHER interactive node fully inside it
    const leaves = [];
    for (const n of nodes) {
      const containsOther = nodes.some(m => m !== n && m.area < n.area &&
        m.x >= n.x - 2 && m.y >= n.y - 2 && m.x + m.w <= n.x + n.w + 2 && m.y + m.h <= n.y + n.h + 2);
      if (!containsOther) leaves.push(n);
    }
    return leaves.map(n => ({
      kind: n.role === 'button' ? 'button' : 'tappable',
      label: n.label.slice(0, 70),
      x: Math.round(n.x + n.w / 2), y: Math.round(n.y + n.h / 2), area: Math.round(n.area),
    }));
  });
}

(async () => {
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, recordVideo: { dir: 'e2e/videos', size: { width: 375, height: 667 } } });
  const p = await ctx.newPage();
  const apiCalls = [];
  p.on('request', r => { const u = r.url(); if (u.includes(':8083/api/') && !u.includes('/uploads/')) apiCalls.push(u.replace(API, '')); });

  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await waitApp(p);
  await openDetail(p);
  await p.waitForTimeout(1200);

  // pass 1: enumerate leaves at TOP scroll position
  const seenTop = await leafControls(p);
  console.log('LEAVES@top:', JSON.stringify(seenTop));
  // pass 2: scroll to bottom, enumerate again
  await L.scrollToBottom(p, 16);
  await p.waitForTimeout(900);
  const seenBottom = await leafControls(p);
  console.log('LEAVES@bottom:', JSON.stringify(seenBottom));

  // union by label+kind, remember where each was seen
  const targets = new Map();
  for (const c of [...seenTop, ...seenBottom]) {
    const k = c.kind + '|' + c.label;
    if (!targets.has(k)) targets.set(k, { ...c, where: (c === seenBottom[seenBottom.length - 1]) ? '' : '' });
  }
  console.log('UNIQUE CONTROLS:', targets.size);

  const results = []; let ok = 0, failN = 0;
  for (const [key, c] of targets) {
    // ensure detail is up
    if (!(await snapText(p)).includes('Add to cart')) { await openDetail(p); await p.waitForTimeout(800); }
    // FRESH geometry for THIS label right now
    const fresh = (await leafControls(p)).find(f => f.kind === c.kind && f.label === c.label);
    if (!fresh) { results.push({ label: c.label.replace(/\n/g, '|'), kind: c.kind, effect: 'OFFSCREEN-now', SKIPPED: true }); continue; }
    const beforeHash = await p.evaluate(() => location.hash);
    const beforeTxt = await snapText(p);
    const beforeCalls = apiCalls.filter(u => !u.includes('/clicks')).length;
    await p.mouse.click(Math.max(4, Math.min(fresh.x, 371)), Math.max(12, Math.min(fresh.y, 652)));
    await p.waitForTimeout(2000);
    const afterHash = await p.evaluate(() => location.hash);
    const afterTxt = await snapText(p);
    const netDelta = apiCalls.filter(u => !u.includes('/clicks')).length - beforeCalls;
    let changed = afterHash !== beforeHash || afterTxt !== beforeTxt || netDelta > 0;
    // SnackBar fallback (Flutter toast not in semantics)
    let snack = '';
    if (!changed) { const sb = await L.hasSnackBar(p); if (sb.found) { changed = true; snack = 'snackbar-band@y' + sb.atY; } }
    const effect = !changed ? 'NONE'
      : afterHash !== beforeHash ? 'nav:' + String(afterHash).slice(0, 40)
        : netDelta > 0 ? 'network:' + apiCalls.filter(u => !u.includes('/clicks')).slice(-2).join(',').slice(-80)
          : snack ? snack : 'text-change';
    results.push({ label: c.label.replace(/\n/g, ' | ').slice(0, 70), kind: c.kind, effect });
    if (changed) ok++; else { failN++; results[results.length - 1].FAILED = true; }
    console.log(`${changed ? 'OK  ' : 'FAIL'} [${c.kind}] ${c.label.replace(/\n/g, '|').slice(0, 50)} -> ${effect}`);
    if (afterHash !== beforeHash || !(await snapText(p)).includes('Add to cart')) { await openDetail(p); await p.waitForTimeout(600); }
  }

  fs.writeFileSync('/tmp/au052_clicks_results.json', JSON.stringify({ total: results.length, ok, failed: failN, results }, null, 1));
  await ctx.close(); await browser.close();
  console.log('DONE ok=' + ok + ' fail=' + failN);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
