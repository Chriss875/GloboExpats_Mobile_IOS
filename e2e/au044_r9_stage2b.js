// au044_r9_stage2b.js — robust AU-044 clicks: re-enumerate geometry before EVERY click,
// verify home is on screen, use fresh page per control group (no history dependence).
const L = require('./lib_verify.js');
const A = require('./au044_r9_lib.js');
const fs = require('fs');

const VPS = [{ w: 375, h: 667 }, { w: 768, h: 1024 }];

async function homeReady(page) {
  for (let i = 0; i < 10; i++) {
    const t = await A.treeText(page);
    if (/Buy\. Sell\. Connect\./.test(t)) return true;
    await page.waitForTimeout(800);
  }
  return false;
}

// find node whose text/aria includes label, visible, area within [minArea,maxArea]
async function findNode(page, label) {
  return page.evaluate(lbl => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const txt = ((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim();
      if (!txt.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 12 || r.height < 12) return;
      if (r.bottom < 0 || r.top > innerHeight || r.left < 0 || r.right > innerWidth) return;
      if (r.width > innerWidth * 0.98) return; // full-screen wrapper
      const area = r.width * r.height;
      if (!best || area < best.area) best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area, txt: txt.slice(0, 50) };
    });
    return best;
  }, label);
}

(async () => {
  const browser = await L.newBrowser({ headless: true });
  const all = {};

  for (const vp of VPS) {
    const tag = `${vp.w}`;
    const { ctx, page, net } = await A.openHome(browser, vp, { video: true });
    const log = [];
    const rec = s => { log.push(s); console.log(s); };

    // helper: fresh home state via goHome (reload route by clicking Home tab or goto)
    async function goHome() {
      // fastest reliable reset: reload the SPA
      await page.goto(A.APP + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await A.waitText ? null : null;
      await page.waitForFunction(() => [...document.querySelectorAll('flt-semantics')].some(e => (e.textContent || '').includes('Buy. Sell. Connect.')), { timeout: 40000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    // ---- header search icon
    await goHome();
    net.filterCalls.length = 0;
    let n = await findNode(page, 'Search');
    rec(`HDRSEARCH-FOUND[${tag}]=${JSON.stringify(n)}`);
    if (n) { await page.mouse.click(n.cx, n.cy); await page.waitForTimeout(2200); }
    const t4 = await A.treeText(page);
    rec(`HDRSEARCH[${tag}] tree=${JSON.stringify(t4.slice(0, 160))}`);
    await A.shot(page, `AU-044-r9-${tag}-13-header-search.png`);

    // type a real query and assert network
    net.searchCalls.length = 0;
    const inp = page.locator('input[type="text"]').first();
    await inp.click({ force: true }).catch(() => {});
    await page.keyboard.type('fridge');
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    const t4b = await A.treeText(page);
    rec(`HDRSEARCH-QUERY[${tag}] resultsUi=/fridge/i in tree=${/fridge/i.test(t4b)} calls=${net.filterCalls.length} first=${net.filterCalls[0] ? (net.filterCalls[0].postBody || '').slice(0, 140) : 'none'}`);
    await A.shot(page, `AU-044-r9-${tag}-13b-header-search-results.png`);
    const fridgeTree = t4b;
    fs.writeFileSync(`tmp/au044-searchtree-${tag}.txt`, fridgeTree.slice(0, 2500));

    // ---- cart
    await goHome();
    n = await findNode(page, 'Cart');
    rec(`HDRCART-FOUND[${tag}]=${JSON.stringify(n)}`);
    if (n) { await page.mouse.click(n.cx, n.cy); await page.waitForTimeout(2200); }
    const t5 = await A.treeText(page);
    rec(`HDRCART[${tag}] emptyCart=${/Your cart is empty/.test(t5)} tree=${JSON.stringify(t5.slice(0, 120))}`);
    await A.shot(page, `AU-044-r9-${tag}-14-header-cart.png`);

    // ---- person/login
    await goHome();
    n = await findNode(page, 'Login');
    rec(`HDRPERSON-FOUND[${tag}]=${JSON.stringify(n)}`);
    if (n) { await page.mouse.click(n.cx, n.cy); await page.waitForTimeout(2400); }
    const t6 = await A.treeText(page);
    rec(`HDRPERSON[${tag}] loginUi=${/Welcome back/.test(t6)} tree=${JSON.stringify(t6.slice(0, 140))}`);
    await A.shot(page, `AU-044-r9-${tag}-15-header-person-login.png`);

    // ---- WhatsApp FAB
    await goHome();
    net.popups.length = 0; net.waLaunches.length = 0;
    n = await findNode(page, 'WhatsApp support');
    rec(`WAFAB-FOUND[${tag}]=${JSON.stringify(n)}`);
    if (n) { await page.mouse.click(n.cx, n.cy); await page.waitForTimeout(2600); }
    const t7 = await A.treeText(page);
    rec(`WA-FAB[${tag}] popups=${JSON.stringify(net.popups)} waNet=${JSON.stringify(net.waLaunches)} homeStill=${/Buy\. Sell\. Connect\./.test(t7)}`);
    await A.shot(page, `AU-044-r9-${tag}-16-whatsapp-fab.png`);

    try { const v = page.video(); await ctx.close(); if (v) await v.saveAs(`${A.VID}/AU-044-r9-${tag}-c.webm`).catch(() => {}); } catch (e) {}
    all[tag] = log;
  }
  fs.writeFileSync('tmp/au044-stage2b.json', JSON.stringify(all, null, 1));
  console.log('STAGE2B DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
