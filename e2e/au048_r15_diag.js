// DECISIVE: the empty branch paints black in headless. Check the ERROR branch too
// (Search failed: ...) by killing API access? Simpler decisive check: does the app
// paint black for OTHER screens' plain-Center empty states? e.g. /orders when
// logged out? Instead, test the SAME SearchScreen empty state on a REAL (headed)
// browser is impossible here. Use CDP Page.captureScreenshot with fromSurface +
// emulate a fresh compositor frame: captureScreenshot after forcing a repaint via
// devicePixelRatio change.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ env:{...process.env, LD_LIBRARY_PATH:process.env.HOME+'/chromium-libs/usr/lib/x86_64-linux-gnu'},
    args:['--force-color-profile=srgb','--disable-gpu','--use-gl=swiftshader'] });
  const ctx = await b.newContext({ viewport:{width:375,height:667} });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await p.goto('http://localhost:9131/#/search?q=zzqq99xx', { waitUntil:'load', timeout:60000 }).catch(()=>{});
  await p.waitForTimeout(10000);
  // force compositor to produce a fresh frame with a screenshot request that
  // includes the surface; try Emulation.setDeviceMetricsOverride then capture
  await cdp.send('Emulation.setDeviceMetricsOverride', { width:375, height:667, deviceScaleFactor:2, mobile:true });
  await p.waitForTimeout(3000);
  const shot = await cdp.send('Page.captureScreenshot', { format:'png', captureBeyondViewport:false });
  require('fs').writeFileSync('/tmp/au048/cdp-dpr2.png', Buffer.from(shot.data,'base64'));
  console.log('cdp bytes', Buffer.from(shot.data,'base64').length);
  await b.close();
})();
