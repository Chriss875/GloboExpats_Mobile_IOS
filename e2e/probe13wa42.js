// 375x667 anon: click a RELATED-RAIL product card (tappable, no role) then the WA row.
// If the rail card tap WORKS (navigation), the pointer pipeline is fine and the WA
// row's onTap is genuinely not firing — a real app bug, not harness noise.
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(25000);
  await p.goto('http://localhost:9108/#/product/627',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Fixture WhatsApp Contact Phone Listing',25000); await p.waitForTimeout(2000);
  await lib.scrollToBottom(p,16); await p.waitForTimeout(900);
  // find a related-rail product card by its price text (TSh …)
  const card=await p.evaluate(()=>{
    let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(/^TSh [\d,]+$/.test(t)&&t.length<20){
        const r=e.getBoundingClientRect();
        if(r.bottom<0||r.top>innerHeight||r.width<40) return;
        if(!best||r.width*r.height<best.w*best.h) best={cx:r.x+r.width/2,cy:r.y+r.height/2,t};
      }});
    return best;});
  console.log('rail card:',JSON.stringify(card));
  if(card){
    await p.mouse.click(Math.round(card.cx),Math.round(card.cy));
    await p.waitForTimeout(2500);
    const t=await lib.allText(p);
    console.log('after rail click url-hash=',await p.evaluate(()=>location.hash),'name-changed=',!t.includes('Fixture WhatsApp Contact Phone Listing'));
  }
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
