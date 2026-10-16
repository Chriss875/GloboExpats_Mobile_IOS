// dbg: click the +/- IconButtons by their rendered geometry (271..311 / 319..359 @ y139 h40)
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
  const qtyNode = () => p.evaluate(() => {
    let q = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if ((e.textContent || '').trim() === '1' || /^[0-9]$/.test((e.textContent||'').trim())) {
        const r = e.getBoundingClientRect();
        if (r.x > 280 && r.x < 340 && r.height < 30 && r.y > 100 && r.y < 200)
          q = Number((e.textContent || '').trim());
      }
    });
    return q;
  });
  const plusAt = () => p.evaluate(() => {
    // the + IconButton is the unlabeled 40x40 button to the RIGHT of the qty digit
    let plus = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.width === 40 && r.height === 40 && r.y > 100 && r.y < 220 && r.x > 300) plus = { x: Math.round(r.x + 20), y: Math.round(r.y + 20) };
    });
    return plus;
  });
  console.log('qty', await qtyNode(), 'plus', await plusAt());
  const plus = await plusAt();
  for (let i = 0; i < 8; i++) { await p.mouse.click(plus.x, plus.y); await p.waitForTimeout(450); console.log(i, 'qty', await qtyNode()); }
  // minus
  const minusAt = () => p.evaluate(() => {
    let m = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.width === 40 && r.height === 40 && r.y > 100 && r.y < 220 && r.x > 240 && r.x < 310) m = { x: Math.round(r.x + 20), y: Math.round(r.y + 20) };
    });
    return m;
  });
  const minus = await minusAt();
  await p.mouse.click(minus.x, minus.y); await p.waitForTimeout(500);
  console.log('after minus', await qtyNode());
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-014/dbg-stepper2.png' });
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
