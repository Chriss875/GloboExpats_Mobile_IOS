// 375x667: WA row — click via Playwright locator .click() (real hit-testing path)
const lib=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
(async()=>{
  const b=await lib.newBrowser();
  const c=await b.newContext({viewport:{width:375,height:667}});
  const p=await c.newPage(); p.setDefaultTimeout(20000);
  await p.goto('http://localhost:9108/#/product/627',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await lib.waitText(p,'Fixture WhatsApp Contact Phone Listing',25000); await p.waitForTimeout(2000);
  // scroll the row to middle of viewport using mouse wheel
  await p.mouse.move(187,300); await p.mouse.wheel(0,600); await p.waitForTimeout(800);
  const seen=[]; c.on('page', np=>seen.push(np.url()));
  const loc = p.locator('flt-semantics[role="button"]', { hasText: 'WhatsApp seller' }).first();
  console.log('locator count', await loc.count());
  try { await loc.click({timeout:5000}); console.log('locator click ok'); } catch(e){ console.log('locator click failed', e.message.slice(0,80)); }
  for(let i=0;i<20;i++){ await p.waitForTimeout(500); if(seen.length) break; }
  console.log('locator popups=',JSON.stringify(seen));
  await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
