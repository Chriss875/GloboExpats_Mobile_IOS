// AU-021 probe: does the frozen bundle boot, seed auth via localStorage, deep-link /cart?
const { chromium } = require('playwright');
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 100)); });
  p.on('pageerror', e => errs.push('pageerror:' + String(e).slice(0, 100)));
  await p.goto(L.APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(e => console.log('goto err', String(e).slice(0,80)));
  // wait for flutter app to render something
  let painted = false;
  for (let i = 0; i < 60 && !painted; i++) {
    try {
      painted = await p.evaluate(() => document.querySelectorAll('flt-semantics').length > 3);
    } catch (e) {}
    if (!painted) await p.waitForTimeout(1000);
  }
  console.log('painted:', painted);
  if (painted) {
    const t = await L.allText(p);
    console.log('TEXT>>>', t.replace(/\s+/g, '|').slice(0, 400));
  }
  // seed auth + cart
  const tok = await L.apiLogin(L.BUYER);
  console.log('token len', tok.length);
  const cart = [
    { lineId: 'p612', productId: 612, sellerId: '132', sellerName: 'Grace Mramba', title: 'Complete Guest Aminities Package',
      price: 7000, imageUrl: null, category: 'Home', location: 'Dar es Salaam', isVerified: false, currency: 'TZS',
      maxQuantity: 9, quantity: 5, selected: true, choices: [] },
    { lineId: 'p621', productId: 621, sellerId: '113', sellerName: 'THOMAS SOSPETER', title: 'Crochet Bonet hat',
      price: 35000, imageUrl: null, category: 'Fashion', location: 'Arusha', isVerified: true, currency: 'TZS',
      maxQuantity: 2, quantity: 2, selected: true, choices: [] },
    { lineId: 'p618', productId: 618, sellerId: '128', sellerName: "Kevin  Shellukindo", title: "VICTORIA'S SECRET BOMBSHELL INTENSE",
      price: 342000, imageUrl: null, category: 'Beauty', location: 'Mwanza', isVerified: false, currency: 'TZS',
      maxQuantity: 1, quantity: 1, selected: true, choices: [] },
  ];
  await p.evaluate(([t, e, c]) => {
    localStorage.setItem('flutter.auth_token', t);
    localStorage.setItem('flutter.auth_email', e);
    localStorage.setItem('expatCartItems_' + e, c);
  }, [tok, L.BUYER.email, JSON.stringify(cart)]);
  // reload and go to /cart
  await p.goto(L.APP + '/cart', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(6000);
  let txt = '';
  for (let i = 0; i < 20; i++) {
    txt = await L.allText(p).catch(() => '');
    if (/Go to checkout|Cart \(/.test(txt)) break;
    await p.waitForTimeout(1500);
  }
  console.log('CART TEXT>>>', txt.replace(/\n+/g, '|').slice(0, 1200));
  await p.screenshot({ path: '/tmp/au021v/probe-cart.png' }).catch(() => {});
  console.log('errors:', JSON.stringify(errs.slice(0, 8)));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
