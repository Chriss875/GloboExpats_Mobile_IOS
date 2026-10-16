// au040_probe.js — map the live wizard DOM on frozen bundle :9110 (56ba3fc).
const fs = require('fs');
process.chdir(require('path').resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const APP = 'http://localhost:9110';

async function dump(p, tag) {
  const d = await p.evaluate(() => {
    const inputs = [...document.querySelectorAll('input,textarea')].map(i => ({
      type: i.type, label: i.getAttribute('aria-label'), value: i.value,
      placeholder: i.placeholder || null,
    }));
    const ctrls = [];
    document.querySelectorAll('flt-semantics').forEach(e => {
      const role = e.getAttribute('role');
      const tappy = e.getAttribute('flt-tappable') !== null;
      if (!role && !tappy) return;
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      ctrls.push({ role: role || 'tappable', label: (e.textContent || '').trim().slice(0, 60),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
    });
    return { inputs, ctrls, ls: Object.keys(localStorage).sort(),
      draft: localStorage.getItem('flutter.sell_form_draft'),
      token: !!(localStorage.getItem('flutter.auth_token')) };
  });
  console.log(`\n===== ${tag} =====`);
  console.log('inputs:', JSON.stringify(d.inputs));
  console.log('draftKey present:', !!d.draft, '| keys:', d.ls.join(','));
  console.log('controls:');
  d.ctrls.sort((a,b)=>a.y-b.y).forEach(c => console.log(`  [${c.role}] (${c.x},${c.y} ${c.w}x${c.h}) ${c.label}`));
  return d;
}

(async () => {
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();

  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(()=>{});
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'load', timeout: 90000 }).catch(()=>{});
  await L.waitText(p, 'Buy now', 40000);
  const logged = await L.login(p, L.ADMIN);
  console.log('login:', logged);
  for (let i=0;i<30 && !(await L.allText(p)).includes('Sell');i++) await sleep(500);

  await p.evaluate(() => { location.hash = '#/sell'; });
  for (let i=0;i<40;i++){ const t = await L.allText(p); if (t.includes('Details')) break; await sleep(500); }
  await sleep(1500);
  await dump(p, 'step1-fresh');

  // tap Category dropdown
  const catY = await p.evaluate(() => {
    let hit=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||''); const r=e.getBoundingClientRect();
      if(t.includes('Category *') && r.width>50){ if(!hit||r.width*r.height<hit.a) hit={a:r.width*r.height,x:r.x+r.width/2,y:r.y+r.height/2}; }
    });
    return hit?{x:Math.round(hit.x),y:Math.round(hit.y)}:null;
  });
  console.log('\ncategory rect:', JSON.stringify(catY));
  if (catY) { await p.mouse.click(catY.x, catY.y); await sleep(1600); }
  const opts = await p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .filter(e=>e.getAttribute('role')==='option'||e.getAttribute('role')==='menuitem')
    .map(e=>({label:(e.textContent||'').trim().slice(0,40), r:e.getBoundingClientRect()}))
    .filter(o=>o.r.width>5&&o.r.bottom>0&&o.r.top<innerHeight)
    .map(o=>({label:o.label,y:Math.round(o.r.y+r0(o.r))})));
  function r0(r){ return r.height/2; }
  console.log('options after open:', JSON.stringify(opts));
  fs.writeFileSync('/tmp/au040_probe.json', JSON.stringify({opts}));
  await p.screenshot({ path: 'e2e/shots/AU-040/probe-dropdown.png' }).catch(()=>{});

  await ctx.close().catch(()=>{});
  await browser.close().catch(()=>{});
})().catch(e => { console.error('PROBE-ERR', e); process.exit(1); });
