// au044_r9_stage1.js — AU-044 r9: inventory + hero CTAs + header shortcuts + WhatsApp FAB
// at BOTH mandatory viewports. Records video, network taps, screenshots.
const L = require('./lib_verify.js');
const A = require('./au044_r9_lib.js');
const fs = require('fs');

const VPS = [{ w: 375, h: 667 }, { w: 768, h: 1024 }];
const out = {};

(async () => {
  const browser = await L.newBrowser({ headless: true });

  for (const vp of VPS) {
    const tag = `${vp.w}`;
    const r = await A.openHome(browser, vp, { video: true });
    const { page, net } = r;
    const log = [];
    const rec = (s) => { log.push(s); console.log(s); };

    await A.shot(page, `AU-044-r9-${tag}-01-home-top.png`);

    // ---- enumerate all controls on home top screen
    const ctrls = await A.enumerate(page);
    fs.writeFileSync(`tmp/au044-ctrls-${tag}.json`, JSON.stringify(ctrls, null, 1));
    rec(`CTRLS[${tag}]=${ctrls.length}`);

    // ---- scroll to bottom to load everything, then back up
    await L.scrollToBottom(page, 12);
    await page.waitForTimeout(1500);
    await A.shot(page, `AU-044-r9-${tag}-02-home-scrolled.png`);
    const ctrlsBottom = await A.enumerate(page);
    fs.writeFileSync(`tmp/au044-ctrls-bottom-${tag}.json`, JSON.stringify(ctrlsBottom, null, 1));

    // ---- HERO CTA: Buy now -> browse/marketplace; capture network filter call
    await page.mouse.move(200, 300); for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(90); }
    await page.waitForTimeout(600);
    net.filterCalls.length = 0;
    const buy = await A.clickSmallest(page, 'Buy now');
    await page.waitForTimeout(2500);
    const buyTree = await A.treeText(page);
    const buyHasMarketplace = /Marketplace/.test(buyTree) && !/Sell for free/.test(buyTree);
    const filterAfterBuy = net.filterCalls.slice();
    rec(`BUY[${tag}] clicked=${buy.clicked} marketplaceScreen=${buyHasMarketplace} filterCalls=${filterAfterBuy.length}`);
    if (filterAfterBuy[0]) rec(`BUY-FILTER-BODY[${tag}]=${(filterAfterBuy[0].postBody || '').slice(0, 220)}`);
    await A.shot(page, `AU-044-r9-${tag}-03-after-buynow.png`);
    fs.writeFileSync(`tmp/au044-buytree-${tag}.txt`, buyTree);

    // back home via browser history (go_router push)
    await page.goBack().catch(() => {});
    await page.waitForTimeout(2000);

    // ---- SELL for free
    net.filterCalls.length = 0;
    const sell = await A.clickSmallest(page, 'Sell for free');
    await page.waitForTimeout(2200);
    const sellTree = await A.treeText(page);
    const sellOk = /Sell for free to the expat community/.test(sellTree);
    rec(`SELL[${tag}] clicked=${sell.clicked} sellScreen=${sellOk}`);
    await A.shot(page, `AU-044-r9-${tag}-04-after-sell.png`);

    await page.goBack().catch(() => {});
    await page.waitForTimeout(2000);

    // ---- header search icon -> SearchScreen
    const searchClick = await A.clickSmallest(page, 'Search');
    await page.waitForTimeout(2200);
    const searchTree = await A.treeText(page);
    const searchOk = /Search…|Search\.\.\./.test(searchTree) || /results/i.test(searchTree);
    rec(`HDRSEARCH[${tag}] clicked=${searchClick.clicked} searchUi=${searchOk}`);
    await A.shot(page, `AU-044-r9-${tag}-05-header-search.png`);

    await page.goBack().catch(() => {});
    await page.waitForTimeout(1800);

    // ---- header cart icon -> Cart
    const cartClick = await A.clickSmallest(page, 'Cart');
    await page.waitForTimeout(2200);
    const cartTree = await A.treeText(page);
    const cartOk = /Your cart is empty/.test(cartTree);
    rec(`HDRCART[${tag}] clicked=${cartClick.clicked} cartUi=${cartOk}`);
    await A.shot(page, `AU-044-r9-${tag}-06-header-cart.png`);

    await page.goBack().catch(() => {});
    await page.waitForTimeout(1800);

    // ---- header person icon -> login
    const personClick = await A.clickSmallest(page, 'Login');
    await page.waitForTimeout(2200);
    const personTree = await A.treeText(page);
    const personOk = /Welcome back/.test(personTree) || /Log in/.test(personTree);
    rec(`HDRPERSON[${tag}] clicked=${personClick.clicked} loginUi=${personOk}`);
    await A.shot(page, `AU-044-r9-${tag}-07-header-person-login.png`);

    await page.goBack().catch(() => {});
    await page.waitForTimeout(1800);

    // ---- WhatsApp FAB (last: may open external handler)
    net.waLaunches.length = 0; net.popups.length = 0;
    let waClicked = false, waEvidence = '';
    try {
      waClicked = await A.clickSmallest(page, 'WhatsApp support').then(x => x.clicked);
      // also try by label text 'WhatsApp'
      if (!waClicked) waClicked = await A.clickSmallest(page, 'WhatsApp').then(x => x.clicked);
    } catch (e) { waEvidence = 'err:' + e.message.slice(0, 80); }
    await page.waitForTimeout(2500);
    const treeAfterWa = await A.treeText(page);
    const homeStill = /Buy\. Sell\. Connect\./.test(treeAfterWa);
    waEvidence += ` popups=${JSON.stringify(net.popups)} waNet=${JSON.stringify(net.waLaunches)} homeStillRendered=${homeStill}`;
    rec(`WA-FAB[${tag}] clicked=${waClicked} ${waEvidence}`);
    await A.shot(page, `AU-044-r9-${tag}-08-whatsapp-fab.png`);

    // ---- image reconciliation on home
    const imgUp = Object.entries(net.uploads); const imgAs = Object.entries(net.assets);
    const badUp = imgUp.filter(([, s]) => s !== 200 && s !== 304);
    const badAs = imgAs.filter(([, s]) => s !== 200 && s !== 304);
    rec(`IMAGES[${tag}] uploads=${imgUp.length} badUploads=${badUp.length} assets=${imgAs.length} badAssets=${badAs.length}`);

    // close video
    try {
      const v = page.video();
      await ctx.close();
      if (v) await v.saveAs(`${A.VID}/AU-044-r9-${tag}.webm`).catch(() => {});
    } catch (e) {}
    out[tag] = log;
  }

  await browser.close();
  fs.writeFileSync('tmp/au044-stage1.json', JSON.stringify(out, null, 1));
  console.log('STAGE1 DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
