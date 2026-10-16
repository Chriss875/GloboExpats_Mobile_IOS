// dbg: DECISIVE — does the app process ANY tap on this page? The stepper plus
// worked earlier (qty went 1->2) in dbg14w. So taps DO work on the detail page
// body. The Add button specifically doesn't react. Compare with the REFERENCE:
// maybe the bottom bar is COVERED by the home-indicator / safe-area inset at
// 667 height? Try clicking INSIDE the text (not center): y=630 vs y=645.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9108/#/product/629', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  // prove page-wide interactivity again via the stepper PLUS
  const plus = await p.evaluate(() => { let m=null; document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{const r=e.getBoundingClientRect(); if(r.width===40&&r.height===40&&r.x>300&&r.y<innerHeight-10) m={x:Math.round(r.x+20),y:Math.round(r.y+20)};}); return m; });
  const qtyBefore = await p.evaluate(() => { let q=null; document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim(); if(/^[0-9]+$/.test(t)){const r=e.getBoundingClientRect(); if(r.x>260&&r.width<30) q=t;}}); return q; });
  if (plus) { await p.mouse.click(plus.x, plus.y); await p.waitForTimeout(600); }
  const qtyAfter = await p.evaluate(() => { let q=null; document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim(); if(/^[0-9]+$/.test(t)){const r=e.getBoundingClientRect(); if(r.x>260&&r.width<30) q=t;}}); return q; });
  console.log(`stepper control: ${qtyBefore} -> ${qtyAfter}`);
  // now sweep the Add button area vertically
  for (const y of [625, 630, 634, 637, 641, 646, 650]) {
    await p.mouse.click(287, y);
    await p.waitForTimeout(700);
    const m = (await L.allText(p)).match(/own listed items|Added to cart|Login Required/);
    console.log(`y=${y}: ${m ? m[0] : 'no reaction'}`);
    if (m) break;
  }
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
