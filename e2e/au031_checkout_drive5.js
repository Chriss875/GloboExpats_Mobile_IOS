// AU-031 checkout drive r5 — proven checkbox technique from au027 (left-edge click on full-width row).
const { chromium } = require('playwright');
const L = require('./lib_verify.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
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
  // au027-proven: full-width CheckboxListTile rows toggle via a click near the LEFT edge
  const toggleRowCheckbox = async (which) => {
    for (let s = 0; s < 12; s++) {
      const target = await p.evaluate((wch) => {
        const nodes = [...document.querySelectorAll('flt-semantics')].filter(e => e.getAttribute('role') === 'checkbox');
        const rows = nodes.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height, vis: r.y > 40 && (r.y + r.height) < innerHeight - 10 && r.width > 5 }; }).filter(bb => bb.vis);
        if (!rows.length) return null;
        const pick = wch === 'first' ? rows[0] : rows[rows.length - 1];
        return { x: pick.x + 18, y: Math.min(Math.max(pick.y + pick.h / 2, 25), 640) };
      }, which);
      if (target) { await p.mouse.click(target.x, target.y); await sleep(800);
        const checked = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].filter(e => e.getAttribute('role') === 'checkbox').some(e => e.getAttribute('aria-checked') === 'true'));
        return { clicked: true, checked };
      }
      await p.mouse.move(187, 400); await p.mouse.wheel(0, 300); await sleep(450);
    }
    return { clicked: false, checked: null };
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
  console.log('window:', JSON.stringify(await toggleRowCheckbox('first')));
  console.log('agree:', JSON.stringify(await toggleRowCheckbox('last')));
  console.log('confirm:', await tapBtn('Confirm'));
  let atPayment = false;
  for (let i = 0; i < 20; i++) {
    const txt = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.getAttribute('aria-label') || '') + (e.textContent || '')).join('\n'));
    if (txt.includes('Step 3 of 4')) { atPayment = true; break; }
    await p.waitForTimeout(1200);
  }
  console.log('AT PAYMENT:', atPayment);
  if (atPayment) {
    await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-031/flutter-375-checkout-payment-step.png' });
    const readSec = () => p.evaluate(() => {
      const all = [...document.querySelectorAll('flt-semantics')].map(e => (e.getAttribute('aria-label') || '') + (e.textContent || '')).join('\n');
      const mm = all.match(/Complete payment within (\d{2}):(\d{2}):(\d{2})/);
      return mm ? (+mm[1]) * 3600 + (+mm[2]) * 60 + (+mm[3]) : null;
    });
    const rawLabel = await p.evaluate(() => ([...document.querySelectorAll('flt-semantics')].map(e => (e.getAttribute('aria-label') || '') + (e.textContent || '')).join('\n').match(/Complete payment within \d{2}:\d{2}:\d{2}/g) || []).join(','));
    console.log('CD label:', rawLabel);
    const s1 = await readSec();
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
