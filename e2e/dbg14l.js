// dbg: does the snackbar "Added to cart" appear at all on authed add? And does
// the CART SCREEN show the line? (SharedPreferences on flutter web = localStorage
// with 'flutter.' prefix — key would be flutter.expatCartItems_<uid>.)
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
  windowSnack(p);
  function windowSnack(pg) { pg.evaluate(() => { window.__s=[]; new MutationObserver(ms=>{for(const m of ms) for(const n of m.addedNodes||[]) if(n.nodeType===1) window.__s.push((n.textContent||'').trim().slice(0,60));}).observe(document.body,{childList:true,subtree:true}); }); }
  const ab = await p.evaluate(() => {
    const b2 = [...document.querySelectorAll('flt-semantics[role="button"]')]
      .map(e => ({ t: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
      .find(b3 => /Add to cart/i.test(b3.t));
    return b2;
  });
  await p.mouse.click(ab.x, ab.y); await p.waitForTimeout(2200);
  console.log('snacks:', JSON.stringify((await p.evaluate(() => window.__s || [])).filter(s => /Added|cart/i.test(s))));
  // open Cart via bottom nav
  const cb = await p.evaluate(() => {
    const c = [...document.querySelectorAll('flt-semantics[role="button"]')]
      .map(e => ({ t: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
      .find(x => /^Cart/.test(x.t));
    return c;
  });
  console.log('cart btn:', cb);
  if (cb) { await p.mouse.click(cb.x, cb.y); await p.waitForTimeout(2600); }
  const t = await L.allText(p);
  console.log('cart screen has Window Probe Cabinet?', t.includes('Window Probe Cabinet'), '| subtotal-ish:', (t.match(/TSh [\d,]+/g) || []).slice(0, 4));
  const all = await p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = (localStorage.getItem(k) || '').slice(0, 300); } return o; });
  console.log('storage keys now:', JSON.stringify(Object.keys(all)));
  for (const [k, v] of Object.entries(all)) if (/expatCartItems/i.test(k)) console.log('CARTKEY', k, '=', v.slice(0, 300));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
