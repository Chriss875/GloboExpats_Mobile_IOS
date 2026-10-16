// dbg: dispatch a REAL pointer event sequence on the node (Flutter web listens
// for pointerdown/pointerup on the semantics node, not click). Playwright's
// mouse.click does that — but maybe the button needs the events on the exact
// node, not document coords. Use el.dispatchEvent with PointerEvent.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9108/#/product/629', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  const res = await p.evaluate(() => {
    let h = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if (/Add to cart/i.test((e.textContent || '').trim()) && !h) h = e;
    });
    if (!h) return 'no node';
    const r = h.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, composed: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, button: 0, buttons: 1 };
    h.dispatchEvent(new PointerEvent('pointerdown', opts));
    h.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }));
    h.dispatchEvent(new MouseEvent('click', opts));
    return `dispatched at ${Math.round(r.x + r.width / 2)},${Math.round(r.y + r.height / 2)}`;
  });
  console.log(res);
  let seen = '';
  for (let i = 0; i < 50; i++) {
    await p.waitForTimeout(100);
    const m = (await L.allText(p)).match(/own listed items|Added to cart|Login Required/);
    if (m) { seen = m[0]; break; }
  }
  console.log('result:', seen || 'NOTHING');
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
