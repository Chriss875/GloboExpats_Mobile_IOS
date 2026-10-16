// tb_stage3_d3.js — D3: 5 cold loads of #/category/food-groceries, fresh
// contexts (cleared storage/cache by construction), passive response log.
const fs = require('fs');
const path = require('path');
const { LV, APP, OUT, SHOTS, allText } = (() => {
  const L = require('./tb_lib.js');
  return { LV: L.LV, APP: L.APP, OUT: L.OUT, SHOTS: L.SHOTS, allText: L.LV.allText };
})();
const { newBrowser } = LV;

(async () => {
  const browser = await newBrowser();
  const res = [];
  for (let i = 1; i <= 5; i++) {
    const r = { attempt: i, startedAt: new Date().toISOString() };
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    const reqs = [];
    p.on('response', rx => {
      const u = rx.url();
      if (u.includes('/api/v1/')) reqs.push({ s: rx.status(), m: rx.request().method(),
        u: u.replace('http://localhost:8083', '').slice(0, 120) });
    });
    try {
      await p.goto(APP + '/#/category/food-groceries', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await p.waitForFunction(() => {
        const t = [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n');
        return t.includes('Could not load products') || (t.match(/TSh/g) || []).length >= 3;
      }, null, { timeout: 45000 }).catch(() => {});
      await p.waitForTimeout(2000);
      const txt = await allText(p);
      r.errorShown = txt.includes('Could not load products');
      r.tshCount = (txt.match(/TSh/g) || []).length;
      r.itemSample = txt.split('\n').filter(l => l.includes('TSh')).slice(0, 3).map(l => l.slice(0, 60));
      r.apiCalls = reqs;
      r.filterCalls = reqs.filter(q => q.u.includes('/displayItem/filter'));
      r.outcome = r.errorShown ? 'ERROR_SHOWN' : (r.tshCount >= 3 ? 'LOADED' : 'NO_SIGNAL');
      await p.screenshot({ path: path.join(SHOTS, `tb-d3-cold-${i}.png`), fullPage: false }).catch(() => {});
    } catch (e) { r.outcome = 'HARNESS_ERROR'; r.error = String(e.message || e); }
    res.push(r);
    await ctx.close();
    console.log('D3 attempt ' + i + ': ' + JSON.stringify(r).slice(0, 400));
  }
  try { await browser.close(); } catch (_) {}
  fs.writeFileSync(path.join(OUT, 'd3_attempts_9121.json'), JSON.stringify(res, null, 2));
  const errs = res.filter(r => r.outcome === 'ERROR_SHOWN').length;
  console.log('STAGE3 DONE attempts=5 errorShown=' + errs);
})();
