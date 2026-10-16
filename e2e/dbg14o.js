// dbg: click Add and watch for ANY snackbar via role=alert / aria-live nodes
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9108/', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Buy now', 1500)); i++) {}
  if (!(await L.isLoggedIn(p))) {
    await L.clickBtn(p, 'Login'); await p.waitForTimeout(2000);
    await p.locator('input[type="text"]').first().click({ force: true }); await p.waitForTimeout(250);
    await p.keyboard.type(L.BUYER.email, { delay: 10 });
    await p.locator('input[type="password"]').first().click({ force: true }); await p.waitForTimeout(250);
    await p.keyboard.type(L.BUYER.pw, { delay: 10 });
    await L.clickBtn(p, 'Log in');
    let ok = false; for (let i = 0; i < 25 && !ok; i++) { ok = await L.isLoggedIn(p); if (!ok) await p.waitForTimeout(700); }
    console.log('login', ok);
  }
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  const ab = await p.evaluate(() => {
    const b2 = [...document.querySelectorAll('flt-semantics[role="button"]')]
      .map(e => ({ t: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
      .find(b3 => /Add to cart/i.test(b3.t));
    return b2;
  });
  // watch DOM mutations for 3s
  await p.evaluate(() => { window.__m=[]; const mo=new MutationObserver(ms=>{for(const m of ms) for(const n of m.addedNodes||[]) if(n.nodeType===1) window.__m.push(((n.getAttribute&&n.getAttribute('role'))||'?')+':'+(n.textContent||'').trim().slice(0,60));}).observe(document.body,{childList:true,subtree:true}); window.__mo=mo; });
  await p.mouse.click(ab.x, ab.y);
  await p.waitForTimeout(3000);
  const muts = await p.evaluate(() => window.__m.filter(s => /Added|cart|alert|live/i.test(s)));
  console.log('relevant mutations:', JSON.stringify(muts.slice(0, 10), null, 1));
  // check the app's own snackbar area: any node with 'Added to cart' text?
  const found = await p.evaluate(() => !!document.body.innerHTML.includes('Added to cart'));
  console.log('DOM contains "Added to cart":', found);
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
