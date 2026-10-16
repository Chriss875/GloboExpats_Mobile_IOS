// au039_probe_msgvis.js — decisive message-visibility probe on a FRESH IN_TRANSIT
// order (ORD-2026-000098, code 775965): seller enters 1 wrong code in the app card,
// then (a) dumps the FULL a11y text, (b) scrolls the card to the TOP of the viewport,
// screenshots, and crops the whole card. If a red error line exists anywhere it must
// appear here.
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
  const pre = await L.api(fxC.buyer.token, 'GET', `/api/v1/orders/${fxC.orderId}`);
  console.log('PRE:', pre.json.status, pre.json.deliveryCode);
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  let vdBody = null;
  p.on('response', async r => { const u = r.url();
    if (/verify-delivery/.test(u)) { try { vdBody = await r.json(); } catch (e) {} console.log('NET verify-delivery ->', r.status(), JSON.stringify(vdBody)); } });
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000);
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
  const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fxC.seller.email, { delay: 12 });
  const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fxC.seller.pw, { delay: 12 });
  await L.clickBtn(p, 'Log in');
  for (let i = 0; i < 30; i++) { if (await p.evaluate(() => localStorage.getItem('flutter.auth_token'))) break; await sleep(1000); }
  console.log('logged in');
  await sleep(1500);
  await p.evaluate(() => { window.location.hash = '#/orders'; }); await sleep(5200);
  console.log('tap Selling:', await tap(p, 'Selling', 4)); await sleep(1800);
  console.log('list ok:', (await txt(p)).includes(fxC.orderNumber));
  console.log('open detail:', await tap(p, fxC.orderNumber, 4)); await sleep(1600);
  console.log('tap Track delivery:', await tap(p, 'Track delivery', 5)); await sleep(2600);

  // type wrong code
  const inp = p.locator('input').first();
  await inp.click({ force: true }).catch(() => {}); await sleep(280);
  await p.keyboard.type('711111', { delay: 22 }); await sleep(320);
  console.log('typed dom=', await p.evaluate(() => document.querySelector('input')?.value));
  console.log('tap Verify delivery:', await tap(p, 'Verify delivery', 2));
  await sleep(2400);

  // scroll so the CARD is fully at top of viewport
  await p.mouse.move(190, 350);
  for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, -300); await sleep(150); }
  // then bring the card into view by scrolling down until 'Delivery handover' is visible near top
  for (let i = 0; i < 14; i++) {
    const pos = await p.evaluate(() => { let r = null;
      document.querySelectorAll('flt-semantics').forEach(e => { if (r) return;
        if ((e.textContent || '').includes('Delivery handover')) { const b = e.getBoundingClientRect(); r = b.top; } });
      return r; });
    if (pos !== null && pos > 20 && pos < 120) break;
    if (pos === null || pos > 120) { await p.mouse.wheel(0, 160); await sleep(160); } else { await p.mouse.wheel(0, -80); await sleep(160); }
  }
  await sleep(800);
  const full = await txt(p);
  console.log('--- FULL A11Y DUMP (after wrong code, card scrolled to top) ---');
  console.log(full.split('\n').filter(Boolean).join(' | ').slice(0, 1400));
  console.log('--- contains INVALID_DELIVERY_CODE?', full.includes('INVALID_DELIVERY_CODE'));
  console.log('--- contains "attempt"?', /attempt/i.test(full), '| matches:', JSON.stringify(full.match(/[^\n]*attempt[^\n]*/gi)));
  console.log('--- contains "remaining"?', /remaining/i.test(full));
  await L.screenshot(p, 'e2e/shots/AU-039/AU-039-msgprobe-card-top.png');
  // also crop via ffmpeg afterwards
  fs.writeFileSync('/tmp/au039_msgprobe_full.txt', full);
  await ctx.close(); await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
