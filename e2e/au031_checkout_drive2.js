// AU-031 checkout drive r2 — agree + delivery window then confirm.
const { chromium } = require('playwright');
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const token = await L.apiLogin();
  await p.addInitScript((t) => { localStorage.setItem('flutter.auth_token', JSON.stringify(t)); localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com')); }, token);
  const tapBtn = async (l) => {
    for (let a = 0; a < 4; a++) {
      const c = await p.evaluate((x) => {
        const e = [...document.querySelectorAll('flt-semantics[role=button]')].find(y => (y.getAttribute('aria-label') || y.textContent || '').includes(x));
        if (!e) return null; const r = e.getBoundingClientRect();
        if (r.y < 0 || r.y > 645) return 'off';
        return { x: Math.round(r.x + r.width / 2), y: Math.min(Math.round(r.y + r.height / 2), 645) };
      }, l);
      if (c === 'off') { await p.mouse.wheel(0, 300); await p.waitForTimeout(600); continue; }
      if (c) { await p.mouse.click(c.x, c.y); await p.waitForTimeout(2200); return true; }
      await p.mouse.move(187, 400); await p.mouse.wheel(0, 350); await p.waitForTimeout(700);
    }
    return false;
  };
  await p.goto('http://localhost:9113/cart', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(3000);
  console.log('cart item present:', await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].some(e => /item/.test(e.textContent || '')) && ![...document.querySelectorAll('flt-semantics')].some(e => (e.textContent || '').includes('empty'))));
  console.log('checkout:', await tapBtn('Go to checkout'));
  console.log('review:', await tapBtn('Continue to review'));
  for (let s = 0; s < 10; s++) {
    const v = await p.evaluate(() => {
      const es = [...document.querySelectorAll('flt-semantics')];
      for (const e of es) {
        const t = (e.textContent || '') + (e.getAttribute('aria-label') || '');
        if (t.includes('I agree')) { const r = e.getBoundingClientRect(); if (r.y > 60 && r.bottom < 640) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; return null; }
      }
      return null;
    });
    if (v) { await p.mouse.click(v.x, v.y); await p.waitForTimeout(800); break; }
    await p.mouse.move(187, 400); await p.mouse.wheel(0, 280); await p.waitForTimeout(500);
  }
  const win = await p.evaluate(() => {
    const es = [...document.querySelectorAll('flt-semantics')];
    for (const e of es) {
      const t = (e.textContent || '') + (e.getAttribute('aria-label') || '');
      if (/Today|Tomorrow/.test(t) && t.length < 70) {
        const r = e.getBoundingClientRect();
        if (r.y > 60 && r.bottom < 640 && r.width < 320) return { x: Math.round(r.x + Math.min(40, r.width / 2)), y: Math.round(r.y + r.height / 2), t: t.slice(0, 44) };
      }
    }
    return null;
  });
  console.log('window chip:', JSON.stringify(win));
  if (win) { await p.mouse.click(win.x, win.y); await p.waitForTimeout(1200); }
  console.log('confirm:', await tapBtn('Confirm'));
  await p.waitForTimeout(7000);
  const txt = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.getAttribute('aria-label') || '') + (e.textContent || '')).join('\n'));
  console.log('step:', txt.includes('Step 3 of 4') ? 'PAYMENT' : (txt.includes('Step 2 of 4') ? 'REVIEW' : '?'), '| CD:', JSON.stringify(txt.match(/Complete payment within (\d{2}:\d{2}:\d{2})/g)));
  console.log('err:', JSON.stringify(txt.match(/Please agree[^\n]*|Select at least one[^\n]*|Calculating[^\n]*|invoice[^\n]*/i)));
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-031/flutter-375-checkout-payment-step.png' });
  if (txt.includes('Step 3 of 4')) {
    const g = () => p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.getAttribute('aria-label') || '') + (e.textContent || '')).join('\n').match(/Complete payment within (\d{2}:\d{2}:\d{2})/));
    const a = await g(); await p.waitForTimeout(7000); const c2 = await g();
    console.log('tick:', JSON.stringify(a), '->', JSON.stringify(c2));
    const r = await fetch('http://localhost:8083/api/v1/payments/my', { headers: { Authorization: 'Bearer ' + token } });
    const rows = (await r.json()).filter(x => x.status === 'PENDING_PAYMENT').sort((a1, b1) => new Date(b1.createdAt) - new Date(a1.createdAt));
    console.log('api newest pending:', rows[0].proformaNumber, 'rem_s', Math.round((new Date(rows[0].expiresAt).getTime() - Date.now()) / 1000));
  }
  await b.close();
})().catch(e => console.error(e.message));
