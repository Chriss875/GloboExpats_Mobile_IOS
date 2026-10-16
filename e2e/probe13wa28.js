// 375x667 anon: WA row click -> activeElement + snackbar + popup all tracked
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(20000);
  const seen=[]; c.on('page', np=>seen.push(np.url()));
  await p.goto('http://localhost:9108/#/product/627',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Fixture WhatsApp Contact Phone Listing',25000); await p.waitForTimeout(2000);
  await p.mouse.move(187,300); await p.mouse.wheel(0,600); await p.waitForTimeout(800);
  const hit=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const t=(e.textContent||'').trim(); if(!t.startsWith('WhatsApp seller')) return;
      const r=e.getBoundingClientRect(); if(r.bottom<0||r.top>innerHeight) return;
      best={cx:r.x+r.width/2,cy:r.y+r.height/2,id:e.id};}); return best;});
  console.log('tap',JSON.stringify(hit));
  await p.mouse.click(Math.round(hit.cx),Math.round(hit.cy));
  let snack=null;
  for(let i=0;i<40;i++){
    await p.waitForTimeout(250);
    const t=await p.evaluate(()=>({ae:(document.activeElement&&(document.activeElement.textContent||'').slice(0,40))||null,
      txt:[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('|')}));
    if(/Could not open WhatsApp/i.test(t.txt)){snack='Could not open WhatsApp';break;}
    if(seen.length) break;
    if(i===8) console.log('mid activeElement:',JSON.stringify(t.ae));
  }
  console.log('anon375 popups=',JSON.stringify(seen),'snackbar=',snack);
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
