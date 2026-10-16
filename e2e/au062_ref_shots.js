// ref shots: capture :3000 static pages at both viewports (LD_LIBRARY_PATH for chromium)
const { chromium } = require('playwright');
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  for (const vp of [[375, 667], [768, 1024]]) {
    const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] } });
    const p = await ctx.newPage();
    for (const route of ['help', 'contact', 'privacy', 'terms', 'about']) {
      await p.goto(`http://localhost:3000/${route}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(2200);
      const f = `/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-062/AU-062-ref-${vp[0]}-${route}.png`;
      await p.screenshot({ path: f }).catch(() => {});
      console.log('shot', route, vp[0]);
    }
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
