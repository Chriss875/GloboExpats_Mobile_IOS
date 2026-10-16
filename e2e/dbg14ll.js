// dbg: storage diff with token INJECTION (skip UI login flakiness).
const L = require('./lib_verify.js');
const API = 'http://localhost:8083';
async function apiLogin() {
  const r = await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: L.BUYER.email, password: L.BUYER.pw }) });
  return (await r.json()).token;
}
(async () => {
  const token = await apiLogin();
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.addInitScript((t) => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, token);
  await p.goto('http://localhost:9108/', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Buy now', 1500)); i++) {}
  console.log('loggedIn:', await L.isLoggedIn(p));
  const keysBefore = await p.evaluate(() => Object.keys(localStorage));
  console.log('keys before:', JSON.stringify(keysBefore));
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  await p.waitForTimeout(5000);
  const okClick = await L.clickBtn(p, 'Add to cart');
  console.log('click:', okClick);
  await p.waitForTimeout(3000);
  console.log('toast in DOM:', await p.evaluate(() => document.body.innerHTML.includes('Added to cart')));
  const keysAfter = await p.evaluate(() => Object.keys(localStorage));
  console.log('keys after:', JSON.stringify(keysAfter));
  for (const k of keysAfter) if (/expatCartItems/i.test(k)) console.log('CARTKEY', k, '=', await p.evaluate((kk) => localStorage.getItem(kk), k).then(v => v.slice(0, 400)));
  // cart route
  await p.goto('http://localhost:9108/#/cart', { waitUntil: 'load' }).catch(() => {});
  await p.waitForTimeout(3500);
  const t = await L.allText(p);
  console.log('cart item shown?', t.includes('Window Probe Cabinet'), '| subtotal:', (t.match(/Subtotal \(\d+ item[^\n]*/) || [''])[0]);
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
