const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ env:{...process.env, LD_LIBRARY_PATH:(process.env.HOME||'/home/devsystemadmin')+'/chromium-libs/usr/lib/x86_64-linux-gnu'},
    args:['--force-color-profile=srgb','--disable-gpu','--use-gl=swiftshader'] });
  const ctx = await b.newContext({ viewport:{width:375,height:667} });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9131/',{waitUntil:'load',timeout:90000});
  await p.waitForFunction(()=>[...document.querySelectorAll('flt-semantics')].some(e=>(e.textContent||'').includes('Buy now')),{timeout:40000}).catch(()=>{});
  await p.evaluate(()=>{window.location.hash='/browse';});
  await p.waitForTimeout(3500);
  const flt = await p.evaluate(()=>{let best=null;document.querySelectorAll('flt-semantics').forEach(e=>{if((e.textContent||'').trim()!=='Filters')return;if(e.getAttribute('role')!=='button')return;const r=e.getBoundingClientRect();if(!best||r.width*r.height<best.a)best={a:r.width*r.height,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};});return best;});
  console.log('FiltersBtn', JSON.stringify(flt));
  await p.mouse.click(flt.x,flt.y); await p.waitForTimeout(2500);
  const inputs = await p.evaluate(()=>[...document.querySelectorAll('input')].map((i,ix)=>({ix,type:i.type,inputmode:i.getAttribute('inputmode'),aria:i.getAttribute('aria-label'),ph:i.placeholder,
    rect:(()=>{const r=i.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};})()})));
  console.log('INPUTS', JSON.stringify(inputs));
  const condTxt = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>({t:(e.textContent||'').trim(),role:e.getAttribute('role'),tap:e.getAttribute('flt-tappable')})).filter(o=>o.t&&/new|good|fair|poor|like/i.test(o.t)&&o.t.length<22));
  console.log('CONDNODES', JSON.stringify(condTxt));
  await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
