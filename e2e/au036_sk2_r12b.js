// au036_sk2_r12b.js — targeted re-leg: REFUND_PENDING banner (ORD-2026-000091)
// viewed as its OWNER (throwaway fixture buyer) at both viewports. The r12 run's
// browser-side login of this account flaked (form race); API login is proven fine.
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9131';
const fx = JSON.parse(fs.readFileSync('/tmp/au036_r5.json', 'utf8'));
let seq = 50000 + Math.floor(Math.random() * 9999);
const out = [];
(async () => {
  const browser = await L.newBrowser();
  for (const [vpName, viewport] of [['mobile', { width: 375, height: 667 }], ['tablet', { width: 768, height: 1024 }]]) {
    const ctx = await L.newCtx(browser, { viewport, videoPath: `e2e/videos/AU-036-sk2-r12b-${vpName}.webm` });
    const page = await ctx.newPage();
    let ok = false;
    for (let att = 0; att < 3 && !ok; att++) {
      await page.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
      await L.waitText(page, 'Buy now', 45000);
      await L.clickBtn(page, 'Login'); await L.waitText(page, 'Welcome back', 30000);
      const ei = page.locator('input[type="text"]').first(), pi = page.locator('input[type="password"]').first();
      await ei.click({ force: true }).catch(() => {}); await new Promise(r => setTimeout(r, 400));
      await page.keyboard.type(fx.buyer.email);
      await pi.click({ force: true }).catch(() => {}); await new Promise(r => setTimeout(r, 400));
      await page.keyboard.type(fx.buyer.pw);
      await L.clickBtn(page, 'Log in');
      for (let i = 0; i < 25 && !ok; i++) { ok = await L.isLoggedIn(page); if (!ok) await new Promise(r => setTimeout(r, 1000)); }
      if (!ok) await new Promise(r => setTimeout(r, 4000));
    }
    console.log(`login-fixture-buyer-${vpName}: ${ok}`);
    ++seq;
    await page.goto(`${APP}/?sk12b=${seq}#/orders/38ddba19-9785-4b36-89e4-92f623ee808e`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 7000));
    const T = await L.allText(page);
    const hit = T.includes('Cancellation refund pending - GloboExpats will return your money');
    const alt = T.includes('Refund pending');
    console.log(`banner-refundpending-${vpName}: exact=${hit} alt=${alt} num=${T.includes('ORD-2026-000091')} head=${T.split('\n').filter(Boolean).slice(0, 8).join('|').slice(0, 260)}`);
    out.push({ vp: vpName, ok, hit, alt });
    await L.screenshot(page, `e2e/shots/AU-036/AU-036-sk2-${vpName}-refund-pending.png`);
    await L.closeVideo(ctx, `e2e/videos/AU-036-sk2-r12b-${vpName}.webm`).catch(() => {});
  }
  await browser.close().catch(() => {});
  fs.writeFileSync('e2e/results/shards/tmp-AU-036-sk2-r12b.json', JSON.stringify(out));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
