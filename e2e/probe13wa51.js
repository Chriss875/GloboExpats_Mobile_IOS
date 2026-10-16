// 375x667 home: FAB — click and dump ALL text immediately after (snackbar check, wide window)
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(25000);
  await p.goto('http://localhost:9108/#/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Featured',30000).catch(()=>{}); await p.waitForTimeout(2500);
  let snack=null;
  // find the FAB by its semantics LABEL (tooltip 'WhatsApp support' becomes label)
  const fab=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(/WhatsApp support/.test(t)){ const r=e.getBoundingClientRect(); best={cx:r.x+r.width/2,cy:r.y+r.height/2,t:t.slice(0,40)}; }});
    if(!best){ document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const r=e.getBoundingClientRect(); const cx=r.x+r.width/2, cy=r.y+r.height/2;
      if(r.width<80&&r.height<80&&cx>innerWidth-90&&cy>innerHeight-120) best={cx,cy,t:'icon-only'};});}
    return best;});
  console.log('FAB:',JSON.stringify(fab));
  if(fab){ await p.mouse.click(Math.round(fab.cx),Math.round(fab.cy)); }
  for(let i=0;i<16;i++){ await p.waitForTimeout(300);
    const t=await lib.allText(p);
    const m=t.match(/[Aa]bout WhatsApp|WhatsApp support|support: WhatsApp|Could not open/g);
    if(m){ snack=m; break; } }
  console.log('any whatsapp-ish text after tap:',JSON.stringify(snack));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
