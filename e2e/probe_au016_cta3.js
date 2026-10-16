// Definitive CTA probe: elementFromPoint, full-text dump post-tap, own-item guard check
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: null });
  const p = await ctx.newPage(); p.setDefaultTimeout(25000);
  // capture the user-details payload (own-item guard input)
  let userDetails = null;
  p.on('response', async r => {
    if (/user-details/.test(r.url())) { try { userDetails = await r.json(); } catch (e) {} }
  });
  await p.goto(`${APP}/#/login`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  if (!(await lib.isLoggedIn(p))) {
    await lib.waitText(p, 'Welcome back', 30000);
    const ei = p.locator('input[type="text"]').first(), pi = p.locator('input[type="password"]').first();
    await ei.click({ force: true }); await p.waitForTimeout(350); await p.keyboard.type(lib.BUYER.email);
    await pi.click({ force: true }); await p.waitForTimeout(350); await p.keyboard.type(lib.BUYER.pw);
    await lib.clickBtn(p, 'Log in');
    let ok = false; for (let i = 0; i < 30 && !ok; i++) { ok = await lib.isLoggedIn(p); if (!ok) await p.waitForTimeout(1000); }
    console.log('login', ok);
  }
  await sleep(1500);
  await p.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await lib.waitText(p, 'Modern Business Stay Apartment', 40000); await sleep(2200);
  console.log('userDetails:', JSON.stringify(userDetails || 'NOT CAPTURED'));

  const btn = await p.evaluate(() => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if ((e.textContent || '').trim() !== 'Add to cart') return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      if (!best || r.width * r.height < best.area)
        best = { area: r.width*r.height, cx: r.x + r.width/2, cy: r.y + r.height/2 };
    });
    return best;
  });
  console.log('btn:', JSON.stringify(btn));
  // what is topmost at that point?
  const top = await p.evaluate(([x,y]) => {
    const el = document.elementFromPoint(x, y);
    return { tag: el && el.tagName, cls: el && el.getAttribute('flt-tappable'),
             role: el && el.getAttribute('role'), txt: el && (el.textContent||'').slice(0,60),
             chain: (() => { let c=[],e=el; while(e && c.length<5){ c.push((e.tagName||'?')+(e.className&&typeof e.className==='string'?'.'+e.className.split(' ')[0]:'')); e=e.parentElement;} return c; })() };
  }, [Math.round(btn.cx), Math.round(btn.cy)]);
  console.log('elementFromPoint:', JSON.stringify(top));

  await p.mouse.click(Math.round(btn.cx), Math.round(btn.cy));
  // poll aggressively for ANY new short text node (snackbar) for 4s
  for (let i = 0; i < 16; i++) {
    const news = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
      .map(e => (e.textContent || '').trim())
      .filter(x => x.length > 5 && x.length < 160 &&
        !/TSh|Apartment|Kilaiti|kilaiti|Stays|Rental|per night|Start date|End date|Bedroom|Available|reviews|views/i.test(x)));
    if (news.length) { console.log('T+' + (i*0.25).toFixed(2) + 's new nodes:', JSON.stringify(news.slice(0,4))); break; }
    await sleep(250);
  }
  // final full dump of short texts
  const shorts = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map(e => (e.textContent || '').trim()).filter(x => x.length > 4 && x.length < 130));
  console.log('short texts now:', JSON.stringify(shorts.slice(0, 25)));
  const cart = await p.evaluate(() => Object.keys(localStorage).filter(k => /cart/i.test(k))
    .map(k => k + '=' + (localStorage.getItem(k)||'').slice(0,300)));
  console.log('cart storage:', JSON.stringify(cart));
  await ctx.close(); await browser.close();
})();
