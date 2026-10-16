// probe_stepper2.js — hunt the real qty stepper nodes on product 620
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9110/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 12; i++) { await p.waitForTimeout(1200); if (await p.evaluate(() => document.querySelectorAll('flt-semantics').length) > 8) break; }
  await p.evaluate(() => { window.location.hash = '#/product/620'; });
  await p.waitForTimeout(7000);
  // scroll UP to top first
  await p.mouse.move(200, 300); await p.mouse.wheel(0, -4000); await p.waitForTimeout(800);
  const dump = async (tag) => {
    const rows = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        const r = e.getBoundingClientRect();
        if (!r.width || r.height <= 0) return;
        if (/Quantity|^\d{1,4}$|available/.test(t)) {
          out.push({ tag: e.getAttribute('role') || (e.getAttribute('flt-tappable') !== null ? 'tap' : '-'),
                     txt: t.slice(0, 40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
                     childN: e.querySelectorAll(':scope > flt-semantics').length });
        }
      });
      return out;
    });
    console.log(tag, JSON.stringify(rows));
  };
  await dump('TOP:');
  // now scroll down gradually until Quantity appears
  for (let i = 0; i < 10; i++) {
    await p.mouse.wheel(0, 160); await p.waitForTimeout(200);
  }
  await dump('AFTER-DOWN:');
  const t = await L.allText(p);
  console.log('---has "Quantity":', /Quantity/.test(t), '| "available":', /available/.test(t));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
