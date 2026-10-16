// dbg: what does the stepper band actually contain on 619 at 375?
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9108/#/product/619', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30; i++) { if (await L.waitText(p, 'Add to cart', 1500)) break; }
  // scroll to quantity
  for (let i = 0; i < 14; i++) {
    const has = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].some(e => (e.textContent || '').trim() === 'Quantity'));
    if (has) break;
    await p.mouse.move(180, 350); await p.mouse.wheel(0, 380); await p.waitForTimeout(300);
  }
  const dump = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      out.push({ t: (e.textContent || '').trim().slice(0, 40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), label: e.getAttribute('aria-label'), fltlabel: e.getAttribute('flt-label') });
    });
    return out;
  });
  console.log(JSON.stringify(dump.filter(d => d.h < 90), null, 1));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
