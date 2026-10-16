// Probe 2: wait for flt-semantics to attach (Flutter web a11y needs a tick), then retry chips.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 375, height: 667 } })).newPage();
  const reqs = [];
  page.on('request', r => { if (r.url().includes('/displayItem/filter')) reqs.push(r.postData()); });
  await page.goto('http://localhost:9131/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { window.location.hash = '#/browse'; });
  // wait until the first filter request resolves and cards render
  await page.waitForTimeout(9000);
  const dump = async () => page.evaluate(() =>
    [...document.querySelectorAll('flt-semantics')].map(n => n.getAttribute('aria-label') || n.textContent || '').filter(Boolean));
  let t = await dump();
  console.log('top controls:', JSON.stringify(t.slice(0, 14)));
  const before = (await dump()).join('|');
  for (const name of ['Books & Media', 'Clothing', 'Electronics']) {
    const idx = t.findIndex(x => x === name);
    console.log(name, 'present at', idx);
  }
  // click via coordinates from the semantics node
  const target = await page.evaluate((nm) => {
    const el = [...document.querySelectorAll('flt-semantics')].find(n => (n.getAttribute('aria-label') || n.textContent) === nm);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, 'Books & Media');
  if (!target) { console.log('chip NOT in a11y tree — need scroll'); }
  else {
    await page.mouse.click(target.x, target.y);
    console.log('clicked at', target);
    await page.waitForTimeout(5000);
  }
  const after = (await dump()).join('|');
  console.log('reqs total:', reqs.length, 'last body:', (reqs[reqs.length - 1] || '').slice(0, 140));
  console.log('grid changed:', before !== after);
  console.log('after sample:', after.slice(0, 260));
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
