// 375x667 anon: control test 2 — tap the APP BAR 'Share' icon button (role=button,
// top-level, definitely wired to a SnackBar). If the snackbar appears, taps work
// on role=button nodes generally; if not, ALL taps on this page are dead.
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(25000);
  await p.goto('http://localhost:9108/#/product/627',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Fixture WhatsApp Contact Phone Listing',25000); await p.waitForTimeout(2000);
  const share=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if((e.textContent||'').trim()!=='Share') return;   // tooltip label? may be empty
      const r=e.getBoundingClientRect();
      best={cx:r.x+r.width/2,cy:r.y+r.height/2};});
    // fallback: icon-only button at top-right
    if(!best){ document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const r=e.getBoundingClientRect();
      if(r.width<60&&r.height<60&&r.x>innerWidth-80&&r.y<80) best={cx:r.x+r.width/2,cy:r.y+r.height/2};});}
    return best;});
  console.log('share btn:',JSON.stringify(share));
  if(share){
    await p.mouse.click(Math.round(share.cx),Math.round(share.cy));
    for(let i=0;i<10;i++){ await p.waitForTimeout(300);
      const t=await lib.allText(p);
      if(/Share this product/.test(t)){ console.log('SHARE SNACKBAR APPEARED — taps work on this page'); break; }
      if(i===9) console.log('share snackbar NOT seen');
    }
  }
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
