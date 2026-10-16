// dbg: hit-test what element is at (287,637). Maybe an invisible overlay
// (e.g. the snackbar region or a scrim) intercepts the click.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9108/#/product/629', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  const probe = await p.evaluate(() => {
    const el = document.elementFromPoint(287, 637);
    return { tag: el.tagName, cls: el.className && String(el.className).slice(0, 60), txt: (el.textContent || '').slice(0, 40), parent: el.parentElement && el.parentElement.tagName };
  });
  console.log('elementFromPoint:', JSON.stringify(probe));
  // Also check whether the semantics node for Add is marked clickable/has actions
  const info = await p.evaluate(() => {
    let h = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if (/Add to cart/i.test((e.textContent || '').trim()) && !h) {
        h = { attrs: [...e.attributes].map(a => a.name + '=' + a.value.slice(0, 30)) };
      }
    });
    return h;
  });
  console.log('add node attrs:', JSON.stringify(info, null, 1));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
