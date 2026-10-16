const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ env:{...process.env, LD_LIBRARY_PATH:(process.env.HOME||'/home/devsystemadmin')+'/chromium-libs/usr/lib/x86_64-linux-gnu'},
    args:['--force-color-profile=srgb','--disable-gpu','--use-gl=swiftshader'] });
  const p = await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  const reqs=[];
  p.on('request', r=>{ if(r.url().includes(':8083')) reqs.push(r.url()); });
  p.on('response', r=>{ if(/\/uploads\/|\/assets\//.test(r.url())) console.log('IMG', r.status(), r.url().slice(0,110)); });
  await p.goto('http://localhost:9121/', {waitUntil:'load', timeout:90000}).catch(()=>{});
  for(let i=0;i<45;i++){ const t=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')).catch(()=>''); if(t.includes('GloboExpats')) break; await new Promise(r=>setTimeout(r,1000)); }
  reqs.length=0;
  await p.evaluate(()=>{ window.location.hash = '#/product/827'; });
  await new Promise(r=>setTimeout(r,8000));
  const t1 = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n'));
  console.log('=== DETAIL TEXT ==='); console.log(t1);
  console.log('=== API CALLS after hash ===');
  reqs.forEach(u=>console.log(u.replace('http://localhost:8083','')));
  // rail card labels
  const cards = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics[flt-tappable]')].map(e=>(e.textContent||'').trim()).filter(t=>t.includes('AU049')||t.includes('Probe Widget')));
  console.log('=== RAIL CARDS ==='); console.log(JSON.stringify(cards,null,1));
  await b.close();
})();
