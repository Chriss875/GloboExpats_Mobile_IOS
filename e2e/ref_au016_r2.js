// Reference parity capture: /product/470 on :3000 at BOTH viewports; extract rental
// UI markers from rendered DOM (Book now / See on map / per night / Choose dates).
const { chromium } = require('playwright');
const fs = require('fs');
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await lib.newBrowser();
  const out = {};
  for (const [name, vp] of [['mobile', {width:375,height:667}], ['tablet', {width:768,height:1024}]]) {
    const ctx = await lib.newCtx(browser, { viewport: vp, videoPath: null });
    const p = await ctx.newPage();
    await p.goto('http://localhost:3000/product/470', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await sleep(6000);
    const body = await p.evaluate(() => document.body ? document.body.innerText : '');
    out[name] = {
      perNight: /per night/i.test(body),
      bookNow: /book now/i.test(body),
      seeOnMap: /see on map/i.test(body),
      chooseDates: /choose dates/i.test(body),
      checkinLabels: /check-?in/i.test(body),
      price: /150,000|TZS\s*150/.test(body),
      title: /Modern Business Stay Apartment/i.test(body),
    };
    await p.screenshot({ path: `/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-016r2/ref-470-${name}.png` });
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
