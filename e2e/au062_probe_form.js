// probe: why do only 3 inputs exist on /contact? dump input attrs + tappable nodes
const { chromium } = require('playwright');
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  // login
  if (!(await L.isLoggedIn(p))) {
    await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 20000);
    const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }); await p.waitForTimeout(300);
    await p.keyboard.type('mobile.test.20260820@gmail.com', { delay: 6 });
    const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }); await p.waitForTimeout(300);
    await p.keyboard.type('StrongPass!1', { delay: 6 });
    await L.clickBtn(p, 'Log in');
    for (let i = 0; i < 25; i++) { if (await L.isLoggedIn(p)) break; await p.waitForTimeout(800); }
  }
  console.log('logged', await L.isLoggedIn(p));
  await p.evaluate(() => { window.location.hash = '/contact'; });
  await L.waitText(p, 'Contact us', 15000).catch(() => {});
  await p.waitForTimeout(2500);
  const info = await p.evaluate(() => ({
    hash: location.hash,
    inputs: [...document.querySelectorAll('input,textarea')].map(i => ({ type: i.type, value: (i.value||'').slice(0,40), ph: i.placeholder, aria: i.getAttribute('aria-label'), rect: (()=>{const r=i.getBoundingClientRect();return [r.x,r.y,r.width,r.height];})() })),
    semantics: [...document.querySelectorAll('flt-semantics')].map(e => ({ role: e.getAttribute('role'), tag: e.tagName, tap: e.getAttribute('flt-tappable') !== null, txt: (e.textContent||'').trim().slice(0,40), rect: (()=>{const r=e.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];})() })).filter(s => s.rect[3] > 4),
    rawTexts: [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent||'').trim()).filter(Boolean),
  }));
  console.log(JSON.stringify(info, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
