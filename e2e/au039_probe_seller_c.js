// au039_probe_seller_c.js — FINAL AU-039 probe.
// Seller (fixture C) drives the handover card on a GENUINELY IN_TRANSIT order:
//   3 wrong codes -> expect REAL 400 INVALID_DELIVERY_CODE bodies (attemptsRemaining 2,1)
//   -> app must surface attempt copy each time -> lock on 3rd
//   -> buyer regenerates via API -> seller verifies NEW code in-app? (T19 via API)
// After EVERY attempt: FULL a11y dump grep + bottom-strip screenshot, so we can
// prove whether the error message renders or is swallowed.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9121';
const R = { calls: [], steps: [], shots: [], t19: null };
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
async function typeIntoFirstInput(p, value) {
  const inp = p.locator('input').first();
  await inp.click({ force: true }).catch(() => {}); await sleep(280);
  await p.keyboard.press('Control+a'); await sleep(120); await p.keyboard.press('Delete'); await sleep(200);
  await p.keyboard.type(value, { delay: 22 }); await sleep(320);
  return p.evaluate(() => { const el = document.querySelector('input'); return el ? el.value : null; });
}
(async () => {
  const fxC = JSON.parse(fs.readFileSync('/tmp/au039_fixtures_c.json', 'utf8'));
  // preconditions
  const pre = await L.api(fxC.buyer.token, 'GET', `/api/v1/orders/${fxC.orderId}`);
  console.log('PRE: order C status=', pre.json.status, 'code=', pre.json.deliveryCode);
  if (pre.json.status !== 'IN_TRANSIT') { console.error('order C not IN_TRANSIT — aborting'); process.exit(1); }
  const CODE_C = String(pre.json.deliveryCode);

  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-039-r6-seller-realinvalid.webm' });
  const p = await ctx.newPage();
  p.on('response', async r => {
    const u = r.url(); if (!/localhost:8083\/api\//.test(u)) return;
    if (/verify-delivery|regenerate/.test(u)) {
      let body = null; try { body = await r.json(); } catch (e) {}
      R.calls.push({ line: `${r.request().method()} ${u.replace('http://localhost:8083', '')} -> ${r.status()}`, body });
      console.log('NET:', R.calls[R.calls.length - 1].line, JSON.stringify(body).slice(0, 130));
    }
  });
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000);
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
  const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fxC.seller.email, { delay: 12 });
  const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fxC.seller.pw, { delay: 12 });
  await L.clickBtn(p, 'Log in');
  let li = false; for (let i = 0; i < 30 && !li; i++) { await sleep(1000); li = !!(await p.evaluate(() => localStorage.getItem('flutter.auth_token') || '')); }
  console.log('seller login:', li);
  await sleep(1500);
  await p.evaluate(() => { window.location.hash = '#/orders'; }); await sleep(5200);
  // switch to Selling tab
  console.log('tap Selling:', await tap(p, 'Selling', 4)); await sleep(1800);
  console.log('list shows ORD-088:', (await txt(p)).includes('ORD-2026-000088'));
  console.log('open detail:', await tap(p, 'ORD-2026-000088', 4)); await sleep(1600);
  console.log('tap Track delivery:', await tap(p, 'Track delivery', 5)); await sleep(2600);
  let T = await txt(p);
  console.log('tracking open:', T.includes('Delivery tracking'), '| handover copy:', T.includes('Delivery handover'));
  await L.screenshot(p, 'e2e/shots/AU-039/AU-039-r6seller-00-tracking.png');

  for (let i = 1; i <= 3; i++) {
    const code = String(600000 + i * 37);
    const dom = await typeIntoFirstInput(p, code);
    console.log(`[${i}] typed dom="${dom}"`);
    console.log(`[${i}] tap verify:`, await tap(p, 'Verify delivery', 2));
    await sleep(2200);
    T = await txt(p);
    const hits = {
      invalidBodyMsg: T.includes('INVALID_DELIVERY_CODE'),
      transportMsg: T.includes('cannot manage transport'),
      attemptsDebug: (T.match(/attemptsRemaining:? \d/g) || []),
      attemptWord: T.split('\n').filter(x => /attempt/i.test(x)),
      lockedErr: T.includes('Locked'),
      threeUsed: T.includes('Three attempts have been used'),
    };
    R.steps.push({ i, dom, hits });
    console.log(`[${i}] HITS:`, JSON.stringify(hits).slice(0, 320));
    const shot = `e2e/shots/AU-039/AU-039-r6seller-${i}.png`;
    await L.screenshot(p, shot); R.shots.push(shot);
    if (hits.threeUsed) break;
  }
  await ctx.close();

  // buyer regenerates (resets lock), then SELLER verifies the NEW code -> T19
  const rg = await L.api(fxC.buyer.token, 'POST', `/api/v1/orders/${fxC.orderId}/regenerate-delivery-code`);
  console.log('buyer regenerate:', rg.status, JSON.stringify(rg.json || {}).slice(0, 90));
  const NEWC = String((rg.json || {}).deliveryCode);
  const vd = await L.api(fxC.seller.token, 'POST', `/api/v1/orders/${fxC.orderId}/verify-delivery`, { code: NEWC });
  R.t19 = { status: vd.status, body: vd.json };
  console.log('T19 verify NEW code:', vd.status, JSON.stringify(vd.json || {}).slice(0, 170));
  const fin = await L.api(fxC.buyer.token, 'GET', `/api/v1/orders/${fxC.orderId}`);
  console.log('final:', fin.json.status, 'code=', fin.json.deliveryCode);

  fs.writeFileSync('/tmp/au039_sellerc_probe.json', JSON.stringify(R, null, 2));
  await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
