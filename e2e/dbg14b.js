// dbg: precise stepper semantics — click the two unlabeled 40x40 buttons at y~139
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
  const readQty = () => p.evaluate(() => {
    let q = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      const m = t.match(/^(\d+)$/);
      if (m && e.getBoundingClientRect().y > 100 && e.getBoundingClientRect().height < 40) q = Number(m[1]);
    });
    return q;
  });
  console.log('initial qty', await readQty());
  // minus at x271..311, plus at x319..359, both y139..179 -> centers (291,159) and (339,159)
  console.log('click minus center'); await p.mouse.click(291, 159); await p.waitForTimeout(500);
  console.log('after minus', await readQty());
  for (let i = 0; i < 6; i++) { await p.mouse.click(339, 159); await p.waitForTimeout(350); }
  console.log('after +x6', await readQty());
  for (let i = 0; i < 6; i++) { await p.mouse.click(339, 159); await p.waitForTimeout(350); }
  console.log('after +x12 total', await readQty());
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-014/dbg-stepper.png' });
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
