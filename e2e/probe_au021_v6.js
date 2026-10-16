// AU-021 probe v6: UI login, then seed cart with JSON-encoded values (KvStore.setJson stores jsonEncode output).
const { chromium } = require('playwright');
const L = require('./lib_verify.js');
(async () => {
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(L.APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 60; i++) { if (await p.evaluate(() => document.querySelectorAll('flt-semantics').length > 3)) break; await p.waitForTimeout(1000); }
  let ok = false;
  for (let i = 0; i < 4 && !ok; i++) ok = await L.clickBtn(p, 'Login');
  for (let i = 0; i < 20 && !(/Welcome back/.test(await L.allText(p).catch(()=> ''))); i++) await p.waitForTimeout(1000);
  const ei = p.locator('input[type="text"]').first(); const pi = p.locator('input[type="password"]').first();
  await ei.click({ force: true }); await p.waitForTimeout(400); await p.keyboard.type(L.BUYER.email);
  await pi.click({ force: true }); await p.waitForTimeout(400); await p.keyboard.type(L.BUYER.pw);
  await L.clickBtn(p, 'Log in');
  let logged = false;
  for (let i = 0; i < 30 && !logged; i++) { logged = /Log out|My account/.test(await L.allText(p).catch(()=> '')); if (!logged) await p.waitForTimeout(1000); }
  console.log('ui logged in:', logged);
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
  const res = await p.evaluate((c) => {
    const emailRaw = localStorage.getItem('flutter.auth_email') || '';
    let email = emailRaw; try { email = JSON.parse(emailRaw); } catch (e) {}
    // mirror KvStore.setJson: value must be a JSON STRING of the list
    localStorage.setItem('flutter.expatCartItems_' + email, JSON.stringify(c));
    return { key: 'flutter.expatCartItems_' + email, stored: String(localStorage.getItem('flutter.expatCartItems_' + email)).slice(0, 80) };
  }, cart);
  console.log('seed:', JSON.stringify(res));
  await p.goto(L.APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 40; i++) { if (/Buy now|Marketplace/.test(await L.allText(p).catch(()=> ''))) break; await p.waitForTimeout(1000); }
  let clicked = false;
  for (let i = 0; i < 4 && !clicked; i++) clicked = await L.clickBtn(p, 'Cart');
  console.log('cart clicked:', clicked);
  await p.waitForTimeout(5000);
  let txt = '';
  for (let i = 0; i < 10; i++) {
    txt = [...new Set((await L.allText(p).catch(() => '')).split('\n'))].join('|');
    if (/Crochet Bonet hat/.test(txt)) break;
    await p.waitForTimeout(1500);
  }
  console.log('CART TEXT>>>', txt.slice(0, 1800));
  await p.screenshot({ path: '/tmp/au021v/probe-v6-cart.png' }).catch(() => {});
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
