// dbg: THE decisive experiment. The stepper + worked. Back worked (nav).
// Bottom-bar buttons ALL dead. What's different? The bottom bar sits at
// y>=621. Flutter web semantics: maybe the browser visual viewport is SHORTER
// than 667 (e.g. 653) so the last 14px are off... but clicks at y=625 also died.
//
// Test: click 'Save' via keyboard Enter after focusing (semantics tabindex=0),
// then read the aria state change.
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9108/#/product/646', { waitUntil: 'load', timeout: 90000 });
  for (let i = 0; i < 30 && !(await L.waitText(p, 'Add to cart', 2000)); i++) {}
  // focus Save and press Enter
  const focused = await p.evaluate(() => {
    let h = null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
      if (/^Save$/.test((e.textContent || '').trim()) && !h) h = e;
    });
    if (!h) return 'none';
    h.focus();
    return document.activeElement === h ? 'focused' : 'focus-failed';
  });
  console.log('save focus:', focused);
  await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
  console.log('after Enter, toast?', /Saved to|Removed|saved/i.test(await L.allText(p)));
  // Now check window.visualViewport vs innerHeight vs the flt-glass-pane size
  const geo = await p.evaluate(() => ({
    innerH: innerHeight, innerW: innerWidth,
    vvH: window.visualViewport ? Math.round(window.visualViewport.height) : null,
    vvScale: window.visualViewport ? Number(window.visualViewport.scale.toFixed(3)) : null,
    docH: document.documentElement.scrollHeight,
    glassPanes: [...document.querySelectorAll('flutter-view, flt-glass-pane, #flutter-view')].map(e => ({ tag: e.tagName, h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) })),
  }));
  console.log(JSON.stringify(geo));
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
