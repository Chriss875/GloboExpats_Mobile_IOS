// 375x667: WA row click with CDP Input.dispatchMouseEvent (raw, bypasses Playwright)
const { chromium } = require('playwright');
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(20000);
  const cdp = await c.newCDPSession(p);
  await p.goto('http://localhost:9108/#/product/627',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Fixture WhatsApp Contact Phone Listing',25000); await p.waitForTimeout(2000);
  await p.mouse.move(187,300); await p.mouse.wheel(0,600); await p.waitForTimeout(800);
  const seen=[]; c.on('page', np=>seen.push(np.url()));
  const hit=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const t=(e.textContent||'').trim(); if(!t.startsWith('WhatsApp seller')) return;
      const r=e.getBoundingClientRect(); if(r.bottom<0||r.top>innerHeight) return;
      best={cx:r.x+r.width/2,cy:r.y+r.height/2};}); return best;});
  console.log('tap',JSON.stringify(hit));
  // raw CDP events
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:hit.cx,y:hit.cy,button:'left',clickCount:1});
  await p.waitForTimeout(90);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:hit.cx,y:hit.cy,button:'left',clickCount:1});
  for(let i=0;i<30;i++){ await p.waitForTimeout(400); if(seen.length) break; }
  console.log('cdp popups=',JSON.stringify(seen));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
