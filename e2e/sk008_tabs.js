// Bottom-nav tab probes (Requests tab = AU-056, Account tab = AU-058) + product real-data
const L=require('./lib_verify.js');
const APP='http://localhost:9131';
const fs=require('fs');
const OUT=process.env.OUTSHARD||'/tmp/sk008_tabs.jsonl';
function rec(o){o.ts=new Date().toISOString();o.unit='AU-008';o.wave='skeptic';o.stage='skeptic-r12';o.build_sha='c6b4d61';fs.appendFileSync(OUT,JSON.stringify(o)+'\n');console.log(JSON.stringify(o).slice(0,500));}
(async()=>{
 const b=await L.newBrowser();
 for(const vp of [{w:375,h:667,name:'375'},{w:768,h:1024,name:'768'}]){
  const ctx=await b.newContext({viewport:{width:vp.w,height:vp.h}});
  const p=await ctx.newPage();
  await p.goto(APP+'/',{waitUntil:'load'});
  await L.waitText(p,'expat marketplace',30000); await p.waitForTimeout(6000);
  // Requests TAB (index 3)
  const tabs=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics[role="button"]')].map(e=>e.textContent.trim()));
  await p.evaluate(()=>{window.location.hash='#/browse';}); await p.waitForTimeout(2500);
  // click bottom nav via semantics label
  const reqOk=await L.clickBtn(p,'Tab 4 of 5') || await L.clickBtn(p,'Requests');
  await p.waitForTimeout(3500);
  let t=(await L.allText(p)).replace(/\s+/g,' ');
  const reqText=t.slice(0,220);
  rec({probe:'AU-056 requests-tab', viewport:vp.w+'x'+vp.h, pass:t.length>150 && !t.includes('Page not found'), excerpt:reqText});
  await L.screenshot(p,`e2e/shots/AU-008/AU-008-sk2-${vp.name}-requests-tab.png`);
  // Account TAB (index 4)
  const accOk=await L.clickBtn(p,'Tab 5 of 5') || await L.clickBtn(p,'Account');
  await p.waitForTimeout(3000);
  t=(await L.allText(p)).replace(/\s+/g,' ');
  rec({probe:'AU-058 account-tab', viewport:vp.w+'x'+vp.h, pass:/Log in|Account/.test(t), excerpt:t.slice(0,200)});
  await L.screenshot(p,`e2e/shots/AU-008/AU-008-sk2-${vp.name}-account-tab.png`);
  // Notifications route (correct path)
  await p.evaluate(()=>{window.location.hash='#/notifications';}); await p.waitForTimeout(3000);
  t=(await L.allText(p)).replace(/\s+/g,' ');
  rec({probe:'AU-058 notifications-route', viewport:vp.w+'x'+vp.h, pass:!t.includes('Page not found'), excerpt:t.slice(0,200)});
  await L.screenshot(p,`e2e/shots/AU-008/AU-008-sk2-${vp.name}-notifications.png`);
  // Product detail with REAL product id from API
  await p.evaluate(()=>{window.location.hash='#/product/170';}); await p.waitForTimeout(4000);
  t=(await L.allText(p)).replace(/\s+/g,' ');
  rec({probe:'AU-000-realdata product170', viewport:vp.w+'x'+vp.h,
       pass: t.includes('Balanced Minds') || t.includes('TSh'),
       excerpt:t.slice(0,260), apiEntity:'GET /displayItem/featured => productId=170 "Balanced Minds: Modern Thinker Sculpture"'});
  await L.screenshot(p,`e2e/shots/AU-008/AU-008-sk2-${vp.name}-product170.png`);
  await ctx.close();
 }
 await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
