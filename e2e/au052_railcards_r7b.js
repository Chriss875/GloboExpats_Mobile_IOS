// au052_railcards_r7b.js — RAIL-CARD CLICKS v2 for AU-052.
// Scroll-until-visible driven by CARD geometry (not the heading), clicks each
// suggestion leaf card, asserts navigation to itemDetails/<id>.
process.chdir(require('path').resolve(__dirname, '..'));
const { chromium } = require('playwright');
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9121';
const API = 'http://localhost:8083';
const PID = 827;
const UNIT_RAIL = 'AU-052';
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
// vertical scroll until any rail card (narrow leaf, has price, starts with AU04)
// sits fully on screen; returns its geometry.
async function scrollUntilCardVisible(p) {
  for (let i = 0; i < 26; i++) {
    const g = await p.evaluate(() => {
      let best = null;
      document.querySelectorAll('flt-semantics[flt-tappable]').forEach(e => {
        const txt = (e.textContent || '').trim();
        if (!/^AU0/.test(txt) || !/TSh\s[\d,]+/.test(txt)) return;
        if ((e.textContent || '').split('\n').length < 3) return;
        const r = e.getBoundingClientRect();
        if (r.width > 220) return;                    // skip full-width wrappers
        if (r.width < 60 || r.height < 60) return;
        if (r.top < 5 || r.bottom > innerHeight - 90) return;
        if (!best || r.width * r.height < best.area) {
          best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), label: txt.split('\n')[0], area: r.width * r.height };
        }
      });
      return best;
    });
    if (g) return g;
    await p.mouse.move(190, 400);
    await p.mouse.wheel(0, 240);
    await p.waitForTimeout(190);
  }
  return null;
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
  const g1 = await scrollUntilCardVisible(p);
  console.log('first visible card:', JSON.stringify(g1));
  await L.screenshot(p, L.shotName(UNIT_RAIL, 'm375', 'rail-preclick'));

  const results = [];
  for (const pref of EXPECTED_ORDER.slice(0, 3)) {
    // ensure we're back on source detail & rail visible
    let g = await scrollUntilCardVisible(p);
    let geom = null;
    for (let tries = 0; tries < 6 && g; tries++) {
      geom = await p.evaluate((prefx) => {
        let hit = null;
        document.querySelectorAll('flt-semantics[flt-tappable]').forEach(e => {
          const txt = (e.textContent || '').trim();
          if (!txt.startsWith(prefx)) return;
          if (!/TSh\s[\d,]+/.test(txt)) return;
          const r = e.getBoundingClientRect();
          if (r.width > 220 || r.width < 40 || r.height < 40) return;
          if (r.top < 5 || r.bottom > innerHeight - 85) return;
          hit = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        });
        return hit;
      }, pref);
      if (geom) break;
      // advance horizontal scroll over the rail then retry
      await p.mouse.move(300, g ? g.y : 400);
      await p.mouse.wheel(-320, 0);
      await p.waitForTimeout(400);
      g = await scrollUntilCardVisible(p);
    }
    if (!geom) { results.push({ card: pref, effect: 'NEVER-VISIBLE', FAILED: true }); console.log('FAIL (never visible)', pref); continue; }
    apiCalls.length = 0;
    await p.mouse.click(geom.x, geom.y);
    let landed = '';
    for (let i = 0; i < 14; i++) {
      await p.waitForTimeout(850);
      const det = [...new Set(apiCalls)].find(u => u.includes('/displayItem/itemDetails/'));
      if (det) { landed = (det.match(/itemDetails\/(\d+)/) || [])[1]; break; }
    }
    const okNav = !!landed;
    results.push({ card: pref, itemDetails: landed ? '/displayItem/itemDetails/' + landed : null, navigated: okNav });
    console.log(`${okNav ? 'OK  ' : 'FAIL'} card "${pref}" -> itemDetails/${landed || '-'}`);
    await openDetail(p);
  }
  fs.writeFileSync('/tmp/au052_railclicks.json', JSON.stringify(results, null, 1));
  await ctx.close(); await browser.close();
  const bad = results.filter(r => r.FAILED || !r.navigated);
  console.log('RAIL CLICK SUMMARY:', JSON.stringify(results));
  process.exit(bad.length ? 2 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
