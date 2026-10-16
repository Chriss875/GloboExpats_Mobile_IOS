// au040_probe4.js — diagnose the r4 run derailment: watch the draft content,
// the reload behavior, and each transition with screenshots.
process.chdir(require('path').resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const fs = require('fs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const APP = 'http://localhost:9110';
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function txt(p) { return L.allText(p).catch(() => ''); }
async function nodes(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => {
    const r = e.getBoundingClientRect();
    return { role: e.getAttribute('role'), tappy: e.getAttribute('flt-tappable') !== null,
      label: (e.textContent || '').trim().slice(0, 60),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      area: r.width * r.height };
  }).filter(n => n.w > 5 && n.h > 5 && n.y < innerHeight - 2 && n.y + n.h > 2));
}
async function findNode(p, prefix) {
  const ns = await nodes(p);
  return ns.filter(n => n.label.startsWith(prefix)).sort((a, b) => a.area - b.area)[0] || null;
}
async function tap(p, n, dx = 0.5) { await p.mouse.click(n.x + n.w * dx, n.y + n.h / 2); await sleep(900); }
async function scroll(p, dy) { await p.mouse.move(187, 350); await p.mouse.wheel(0, dy); await sleep(650); }
async function dump(p, tag) {
  const t = await txt(p);
  const draft = await p.evaluate(() => {
    const out = {};
    for (const k of Object.keys(localStorage)) if (k.indexOf('draft') >= 0) out[k] = localStorage.getItem(k);
    return out;
  });
  console.log(`\n### ${tag}`);
  console.log('url:', p.url());
  console.log('step:', (t.match(/Step . of 4/) || [null])[0], '| titleField:', t.includes('Item title'),
    '| cat:', t.includes('Category *'), '| photos copy:', t.includes('Up to 50'),
    '| YouReceive:', t.includes('You receive'));
  for (const [k, v] of Object.entries(draft)) console.log(`DRAFT ${k} = ${v ? v.slice(0, 400) : v}`);
  return t;
}
async function inputBox(p, label) {
  return p.evaluate((lbl) => {
    const i = [...document.querySelectorAll('input,textarea')].find(x => x.getAttribute('aria-label') === lbl);
    if (!i) return null; const r = i.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, label).catch(() => null);
}
async function inputVal(p, label) {
  return p.evaluate((lbl) => {
    const i = [...document.querySelectorAll('input,textarea')].find(x => x.getAttribute('aria-label') === lbl);
    return i ? i.value : null;
  }, label).catch(() => null);
}

(async () => {
  const photoTmp = '/tmp/au040_photo.png';
  fs.writeFileSync(photoTmp, Buffer.from(PNG_B64, 'base64'));

  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(()=>{});
  await L.waitText(p, 'Buy now', 40000);
  await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.indexOf('sell_form_draft') >= 0) localStorage.removeItem(k); });
  await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(()=>{});
  console.log('login:', await L.login(p, L.ADMIN));
  await p.evaluate(() => { location.hash = '#/sell'; });
  for (let i = 0; i < 50; i++) { if ((await txt(p)).includes('Step 1 of 4')) break; await sleep(500); }
  await sleep(2000);
  await dump(p, 'fresh mount');

  // type title
  const tb = await inputBox(p, 'Item title *');
  console.log('\ntitle box:', JSON.stringify(tb));
  await p.mouse.click(tb.x, tb.y); await sleep(450);
  await p.keyboard.type('AU040 Diag Title 17001', { delay: 14 }); await sleep(600);
  console.log('title val now:', await inputVal(p, 'Item title *'));

  // category
  let fld = await findNode(p, 'Category *'); await tap(p, fld); await sleep(1500);
  const opt = await findNode(p, 'Furniture', n => n.role === 'button' && n.tappy && n.w >= 200);
  await tap(p, opt, 0.16); await sleep(1400);
  fld = await findNode(p, 'Subcategory *');
  if (fld) { await tap(p, fld); await sleep(1500);
    const o2 = (await nodes(p)).filter(n => n.role === 'button' && n.tappy && n.w >= 250 && n.label.length > 2)[0];
    if (o2) { console.log('sub opt:', o2.label.slice(0, 24)); await tap(p, o2, 0.16); await sleep(1300); } }

  // address radio
  let radios = [];
  for (let i = 0; i < 9; i++) {
    radios = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
      .filter(e => e.getAttribute('role') === 'radio')
      .map(e => { const r = e.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
          checked: e.getAttribute('aria-checked') === 'true' }; })
      .filter(r => r.h > 5 && r.y > 55 && r.y < 640));
    if (radios.length >= 2 && radios[radios.length - 1].y < 620) break;
    await scroll(p, 380);
  }
  console.log('\nradios:', JSON.stringify(radios));
  if (radios.length) {
    // pick the LAST one (AU040 Pickup was appended last)
    const t = radios.sort((a, b) => a.y - b.y)[radios.length - 1];
    await p.mouse.click(t.x + 14, t.y + t.h / 2); await sleep(1100);
    console.log('checked states:', JSON.stringify((await p.evaluate(() =>
      [...document.querySelectorAll('flt-semantics')].filter(e => e.getAttribute('role') === 'radio')
        .map(e => e.getAttribute('aria-checked'))))));
  }
  await dump(p, 'after fill (pre-save)');
  // wait for debounce
  await sleep(5000);
  await dump(p, 'after 5s debounce');

  // RELOAD and watch closely
  await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(()=>{});
  for (let i = 0; i < 12; i++) { await sleep(1000);
    const t = await txt(p);
    console.log(`post-reload ${i}s: url=${p.url().slice(-18)} step=${(t.match(/Step . of 4/)||[null])[0]} titleVal=${JSON.stringify(await inputVal(p,'Item title *'))}`);
    if (((await inputVal(p, 'Item title *')) || '').length > 3) break;
  }
  await dump(p, 'post-reload settled');
  await p.screenshot({ path: '/tmp/diag-postreload.png' }).catch(()=>{});

  await ctx.close().catch(()=>{});
  await browser.close().catch(()=>{});
})().catch(e => { console.error('ERR', e); process.exit(1); });
