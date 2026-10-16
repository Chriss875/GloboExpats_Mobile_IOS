// AU-031 checkout drive r4 — click checkbox-role nodes directly (Today window + I agree), then Confirm.
const { chromium } = require('playwright');
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, recordVideo: { dir: '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos', size: { width: 375, height: 667 } } });
  const p = await ctx.newPage();
  const token = await L.apiLogin();
  await p.addInitScript((t) => {
    localStorage.setItem('flutter.auth_token', JSON.stringify(t));
    localStorage.setItem('flutter.auth_email', JSON.stringify('mobile.test.20260820@gmail.com'));
  }, token);
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
  // scroll a role=checkbox node into view and click it
  const clickCheckbox = async (needle) => {
    for (let s = 0; s < 12; s++) {
      const v = await p.evaluate((nd) => {
        const es = [...document.querySelectorAll('flt-semantics[role=checkbox]')];
        for (const e of es) {
          if ((e.textContent || '').includes(nd)) {
            const r = e.getBoundingClientRect();
            if (r.y > 60 && r.bottom < 640) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), checked: e.getAttribute('aria-checked') };
            return null;
          }
        }
        return null;
      }, needle);
      if (v) { await p.mouse.click(v.x, v.y); await p.waitForTimeout(900); return v.checked; }
      await p.mouse.move(187, 400); await p.mouse.wheel(0, 300); await p.waitForTimeout(450);
    }
    return 'notfound';
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
  await p.waitForTimeout(3000);
  console.log('checkout:', await tapBtn('Go to checkout'));
  console.log('review:', await tapBtn('Continue to review'));
  await p.waitForTimeout(2000);
  console.log('window before:', await clickCheckbox('Today Afternoon'));
  console.log('agree before:', await clickCheckbox('I agree'));
  console.log('confirm:', await tapBtn('Confirm'));
  let atPayment = false, cdTxt = null;
  for (let i = 0; i < 20; i++) {
    const txt = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.getAttribute('aria-label') || '') + (e.textContent || '')).join('\n'));
    if (txt.includes('Step 3 of 4')) { atPayment = true; cdTxt = (txt.match(/Complete payment within (\d{2}:\d{2}:\d{2})/g) || []).join(','); break; }
    await p.waitForTimeout(1200);
  }
  console.log('AT PAYMENT:', atPayment, '| CD:', cdTxt);
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-031/flutter-375-checkout-payment-step.png' });
  if (atPayment) {
    const readSec = async () => p.evaluate(() => {
      const all = [...document.querySelectorAll('flt-semantics')].map(e => (e.getAttribute('aria-label') || '') + (e.textContent || '')).join('\n');
      const mm = all.match(/Complete payment within (\d{2}):(\d{2}):(\d{2})/);
      return mm ? (+mm[1]) * 3600 + (+mm[2]) * 60 + (+mm[3]) : null;
    });
    const s1 = await readSec();
    await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-031/flutter-375-checkout-payment-step-t0.png' });
    await p.waitForTimeout(7000);
    const s2 = await readSec();
    await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-031/flutter-375-checkout-payment-step-t1.png' });
    console.log('tick seconds:', s1, '->', s2, '(delta', s1 - s2, ')');
    const r = await fetch('http://localhost:8083/api/v1/payments/my', { headers: { Authorization: 'Bearer ' + token } });
    const rows = (await r.json()).filter(x => x.status === 'PENDING_PAYMENT').sort((a1, b1) => new Date(b1.createdAt) - new Date(a1.createdAt));
    console.log('api newest pending:', rows[0] && rows[0].proformaNumber, 'rem_s', rows[0] ? Math.round((new Date(rows[0].expiresAt).getTime() - Date.now()) / 1000) : null);
  }
  await L.closeVideo(ctx, '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-031-checkout.webm').catch(() => {});
  await b.close();
})().catch(e => console.error(e.message));
