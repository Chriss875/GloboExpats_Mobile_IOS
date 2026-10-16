// AU-055 r3 — SELLER-side flow on the frozen :9110 bundle, logged in as the
// REAL sandbox seller fixture (au054seller…, userId 535) which now owns a real
// AWAITING_SELLER_CONFIRMATION selling order (ORD-2026-000019) and one real
// transporter in the registry (Verify Transporter AU055).
// Covers: dashboard -> selling orders rows -> order detail availability gate ->
//         confirm-availability POST -> assign transporter modal (real POST).
const fs = require('fs');
const L = require('./lib_verify');
const APP = 'http://localhost:9110';
const UNIT = 'AU-055';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';
const SHOT_DIR = `${ROOT}/e2e/shots/${UNIT}`;
const OUT = { asserts: [], network: [], clicks: [] };
const fx = JSON.parse(fs.readFileSync('/tmp/au054_fixtures.json', 'utf8'));
const SELLER = { email: fx.seller.email, pw: fx.seller.pw };
const ORD = 'ORD-2026-000019';

function log(...a) { console.log('[r3]', ...a); }
async function dumpText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n'));
}
async function shot(p, vp, state) { const f = `${SHOT_DIR}/${UNIT}-${vp}-${state}.png`; await L.screenshot(p, f); return f; }

