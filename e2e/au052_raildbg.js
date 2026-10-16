const { chromium } = require('playwright');
const L = require('./lib_verify.js');
(async () => {
  const b = await L.newBrowser();
  const p = await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  const txt=()=>p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n'));
  await p.goto('http://localhost:9121/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  for(let i=0;i<60;i++){ if((await txt().catch(()=>'')).includes('GloboExpats')) break; await p.waitForTimeout(1000);} 
  await p.evaluate(()=>{window.location.hash='#/product/827';});
  for(let i=0;i<30;i++){ if((await txt()).includes('You Might Also Like')) break; await p.waitForTimeout(700);}
  // scroll like scrollToRail
  for(let i=0;i<20;i++){
    const pos=await p.evaluate(()=>{let yy=null;document.querySelectorAll('flt-semantics').forEach(e=>{if(yy===null&&(e.textContent||'').includes('You Might Also Like')){const r=e.getBoundingClientRect();if(r.height>0&&r.y>0)yy=r.y;}});return yy;});
    if(pos!==null&&pos<300) break;
    await p.mouse.move(190,400); await p.mouse.wheel(0,260); await p.waitForTimeout(200);
  }
  await p.waitForTimeout(800);
  const dump = await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const r=e.getBoundingClientRect();
      out.push({tap:e.getAttribute('flt-tappable'),role:e.getAttribute('role'),t:(e.textContent||'').trim().slice(0,40),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width)});
    });
    return out.filter(o=>o.t.includes('AU04')||o.tap!==null);
  });
  console.log(JSON.stringify(dump.slice(0,30),null,1));
  await b.close();
})();
