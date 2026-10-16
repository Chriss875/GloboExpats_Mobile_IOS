// au039_r9_feedback_probe.js — targeted probe for the r9 feedback findings:
//  1) does the buyer tracking screen paint the code card AT ALL (scroll to bottom)?
//  2) after a regenerate / confirm action, does any SnackBar/toast appear?
// Uses fixture D (ORD-2026-000147, buyer view, IN_TRANSIT, code known).
const fs = require('fs'); const path = require('path');
process.chdir('/home/devsystemadmin/GloboExpats_Mobile/e2e');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9130';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const fx = JSON.parse(fs.readFileSync('/tmp/au039_fixtures_r9d.json', 'utf8'));
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: '/tmp/au039_d_probe.webm' });
  const p = await ctx.newPage();
  const out = {};
  const txt = () => p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  // login
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000);
  await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
  const ei = p.locator('input[type="text"]').first(); await ei.click({ force: true }); await sleep(300); await p.keyboard.type(fx.buyer.email, { delay: 12 });
  const pi = p.locator('input[type="password"]').first(); await pi.click({ force: true }); await sleep(300); await p.keyboard.type(fx.buyer.pw, { delay: 12 });
  await L.clickBtn(p, 'Log in');
  let li = false; for (let i = 0; i < 30 && !li; i++) { await sleep(1000); li = await p.evaluate(() => !!localStorage.getItem('flutter.auth_token')); }
  console.log('login:', li);
  await sleep(1500);
  await p.evaluate(() => { window.location.hash = '#/orders'; }); await sleep(5000);
  await p.mouse.move(190, 350); await p.mouse.wheel(0, 260); await sleep(400);
  await p.evaluate(o => { let hit = null; document.querySelectorAll('flt-semantics').forEach(e => { if (hit) return; if ((e.textContent || '').includes(o) && e.getAttribute('flt-tappable') !== null) { const r = e.getBoundingClientRect(); if (r.width > 40 && r.height > 40 && r.bottom > 0 && r.top < innerHeight) hit = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), area: r.width * r.height }; } }); document.querySelectorAll('flt-semantics').forEach(e => { if (hit) return; if ((e.textContent || '').includes(o)) { const r = e.getBoundingClientRect(); if (r.width > 40 && r.height > 40 && r.bottom > 0 && r.top < innerHeight && (!hit || r.width * r.height < hit.area)) hit = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), area: r.width * r.height }; } }); if (hit) require; }, 'x');
  // tap order row via smallest-area match
  const rowHandle = await findSmallest(p, fx.orderNumber);
  console.log('row node:', rowHandle);
  if (rowHandle) { await p.mouse.click(rowHandle.x, Math.min(rowHandle.y, 640)); }
  await sleep(2000);
  out.detailHasCode = (await txt()).includes(fx.deliveryCode);
  console.log('detail shows code:', out.detailHasCode, fx.deliveryCode);
  // open Track delivery
  const trk = await findSmallest(p, 'Track delivery');
  console.log('track btn:', trk);
  if (trk) await p.mouse.click(trk.x, Math.min(trk.y, 640));
  await sleep(3000);
  let t = await txt();
  out.trackingOpen = t.includes('Delivery tracking');
  out.cardVisibleTop = t.includes('Your delivery code');
  console.log('tracking open:', out.trackingOpen, '| card visible at top:', out.cardVisibleTop);
  await p.screenshot({ path: '/tmp/au039_d_1_tracking_top.png' });
  // scroll to the BOTTOM of the list and re-dump
  await p.mouse.move(190, 350);
  for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 260); await sleep(160); }
  await sleep(900);
  t = await txt();
  out.cardVisibleAfterScroll = t.includes('Your delivery code');
  out.codeVisibleAfterScroll = t.includes(fx.deliveryCode);
  out.selfConfirmVisible = t.toLowerCase().includes('i received the items');
  out.regenerateVisible = t.toLowerCase().includes('generate a new code');
  out.snackBarVisibleInTree = /New code generated|Delivery confirmed|attempts remaining/.test(t);
  console.log('after scroll -> card:', out.cardVisibleAfterScroll, '| code:', out.codeVisibleAfterScroll, '| selfConfirm:', out.selfConfirmVisible, '| regen:', out.regenerateVisible);
  await p.screenshot({ path: '/tmp/au039_d_2_tracking_bottom.png' });
  // dump full semantics with rects for the card region
  const nodes = await p.evaluate(() => {
    const arr = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const r = e.getBoundingClientRect();
      const t = (e.textContent || '').trim().slice(0, 60);
      if (r.height > 0 && r.top < innerHeight && r.bottom > 0 && t) arr.push({ y: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width), t });
    });
    return arr.sort((a, b) => a.y - b.y).slice(-30);
  });
  out.nodesBottom = nodes;
  fs.writeFileSync('/tmp/au039_d_probe.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(nodes.slice(0, 20), null, 1));
  await ctx.close(); await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });

async function findSmallest(p, label) {
  return p.evaluate((lbl) => { let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => { const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      if (e.getAttribute('role') !== 'button' && e.getAttribute('flt-tappable') === null) return;
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
      if (!best || r.width * r.height < best.area) best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }); return best; }, label);
}
