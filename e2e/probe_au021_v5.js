// AU-021 probe v5: UI login, inspect storage keys, then seed cart under the right key.
const { chromium } = require('playwright');
const L = require('./lib_verify.js');
const dump = async (p, tag) => {
  const o = await p.evaluate(() => {
    const r = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); r[k] = String(localStorage.getItem(k)).slice(0, 60); } return r;
  }).catch(() => ({}));
  console.log(tag, JSON.stringify(o));
};
(async () => {
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(L.APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 60; i++) { if (await p.evaluate(() => document.querySelectorAll('flt-semantics').length > 3)) break; await p.waitForTimeout(1000); }
  // UI login
  let ok = false;
  for (let i = 0; i < 4 && !ok; i++) ok = await L.clickBtn(p, 'Login');
  console.log('login tab clicked:', ok);
  for (let i = 0; i < 20 && !(/Welcome back/.test(await L.allText(p).catch(()=> ''))); i++) await p.waitForTimeout(1000);
  const ei = p.locator('input[type="text"]').first(); const pi = p.locator('input[type="password"]').first();
  await ei.click({ force: true }); await p.waitForTimeout(400); await p.keyboard.type(L.BUYER.email);
  await pi.click({ force: true }); await p.waitForTimeout(400); await p.keyboard.type(L.BUYER.pw);
  await L.clickBtn(p, 'Log in');
  let logged = false;
  for (let i = 0; i < 30 && !logged; i++) { logged = /My account|Log out/.test(await L.allText(p).catch(()=> '')); if (!logged) await p.waitForTimeout(1000); }
  console.log('ui logged in:', logged);
  await dump(p, 'after-login-storage:');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
