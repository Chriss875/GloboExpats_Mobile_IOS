// dbg: clicks not registering at all? Test with a control that ALWAYS reacts:
// the +/- stepper (proven to work in dbg14e). If stepper works but Add doesn't,
// the Add button itself may be off-hit-target. Try clicking slightly higher.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  // guest is fine for Login Required toast (also a known-firing toast)
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  const ab = await p.evaluate(() => {
    const b2 = [...document.querySelectorAll('flt-semantics[role="button"]')]
      .map(e => ({ t: (e.textContent || '').trim(), r: e.getBoundingClientRect() }))
      .find(b3 => /Add to cart/i.test(b3.t));
    return ab2(ab);
    function ab2(x) { return x ? { t: x.t, cx: Math.round(x.r.x + x.r.width / 2), cy: Math.round(x.r.y + x.r.height / 2), h: Math.round(x.r.height), top: Math.round(x.r.top), bottom: Math.round(x.r.bottom) } : null; }
  });
  console.log('btn geom', JSON.stringify(ab));
  for (const dy of [0, -8, -14]) {
    await p.mouse.click(ab.cx, ab.cy + dy); await p.waitForTimeout(900);
    const has = (await L.allText(p)).match(/Login Required[^\n]*/);
    if (has) { console.log(`dy=${dy}: toast ->`, has[0].slice(0, 60)); break; }
    else console.log(`dy=${dy}: no toast`);
  }
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