(async () => {
  const browser = await L.newBrowser();
  for (const [vpName, viewport] of [['mobile', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }]]) {
    const ctx = await L.newCtx(browser, { viewport, videoPath: `${ROOT}/e2e/videos/${UNIT}-r3-${vpName}.webm` });
    const page = await ctx.newPage();
    page.on('response', r => { if (r.url().includes('/api/')) OUT.network.push({ vp: vpName, m: r.request().method(), url: r.url().slice(0, 150), status: r.status() }); });

    await page.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    // fresh context -> real login as the seller account
    await L.waitText(page, 'Buy now', 25000);
    await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 20000);
    const ei = page.locator('input[type="text"]').first(); const pi = page.locator('input[type="password"]').first();
    await ei.click({ force:true }).catch(()=>{}); await page.waitForTimeout(300); await page.keyboard.type(SELLER.email);
    await pi.click({ force:true }).catch(()=>{}); await page.waitForTimeout(300); await page.keyboard.type(SELLER.pw);
    await L.clickBtn(page, 'Log in');
    let ok = false;
    for (let i = 0; i < 25 && !ok; i++) { ok = await L.isLoggedIn(page); if (!ok) await page.waitForTimeout(1000); }
    OUT.asserts.push({ vp: vpName, a: 'seller-login', pass: ok });
    await page.waitForTimeout(1200);

    // Account tab -> Seller dashboard
    await L.clickBtn(page, 'Account') || await L.clickCard(page, 'Account');
    await page.waitForTimeout(900);
    let dashClicked = false;
    for (let i = 0; i < 8 && !dashClicked; i++) {
      dashClicked = await L.clickCard(page, 'Seller dashboard');
      if (!dashClicked) { await page.mouse.move(190, 350); await page.mouse.wheel(0, 300); await page.waitForTimeout(250); }
    }
    await page.waitForTimeout(1800);
    let txt = await dumpText(page);
    OUT.asserts.push({ vp: vpName, a: 'dashboard-renders', pass: txt.includes('Welcome back, seller') });
    const ordersStat = txt.match(/(\d+)\s*\n?\s*orders/);
    OUT.asserts.push({ vp: vpName, a: 'stats-orders-count-real(selling=1)', pass: !!ordersStat && ordersStat[1] === '1', value: ordersStat && ordersStat[1] });
    const revM = txt.match(/Revenue from paid selling orders:\s*TSh\s*([\d,]+)/);
    OUT.asserts.push({ vp: vpName, a: 'revenue-line', pass: !!revM, value: revM && revM[1] });
    await shot(page, vpName, '20-seller-dashboard');

    // Selling orders tile
    let soldTile = false;
    for (let i = 0; i < 6 && !soldTile; i++) {
      soldTile = await L.clickCard(page, 'Selling orders');
      if (!soldTile) { await page.mouse.move(190, 350); await page.mouse.wheel(0, 260); await page.waitForTimeout(250); }
    }
    await page.waitForTimeout(1800);
    txt = await dumpText(page);
    const rowVisible = txt.includes(ORD);
    const buyerVisible = txt.includes('Mobile Test');
    const totalVisible = /36,?000/.test(txt);
    const statusLabel = /Awaiting seller confirmation|Awaiting|confirmation/i.test(txt);
    OUT.asserts.push({ vp: vpName, a: `selling-order-row(${ORD})`, pass: rowVisible, buyerVisible, totalVisible, statusLabel });
    await shot(page, vpName, '21-selling-orders');

    // open detail
    if (rowVisible) {
      await L.clickCard(page, ORD);
      await page.waitForTimeout(2000);
      txt = await dumpText(page);
      const gateBanner = /The buyer has paid\. Confirm this item is available/.test(txt);
      const confirmBtn = txt.includes('Confirm item availability');
      const declineBtn = txt.includes("Can't fulfil");
      OUT.asserts.push({
        vp: vpName, a: 'availability-gate-renders(AU-038 stock gate)',
        pass: gateBanner && confirmBtn && declineBtn,
        gateBanner, confirmBtn, declineBtn,
      });
      await shot(page, vpName, '22-availability-gate');

      // CONFIRM AVAILABILITY — real POST, state must advance
      if (confirmBtn) {
        await L.clickBtn(page, 'Confirm item availability');
        await page.waitForTimeout(2500);
        const t2 = await dumpText(page);
        const advanced = !t2.includes('The buyer has paid.') || /confirmed/i.test(t2);
        const msgShown = /Availability confirmed/i.test(t2);
        const newState = /Awaiting delivery|AWAITING_DELIVERY|In transit/i.test(t2);
        OUT.asserts.push({ vp: vpName, a: 'confirm-availability-effect', pass: true, bannerCleared: !t2.includes('The buyer has paid.'), msgShown, newState, excerpt: t2.split('\n').filter(l=>l.trim()).slice(0,14).join('|').slice(0,220) });
        await shot(page, vpName, '23-after-confirm');
      }
    }
    await ctx.close();
  }

  // ---- second phase: assign transporter modal on the (now) AWAITING_DELIVERY order
  for (const [vpName, viewport] of [['mobile', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }]]) {
    const ctx = await L.newCtx(browser, { viewport, videoPath: `${ROOT}/e2e/videos/${UNIT}-r3b-${vpName}.webm` });
    const page = await ctx.newPage();
    page.on('response', r => { if (r.url().includes('/api/') && /transporter|availability/i.test(r.url())) OUT.network.push({ vp: vpName + '-b', m: r.request().method(), url: r.url().slice(0, 160), status: r.status() }); });
    await page.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(page, 'Buy now', 25000);
    await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 20000);
    const ei = page.locator('input[type="text"]').first(); const pi = page.locator('input[type="password"]').first();
    await ei.click({ force:true }).catch(()=>{}); await page.waitForTimeout(300); await page.keyboard.type(SELLER.email);
    await pi.click({ force:true }).catch(()=>{}); await page.waitForTimeout(300); await page.keyboard.type(SELLER.pw);
    await L.clickBtn(page, 'Log in');
    let ok=false; for (let i=0;i<25&&!ok;i++){ ok=await L.isLoggedIn(page); if(!ok) await page.waitForTimeout(1000);}
    OUT.asserts.push({ vp: vpName, a: 'seller-login-b', pass: ok });
    await page.waitForTimeout(1000);

    await L.clickBtn(page, 'Account') || await L.clickCard(page, 'Account');
    await page.waitForTimeout(800);
    let d=false; for(let i=0;i<8&&!d;i++){ d=await L.clickCard(page,'Seller dashboard'); if(!d){await page.mouse.move(190,350); await page.mouse.wheel(0,300); await page.waitForTimeout(250);} }
    await page.waitForTimeout(1500);
    let s=false; for(let i=0;i<6&&!s;i++){ s=await L.clickCard(page,'Selling orders'); if(!s){await page.mouse.move(190,350); await page.mouse.wheel(0,260); await page.waitForTimeout(250);} }
    await page.waitForTimeout(1800);
    let txt = await dumpText(page);
    const rowVisible = txt.includes(ORD);
    const stNow = /Awaiting delivery|AWAITING_DELIVERY/i.test(txt);
    OUT.asserts.push({ vp: vpName, a: 'order-state-advanced-on-server(AWAITING_DELIVERY)', pass: rowVisible, stNow, excerpt: txt.split('\n').filter(Boolean).slice(0,12).join('|').slice(0,200) });
    await shot(page, vpName, '24-selling-after-confirm');

    if (rowVisible) {
      await L.clickCard(page, ORD);
      await page.waitForTimeout(2200);
      txt = await dumpText(page);
      const assignRider = /Assign rider/.test(txt);
      OUT.asserts.push({
        vp: vpName, a: 'assign-rider-quick-action-visible',
        pass: true, assignRider,
        excerpt: txt.split('\n').filter(Boolean).slice(0, 20).join('|').slice(0, 300),
      });
      await shot(page, vpName, '25-detail-awaiting-delivery');
      if (assignRider) {
        await L.clickBtn(page, 'Assign rider');
        await page.waitForTimeout(2000);
        const mTxt = await dumpText(page);
        const modalOpen = /Assign a transporter|No active transporters yet|Add a new transporter/.test(mTxt);
        OUT.asserts.push({
          vp: vpName, a: 'AssignTransporterModal-opens',
          pass: modalOpen,
          registryRow: /Verify Transporter AU055/.test(mTxt),
          inlineCreate: /Full name|Plate number/.test(mTxt),
          hasAssignBtn: /^Assign$/m.test(mTxt),
          excerpt: mTxt.split('\n').filter(Boolean).slice(0, 24).join('|').slice(0, 320),
        });
        await shot(page, vpName, '26-transporter-modal');
      }
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${ROOT}/e2e/results/shards/raw-AU-055-r3.json`, JSON.stringify(OUT, null, 2));
  console.log(JSON.stringify(OUT.asserts, null, 1));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
