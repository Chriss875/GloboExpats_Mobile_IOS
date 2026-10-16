const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ env:{...process.env, LD_LIBRARY_PATH:(process.env.HOME||'/home/devsystemadmin')+'/chromium-libs/usr/lib/x86_64-linux-gnu'},
    args:['--force-color-profile=srgb','--disable-gpu','--use-gl=swiftshader'] });
  const p = await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  const reqs=[];
  p.on('request', r=>{ if(r.url().includes(':8083')) reqs.push(r.url().replace('http://localhost:8083','')); });
  await p.goto('http://localhost:9121/', {waitUntil:'load', timeout:90000}).catch(()=>{});
  for(let i=0;i<45;i++){ const t=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')).catch(()=>''); if(t.includes('GloboExpats')) break; await new Promise(r=>setTimeout(r,1000)); }
  reqs.length=0;
  await p.evaluate(()=>{ window.location.hash = '#/product/827'; });
  await new Promise(r=>setTimeout(r,9000));
  console.log('REQS:', JSON.stringify(reqs.filter(u=>!u.includes('/uploads/')),null,1));
  // count rail cards by matching product-name pattern nodes that are tappable
  const cards = await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('flt-semantics[flt-tappable]').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(/^(AU049|AU048R)/.test(t) && /TSh/.test(t)) out.push(t.split('\n')[0]);
    });
    return out;
  });
  console.log('RAIL_CARD_COUNT:', cards.length);
  console.log('RAIL_CARDS:', JSON.stringify(cards,null,1));
  await b.close();
})();
