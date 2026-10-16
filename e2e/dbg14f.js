// dbg: A2/A4 root cause — does clicking Add actually write a cart line, and
// what do the snackbar logs say? Also: is expatCartItems double-encoded?
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30; i++) { if (await L.waitText(p, 'Add to cart', 1500)) break; }
  await p.evaluate(() => { window.__snackLog = []; new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes || []) if (n.nodeType === 1) window.__snackLog.push((n.textContent || '').trim().slice(0, 80)); }).observe(document.body, { childList: true, subtree: true }); });
  // login via API token injection? Use UI-free path: check storage keys first.
  const keysBefore = await p.evaluate(() => Object.keys(localStorage));
  console.log('storage keys before:', JSON.stringify(keysBefore));
  const ab = await p.evaluate(() => {
    const b2 = [...document.querySelectorAll('flt-semantics[role="button"]')]
      .map(e => ({ t: (e.textContent || '').trim(), x: Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2), y: Math.round(e.getBoundingClientRect().y + e.getBoundingClientRect().height / 2) }))
      .find(b3 => /Add to cart/i.test(b3.t));
    return b2;
  });
  console.log('addBtn', ab);
  if (ab) { await p.mouse.click(ab.x, ab.y); await p.waitForTimeout(1500); }
  const snacks1 = await p.evaluate(() => window.__snackLog);
  const keysAfter = await p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = (localStorage.getItem(k) || '').slice(0, 200); } return o; });
  console.log('snacks after add:', JSON.stringify(snacks1));
  console.log('storage after add:', JSON.stringify(keysAfter, null, 1).slice(0, 1200));
  console.log('errs', JSON.stringify(errs));
  await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-014/dbg-add-guest.png' });
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
