// dbg: THE decisive control. The prior skeptic (09:24, same lane) reported the
// 629 own-item toast FIRING with sk-d-629-after-add.png. Reproduce their exact
// flow: UI-driven login first, then navigate to 629 via CARD TAP from home
// (not deep link). Maybe deep-link load leaves semantics in a state where
// clicks are dropped.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  // login FIRST on home
  await p.goto('http://localhost:9108/', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Buy now', 1500)); i++) {}
  if (!(await L.isLoggedIn(p))) {
    await L.clickBtn(p, 'Login'); await p.waitForTimeout(2000);
    await p.locator('input[type="text"]').first().click({ force: true }); await p.waitForTimeout(250);
    await p.keyboard.type(L.BUYER.email, { delay: 10 });
    await p.locator('input[type="password"]').first().click({ force: true }); await p.waitForTimeout(250);
    await p.keyboard.type(L.BUYER.pw, { delay: 10 });
    await L.clickBtn(p, 'Log in');
    let ok = false; for (let i = 0; i < 25 && !ok; i++) { ok = await L.isLoggedIn(p); if (!ok) await p.waitForTimeout(700); }
    console.log('login', ok);
  }
  // find B2 Hidden Guard Fixture 2 card in feed by scroll
  let node = null;
  for (let i = 0; i < 40 && !node; i++) {
    node = await p.evaluate(() => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if (e.getAttribute('flt-tappable') === null) return;
        const txt = (e.textContent || '').trim().toUpperCase();
        if (!txt.includes('HIDDEN GUARD FIXTURE')) return;
        const r = e.getBoundingClientRect();
        if (r.width < 60 || r.height < 60 || r.top < 0 || r.bottom > innerHeight) return;
        if (best === null || r.width * r.height < best.area) best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), area: r.width * r.height };
      });
      return best;
    });
    if (!node) { await p.mouse.move(180, 350); await p.mouse.wheel(0, 600); await p.waitForTimeout(350); }
  }
  console.log('card node', JSON.stringify(node));
  if (!node) { console.log('NOT IN FEED'); await b.close(); return; }
  await p.mouse.click(node.x, node.y);
  let reached = false;
  for (let i = 0; i < 20 && !reached; i++) { reached = /Add to cart/.test(await L.allText(p)); if (!reached) await p.waitForTimeout(700); }
  console.log('reached detail:', reached);
  const ab = await p.evaluate(() => {
    let h = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      const t = (e.textContent || '').trim();
      if (/Add to cart/i.test(t) && !h) { const r = e.getBoundingClientRect(); h = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }
    });
    return h;
  });
  console.log('add btn', ab);
  await p.mouse.click(ab.x, ab.y); await p.waitForTimeout(1400);
  const t = await L.allText(p);
  console.log('own-item toast?', t.includes('own listed items'), '| Added to cart?', t.includes('Added to cart'));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
