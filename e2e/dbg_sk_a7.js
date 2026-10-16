// dbg_sk_a7.js — standalone A7 re-probe: LOGGED-IN choiceless-product add on 646.
// The main battery's A7 followed A6 (token wipe), so its add was guest-gated.
const L = require('./lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9108';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
(async () => {
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(`${APP}/`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  let ready = false; for (let i = 0; i < 30 && !ready; i++) ready = await L.waitText(p, 'Buy now', 1500);
  // login
  if (!(await L.isLoggedIn(p))) {
    if (await L.clickBtn(p, 'Login')) {
      await p.waitForTimeout(2000);
      await p.locator('input[type="text"]').first().click({ force: true }); await p.waitForTimeout(250);
      await p.keyboard.type(L.BUYER.email, { delay: 10 });
      await p.locator('input[type="password"]').first().click({ force: true }); await p.waitForTimeout(250);
      await p.keyboard.type(L.BUYER.pw, { delay: 10 });
      await L.clickBtn(p, 'Log in');
      let okl = false;
      for (let i = 0; i < 25 && !okl; i++) { okl = await L.isLoggedIn(p); if (!okl) await p.waitForTimeout(700); }
      console.log('login:', okl);
    }
  }
  const lines0 = await p.evaluate(() => {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/expatCartItems/.test(k)) { try { const v = JSON.parse(JSON.parse(localStorage.getItem(k))); if (Array.isArray(v)) out.push(...v); } catch (e) {} } }
    return out;
  });
  console.log('pre-existing cart lines:', lines0.length);
  // clear via UI
  const cb = await p.evaluate(() => {
    const b = [...document.querySelectorAll('flt-semantics[role="button"]')]
      .map(e => ({ t: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
      .find(b => /^Cart/i.test(b.t));
    return b || null;
  });
  if (cb && lines0.length) {
    await p.mouse.click(cb.x, cb.y); await p.waitForTimeout(2600);
    if (/Clear all items/.test(await L.allText(p))) {
      await L.clickBtn(p, 'Clear all items'); await p.waitForTimeout(1200);
      for (const lbl of ['Clear', 'Yes', 'Confirm']) { if (await L.clickBtn(p, lbl)) break; }
      await p.waitForTimeout(800);
    }
  }
  // home -> find 646 card
  await p.goto(`${APP}/`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  ready = false; for (let i = 0; i < 30 && !ready; i++) ready = await L.waitText(p, 'Buy now', 1500);
  let node = null;
  for (let i = 0; i < 45 && !node; i++) {
    node = await p.evaluate(() => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (e.getAttribute('flt-tappable') === null) return;
        const txt = (e.textContent || '').trim().toUpperCase();
        if (!txt.includes('AU026 WINDOW PROBE')) return;
        const r = e.getBoundingClientRect();
        if (r.width < 60 || r.height < 60 || r.top < 0 || r.bottom > innerHeight) return;
        if (best === null || r.width * r.height < best.area)
          best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), area: r.width * r.height };
      });
      return best;
    });
    if (!node) { await p.mouse.move(187, 368); await p.mouse.wheel(0, 430); await p.waitForTimeout(400); }
  }
  console.log('card found:', !!node);
  if (!node) process.exit(2);
  await p.mouse.click(node.x, node.y);
  let reached = false;
  for (let i = 0; i < 22 && !reached; i++) {
    const t = await L.allText(p);
    if (t.includes('Add to cart')) reached = true; else await p.waitForTimeout(650);
  }
  console.log('detail reached:', reached);
  const txt = await L.allText(p);
  console.log('has Choose options (should be false):', txt.includes('Choose options'));
  await p.screenshot({ path: `${ROOT}/e2e/shots/AU-015/sk-375-a7-nochoice-relogin.png` });
  const ab = await p.evaluate(() => {
    const b = [...document.querySelectorAll('flt-semantics[role="button"]')]
      .map(e => ({ t: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
      .find(b => b.t === 'Add to cart');
    return b || null;
  });
  if (!ab) { console.log('no Add button'); process.exit(2); }
  await p.mouse.click(ab.x, ab.y);
  await p.waitForTimeout(1300);
  const lines = await p.evaluate(() => {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/expatCartItems/.test(k)) { try { const v = JSON.parse(JSON.parse(localStorage.getItem(k))); if (Array.isArray(v)) out.push(...v); } catch (e) {} } }
    return out.filter(l => String(l.productId) === '646');
  });
  console.log('RESULT lines after logged-in add on choiceless 646:', lines.length, JSON.stringify(lines.map(l => ({ price: l.price, qty: l.quantity }))));
  await p.screenshot({ path: `${ROOT}/e2e/shots/AU-015/sk-375-a7-after-add.png` });
  // cleanup
  await p.goto(`${APP}/`, { waitUntil: 'load', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(2000);
  const cb2 = await p.evaluate(() => {
    const b = [...document.querySelectorAll('flt-semantics[role="button"]')]
      .map(e => ({ t: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
      .find(b => /^Cart/i.test(b.t));
    return b || null;
  });
  if (cb2) { await p.mouse.click(cb2.x, cb2.y); await p.waitForTimeout(2500);
    if (/Clear all items/.test(await L.allText(p))) { await L.clickBtn(p, 'Clear all items'); await p.waitForTimeout(1100); for (const lbl of ['Clear', 'Yes', 'Confirm']) { if (await L.clickBtn(p, lbl)) break; } } }
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(3); });
