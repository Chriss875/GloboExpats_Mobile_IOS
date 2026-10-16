// dbg: is semantics interactivity alive at all on this deep-linked page?
// The stepper WORKED (dbg14e) — but that was a fresh page where I scrolled.
// Compare: stepper click NOW on this same page load. If stepper works and
// Add doesn't, the Add button's semantics ACTION handler differs.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9108/#/product/629', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  const qty = () => p.evaluate(() => { let q = null; document.querySelectorAll('flt-semantics').forEach(e => { const t = (e.textContent||'').trim(); if (/^[0-9]+$/.test(t)) { const r = e.getBoundingClientRect(); if (r.x > 260 && r.width < 30) q = Number(t); } }); return q; });
  console.log('qty before', await qty());
  const s = await p.evaluate(() => { let m=null; document.querySelectorAll('flt-semantics[role="button"]').forEach(e => { const r=e.getBoundingClientRect(); if (r.width===40&&r.height===40&&r.x>240&&r.x<310) m={x:Math.round(r.x+20),y:Math.round(r.y+20)}; }); return m; });
  console.log('minus at', s);
  if (s && (await qty()) === 1) { /* minus floor */ }
  // plus
  const s2 = await p.evaluate(() => { let m=null; document.querySelectorAll('flt-semantics[role="button"]').forEach(e => { const r=e.getBoundingClientRect(); if (r.width===40&&r.height===40&&r.x>300) m={x:Math.round(r.x+20),y:Math.round(r.y+20)}; }); return m; });
  if (s2) { await p.mouse.click(s2.x, s2.y); await p.waitForTimeout(600); }
  console.log('qty after plus', await qty());
  // now the Add button via mouse click again
  const ab = await p.evaluate(() => { let h=null; document.querySelectorAll('flt-semantics[role="button"]').forEach(e => { if (/Add to cart/i.test((e.textContent||'').trim()) && !h) { const r=e.getBoundingClientRect(); h={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; } }); return h; });
  console.log('add at', ab);
  await p.mouse.click(ab.x, ab.y);
  let seen='';
  for (let i=0;i<50;i++) { await p.waitForTimeout(100); const t=await L.allText(p); const m=t.match(/own listed items|Added to cart|Login Required/); if(m){seen=m[0];break;} }
  console.log('add result:', seen || 'NOTHING');
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
