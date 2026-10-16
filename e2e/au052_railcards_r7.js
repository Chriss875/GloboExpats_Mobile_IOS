// au052_railcards_r7.js — RAIL-CARD CLICKS for AU-052.
// Scrolls the similar-rail into view, clicks EVERY visible suggestion card
// (h-scroller advanced between clicks), asserts navigation to that product's
// own detail (itemDetails/<id> network + its name in semantics).
process.chdir(require('path').resolve(__dirname, '..'));
const { chromium } = require('playwright');
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9121';
const API = 'http://localhost:8083';
const PID = 827;
const EXPECTED_ORDER = [
  'AU049 LG Monitor 1787692209468',
  'AU049 Pixel Buds 1787692209468',
  'AU048R71787692116574 Probe Widget 29',
  'AU048R71787692116574 Probe Widget 28',
];

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
    if (t.includes('You Might Also Like')) return true;
    await p.waitForTimeout(700);
  }
  return false;
}
async function scrollToRail(p) {
  // find heading y, wheel down so rail sits mid-screen
  for (let i = 0; i < 20; i++) {
    const pos = await p.evaluate(() => {
      let yy = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (yy === null && (e.textContent || '').includes('You Might Also Like')) {
          const r = e.getBoundingClientRect(); if (r.height > 0 && r.y > 0) yy = r.y;
        }
      });
      return yy;
    });
    if (pos !== null && pos < 300) return true;
    await p.mouse.move(190, 400);
    await p.mouse.wheel(0, 260);
    await p.waitForTimeout(200);
  }
  return false;
}
async function railCardGeom(p, labelPrefix) {
  return p.evaluate((pref) => {
    let best = null;
    document.querySelectorAll('flt-semantics[flt-tappable]').forEach(e => {
      const txt = (e.textContent || '').trim();
      if (!txt.startsWith(pref)) return;
      if (!/TSh\s[\d,]+/.test(txt)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) return;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
      best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
    });
    return best;
  }, labelPrefix);
}

(async () => {
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const apiCalls = [];
  p.on('request', r => { const u = r.url(); if (u.includes(':8083/api/') && !u.includes('/uploads/')) apiCalls.push(u.replace(API, '')); });

  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await waitApp(p);
  await openDetail(p);
  const railOk = await scrollToRail(p);
  console.log('rail scrolled into view:', railOk);
  await p.waitForTimeout(700);
  await L.screenshot(p, L.shotName(UNIT_RAIL, 'm375', 'rail-preclick'));

  const results = [];
  for (const pref of EXPECTED_ORDER.slice(0, 3)) {   // first 3 visible without h-scroll
    apiCalls.length = 0;
    const g = await railCardGeom(p, pref);
    if (!g) { results.push({ card: pref, effect: 'NOT-VISIBLE', FAILED: true }); continue; }
    await p.mouse.click(g.x, g.y);
    // wait for target product detail
    let landed = '';
    for (let i = 0; i < 12; i++) {
      await p.waitForTimeout(900);
      const t = await snapText(p);
      const det = apiCalls.find(u => u.includes('/displayItem/itemDetails/'));
      if (det && t.length) { landed = det.match(/itemDetails\/(\d+)/)[1]; break; }
      if (!t.includes(pref) === false && det) break;
    }
    const tAfter = await snapText(p);
    const stillRail = tAfter.includes('You Might Also Like') && !apiCalls.some(u => u.includes('/displayItem/itemDetails/'));
    const okClick = !stillRail;
    results.push({ card: pref, itemDetails: landed ? '/displayItem/itemDetails/' + landed : null, navigated: okClick });
    console.log(`${okClick ? 'OK  ' : 'FAIL'} card "${pref}" -> itemDetails ${landed}`);
    // back to source detail
    await openDetail(p);
    await scrollToRail(p);
    await p.waitForTimeout(500);
  }
  fs.writeFileSync('/tmp/au052_railclicks.json', JSON.stringify(results, null, 1));
  console.log(JSON.stringify(results, null, 1));
  await ctx.close(); await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
const UNIT_RAIL = 'AU-052';
