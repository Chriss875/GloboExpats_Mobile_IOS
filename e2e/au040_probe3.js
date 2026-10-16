// au040_probe3.js — can Playwright drive the image_picker file chooser on this
// CanvasKit build, and does the picked photo reach state.images (thumbnail)?
process.chdir(require('path').resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const fs = require('fs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const APP = 'http://localhost:9110';

// 1x1 red PNG, 68 bytes
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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
  return ns.filter(n => n.label.startsWith(prefix)).sort((a,b)=>a.area-b.area)[0] || null;
}
async function tap(p, n, dx=0.5){ await p.mouse.click(n.x + n.w*dx, n.y + n.h/2); await sleep(900); }

(async () => {
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const reqs = [];
  p.on('request', r => { if (/post-product|\/images|update\//.test(r.url())) reqs.push(r.method() + ' ' + r.url()); });

  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(()=>{});
  await L.waitText(p, 'Buy now', 40000);
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(()=>{});
  console.log('login:', await L.login(p, L.ADMIN));
  for (let i=0;i<40;i++){ if ((await L.allText(p)).includes('Sell')) break; await sleep(500); }

  await p.evaluate(() => { location.hash = '#/sell'; });
  for (let i=0;i<50;i++){ if ((await L.allText(p)).includes('Step 1 of 4')) break; await sleep(500); }
  await sleep(1200);

  // fill title
  let box = await p.evaluate(() => { const i=[...document.querySelectorAll('input')].find(x=>x.getAttribute('aria-label')==='Item title *'); if(!i)return null; const r=i.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; });
  await p.mouse.click(box.x, box.y); await sleep(400);
  await p.keyboard.type(`AU040 Probe ${Date.now()}`, { delay: 10 });

  // category Furniture
  let fld = await findNode(p, 'Category *');
  await tap(p, fld); await sleep(1400);
  let opt = (await nodes(p)).filter(n=>n.label==='Furniture'&&n.role==='button')[0];
  await tap(p, opt, 0.16); await sleep(1300);
  // subcategory
  fld = await findNode(p, 'Subcategory *');
  await tap(p, fld); await sleep(1400);
  opt = (await nodes(p)).filter(n=>n.role==='button'&&n.tappy&&n.w>=200&&n.label.length>2&&!/Subcategory/.test(n.label))[0];
  console.log('sub option:', opt && opt.label);
  if (opt) await tap(p, opt, 0.16);

  // address
  await p.mouse.move(187,350); await p.mouse.wheel(0, 800); await sleep(700);
  const addr = await findNode(p, 'Verify Mobile HQ');
  console.log('addr row:', JSON.stringify(addr));
  if (addr) await tap(p, addr, 0.06);

  // Continue → step 2
  const cont = await findNode(p, 'Continue');
  await tap(p, cont); await sleep(1500);
  let T = await L.allText(p);
  console.log('on step2:', T.includes('Up to 50'), '| error:', T.includes('Add at least one photo'));

  // click add-photo tile → file chooser
  const tile = await findNode(p, '');
  // The add-photo tile has NO semantics label; find tappable nodes with no text
  const tiles = (await nodes(p)).filter(n => !n.label && n.tappy && n.w > 60 && n.h > 60);
  console.log('unlabeled tappables:', JSON.stringify(tiles));

  const fcPromise = p.waitForEvent('filechooser', { timeout: 12000 }).catch(()=>null);
  if (tiles.length) await tap(p, tiles[0]);
  const fc = await fcPromise;
  console.log('filechooser fired:', !!fc);
  if (fc) {
    const tmp = '/tmp/au040_photo.png';
    fs.writeFileSync(tmp, Buffer.from(PNG_B64, 'base64'));
    await fc.setFiles([tmp]).catch(e=>console.log('setFiles err', e.message));
    await sleep(4000);
    T = await L.allText(p);
    console.log('after pick — Main Photo visible:', T.includes('Main Photo'));
    await p.screenshot({ path: 'e2e/shots/AU-040/probe3-photo.png' }).catch(()=>{});
    // draft should record imageCount 1
    const draft = await p.evaluate(() => localStorage.getItem('flutter.sell_form_draft'));
    console.log('draft imageCount:', draft ? (JSON.parse(draft).imageCount ?? 'none') : 'no draft');
    // try publish path requests by continuing
    const desc = await p.evaluate(() => { const i=[...document.querySelectorAll('textarea')].find(x=>x.getAttribute('aria-label')==='Description *'); if(!i)return null; const r=i.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; });
    console.log('desc box:', JSON.stringify(desc));
    if (desc) { await p.mouse.click(desc.x, desc.y); await sleep(300); await p.keyboard.type('Probe description for publish.', {delay:6}); }
    await sleep(3600);
    const cont2 = await findNode(p, 'Continue');
    if (cont2) await tap(p, cont2); await sleep(1500);
    T = await L.allText(p);
    console.log('step3 reached (You receive):', T.includes('You receive'));
    console.log('API reqs so far:', JSON.stringify(reqs));
  }
  await ctx.close().catch(()=>{});
  await browser.close().catch(()=>{});
})().catch(e => { console.error('ERR', e); process.exit(1); });
