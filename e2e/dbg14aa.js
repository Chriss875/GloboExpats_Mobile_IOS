// dbg: 768 viewport — is the bottom bar clickable there? Also try 375 with a
// SMALLER viewport height (e.g. 600) to see if the bottom bar is clipped by
// the visual viewport at 667 (keyboard inset?). Screenshot the bar region.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  for (const VP of [{ w: 375, h: 667 }, { w: 768, h: 1024 }]) {
    const ctx = await L.newCtx(b, { viewport: { width: VP.w, height: VP.h } });
    const p = await ctx.newPage();
    await p.goto('http://localhost:9108/#/product/629', { waitUntil: 'load', timeout: 90000 });
    for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
    const ab = await p.evaluate(() => { let h=null; document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{ if(/Add to cart/i.test((e.textContent||'').trim())&&!h){const r=e.getBoundingClientRect(); h={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),bottom:Math.round(r.bottom)};} }); return h; });
    console.log(`[${VP.w}x${VP.h}] add btn`, JSON.stringify(ab));
    await p.mouse.click(ab.x, ab.y); await p.waitForTimeout(1200);
    const m = (await L.allText(p)).match(/own listed items|Added to cart|Login Required/);
    console.log(`[${VP.w}x${VP.h}] click -> ${m ? m[0] : 'NO REACTION'}`);
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
