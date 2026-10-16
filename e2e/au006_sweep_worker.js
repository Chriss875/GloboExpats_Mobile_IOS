// AU-006 browser click-sweep WORKER — chunked for parallelism.
// Usage: node au006_sweep_worker.js <workerIndex> <numWorkers>
// Writes e2e/results/shards/raw-AU-006-sweep-w<idx>.json
const lib = require('./lib_verify.js');
const fs = require('fs');
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const APP = 'http://localhost:9106';

const ROUTES = [
  '/', '/browse', '/search?q=phone', '/category/electronics', '/product/101',
  '/seller/2', '/cart', '/checkout', '/orders', '/login', '/register',
  '/reset-password', '/verify-email', '/account/settings', '/account/addresses',
  '/account/payment-methods', '/notifications', '/help', '/faq', '/about',
  '/contact', '/privacy', '/terms', '/expat/dashboard', '/sell', '/insights',
  '/admin',
];

const idx = Number(process.argv[2] || 0);
const nWorkers = Number(process.argv[3] || 1);
const mine = ROUTES.filter((_, i) => i % nWorkers === idx);

(async () => {
  const browser = await lib.newBrowser();
  const findings = [];
  const shotsDir = 'e2e/shots/AU-006';
  fs.mkdirSync(shotsDir, { recursive: true });
  const ctx = await lib.newCtx(browser, {
    viewport: { width: 375, height: 667 },
    videoPath: `e2e/videos/AU-006-sweep-w${idx}.webm`,
  });
  const page = await ctx.newPage();

  for (const route of mine) {
    try {
      await page.goto(APP + route, { waitUntil: 'load', timeout: 30000 });
    } catch (e) {
      findings.push(`LOAD-FAIL ${route}: ${String(e.message).slice(0, 60)}`);
      continue;
    }
    await page.waitForTimeout(3200);
    const btns = await lib.listButtons(page);
    const shot0 = `${shotsDir}/au006-${route.replace(/[^a-z0-9]+/gi, '_')}-initial.png`;
    await lib.screenshot(page, shot0);

    const deadOnRoute = [];
    const cap = Math.min(btns.length, 10);
    for (let b = 0; b < cap; b++) {
      const label = btns[b];
      const t0 = await lib.allText(page);
      const loc0 = await page.evaluate(() => location.pathname).catch(() => '');
      await lib.clickBtn(page, label);
      await page.waitForTimeout(700);
      const t1 = await lib.allText(page);
      const loc1 = await page.evaluate(() => location.pathname).catch(() => '');
      if (t1 === t0 && loc1 === loc0) deadOnRoute.push(label);
      const nowLoc = await page.evaluate(() => location.pathname).catch(() => '/');
      if (nowLoc !== route.split('?')[0]) {
        // clicked out of the route — come back for the next control
        await page.goto(APP + route, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(2200);
      }
    }
    if (deadOnRoute.length)
      findings.push(`${route}: ${deadOnRoute.length}/${cap} no-effect [${deadOnRoute.slice(0, 4).join(' | ')}]`);
    console.log(`w${idx} ${route}: ${btns.length} controls, ${cap} clicked, dead=${deadOnRoute.length}`);
  }

  await lib.closeVideo(ctx, `e2e/videos/AU-006-sweep-w${idx}.webm`);
  await browser.close();
  fs.writeFileSync(
    `e2e/results/shards/raw-AU-006-sweep-w${idx}.json`,
    JSON.stringify({ worker: idx, routes: mine.length, findings }, null, 2),
  );
  console.log(`w${idx} DONE findings=${findings.length}`);
})();
