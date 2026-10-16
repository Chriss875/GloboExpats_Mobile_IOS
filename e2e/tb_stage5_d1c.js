// tb_stage5_d1c.js — D1 final: small-step scroll so the rails band stays in
// the semantics tree; union chip names across steps; control vs outage.
const fs = require('fs');
const path = require('path');
const { LV, OUT, SHOTS, VID, gotoHome } = require('./tb_lib.js');
const { newBrowser, newCtx, closeVideo, allText, screenshot } = LV;

const CATS = ['Art & Crafts','Beauty & Personal Care','Books & Media','Clothing','Decorations',
  'Electronics','Food & Groceries','Furniture','Garden & Outdoors','Health & Wellness',
  'Home & Kitchen Appliances','Home & Living','Pet & Supplies','Property','Vehicles'];

async function scanRails(p, tag) {
  const seen = new Set();
  const geoms = [];
  // step 0: no scroll (band sits just below fold at y~600)
  for (let step = 0; step <= 14; step++) {
    const info = await p.evaluate((cats) => {
      const out = { text: '', found: [] };
      const all = [...document.querySelectorAll('flt-semantics')];
      out.text = all.map(e => e.textContent || '').join('\n');
      cats.forEach(c => {
        if (!out.text.includes(c)) return;
        const e = all.filter(x => (x.textContent || '').includes(c) &&
          x.getAttribute('flt-tappable') !== null &&
          (() => { const r = x.getBoundingClientRect(); return r.width < 220 && r.height < 160 && r.width > 40; })())[0];
        if (e) { const b = e.getBoundingClientRect();
          out.found.push({ c, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width),
            h: Math.round(b.height), onscreen: b.bottom > 0 && b.top < window.innerHeight }); }
      });
      return out;
    }, CATS);
    CATS.forEach(c => { if (info.text.includes(c)) seen.add(c); });
    info.found.forEach(f => { if (!geoms.some(g => g.c === f.c)) geoms.push({ ...f, atStep: step }); });
    await p.mouse.move(187, 400);
    await p.mouse.wheel(0, 140);
    await p.waitForTimeout(170);
  }
  fs.writeFileSync(path.join(OUT, `d1c_scan_${tag}.json`),
    JSON.stringify({ seen: [...seen], geoms }, null, 2));
  return { seen: [...seen], geoms };
}

(async () => {
  const browser = await newBrowser();
  const R = {};
  for (const mode of ['control', 'outage']) {
    const ctx = await newCtx(browser, { viewport: { width: 375, height: 667 },
      videoPath: path.join(VID, `AU-046-tiebreak-d1c-${mode}.webm`) });
    const p = await ctx.newPage();
    const netlog = [];
    p.on('response', rx => { const u = rx.url();
      if (u.includes('/api/v1/')) netlog.push({ s: rx.status(), u: u.slice(-60) }); });
    if (mode === 'outage') {
      await p.route('**/api/v1/displayItem/category-availability*', rx => rx.abort('failed'));
    }
    await gotoHome(p);
    const scan = await scanRails(p, mode);
    R[mode] = {
      chipsSeen: scan.seen,
      chipGeoms: scan.geoms,
      foodChip: scan.geoms.find(g => g.c === 'Food & Groceries') || null,
      availabilityCallStatus: (netlog.find(n => n.u.includes('category-availability')) || {}).s ?? 'none',
    };
    await screenshot(p, path.join(SHOTS, `tb-d1c-${mode}-rails.png`));
    await closeVideo(ctx, path.join(VID, `AU-046-tiebreak-d1c-${mode}.webm`));
  }
  try { await browser.close(); } catch (_) {}
  R.diff = {
    gainedUnderOutage: R.outage.chipsSeen.filter(c => !R.control.chipsSeen.includes(c)),
    lostUnderOutage: R.control.chipsSeen.filter(c => !R.outage.chipsSeen.includes(c)),
  };
  fs.writeFileSync(path.join(OUT, 'd1c_result.json'), JSON.stringify(R, null, 2));
  console.log('D1C DONE ctl=' + R.control.chipsSeen.length + ' chips, out=' +
    R.outage.chipsSeen.length + ' chips, gained=' + JSON.stringify(R.diff.gainedUnderOutage) +
    ', foodCtl=' + !!R.control.foodChip + ', foodOut=' + JSON.stringify(R.outage.foodChip));
})();
