const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  const geom = await p.evaluate(() => {
    let hit = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      const t = (e.textContent || '').trim();
      if (/Add to cart/i.test(t) && !hit) {
        const r = e.getBoundingClientRect();
        hit = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), h: Math.round(r.height), w: Math.round(r.width), top: Math.round(r.y), bottom: Math.round(r.bottom) };
      }
    });
    return hit;
  });
  console.log('geom', JSON.stringify(geom));
  for (const dy of [0, -6, -12]) {
    await p.mouse.click(geom.cx, geom.cy + dy); await p.waitForTimeout(1000);
    const m = (await L.allText(p)).match(/Login Required[^|]*/);
    console.log(`dy=${dy} toast=${m ? m[0].slice(0, 50) : 'NONE'}`);
  }
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
