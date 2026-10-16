// au039_probe_console.js — capture BROWSER CONSOLE during one wrong-code submit
// to determine WHY no feedback renders: uncaught Dart exception (console.error)
// vs silently swallowed vs painted-but-unreachable.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9121';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const txt = p => p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
async function findNode(p, label) {
  return p.evaluate((lbl) => { let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => { const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
      if (!best || r.width * r.height < best.area) best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }); return best; }, label);
}
async function tap(p, label, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const h = await findNode(p, label);
    if (h) { await p.mouse.click(Math.max(3, Math.min(h.x, 760)), Math.max(20, Math.min(h.y, 1015))); await sleep(1100); return true; }
    await p.mouse.move(190, 350); await p.mouse.wheel(0, i % 2 === 0 ? 260 : -260); await sleep(320);
  } return false;
}
(async () => {
  const fxC = JSON.parse(fs.readFileSync('/tmp/au039_fixtures_c.json', 'utf8'));
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const logs = [];
  p.on('console', m => { logs.push({ type: m.type(), text: m.text().slice(0, 500) }); });
  p.on('pageerror', e => { logs.push({ type: 'PAGEERROR', text: String(e).slice(0, 600) }); });
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000);
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
  const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fxC.seller.email, { delay: 12 });
  const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fxC.seller.pw, { delay: 12 });
  await L.clickBtn(p, 'Log in');
  for (let i = 0; i < 30; i++) { if (await p.evaluate(() => localStorage.getItem('flutter.auth_token'))) break; await sleep(1000); }
  await sleep(1500);
  const markBefore = logs.length;
  await p.evaluate(() => { window.location.hash = '#/orders'; }); await sleep(5200);
  await tap(p, 'Selling', 4); await sleep(1800);
  await tap(p, fxC.orderNumber, 4); await sleep(1600);
  await tap(p, 'Track delivery', 5); await sleep(2600);
  logs.length = 0; // clear nav noise
  const inp = p.locator('input').first();
  await inp.click({ force: true }).catch(() => {}); await sleep(280);
  await p.keyboard.type('722222', { delay: 22 }); await sleep(320);
  console.log('tap:', await tap(p, 'Verify delivery', 2));
  await sleep(3000);
  const T = await txt(p);
  console.log('attempt copy present:', /attempt/i.test(T), '| INVALID text:', T.includes('INVALID_DELIVERY_CODE'), '| remaining:', /remaining/i.test(T));
  console.log('--- CONSOLE SINCE SUBMIT ---');
  for (const l of logs.slice(markBefore)) console.log(`[${l.type}] ${l.text.slice(0, 420)}`);
  fs.writeFileSync('/tmp/au039_console_logs.json', JSON.stringify(logs, null, 1));
  await ctx.close(); await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
