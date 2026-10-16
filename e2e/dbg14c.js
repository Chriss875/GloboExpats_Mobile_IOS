// dbg: full semantics dump of the quantity row region on 619
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9108/#/product/619', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30; i++) { if (await L.waitText(p, 'Add to cart', 1500)) break; }
  for (let i = 0; i < 14; i++) {
    const has = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].some(e => (e.textContent || '').trim() === 'Quantity'));
    if (has) break;
    await p.mouse.move(180, 350); await p.mouse.wheel(0, 380); await p.waitForTimeout(300);
  }
  const rows = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t || t.length > 60) return;
      const r = e.getBoundingClientRect();
      if (r.y < 80 || r.y > 260) return;
      out.push({ t: t.slice(0, 40), tag: e.tagName, role: e.getAttribute('role'), tap: e.getAttribute('flt-tappable') !== null ? 'tap' : '', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), actions: e.getAttribute('flt-actions') });
    });
    return out;
  });
  console.log(JSON.stringify(rows, null, 1));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
