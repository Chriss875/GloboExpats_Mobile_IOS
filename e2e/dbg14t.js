// dbg: does ANY click work on the bottom bar? The stepper worked at y~159.
// Bottom bar is y 621-653. Maybe the click needs pointer events sequence.
// Try: mouse.move then down/up with delay; also try tapping via touchscreen.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const cdp = await b.newBrowserCDPSession().catch(() => null);
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  // method 1: touchscreen tap
  
  // method 2: move+down+up
  await p.mouse.move(287, 637); await p.mouse.down(); await p.waitForTimeout(80); await p.mouse.up();
  await p.waitForTimeout(1000);
  console.log('mouse down/up -> toast?', (await L.allText(p)).includes('Login Required'));
  // method 3: keyboard activation via semantics focus
  await p.locator('flt-semantics[role="button"]', { hasText: 'Add to cart' }).first().focus({ timeout: 3000 }).catch(e => console.log('focus fail', e.message));
  await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
  console.log('keyboard Enter -> toast?', (await L.allText(p)).includes('Login Required'));
  // control: stepper minus (known working) to prove page interactivity this session
  const s = await p.evaluate(() => {
    let m = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.width === 40 && r.height === 40 && r.x > 240 && r.x < 310) m = { x: Math.round(r.x + 20), y: Math.round(r.y + 20) };
    });
    return m;
  });
  if (s) { await p.mouse.click(s.x, s.y); await p.waitForTimeout(500); }
  console.log('stepper control clicked (no crash)');
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
