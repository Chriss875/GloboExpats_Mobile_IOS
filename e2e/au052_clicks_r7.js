// au052_clicks_r7.js — CLICK-EVERYTHING leg for AU-052 (coordinate-tap engine).
// Frozen bundle :9121 sha b56e345. Product 827. Asserts observable effect per click.
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
  const h = await p.evaluate(() => location.hash);
  if (h.includes('/product/' + PID)) {
    const t = await snapText(p);
    if (t.includes('You Might Also Like')) return true;
  }
  await p.evaluate((i) => { window.location.hash = '#/product/' + i; }, PID);
  for (let i = 0; i < 30; i++) {
    const t = await snapText(p).catch(() => '');
    if (t.includes('You Might Also Like')) return true;
    await p.waitForTimeout(700);
  }
  return false;
}
// enumerate controls WITH geometry
async function listCtrls(p) {
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const role = e.getAttribute('role'); const tap = e.getAttribute('flt-tappable');
      const txt = (e.textContent || '').trim();
      if (!txt && role !== 'button') return;
      let r = null;
      try { r = e.getBoundingClientRect(); } catch (_) { }
      if (!r || r.width < 8 || r.height < 8) return;
      if (r.bottom < 0 || r.top > innerHeight) return;
      out.push({ kind: role === 'button' ? 'button' : 'tappable', label: txt.slice(0, 60), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), area: Math.round(r.width * r.height) });
    });
    document.querySelectorAll('input,textarea').forEach(i => {
      const r = i.getBoundingClientRect();
      out.push({ kind: 'input', label: (i.placeholder || i.type || 'input'), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), area: Math.round(r.width * r.height) });
    });
    // smallest-area first so card children beat full-screen wrappers
    out.sort((a, b) => a.area - b.area);
    return out;
  });
}

(async () => {
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, recordVideo: { dir: 'e2e/videos', size: { width: 375, height: 667 } } });
  const p = await ctx.newPage();
  const apiCalls = [];
  p.on('request', r => { const u = r.url(); if (u.includes(':8083/api/') && !u.includes('/uploads/')) apiCalls.push(u.replace(API, '')); });
  const imgs = {};
  p.on('response', r => { const u = r.url(); if (/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u) || /\/assets\/.*\.(png|webp|jpg|js|ttf)(\?|#|$)/i.test(u)) imgs[u] = r.status(); });

  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await waitApp(p);
  await openDetail(p);
  // scroll to bottom so commerce buttons are mounted/visible
  await L.scrollToBottom(p, 16);
  await p.waitForTimeout(900);

  const ctrls = await listCtrls(p);
  console.log('TOTAL CONTROLS:', ctrls.length);
  fs.writeFileSync('/tmp/au052_ctrls.json', JSON.stringify(ctrls, null, 1));
  const seen = new Set();
  const results = [];
  let okCount = 0, failCount = 0;

  for (const c of ctrls) {
    const key = c.kind + '|' + c.label;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!c.label && c.kind !== 'input') continue;   // unlabeled icon button handled separately below
    // re-open detail if a click navigated away
    const onP = (await p.evaluate(() => location.hash)).includes('/product/' + PID);
    if (!onP) {
      await openDetail(p); await L.scrollToBottom(p, 14); await p.waitForTimeout(600);
    } else if (!(await snapText(p)).includes('You Might Also Like')) {
      await openDetail(p); await L.scrollToBottom(p, 14);
    }
    const beforeHash = await p.evaluate(() => location.hash);
    const beforeTxt = await snapText(p);
    const beforeCalls = apiCalls.filter(u => !u.includes('/clicks')).length;
    // coordinate tap on smallest matching node
    await p.mouse.click(Math.min(c.x, 373), Math.max(15, Math.min(c.y, 650)));
    await p.waitForTimeout(1800);
    const afterHash = await p.evaluate(() => location.hash);
    const afterTxt = await snapText(p);
    const netDelta = apiCalls.filter(u => !u.includes('/clicks')).length - beforeCalls;
    const changed = afterHash !== beforeHash || afterTxt !== beforeTxt || netDelta > 0;
    const effect = !changed ? 'NONE'
      : afterHash !== beforeHash ? 'nav:' + String(afterHash).slice(0, 48)
        : netDelta > 0 ? 'network:' + apiCalls.filter(u => !u.includes('/clicks')).slice(-2).join(',').slice(0, 90)
          : 'text-change';
    results.push({ label: c.label.replace(/\n/g, ' | '), kind: c.kind, effect });
    if (changed) okCount++; else { failCount++; results[results.length - 1].FAILED = true; }
    console.log(`${changed ? 'OK  ' : 'FAIL'} [${c.kind}] ${c.label.replace(/\n/g, '|').slice(0, 52)} -> ${effect}`);
    // if navigated away, come back
    if (afterHash !== beforeHash) { await openDetail(p); await L.scrollToBottom(p, 14); }
  }

  // unlabeled icon buttons (share etc.) — count them explicitly
  const iconBtns = ctrls.filter(c => c.kind === 'button' && !c.label);
  console.log('UNLABELED BUTTONS:', iconBtns.length);

  const imgVals = Object.values(imgs);
  fs.writeFileSync('/tmp/au052_clicks_results.json', JSON.stringify({
    total: results.length, ok: okCount, failed: failCount,
    images_requested: imgVals.length, images_200: imgVals.filter(s => s === 200 || s === 304).length,
    results,
  }, null, 1));
  await ctx.close();
  await browser.close();
  console.log('DONE ok=' + okCount + ' fail=' + failCount + ' imgs=' + imgVals.length);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
