// CTA probe v2: tap Add to cart (no dates) and watch for snackbar via MutationObserver + rect dump
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: null });
  const p = await ctx.newPage(); p.setDefaultTimeout(25000);
  // login
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
  await p.goto(`${APP}/#/product/470`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await lib.waitText(p, 'Modern Business Stay Apartment', 40000); await sleep(2200);

  async function nodeInfo(label) {
    return p.evaluate((lbl) => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        if (t !== lbl) return;
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return;
        if (!best || r.width * r.height < best.area)
          best = { area: r.width * r.height, x: r.x, y: r.y, w: r.width, h: r.height,
                   role: e.getAttribute('role'), tappable: e.getAttribute('flt-tappable') };
      });
      return best;
    }, label);
  }
  const addBtn = await nodeInfo('Add to cart');
  console.log('AddToCart node:', JSON.stringify(addBtn));
  // install a DOM mutation logger BEFORE the click
  await p.evaluate(() => {
    window.__mut = [];
    const log = () => { window.__mut.push({ t: Date.now(), n: document.querySelectorAll('flt-semantics').length,
      txt: [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent||'').trim())
            .filter(x => /rental|Added|dates/i.test(x)).slice(0,3) });
      if (window.__mut.length > 400) window.__mut.shift(); };
    new MutationObserver(log).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await p.mouse.click(Math.round(addBtn.x + addBtn.w / 2), Math.round(addBtn.y + addBtn.h / 2));
  await sleep(600);
  let m = await p.evaluate(() => window.__mut.slice(-6));
  console.log('mutations after add-tap:', JSON.stringify(m));
  m = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map(e => ({ t: (e.textContent || '').trim().slice(0, 60), y: Math.round(e.getBoundingClientRect().y),
                 role: e.getAttribute('role'), live: e.getAttribute('aria-live') }))
    .filter(x => /rental|Added|dates|cart/i.test(x.t)));
  console.log('matching nodes now:', JSON.stringify(m));
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-016r2/diag-cta2.png' });
  // also check localStorage cart state
  const cart = await p.evaluate(() => Object.keys(localStorage).filter(k => /cart/i.test(k))
    .map(k => k + '=' + (localStorage.getItem(k) || '').slice(0, 200)));
  console.log('cart storage:', JSON.stringify(cart));
  await ctx.close(); await browser.close();
})();
