// AU-006 browser click-sweep — every route on the frozen :9106 bundle at 375x667.
// For each route: load, enumerate flt-semantics buttons, click each ONCE, record whether
// ANY observable effect followed (a11y text change, navigation, dialog, network call).
// A control with zero observable effect = dead stub = AU-006 FAIL evidence.
const lib = require('./lib_verify.js');
const fs = require('fs');
process.chdir(require('path').join(__dirname,'..'));
const APP = 'http://localhost:9106';

const ROUTES = [
  '/', '/browse', '/search?q=phone', '/category/electronics', '/product/101',
  '/seller/2', '/cart', '/checkout', '/orders', '/login', '/register',
  '/reset-password', '/verify-email', '/account/settings', '/account/addresses',
  '/account/payment-methods', '/notifications', '/help', '/faq', '/about',
  '/contact', '/privacy', '/terms', '/expat/dashboard', '/sell', '/insights',
  '/admin',
];

(async () => {
  const browser = await lib.newBrowser();
  const findings = [];
  const shotsDir = 'e2e/shots/AU-006';
  fs.mkdirSync(shotsDir, { recursive: true });

  const ctx = await lib.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-006-sweep.webm' });
  const page = await ctx.newPage();
  const imgWatch = lib.watchImages(page);
  let netPosts = 0;
  page.on('request', r => { if (r.method() === 'POST') netPosts++; });

  for (let i = 0; i < ROUTES.length; i++) {
    const route = ROUTES[i];
    const before = await page.evaluate(() => location.pathname + location.search).catch(() => '');
    await page.goto(APP + route, { waitUntil: 'load', timeout: 45000 }).catch(e => findings.push(`LOAD-FAIL ${route}: ${e.message.slice(0, 80)}`));
    await page.waitForTimeout(3500); // flutter boot + first frame
    const textBefore = await lib.allText(page);
    const btns = await lib.listButtons(page);
    const shot0 = `${shotsDir}/au006-${route.replace(/[^a-z0-9]+/gi, '_')}-initial.png`;
    await lib.screenshot(page, shot0);

    // click up to first 12 controls per route; assert text/nav/dialog delta after each
    let deadOnRoute = [];
    const cap = Math.min(btns.length, 12);
    for (let b = 0; b < cap; b++) {
      const label = btns[b];
      const t0 = await lib.allText(page);
      const loc0 = await page.evaluate(() => location.pathname).catch(() => '');
      const posts0 = netPosts;
      await lib.clickBtn(page, label);
      await page.waitForTimeout(900);
      const t1 = await lib.allText(page);
      const loc1 = await page.evaluate(() => location.pathname).catch(() => '');
      const changed = t1 !== t0 || loc1 !== loc0 || netPosts > posts0;
      if (!changed) deadOnRoute.push(label);
      // navigate back if the click left the route
      const nowLoc = await page.evaluate(() => location.pathname).catch(() => '/');
      if (nowLoc !== route && !route.startsWith(nowLoc)) {
        await page.goto(APP + route, { waitUntil: 'load' }).catch(() => {});
        await page.waitForTimeout(2500);
      }
    }
    if (deadOnRoute.length) findings.push(`${route}: ${deadOnRoute.length} no-effect clicks of ${cap} [${deadOnRoute.slice(0, 5).join(' | ')}]`);
    console.log(`${route}: ${btns.length} controls, ${cap} clicked, dead=${deadOnRoute.length}`);
  }

  const imgs = lib.imageSummary(imgWatch);
  await lib.closeVideo(ctx, 'e2e/videos/AU-006-sweep.webm');
  await browser.close();

  const summary = { routes: ROUTES.length, deadClicks: findings.length, findings: findings.slice(0, 40), images: imgs };
  fs.writeFileSync('e2e/results/shards/raw-AU-006-sweep.json', JSON.stringify(summary, null, 2));
  console.log('SUMMARY', JSON.stringify({ routes: summary.routes, deadRoutes: findings.length, images: imgs }));
})();
