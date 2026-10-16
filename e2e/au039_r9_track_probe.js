// au039_r9_track_probe2.js — open Track delivery on fixture D and dump the
// FULL tracking screen semantics (top + after scroll) + screenshots.
const fs = require('fs');
process.chdir('/home/devsystemadmin/GloboExpats_Mobile/e2e');
const L = require('./lib_verify.js');
const APP = 'http://localhost:9130';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const fx = JSON.parse(fs.readFileSync('/tmp/au039_fixtures_r9d.json', 'utf8'));
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: '/tmp/au039_d2_probe.webm' });
  const p = await ctx.newPage();
  const out = {};
  const txt = () => p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
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
  // open detail
  let row = null;
  for (let i = 0; i < 5 && !row; i++) {
    row = await findSmallest(p, fx.orderNumber);
    if (!row) { await p.mouse.move(190, 350); await p.mouse.wheel(0, 300); await sleep(400); }
  }
  console.log('row:', row);
  if (row) { await p.mouse.click(row.x, Math.max(20, Math.min(row.y, 640))); }
  await sleep(2200);
  // Track delivery — retry with scrolling
  let trkBtn = null;
  for (let i = 0; i < 6 && !trkBtn; i++) {
    trkBtn = await findSmallest(p, 'Track delivery');
    if (!trkBtn) { await p.mouse.move(190, 350); await p.mouse.wheel(0, 300); await sleep(400); }
  }
  console.log('track:', trkBtn);
  if (!trkBtn) { console.log('NO TRACK BUTTON FOUND'); await browser.close(); return; }
  await p.mouse.click(trkBtn.x, Math.max(20, Math.min(trkBtn.y, 640)));
  await sleep(3500);
  let t = await txt();
  out.trackingOpen = t.includes('Delivery tracking');
  out.appBarTitle = t.split('\n').slice(0, 6).join('|');
  out.hasBuyerCardTitle = t.includes('Your delivery code');
  out.hasCode = t.includes(fx.deliveryCode);
  out.hasSelfConfirm = t.toLowerCase().includes('i received the items');
  out.hasRegen = t.toLowerCase().includes('generate a new code');
  out.hasHandoverCopy = t.includes('Enter the 6-digit code');
  out.snippet = t.split('\n').filter(x => /deliver|code|received|generat|transport/i.test(x)).slice(0, 14);
  console.log(JSON.stringify(out, null, 1).slice(0, 1800));
  await p.screenshot({ path: '/tmp/au039_d2_1_tracking.png' });
  await p.mouse.move(190, 350);
  for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 260); await sleep(150); }
  await sleep(800);
  t = await txt();
  out.afterScroll_hasBuyerCard = t.includes('Your delivery code');
  out.afterScroll_hasCode = t.includes(fx.deliveryCode);
  out.afterScroll_hasSelfConfirm = t.toLowerCase().includes('i received the items');
  console.log('afterScroll:', JSON.stringify({ card: out.afterScroll_hasBuyerCard, code: out.afterScroll_hasCode, selfConfirm: out.afterScroll_hasSelfConfirm }));
  const nodes = await p.evaluate(() => {
    const arr = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const r = e.getBoundingClientRect();
      const tt = (e.textContent || '').trim().slice(0, 70);
      if (r.height > 0 && r.bottom > 0 && r.top < innerHeight && tt) arr.push({ y: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width), t: tt });
    });
    return arr.sort((a, b) => a.y - b.y);
  });
  out.nodesAfterScroll = nodes;
  fs.writeFileSync('/tmp/au039_d2_probe.json', JSON.stringify(out, null, 2));
  await p.screenshot({ path: '/tmp/au039_d2_2_tracking_bottom.png' });
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
