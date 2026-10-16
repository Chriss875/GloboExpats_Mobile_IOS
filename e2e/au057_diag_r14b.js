// au057_diag_r14b.js — focused diagnosis of the r14 FAILs on the frozen lane.
// 1) buyer tracking screen: was 'Delivery code' card rendered? (role gating / inTransit)
// 2) assign modal: plate + trips copy present? (subtitle vs semantics split)
// 3) inline-create form: which labels reached flt-semantics?
// 4) seller handover card: title/copy present? (r14 excerpt showed only button labels)
// 5) attempts copy after a UI wrong-code: what did the card paint?
const fs = require('fs');
const L = require('./lib_verify');
const APP = 'http://localhost:9131';
const ROOT = '/home/devsystemadmin/GloboExpats_Mobile';

async function dumpText(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '')).join('\n'));
}
async function shot(p, name) {
  const f = `${ROOT}/e2e/shots/AU-057/AU-057-diag-${name}.png`;
  await L.screenshot(p, f); console.log('shot', name);
}

(async () => {
  const fx = JSON.parse(fs.readFileSync('/tmp/au057_fixtures_r14.json', 'utf8'));
  // NOTE: order B is DELIVERED now (r14 closed the loop). Use the still-live trip of
  // ORDER A (AWAITING_DELIVERY, transporter assigned, NOT dispatched) for the buyer
  // code-card probe we cannot get from B anymore; and re-check the modal details.
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: `${ROOT}/e2e/videos/AU-057-r14b-diag.webm` });
  const page = await ctx.newPage();
  try {
    await page.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(page, 'Buy now', 25000);
    console.log('login buyer:', await L.login(page, { email: fx.buyer.email, pw: fx.buyer.pw }));
    await page.waitForTimeout(1200);

    // ---- BUYER leg on ORDER A (assigned, AWAITING_DELIVERY): tracking should show
    // "not yet available"-style rows WITHOUT the buyer code card (not in transit).
    let acc = false;
    for (let i = 0; i < 5 && !acc; i++) { acc = (await L.clickBtn(page, 'Account')) || (await L.clickCard(page, 'Account')); if (!acc) await page.waitForTimeout(700); }
    let myOrders = false;
    for (let i = 0; i < 10 && !myOrders; i++) { myOrders = await L.clickCard(page, 'My orders'); if (!myOrders) { await page.mouse.move(190, 350); await page.mouse.wheel(0, 300); await page.waitForTimeout(260); } }
    await page.waitForTimeout(1800);
    let txt = await dumpText(page);
    if (!txt.includes(fx.orderA.orderNumber)) { await page.mouse.move(190, 350); await page.mouse.wheel(0, 320); await page.waitForTimeout(600); txt = await dumpText(page); }
    console.log('orderA row visible:', txt.includes(fx.orderA.orderNumber));
    if (txt.includes(fx.orderA.orderNumber)) {
      await L.clickCard(page, fx.orderA.orderNumber);
      await page.waitForTimeout(2600);
      txt = await dumpText(page);
      await shot(page, 'orderA-detail-buyer');
      console.log('--- orderA detail (buyer) has Delivery code?', /Delivery code/.test(txt));
      const trk = (await L.clickBtn(page, 'Track delivery')) || (await L.clickCard(page, 'Track delivery'));
      await page.waitForTimeout(2600);
      txt = await dumpText(page);
      await shot(page, 'orderA-tracking-buyer');
      console.log('--- orderA tracking text:', JSON.stringify(txt.split('\n').filter(Boolean).slice(0, 20).join('|')).slice(0, 500));
      console.log('--- has "will appear here once"?', /will appear here once/.test(txt));
      console.log('--- role resolved seller view?', /Delivery handover|Enter the 6-digit/.test(txt));

      // ---- BUYER leg on ORDER B (DELIVERED): what does the code card show post-delivery?
      await page.goBack().catch(() => {}); await page.waitForTimeout(800);
      await page.goBack().catch(() => {}); await page.waitForTimeout(800);
      txt = await dumpText(page);
      if (txt.includes(fx.orderB.orderNumber)) {
        await L.clickCard(page, fx.orderB.orderNumber);
        await page.waitForTimeout(2600);
        txt = await dumpText(page);
        await shot(page, 'orderB-detail-delivered');
        console.log('--- orderB detail (buyer, DELIVERED):', JSON.stringify(txt.split('\n').filter(Boolean).slice(0, 22).join('|')).slice(0, 520));
      }
    }

    // ---- SELLER leg: modal detail + form labels
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
    await page.goto(APP, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await L.waitText(page, 'Buy now', 25000);
    console.log('login seller:', await L.login(page, { email: fx.seller.email, pw: fx.seller.pw }));
    await page.waitForTimeout(1200);
    acc = false;
    for (let i = 0; i < 5 && !acc; i++) { acc = (await L.clickBtn(page, 'Account')) || (await L.clickCard(page, 'Account')); if (!acc) await page.waitForTimeout(700); }
    let dash = false;
    for (let i = 0; i < 10 && !dash; i++) { dash = await L.clickCard(page, 'Seller dashboard'); if (!dash) { await page.mouse.move(190, 350); await page.mouse.wheel(0, 300); await page.waitForTimeout(260); } }
    await page.waitForTimeout(1500);
    let sold = false;
    for (let i = 0; i < 8 && !sold; i++) { sold = await L.clickCard(page, 'Selling orders'); if (!sold) { await page.mouse.move(190, 350); await page.mouse.wheel(0, 280); await page.waitForTimeout(260); } }
    await page.waitForTimeout(2000);
    txt = await dumpText(page);
    if (!txt.includes(fx.orderA.orderNumber)) { await page.mouse.move(190, 350); await page.mouse.wheel(0, 320); await page.waitForTimeout(600); txt = await dumpText(page); }
    console.log('seller sees orderA row:', txt.includes(fx.orderA.orderNumber));
    await L.clickCard(page, fx.orderA.orderNumber);
    await page.waitForTimeout(2800);
    txt = await dumpText(page);
    await shot(page, 'orderA-detail-seller');
    console.log('--- seller orderA detail:', JSON.stringify(txt.split('\n').filter(Boolean).slice(0, 26).join('|')).slice(0, 560));
    const arranged = (await L.clickBtn(page, 'Arrange transport')) || (await L.clickCard(page, 'Arrange transport'));
    await page.waitForTimeout(2400);
    txt = await dumpText(page);
    await shot(page, 'modal-open-seller');
    console.log('--- modal opened:', arranged);
    console.log('--- modal text:', JSON.stringify(txt.split('\n').filter(Boolean).join('|')).slice(0, 700));
    const createdShown = txt.includes(fx.createdTransporter.fullName);
    const plateShown = txt.includes(fx.createdTransporter.plateNumber);
    const tripsCopy = /\d+\s*trips?/.test(txt);
    console.log('--- registry row: created', createdShown, 'plate', plateShown, 'tripsCopy', tripsCopy);
    const addTapped = await L.clickBtn(page, 'Add a new transporter');
    await page.waitForTimeout(1100);
    txt = await dumpText(page);
    await shot(page, 'inline-form-seller');
    console.log('--- add tapped:', addTapped, 'labels:', JSON.stringify(txt.split('\n').filter(Boolean).filter(l => /Full name|Phone number|Plate number|Boda|Bajaji|Mini truck|Semi truck|Save transporter/.test(l))));
    await L.clickBtn(page, 'Cancel');
    await page.waitForTimeout(800);

    // ---- seller handover card on ORDER A tracking (assigned but not dispatched)
    txt = await dumpText(page);
    const trk2 = (await L.clickBtn(page, 'Track delivery')) || (await L.clickCard(page, 'Track delivery'));
    await page.waitForTimeout(2600);
    txt = await dumpText(page);
    await shot(page, 'orderA-tracking-seller');
    console.log('--- seller tracking (orderA):', JSON.stringify(txt.split('\n').filter(Boolean).join('|')).slice(0, 620));
    console.log('--- handover title?', /Delivery handover/.test(txt), '| instruction?', /Enter the 6-digit code the buyer shows you/.test(txt),
      '| Verify delivery?', /Verify delivery/.test(txt));
    // type wrong code and read painted feedback
    const inp = page.locator('input[type="text"], input[type="number"]').last();
    try { await inp.click({ force: true }); await page.keyboard.type('999999'); } catch (e) { console.log('type fail', String(e).slice(0, 80)); }
    const v = await L.clickBtn(page, 'Verify delivery');
    await page.waitForTimeout(2200);
    txt = await dumpText(page);
    await shot(page, 'wrong-code-feedback-seller');
    console.log('--- verify clicked:', v);
    console.log('--- feedback lines:', JSON.stringify(txt.split('\n').filter(Boolean).filter(l => /attempt|INVALID|remaining/i.test(l))));
  } finally {
    await L.closeVideo(ctx, `${ROOT}/e2e/videos/AU-057-r14b-diag.webm`);
    await browser.close().catch(() => {});
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
