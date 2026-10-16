// 375x667: WA row — click and check whether the row node's flt-semantics gets
// 'flt-tappable' state change / whether a SECOND semantics layer (platform view) exists.
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(20000);
  await p.goto('http://localhost:9108/#/product/627',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Fixture WhatsApp Contact Phone Listing',25000); await p.waitForTimeout(2000);
  await p.mouse.move(187,300); await p.mouse.wheel(0,600); await p.waitForTimeout(800);
  // elementFromPoint at the tap coordinates — what DOM element is on top?
  const top = await p.evaluate(()=>{
    let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const t=(e.textContent||'').trim(); if(!t.startsWith('WhatsApp seller')) return;
      const r=e.getBoundingClientRect(); if(r.bottom<0||r.top>innerHeight) return;
      best={cx:r.x+r.width/2,cy:r.y+r.height/2};});
    if(!best) return null;
    const el=document.elementFromPoint(best.cx,best.cy);
    return {top: el ? el.tagName+'.'+(el.className||'').toString().slice(0,30) : 'null',
            isRow: el && el.textContent ? el.textContent.startsWith('WhatsApp seller') : false};
  });
  console.log('elementFromPoint:',JSON.stringify(top));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
