// tb_stage4_d1b.js — D1 focused: full a11y text control vs availability-outage,
// chip-set diff on the CURRENT bundle (:9121).
const fs = require('fs');
const path = require('path');
const { LV, OUT, SHOTS, VID, gotoHome } = require('./tb_lib.js');
const { newBrowser, newCtx, closeVideo, allText, screenshot } = LV;

async function sweep(p) {
  await p.mouse.move(187, 400);
  for (let i = 0; i < 16; i++) { await p.mouse.wheel(0, 260); await p.waitForTimeout(130); }
  await p.waitForTimeout(900);
}
const CATS = ['Art & Crafts','Beauty & Personal Care','Books & Media','Clothing','Decorations',
  'Electronics','Food & Groceries','Furniture','Garden & Outdoors','Health & Wellness',
  'Home & Kitchen Appliances','Home & Living','Pet & Supplies','Property','Vehicles','Sports & Leisure'];

(async () => {
  const browser = await newBrowser();
  const R = {};
  for (const mode of ['control', 'outage']) {
    const ctx = await newCtx(browser, { viewport: { width: 375, height: 667 },
      videoPath: path.join(VID, `AU-046-tiebreak-d1b-${mode}.webm`) });
    const p = await ctx.newPage();
    const netlog = [];
    p.on('response', rx => { const u = rx.url();
      if (u.includes('/api/v1/')) netlog.push({ s: rx.status(), u: u.slice(-70) }); });
    if (mode === 'outage') {
      await p.route('**/api/v1/displayItem/category-availability*', rx => rx.abort('failed'));
    }
    await gotoHome(p);
    await sweep(p);
    const txt = await allText(p);
    R[mode] = {
      categoriesPresent: CATS.filter(c => txt.includes(c)),
      hasErrorCategories: txt.includes('Could not load categories'),
      spinnerVisible: await p.evaluate(() =>
        [...document.querySelectorAll('flt-semantics')].length > 0),
      apiCalls: netlog.slice(0, 20),
      availabilityCallStatus: (netlog.find(n => n.u.includes('category-availability')) || {}).s ?? 'none',
      rawTextSample: txt.slice(0, 700),
    };
    await screenshot(p, path.join(SHOTS, `tb-d1b-${mode}-swept.png`));
    await closeVideo(ctx, path.join(VID, `AU-046-tiebreak-d1b-${mode}.webm`));
  }
  try { await browser.close(); } catch (_) {}
  R.diff = {
    lostChipsUnderOutage: R.control.categoriesPresent.filter(c => !R.outage.categoriesPresent),
    gainedChipsUnderOutage: R.outage.categoriesPresent.filter(c => !R.control.categoriesPresent),
  };
  fs.writeFileSync(path.join(OUT, 'd1b_chiptext_diff.json'), JSON.stringify(R, null, 2));
  console.log('D1B DONE ' + JSON.stringify({ control: R.control.categoriesPresent.length,
    outage: R.outage.outage === undefined ? R.outage.categoriesPresent.length : null,
    diff: R.diff, availCtl: R.control.availabilityCallStatus, availAtt: R.outage.availabilityCallStatus }));
})();
