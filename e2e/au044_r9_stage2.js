// au044_r9_stage2.js — precise geometry clicks for header icons, WhatsApp FAB,
// art cards (assert categoryIds in POST body), category chips.
const L = require('./lib_verify.js');
const A = require('./au044_r9_lib.js');
const fs = require('fs');

const VPS = [{ w: 375, h: 667 }, { w: 768, h: 1024 }];

async function clickXY(page, x, y) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(1800);
}
async function topOf(page) {
  await page.mouse.move(200, 300);
  for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, -500); await page.waitForTimeout(70); }
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await L.newBrowser({ headless: true });
  const all = {};

  for (const vp of VPS) {
    const tag = `${vp.w}`;
    const { ctx, page, net } = await A.openHome(browser, vp, { video: true });
    const log = [];
    const rec = s => { log.push(s); console.log(s); };
    const H = vp.h;
    // header icon centers from inventory
    const hdrSearch = { x: 267, y: 26 }, hdrCart = { x: 307, y: 26 }, hdrPerson = { x: 347, y: 26 };
    const fabX = 331;
    if (tag === '768') { hdrSearch.x = 596; hdrCart.x = 636; hdrPerson.x = 676; }

    // ---- 1. art card "Electronics" (leftmost visible) -> expect SearchScreen + searchTerm body
    net.filterCalls.length = 0; net.searchCalls.length = 0;
    await clickXY(page, 91, Math.min(459 + 75, H - 60));
    const t1 = await A.treeText(page);
    const searchUi1 = /results/i.test(t1);
    const fc1 = net.filterCalls.slice();
    rec(`ARTCARD-Electronics[${tag}] searchUi=${searchUi1} filterCalls=${fc1.length} searchCalls=${net.searchCalls.length}`);
    if (fc1[0]) rec(`  BODY=${(fc1[0].postBody || '').slice(0, 200)} QUERY=${JSON.stringify(fc1[0].query).slice(0, 200)}`);
    else if (net.searchCalls[0]) rec(`  SEARCHURL=${net.searchCalls[0].url.slice(0, 160)}`);
    await A.shot(page, `AU-044-r9-${tag}-10-artcard-electronics.png`);

    await page.goBack().catch(() => {}); await page.waitForTimeout(1500); await topOf(page);

    // ---- 2. art card "Home & Living"
    net.filterCalls.length = 0;
    await clickXY(page, 251, Math.min(459 + 75, H - 60));
    const t2 = await A.treeText(page);
    const fc2 = net.filterCalls.slice();
    rec(`ARTCARD-HomeLiving[${tag}] filterCalls=${fc2.length}${fc2[0] ? ' BODY=' + (fc2[0].postBody || '').slice(0, 200) : ''}`);
    await A.shot(page, `AU-044-r9-${tag}-11-artcard-homeliving.png`);
    await page.goBack().catch(() => {}); await page.waitForTimeout(1500); await topOf(page);

    // ---- 3. category chip "Art & Crafts" (scroll a bit)
    net.filterCalls.length = 0;
    await page.mouse.move(187, H / 2); await page.mouse.wheel(0, 260); await page.waitForTimeout(700);
    const chipY = Math.min(667 - 667 + 40, H - 40); // after wheel the rail is near y=667 -> ~y=60..170
    let clicked3 = false;
    for (const yy of [Math.max(30, 667 - 600), 120, 90, 160]) {
      const before = (await A.treeText(page)).slice(0, 4000);
      await clickXY(page, 54, yy);
      const t3 = await A.treeText(page);
      if (/Could not load|Buy\. Sell\./.test(t3)) { continue; }
      clicked3 = true; break;
    }
    const fc3 = net.filterCalls.slice();
    rec(`CHIP-ArtCrafts[${tag}] attempted=${clicked3} filterCalls=${fc3.length}${fc3[0] ? ' BODY=' + (fc3[0].postBody || '').slice(0, 220) : ''}`);
    await A.shot(page, `AU-044-r9-${tag}-12-chip-artcrafts.png`);
    const t3f = await A.treeText(page);
    fs.writeFileSync(`tmp/au044-chiptree-${tag}.txt`, t3f.slice(0, 3000));

    await page.goBack().catch(() => {}); await page.waitForTimeout(1500); await topOf(page);

    // ---- 4. header search icon (geometry click)
    net.filterCalls.length = 0;
    await clickXY(page, hdrSearch.x, 26);
    const t4 = await A.treeText(page);
    rec(`HDRSEARCH[${tag}] ui=${/Search…/.test(t4)}/searchField=${t4.includes('Search')} firstLines=${JSON.stringify(t4.slice(0, 120))}`);
    await A.shot(page, `AU-044-r9-${tag}-13-header-search.png`);
    await page.goBack().catch(() => {}); await page.waitForTimeout(1400); await topOf(page);

    // ---- 5. header cart icon
    await clickXY(page, hdrCart.x, 26);
    const t5 = await A.treeText(page);
    rec(`HDRCART[${tag}] emptyCart=${/Your cart is empty/.test(t5)} first=${JSON.stringify(t5.slice(0, 100))}`);
    await A.shot(page, `AU-044-r9-${tag}-14-header-cart.png`);
    await page.goBack().catch(() => {}); await page.waitForTimeout(1400); await topOf(page);

    // ---- 6. header person icon
    await clickXY(page, hdrPerson.x, 26);
    const t6 = await A.treeText(page);
    rec(`HDRPERSON[${tag}] loginUi=${/Welcome back/.test(t6)} first=${JSON.stringify(t6.slice(0, 100))}`);
    await A.shot(page, `AU-044-r9-${tag}-15-header-person-login.png`);
    await page.goBack().catch(() => {}); await page.waitForTimeout(1400);

    // ---- 7. WhatsApp FAB at bottom-right above nav bar
    net.popups.length = 0; net.waLaunches.length = 0;
    const waY = H - 128; // FAB center per inventory (56x56 at y=539 on 667 => cy=567; nav at 614)
    await page.mouse.click(fabX, waY);
    await page.waitForTimeout(2500);
    const t7 = await A.treeText(page);
    rec(`WA-FAB[${tag}] popups=${JSON.stringify(net.popups)} waNet=${JSON.stringify(net.waLaunches)} homeStill=${/Buy\. Sell\. Connect\./.test(t7)}`);
    await A.shot(page, `AU-044-r9-${tag}-16-whatsapp-fab.png`);

    try {
      const v = page.video(); await ctx.close();
      if (v) await v.saveAs(`${A.VID}/AU-044-r9-${tag}-b.webm`).catch(() => {});
    } catch (e) {}
    all[tag] = log;
  }

  fs.writeFileSync('tmp/au044-stage2.json', JSON.stringify(all, null, 1));
  console.log('STAGE2 DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
