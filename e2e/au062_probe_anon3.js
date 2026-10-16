// probe15: anon — dump the a11y text at each step to find where it diverges
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async () => {
  const APP = 'http://localhost:9131';
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/#/contact', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  const t0 = await L.waitText(p, 'Contact us', 40000);
  console.log('saw Contact us:', t0);
  await p.waitForTimeout(3000);
  const T = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
  console.log('TEXT:', JSON.stringify(T.slice(0, 400)));
  console.log('INPUTS:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('input,textarea')].map(i => i.getAttribute('aria-label')))));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
