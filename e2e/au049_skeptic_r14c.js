// au049_skeptic_r14c.js — FOCUSED re-probes for the 3 ambiguous skeptic attacks.
//  P1: genuine offline via route-abort (context.setOffline does NOT block localhost).
//  P2: token-strip diagnosis — where does the app go / does filter fire after re-auth?
//  P3: negative / max<min price — is there ANY user-facing feedback (snackbar pixel band)?
const fs = require('fs');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const SHOT = `${ROOT}/e2e/shots/AU-049`;
const BUILD_SHA = 'e694463', BUILD_MT = 'Wed, 26 Aug 2026 08:15:26 GMT';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n')); }
async function tapNode(p, lbl, minW = 20, minH = 12) {
  const cands = await p.evaluate(({ lbl, minW, minH }) => {
    const out = []; const vh = innerHeight;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (r.width < minW || r.height < minH || r.bottom < 0 || r.top > vh) return;
      out.push({ cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height });
    });
    out.sort((a, b) => a.area - b.area);
    if (!out.length) return null;
    return { cx: out[0].cx, cy: Math.max(14, Math.min(out[0].cy, vh - 16)) };
  }, { lbl, minW, minH });
  if (!cands) return null;
  await p.mouse.click(cands.cx, cands.cy); await sleep(600);
  return true;
}
async function scrollSheet(p) { await p.mouse.move(187, 420); for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, 220); await sleep(160); } }
async function typeBand(p, mn, mx) {
  const nIns = await p.locator('input').count();
  await p.locator('input').nth(nIns - 2).click({ force: true }); await sleep(320);
  await p.keyboard.type(mn); await sleep(180);
  await p.locator('input').nth(nIns - 1).click({ force: true }); await sleep(320);
  await p.keyboard.type(mx); await sleep(200);
}
async function boot(page) {
  await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(page, 'Buy now', 60000).catch(() => {});
  await sleep(3500);
  await L.clickBtn(page, 'Marketplace'); await sleep(4500);
}

(async () => {
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: `${ROOT}/e2e/videos/AU-049-skeptic-r14c.webm` });
  const page = await ctx.newPage();
  const resps = [];
  page.on('response', r => { if (/displayItem\/filter/.test(r.url())) resps.push({ status: r.status(), total: null }); });
  page.on('response', r => { if (/displayItem\/filter/.test(r.url())) r.json().then(j => { resps[resps.length - 1] = { status: r.status(), total: j && j.totalElements }; }).catch(() => { }); });

  // ---------- P3: negative & max<min -> any visible feedback? ----------
  console.log('=== P3 hostile-price feedback probe ===');
  await boot(page);
  let p3 = {};
  for (const [mn, mx, label] of [['-5000', '-100', 'negative'], ['50000', '10000', 'maxltmin']]) {
    await L.clickBtn(page, 'Filters'); await sleep(2200);
    await typeBand(page, mn, mx);
    await tapNode(page, 'Apply filters'); await sleep(2600);
    const snack = await L.hasSnackBar(page);
    const feed = await txt(page);
    const errInline = /invalid|must be|enter a valid|error/i.test(feed);
    await L.screenshot(page, `${SHOT}/AU-049-sk2-p3-${label}.png`);
    p3[label] = { snackbarBand: snack.found, snackbarY: snack.atY ?? null, inlineErrorText: errInline, feedStillShowsTSh: feed.includes('TSh') };
    console.log(label, JSON.stringify(p3[label]));
    // clean up: clear all so next case starts fresh
    await L.clickBtn(page, 'Filters'); await sleep(2000);
    await tapNode(page, 'Clear all'); await sleep(700);
    await tapNode(page, 'Apply filters'); await sleep(2500);
  }

  // ---------- P1: GENUINE offline via route abort ----------
  console.log('=== P1 route-abort offline probe ===');
  await boot(page);
  await L.clickBtn(page, 'Filters'); await sleep(2200);
  await typeBand(page, '10000', '50000');
  let aborted = 0;
  await page.route('**/api/v1/displayItem/filter**', r => { aborted++; r.abort(); });
  await tapNode(page, 'Apply filters'); await sleep(8000);
  const feedOffline = await txt(page);
  const aliveOffline = feedOffline.includes('Filters') && feedOffline.length > 800;
  await L.screenshot(page, `${SHOT}/AU-049-sk2-p1-offline.png`);
  await page.unroute('**/api/v1/displayItem/filter**');
  await sleep(800);
  // recovery: reopen sheet and re-apply
  const sheetStillOpen = feedOffline.includes('Apply filters');
  if (!sheetStillOpen) { await L.clickBtn(page, 'Filters'); await sleep(2200); await typeBand(page, '10000', '50000'); }
  await tapNode(page, 'Apply filters'); await sleep(4500);
  const rec = resps.slice(-2);
  const recovered = rec.some(r => r.status === 200);
  const feedBack = (await txt(page)).includes('TSh');
  await L.screenshot(page, `${SHOT}/AU-049-sk2-p1-recovered.png`);
  const p1 = { abortedRequests: aborted, aliveOffline, recovered, recoveredResp: rec, feedBack };
  console.log(JSON.stringify(p1));

  // ---------- P2: token strip diagnosis ----------
  console.log('=== P2 token-strip diagnosis ===');
  await boot(page);
  await page.evaluate(() => localStorage.removeItem('flutter.auth_token'));
  await sleep(800);
  const t0 = await txt(page);
  const stillBrowse = t0.includes('Marketplace') && t0.includes('TSh');
  const opened = await L.clickBtn(page, 'Filters'); await sleep(2300);
  const t1 = await txt(page);
  const sheetVisible = t1.includes('Price range') || t1.includes('Apply filters');
  await typeBand(page, '10000', '50000');
  const nR = resps.length;
  await tapNode(page, 'Apply filters'); await sleep(4200);
  const t2 = await txt(page);
  const fired = resps.length > nR;
  const last = resps[resps.length - 1];
  await L.screenshot(page, `${SHOT}/AU-049-sk2-p2-token-stripped.png`);
  const tok = await L.apiLogin();
  await page.evaluate(t => localStorage.setItem('flutter.auth_token', t), tok);
  const p2 = { stillBrowse, sheetOpened: !!opened, sheetVisible, requestFired: fired, lastResp: last || null, feedHasProducts: t2.includes('TSh'), textHead: t1.slice(0, 240) };
  console.log(JSON.stringify(p2));

  await ctx.close(); await browser.close();

  fs.writeFileSync('/tmp/au049_skeptic_p123.json', JSON.stringify({ p1, p2, p3 }, null, 1));
  console.log('\nP1=' + JSON.stringify(p1));
  console.log('P2=' + JSON.stringify(p2));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
