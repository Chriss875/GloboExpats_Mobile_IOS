// r15c part 3: mobile vs ref on the SHARED term 'Lamp' — same-flow parity capture.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ env:{...process.env, LD_LIBRARY_PATH:process.env.HOME+'/chromium-libs/usr/lib/x86_64-linux-gnu'},
    args:['--force-color-profile=srgb','--disable-gpu','--use-gl=swiftshader'] });
  const ctx = await b.newContext({ viewport:{width:375,height:667} });
  const p = await ctx.newPage();
  const reqs = [];
  p.on('request', r => { if (/displayItem\/filter/.test(r.url())) reqs.push('BODY:'+(r.postData()||'').slice(0,160)); });
  await p.goto('http://localhost:9131/#/search?q=Lamp', { waitUntil:'load', timeout:60000 }).catch(()=>{});
  await p.waitForTimeout(9000);
  const txt = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n'));
  const prices = (txt.match(/TSh [\d,]+/g)||[]);
  console.log('MOBILE Lamp prices:', prices.slice(0,8), 'count', prices.length);
  console.log('mobile reqs:', JSON.stringify(reqs.slice(0,2)));
  await p.screenshot({ path:'/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-048/AU-048-375-r15c-lamp.png' });
  await b.close();
})();
