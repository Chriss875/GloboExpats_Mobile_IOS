// dbg: is the whole bottom bar dead, or just Add? Try 'Buy now' (navigates to
// checkout for authed user / Login Required toast for guest) and 'Save'
// (toggles favorite icon). If Save works but Add doesn't -> Add-specific bug.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  // GUEST: Buy Now must fire the Login Required toast (guard order: own-item ->
  // out-of-stock -> sign-in). Guest on 646 => toast expected.
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  const bn = await p.evaluate(() => { let h=null; document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{ if(/^Buy now$/.test((e.textContent||'').trim())&&!h){const r=e.getBoundingClientRect(); h={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};} }); return h; });
  console.log('buy-now at', bn);
  if (bn) { await p.mouse.click(bn.x, bn.y); await p.waitForTimeout(1400);
    const m = (await L.allText(p)).match(/Login Required|Added to cart|own listed items|units are/);
    console.log('BuyNow guest ->', m ? m[0] : 'NO REACTION'); }
  const sv = await p.evaluate(() => { let h=null; document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{ if(/^Save$/.test((e.textContent||'').trim())&&!h){const r=e.getBoundingClientRect(); h={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};} }); return h; });
  if (sv) { await p.mouse.click(sv.x, sv.y); await p.waitForTimeout(1000);
    const t = await L.allText(p);
    console.log('Save clicked; Saved view?', /Saved/.test(t)); }
  // Back button control
  const bk = await p.evaluate(() => { let h=null; document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{ if(/^Back$/.test((e.textContent||'').trim())&&!h){const r=e.getBoundingClientRect(); h={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};} }); return h; });
  if (bk) { await p.mouse.click(bk.x, bk.y); await p.waitForTimeout(1500);
    console.log('Back clicked; still on detail?', /Add to cart/.test(await L.allText(p))); }
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
