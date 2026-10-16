// dbg: The semantics tree may be STALE — a shadow of an earlier frame. The
// stepper worked because...? Actually in dbg14z the stepper went null->1 (the
// FIRST read was null!). Maybe the qty digit node appears late. Test whether
// the stepper + click REALLY changed state or whether I misread.
// Fresh page: read qty, click plus x3 with polling, screenshot each step.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9108/#/product/629', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  const qty = () => p.evaluate(() => { let q=null; document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim(); if(/^[0-9]+$/.test(t)){const r=e.getBoundingClientRect(); if(r.x>260&&r.width<30&&r.height<30) q=t;}}); return q; });
  const plusLoc = () => p.evaluate(() => { let m=null; document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{const r=e.getBoundingClientRect(); if(r.width===40&&r.height===40&&r.x>300&&r.y<innerHeight-10&&r.y>50) m={x:Math.round(r.x+20),y:Math.round(r.y+20)};}); return m; });
  console.log('qty0', await qty(), 'plus', JSON.stringify(await plusLoc()));
  for (let k = 1; k <= 4; k++) {
    const pl = await plusLoc();
    await p.mouse.click(pl.x, pl.y);
    await p.waitForTimeout(650);
    console.log(`after +${k}: qty=${await qty()}`);
  }
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-014/dbg-qty-steps.png' });
  // Now Buy Now via locator force click at exact center
  const loc = p.locator('flt-semantics[role="button"]', { hasText: 'Buy now' }).first();
  const box = await loc.boundingBox();
  console.log('buynow bbox', JSON.stringify(box));
  await loc.click({ force: true, position: { x: box.width / 2, y: box.height / 2 } }).catch(e => console.log('click err', e.message));
  let seen = '';
  for (let i = 0; i < 40; i++) { await p.waitForTimeout(120); const m = (await L.allText(p)).match(/Login Required|Added to cart|Checkout|Delivery/); if (m) { seen = m[0]; break; } }
  console.log('buynow result:', seen || 'NO REACTION', '| url:', p.url());
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
