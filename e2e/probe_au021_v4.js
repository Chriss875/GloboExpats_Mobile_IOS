// AU-021 probe v4: correct keys (flutter.auth_token / flutter.auth_email / flutter.expatCartItems_<email>)
const { chromium } = require('playwright');
const L = require('./lib_verify.js');
(async () => {
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(L.APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 60; i++) { if (await p.evaluate(() => document.querySelectorAll('flt-semantics').length > 3)) break; await p.waitForTimeout(1000); }
  const tok = await L.apiLogin(L.BUYER);
  const cart = [
    { lineId: 'p612', productId: 612, sellerId: '132', sellerName: 'Grace Mramba', title: 'Complete Guest Aminities Package',
      price: 7000, category: 'Home', location: 'Dar es Salaam', isVerified: false, currency: 'TZS',
      maxQuantity: 9, quantity: 5, selected: true, choices: [] },
    { lineId: 'p621', productId: 621, sellerId: '113', sellerName: 'THOMAS SOSPETER', title: 'Crochet Bonet hat',
      price: 35000, category: 'Fashion', location: 'Arusha', isVerified: true, currency: 'TZS',
      maxQuantity: 2, quantity: 2, selected: true, choices: [] },
    { lineId: 'p618', productId: 618, sellerId: '128', sellerName: "Kevin  Shellukindo", title: "VICTORIA'S SECRET BOMBSHELL INTENSE",
      price: 342000, category: 'Beauty', location: 'Mwanza', isVerified: false, currency: 'TZS',
      maxQuantity: 1, quantity: 1, selected: true, choices: [] },
  ];
  const keys = await p.evaluate(([t, e, c]) => {
    localStorage.setItem('flutter.auth_token', t);
    localStorage.setItem('flutter.auth_email', e);
    localStorage.setItem('flutter.expatCartItems_' + e, c);
    return Object.keys(localStorage);
  }, [tok, L.BUYER.email, JSON.stringify(cart)]);
  console.log('keys now:', JSON.stringify(keys));
  await p.reload({ waitUntil: 'load' }).catch(() => {});
  for (let i = 0; i < 40; i++) { if (/Buy now|Marketplace/.test(await L.allText(p).catch(()=> ''))) break; await p.waitForTimeout(1000); }
  const t1 = await L.allText(p);
  console.log('after reload header:', t1.replace(/\n+/g,'|').slice(0,120));
  let ok = false;
  for (let i = 0; i < 4 && !ok; i++) ok = await L.clickBtn(p, 'Cart');
  console.log('cart clicked:', ok);
  await p.waitForTimeout(4500);
  let txt = '';
  for (let i = 0; i < 12; i++) {
    txt = [...new Set((await L.allText(p).catch(() => '')).split('\n'))].join('|');
    if (/Go to checkout/.test(txt) && /Crochet Bonet hat/.test(txt)) break;
    await p.waitForTimeout(1500);
  }
  console.log('CART TEXT>>>', txt.slice(0, 1600));
  await p.screenshot({ path: '/tmp/au021v/probe-v4-cart.png' }).catch(() => {});
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
