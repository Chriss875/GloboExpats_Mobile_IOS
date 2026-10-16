// dbg A9: what do the chips on 644 actually look like in semantics?
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9108/#/product/644', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  await p.waitForTimeout(4000);
  // scroll to the choice section
  for (let i = 0; i < 12; i++) {
    const has = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].some(e => /Size/.test((e.textContent || ''))));
    if (has) break;
    await p.mouse.move(180, 350); await p.mouse.wheel(0, 380); await p.waitForTimeout(300);
  }
  const dump = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t || t.length > 40) return;
      if (/Size|Choose|Tote|M\b|^L$|^S$|One/.test(t)) {
        const r = e.getBoundingClientRect();
        out.push({ t: t.slice(0, 30), role: e.getAttribute('role'), tap: e.getAttribute('flt-tappable') !== null ? 'T' : '', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    return out;
  });
  console.log(JSON.stringify(dump.slice(0, 20), null, 1));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
