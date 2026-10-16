// 375x667 anon: click the WA row and check whether a NEW TAB opened via pages() count
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(20000);
  await p.goto('http://localhost:9108/#/product/627',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Fixture WhatsApp Contact Phone Listing',25000); await p.waitForTimeout(2000);
  await p.mouse.move(187,300); await p.mouse.wheel(0,600); await p.waitForTimeout(800);
  const before = c.pages().length;
  const hit=await p.evaluate(()=>{let best=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const t=(e.textContent||'').trim(); if(!t.startsWith('WhatsApp seller')) return;
      const r=e.getBoundingClientRect(); if(r.bottom<0||r.top>innerHeight) return;
      best={cx:r.x+r.width/2,cy:r.y+r.height/2};}); return best;});
  await p.mouse.click(Math.round(hit.cx),Math.round(hit.cy));
  await p.waitForTimeout(5000);
  const after=c.pages().length;
  console.log('pages before=',before,'after=',after, 'urls=',JSON.stringify(c.pages().map(x=>x.url())));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
