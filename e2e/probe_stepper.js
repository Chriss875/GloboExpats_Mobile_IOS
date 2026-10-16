// probe_stepper.js — dump interactive nodes around the qty stepper on a public detail page
const L = require('./lib_verify.js');
const APP = 'http://localhost:9110';
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 12; i++) { await p.waitForTimeout(1200); if (await p.evaluate(() => document.querySelectorAll('flt-semantics').length) > 8) break; }
  await p.evaluate(() => { window.location.hash = '#/product/620'; });
  await p.waitForTimeout(6000);
  await L.scrollToBottom(p, 10);
  const dump = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const r = e.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight) return;
      out.push({ tag: e.getAttribute('role') || (e.getAttribute('flt-tappable') !== null ? 'tap' : '-'),
                 txt: (e.textContent || '').trim().slice(0, 26),
                 x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
    });
    return out.filter(o => o.y < innerHeight - 90); // above bottom bar
  });
  console.log(JSON.stringify(dump, null, 0));
  // full text
  console.log('---TEXT---');
  console.log((await L.allText(p)).split('\n').slice(0, 60).join(' | '));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
