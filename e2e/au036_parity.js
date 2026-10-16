// au036_parity.js — CHECK 7: run the same escrow-state views on the reference :3000
// at both viewports, screenshot each, and diff structure against the Flutter shots.
const fs = require('fs');
process.chdir('/home/devsystemadmin/GloboExpats_Mobile');
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const REF = 'http://localhost:3000';
const FIX = {
  released: { id: '2499e6e9-b5f9-4b47-982e-1d50f99144c5' },
  refunded: { id: 'b564e951-ef8f-452e-b974-7f9438137850' },
  heldAsc: { id: '49dee2e4-e785-45e9-91a8-6a4dac2b3270' },
  heldAwaitDel: { id: 'df3ec5c0-961a-4597-a28e-21351a98f62f' },
};
(async () => {
  const browser = await L.newBrowser();
  for (const [vpName, viewport] of [['mobile',{width:375,height:667}],['tablet',{width:768,height:1024}]]) {
    const ctx = await L.newCtx(browser, { viewport, videoPath: null });
    const page = await ctx.newPage();
    try {
      await page.goto(REF + '/login', { waitUntil:'load', timeout:90000 }).catch(()=>{});
      await page.waitForTimeout(4000);
      const em = page.locator('input[type="email"],input[type="text"]').first();
      const pw = page.locator('input[type="password"]').first();
      await em.fill('mobile.test.20260820@gmail.com');
      await pw.fill('StrongPass!1');
      await page.getByRole('button', { name: /Sign In/i }).first().click({ force: true }).catch(() => {});
      let logged = false;
      for (let i = 0; i < 20 && !logged; i++) { await page.waitForTimeout(1000); logged = !/\/login/.test(page.url()); }
      console.log(vpName, 'after-login url', page.url(), 'logged', logged);
      if (!logged) throw new Error('reference login failed');
      console.log(vpName, 'after-login url', page.url());
      for (const [k,v] of Object.entries(FIX)) {
        await page.goto(REF + '/orders/' + v.id, { waitUntil:'load', timeout:60000 }).catch(()=>{});
        await page.waitForTimeout(6000);
        const body = await page.evaluate(()=>document.body.innerText.slice(0,1500));
        fs.writeFileSync(`e2e/shots/AU-036/ref-${vpName}-${k}.txt`, body);
        await L.screenshot(page, `e2e/shots/AU-036/ref-${vpName}-${k}.png`);
        console.log(vpName, k, 'shot done; has Payment status:', /Payment status/.test(body), '| Refunded:', /Refunded/i.test(body));
      }
    } finally { await ctx.close(); }
  }
  await browser.close().catch(()=>{});
})().catch(e=>{console.error('FATAL', e.message); process.exit(1);});
