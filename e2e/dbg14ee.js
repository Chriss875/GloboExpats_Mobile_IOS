// dbg: qty0=null but after click =2?? The 'plus' locator was null on the FIRST
// call yet the click worked. => semantics nodes APPEAR LATE. The page needs
// MORE TIME to become interactive (CanvasKit warmup?). The bottom-bar clicks
// may have been fired while the tree was still settling... no — Add was dead
// minutes into the session.
//
// NEW HYPOTHESIS: clicks land, but _addToCart's guards return early WITHOUT a
// snackbar because ScaffoldMessenger.of(context) is scoped to a navigator that
// no longer exists after deep-link load... but then Buy Now would navigate.
//
// Let me look at what the app DOES register: instrument Flutter's action
// handler by monkey-patching SemanticsObject.dispatchAction? Too deep. Instead:
// check the console for errors after clicking Add.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const msgs = [];
  p.on('console', m => msgs.push(m.type() + ':' + m.text().slice(0, 120)));
  p.on('pageerror', e => msgs.push('PAGEERROR:' + e.message.slice(0, 160)));
  await p.goto('http://localhost:9108/#/product/629', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  await p.waitForTimeout(4000); // let everything settle
  const loc = p.locator('flt-semantics[role="button"]', { hasText: 'Add to cart' }).first();
  await loc.click({ force: true });
  await p.waitForTimeout(2500);
  const t = await L.allText(p);
  console.log('toast?', /own listed items|Added to cart|Login Required|out of stock/.test(t));
  // any snack region in DOM?
  console.log('DOM has Added?', await p.evaluate(() => document.body.innerHTML.includes('Added to cart')));
  console.log('console tail:', JSON.stringify(msgs.slice(-6), null, 1));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
