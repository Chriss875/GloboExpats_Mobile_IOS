// au040_probe2.js — inspect the OPEN dropdown menu structure precisely.
process.chdir(require('path').resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const APP = 'http://localhost:9110';

async function nodes(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => {
    const r = e.getBoundingClientRect();
    return { role: e.getAttribute('role'), tag: e.tagName,
      tappy: e.getAttribute('flt-tappable') !== null,
      label: (e.textContent || '').trim().slice(0, 45),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(n => n.w > 5 && n.h > 5 && n.y < innerHeight && n.y + n.h > 0));
}

(async () => {
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(()=>{});
  await L.waitText(p, 'Buy now', 30000);
  console.log('login:', await L.login(p, L.ADMIN));
  await p.evaluate(() => { location.hash = '#/sell'; });
  for (let i=0;i<40;i++){ if ((await L.allText(p)).includes('Details')) break; await sleep(500); }
  await sleep(1200);

  // scroll to top first
  await p.mouse.move(187, 350); await p.mouse.wheel(0, -900); await sleep(600);

  // open Category
  const cat = (await nodes(p)).filter(n => n.label.startsWith('Category *')).pop();
  console.log('cat node:', JSON.stringify(cat));
  await p.mouse.click(cat.x + cat.w / 2, cat.y + cat.h / 2);
  await sleep(1800);
  const ns = await nodes(p);
  console.log('\n--- AFTER OPEN: all nodes ---');
  ns.sort((a,b)=>a.y-b.y).forEach(n => console.log(`[${n.role||n.tag}${n.tappy?'|tap':''}] (${n.x},${n.y} ${n.w}x${n.h}) ${JSON.stringify(n.label)}`));

  // try clicking "Furniture" option
  const opt = ns.filter(n => n.label === 'Furniture' && n.h > 20).sort((a,b)=>a.w-b.w)[0];
  console.log('\nfurniture candidate:', JSON.stringify(opt));
  if (opt) {
    await p.mouse.click(opt.x + Math.min(60, opt.w / 2), opt.y + opt.h / 2);
    await sleep(1500);
    const after = await nodes(p);
    console.log('--- AFTER SELECT ---');
    after.filter(n=>n.label).sort((a,b)=>a.y-b.y).slice(0,14).forEach(n =>
      console.log(`[${n.role||''}${n.tappy?'|tap':''}] (${n.x},${n.y}) ${JSON.stringify(n.label)}`));
    const sub = after.some(n => n.label.includes('Subcategory'));
    console.log('subcategory appeared:', sub);
    const draft = await p.evaluate(() => localStorage.getItem('flutter.sell_form_draft'));
    console.log('draft now:', draft ? draft.slice(0, 220) : null);
  }
  await p.screenshot({ path: 'e2e/shots/AU-040/probe2-after-select.png' }).catch(()=>{});
  await ctx.close().catch(()=>{});
  await browser.close().catch(()=>{});
})().catch(e => { console.error('ERR', e); process.exit(1); });
