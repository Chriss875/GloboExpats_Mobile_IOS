// AU-031 checkout payment-step countdown drive (fresh proforma via real checkout).
const { chromium } = require('playwright');
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, recordVideo: { dir: '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos', size: { width: 375, height: 667 } } });
  const p = await ctx.newPage();
  const token = await L.apiLogin();
  await p.addInitScript((t) => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, token);
  const tapBtn = async (label) => {
    for (let a = 0; a < 4; a++) {
      const c = await p.evaluate((l) => {
        const e = [...document.querySelectorAll('flt-semantics[role=button]')].find(x => (x.getAttribute('aria-label') || x.textContent || '').includes(l));
        if (!e) return null; const r = e.getBoundingClientRect();
        if (r.y < 0 || r.y > 645) return 'off';
        return { x: Math.round(r.x + r.width / 2), y: Math.min(Math.round(r.y + r.height / 2), 645) };
      }, label);
      if (c === 'off') { await p.mouse.wheel(0, 300); await p.waitForTimeout(600); continue; }
      if (c) { await p.mouse.click(c.x, c.y); await p.waitForTimeout(2200); return true; }
      await p.mouse.move(187, 400); await p.mouse.wheel(0, 350); await p.waitForTimeout(700);
    }
    return false;
  };
  await p.goto('http://localhost:9113/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 20; i++) {
    const t = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('|'));
    if (t.includes('Newest')) break; await p.waitForTimeout(1000);
  }
  let card = null;
  for (let i = 0; i < 5 && !card; i++) {
    card = await p.evaluate(() => {
      const es = [...document.querySelectorAll('flt-semantics[flt-tappable]')];
      for (const e of es) { const t = (e.getAttribute('aria-label') || '') + (e.textContent || '');
        if (t.includes('Kettle')) { const r = e.getBoundingClientRect(); if (r.y > 0 && r.y < 600 && r.width > 80) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; } }
      return null;
    });
    if (!card) { await p.mouse.move(187, 400); await p.mouse.wheel(0, 500); await p.waitForTimeout(800); }
  }
  await p.mouse.click(card.x, card.y); await p.waitForTimeout(4000);
  console.log('add:', await tapBtn('Add to cart'));
  await p.goto('http://localhost:9113/cart', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(2500);
  console.log('checkout:', await tapBtn('Go to checkout'));
  console.log('review:', await tapBtn('Continue to review'));
  // scroll inside review list until the I-agree row is visible, then click its center
  let clicked = false;
  for (let s = 0; s < 10 && !clicked; s++) {
    const v = await p.evaluate(() => {
      const es = [...document.querySelectorAll('flt-semantics')];
      for (const e of es) {
        const t = (e.textContent || '') + (e.getAttribute('aria-label') || '');
        if (t.includes('I agree')) {
          const r = e.getBoundingClientRect();
          if (r.y > 60 && r.bottom < 640) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
          return null;
        }
      }
      return null;
    });
    if (v) { await p.mouse.click(v.x, v.y); await p.waitForTimeout(1000); clicked = true; break; }
    await p.mouse.move(187, 400); await p.mouse.wheel(0, 280); await p.waitForTimeout(550);
  }
  console.log('agree clicked:', clicked);
  const cbState = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .filter(e => e.getAttribute('role') === 'checkbox')
    .map(e => ({ checked: e.getAttribute('aria-checked'), t: (e.textContent || '').slice(0, 30) })));
  console.log('checkbox nodes:', JSON.stringify(cbState));
  console.log('confirm:', await tapBtn('Confirm'));
  await p.waitForTimeout(6500);
  const txt = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.getAttribute('aria-label') || '') + (e.textContent || '')).join('\n'));
  const cd = txt.match(/Complete payment within (\d{2}:\d{2}:\d{2})/g);
  console.log('PAYMENT CD:', JSON.stringify(cd));
  console.log('payment step reached:', txt.includes('Step 3 of 4'), '| error shown:', (txt.match(/Please agree[^\\]*/) || [])[0]);
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-031/flutter-375-checkout-payment-step.png' });
  if (cd) {
    const g = () => p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.getAttribute('aria-label') || '') + (e.textContent || '')).join('\n').match(/Complete payment within (\d{2}:\d{2}:\d{2})/));
    const a = await g(); await p.waitForTimeout(7000); const c2 = await g();
    console.log('tick:', JSON.stringify(a), '->', JSON.stringify(c2));
    const r = await fetch('http://localhost:8083/api/v1/payments/my', { headers: { Authorization: 'Bearer ' + token } });
    const rows = await r.json();
    const newest = rows.filter(x => x.status === 'PENDING_PAYMENT').sort((a1, a2) => new Date(b2 = a2.createdAt) - new Date(a1.createdAt));
    console.log('api newest pending:', newest[0] && newest[0].proformaNumber, 'rem_s', newest[0] ? Math.round((new Date(newest[0].expiresAt).getTime() - Date.now()) / 1000) : null);
  }
  await L.closeVideo(ctx, '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-031-checkout.webm').catch(() => {});
  await b.close();
})().catch(e => console.error(e.message));
