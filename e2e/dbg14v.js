// dbg: THE key question — does the snackbar render but get REMOVED before we
// read? Flutter web snackbars are in the DOM ~4s (duration 2s + animation).
// Poll every 100ms for 6s after click.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  // capture the semantics ENABLED flag — maybe clicks land on the canvas but
  // the semantics button is a stale overlay. Compare: click canvas coords of
  // the button vs clicking the flt-semantics node itself via JS .click().
  await p.goto('http://localhost:9108/#/product/629', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  // method X: dispatch JS click on the semantics node directly
  const jsClicked = await p.evaluate(() => {
    let h = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if (/Add to cart/i.test((e.textContent || '').trim()) && !h) h = e;
    });
    if (!h) return false;
    h.click();           // synthetic DOM click — Flutter web semantics listens?
    return true;
  });
  console.log('js clicked node:', jsClicked);
  let seen = '';
  for (let i = 0; i < 60; i++) {
    await p.waitForTimeout(100);
    const t = await L.allText(p);
    if (/own listed items|Added to cart|Login Required/.test(t)) { seen = t.match(/own listed items|Added to cart|Login Required/)[0]; break; }
  }
  console.log('after JS-click poll:', seen || 'NOTHING');
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
