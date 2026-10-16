// AU-055 r4 — MOBILE (375x667) seller flow, coordinate-accurate tile taps.
// Seller = real sandbox fixture au054seller…; order ORD-2026-000019 currently
// READY_FOR_DISPATCH with transporter 6 assigned (state advanced by r3+API).
const fs = require('fs');
const L = require('./lib_verify');
const APP = 'http://localhost:9110';
const UNIT = 'AU-055';
const SHOT_DIR = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-055';
const OUT = { asserts: [], network: [] };
const S = JSON.parse(fs.readFileSync('/tmp/au054_fixtures.json', 'utf8')).seller;

async function dumpText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n'));
}
async function shot(p, name) { await L.screenshot(p, `${SHOT_DIR}/${UNIT}-mobile-${name}.png`); }
async function findNode(p, exact) {
  return p.evaluate((lbl) => {
    let r = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      if (r) return;
      if ((e.textContent || '').trim() === lbl) {
        const b = e.getBoundingClientRect();
        r = { y: b.y, h: innerHeight, x: b.x, w: b.width };
      }
    });
    return r;
  }, exact);
}
async function tapTile(p, label) {
  for (let i = 0; i < 16; i++) {
    const pos = await findNode(p, label);
    if (pos && pos.y > 40 && pos.y < pos.h - 60 && pos.w > 40) {
      await p.mouse.click(pos.x + Math.min(pos.w / 2, 130), pos.y + 12);
      return true;
    }
    await p.mouse.move(190, 330); await p.mouse.wheel(0, 170); await p.waitForTimeout(360);
  }
  // partial-label fallback
  for (let i = 0; i < 10; i++) {
    const pos = await p.evaluate((lbl) => {
      let r = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (r) return;
        if ((e.textContent || '').includes(lbl)) { const b = e.getBoundingClientRect(); r = { y: b.y, h: innerHeight, x: b.x, w: b.width }; }
      });
      return r;
    }, label);
    if (pos && pos.y > 40 && pos.y < pos.h - 60 && pos.w > 40) { await p.mouse.click(pos.x + Math.min(pos.w / 2, 130), pos.y + 14); return true; }
    await p.mouse.move(190, 330); await p.mouse.wheel(0, 170); await p.waitForTimeout(360);
  }
  return false;
}

(async () => {
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-055-r4-mobile.webm' });
  const page = await ctx.newPage();
  page.on('response', r => {
    if (r.url().includes('/api/') && (/orders/.test(r.url()) || /transporter/.test(r.url()))) {
      OUT.network.push({ m: r.request().method(), url: r.url().slice(0, 150), status: r.status() });
    }
  });

  await page.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(page, 'Buy now', 25000);
  await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 20000);
  const ei = page.locator('input[type="text"]').first(), pi = page.locator('input[type="password"]').first();
  await ei.click({ force: true }).catch(() => {}); await page.waitForTimeout(300); await page.keyboard.type(S.email);
  await pi.click({ force: true }).catch(() => {}); await page.waitForTimeout(300); await page.keyboard.type(S.pw);
  await L.clickBtn(page, 'Log in');
  let ok = false; for (let i = 0; i < 25 && !ok; i++) { ok = await L.isLoggedIn(page); if (!ok) await page.waitForTimeout(1000); }
  OUT.asserts.push({ a: 'seller-login', pass: ok }); console.log('login', ok);
  await page.waitForTimeout(1500);

  await L.clickBtn(page, 'Account') || await L.clickCard(page, 'Account');
  await page.waitForTimeout(1200);
  const dashTapped = await tapTile(page, 'Seller dashboard');
  await page.waitForTimeout(2200);
  let txt = await dumpText(page);
  OUT.asserts.push({ a: 'dashboard-renders', pass: txt.includes('Welcome back, seller'), tapped: dashTapped });
  const ordersStat = txt.match(/(\d+)\s*\n?\s*orders/);
  OUT.asserts.push({ a: 'stats-orders-count', pass: !!ordersStat, value: ordersStat && ordersStat[1] });
  await shot(page, '30-seller-dashboard');

  const soldTapped = await tapTile(page, 'Selling orders');
  await page.waitForTimeout(2400);
  txt = await dumpText(page);
  OUT.asserts.push({
    a: 'selling-orders-row', pass: txt.includes('ORD-2026-000019'),
    totalVisible: /36,?000/.test(txt), buyerVisible: txt.includes('Mobile Test'),
    statusLabel: txt.split('\n').filter(Boolean).slice(0, 8).join('|').slice(0, 160),
  });
  await shot(page, '31-selling-orders');

  if (txt.includes('ORD-2026-000019')) {
    const rowPos = await page.evaluate(() => {
      let r = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if ((e.textContent || '').includes('ORD-2026-000019')) {
          const b = e.getBoundingClientRect();
          if (!r || (b.width * b.height) < (r.area)) r = { x: b.x, y: b.y, w: b.width, h: b.height, area: b.width * b.height };
          else if (!r.area) r = { x: b.x, y: b.y, w: b.width, h: b.height, area: b.width * b.height };
        }
      });
      return r;
    });
    if (rowPos) {
      await page.mouse.click(rowPos.x + rowPos.w / 2, Math.max(30, Math.min(rowPos.y + 20, 640)));
      await page.waitForTimeout(2600);
      const dtxt = await dumpText(page);
      OUT.asserts.push({
        a: 'order-detail-seller-view',
        pass: dtxt.includes('ORD-2026-000019') && dtxt.includes('Items Ordered'),
        escrowBanner: /Payment secured|escrow|Held|held/i.test(dtxt),
        trackDelivery: dtxt.includes('Track delivery'),
        excerpt: dtxt.split('\n').filter(Boolean).slice(0, 22).join('|').slice(0, 340),
      });
      await shot(page, '32-order-detail-seller');
    }
  }

  // Requests tab via bottom nav — mobile management surface check
  await L.clickBtn(page, 'Requests') || await L.clickCard(page, 'Requests');
  await page.waitForTimeout(2000);
  txt = await dumpText(page);
  OUT.asserts.push({
    a: 'requests-screen-mobile', pass: /Post request|Goods|Services/.test(txt),
    realTitles: ['I am looking for a tailor', 'AU056 probe goods'].find(t => txt.includes(t)) || null,
  });
  await shot(page, '33-requests');

  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/raw-AU-055-r4.json', JSON.stringify(OUT, null, 2));
  console.log(JSON.stringify(OUT.asserts, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
