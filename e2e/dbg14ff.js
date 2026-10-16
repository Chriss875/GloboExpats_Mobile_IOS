// dbg: THE REAL QUESTION — is this MY harness or the APP? Decisive test:
// the SAME click flow on the OTHER frozen lane :9109 (b1f8757, newer bundle
// that also contains this screen). If Add works there but not on :9108,
// something is wrong with the 7b4342f bundle (or the lane). If dead on both,
// my harness has a systematic issue with bottom-bar buttons.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  for (const PORT of [9108, 9109, 9100]) {
    try {
      const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
      const p = await ctx.newPage();
      await p.goto(`http://localhost:${PORT}/#/product/629`, { waitUntil: 'load', timeout: 60000 });
      let up = false;
      for (let i = 0; i < 25 && !up; i++) up = await L.waitText(p, 'Add to cart', 2000);
      if (!up) { console.log(`[${PORT}] page did not load detail`); await ctx.close(); continue; }
      await p.waitForTimeout(3000);
      const loc = p.locator('flt-semantics[role="button"]', { hasText: 'Add to cart' }).first();
      await loc.click({ force: true });
      await p.waitForTimeout(2200);
      const m = (await L.allText(p)).match(/own listed items|Added to cart|Login Required|out of stock/);
      console.log(`[${PORT}] add -> ${m ? m[0] : 'NO REACTION'}`);
      await ctx.close();
    } catch (e) { console.log(`[${PORT}] ERR ${e.message.slice(0, 90)}`); }
  }
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
