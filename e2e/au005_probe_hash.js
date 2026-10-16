const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ env:{...process.env, LD_LIBRARY_PATH:(process.env.HOME||'/home/devsystemadmin')+'/chromium-libs/usr/lib/x86_64-linux-gnu'},
    args:['--force-color-profile=srgb','--disable-gpu','--use-gl=swiftshader'] });
  const p = await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  await p.goto('http://localhost:9121/', {waitUntil:'load', timeout:90000}).catch(e=>console.log('goto err', e.message));
  const t0 = () => p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n'));
  for (let i=0;i<45;i++){ const t = await t0().catch(()=>''); if (t.includes('GloboExpats')) break; await new Promise(r=>setTimeout(r,1000)); }
  console.log('HOME_TEXT:', (await t0()).slice(0,300).replace(/\n+/g,' | '));
  await p.evaluate(()=>{ window.location.hash = '#/product/338'; }).catch(e=>console.log('hash err', e.message));
  await new Promise(r=>setTimeout(r,6000));
  const t1 = await t0();
  console.log('URL:', p.url());
  console.log('DETAIL_TEXT:', t1.slice(0,500).replace(/\n+/g,' | '));
  await b.close();
})();
