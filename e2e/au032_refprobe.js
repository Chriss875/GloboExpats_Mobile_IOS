// au032 ref probe: what does /checkout/success?proforma=<id> actually render?
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const fx = JSON.parse(fs.readFileSync('/tmp/au032_fixtures.json', 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const login = await L.api(null, 'POST', '/api/v1/auth/login', { email: fx.buyer.email, password: fx.buyer.pw });
  const tok = login.json.token;
  const pay = await L.api(tok, 'GET', '/api/v1/payments/my');
  const rows = Array.isArray(pay.json) ? pay.json : [];
  const target = rows.find(r => r.status === 'PAYMENT_SUBMITTED');
  console.log('target proforma:', target.proformaNumber, target.proformaId);
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9112/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 40000);
  if (!await L.isLoggedIn(p)) {
    await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 20000);
    await p.locator('input[type="text"]').first().click({ force: true }).catch(() => {}); await sleep(300);
    await p.keyboard.type(fx.buyer.email, { delay: 10 });
    await p.locator('input[type="password"]').first().click({ force: true }).catch(() => {}); await sleep(300);
    await p.keyboard.type(fx.buyer.pw, { delay: 10 });
    await L.clickBtn(p, 'Log in');
    for (let i = 0; i < 25 && !await L.isLoggedIn(p); i++) await sleep(1000);
  }
  await sleep(1200);
  await p.goto(`http://localhost:9112/checkout/success?proforma=${target.proformaId}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await sleep(5000);
  const T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('--- a11y text (reference-related lines) ---');
  console.log(T.split('\n').filter(l => /eference|PF-|[0-9a-f]{8}-/.test(l)).slice(0, 12).join('\n'));
  console.log('includes number:', T.includes(target.proformaNumber), '| includes uuid:', T.includes(target.proformaId));
  await p.screenshot({ path: 'e2e/shots/AU-032/probe-success-ref.png' }).catch(() => {});
  await ctx.close(); await browser.close();
})().catch(e => { console.error('PROBE FAIL', e); process.exit(1); });
