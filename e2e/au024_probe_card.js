// probe: enumerate search-result tappables + try tap paths
const fs=require('fs');const path=require('path');
process.chdir(path.resolve(__dirname,'..'));
const L=require('./lib_verify.js');
const APP='http://localhost:9113';
const fx=JSON.parse(fs.readFileSync('/tmp/au024_fixtures.json','utf8'));
const PROBE=`AU024 Enum Probe Chair ${fx.stamp}`;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function txt(p){return p.evaluate(()=>document.body.innerText||'').then(t=>t.trim()?t:p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n'))).catch(()=>'');}
(async()=>{
 const b=await L.newBrowser();const ctx=await L.newCtx(b,{viewport:{width:375,height:667}});
 const p=await ctx.newPage();
 await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
 await L.waitText(p,'Buy now',45000);
 if(!(await p.evaluate(()=>!!localStorage.getItem('flutter.auth_token')))){
  await L.clickBtn(p,'Login');await L.waitText(p,'Welcome back',25000);
  const ei=p.locator('input[type="text"]').first();await ei.click({force:true});await sleep(400);
  await p.keyboard.type(fx.buyer.email,{delay:15});
  const pi=p.locator('input[type="password"]').first();await pi.click({force:true});await sleep(400);
  await p.keyboard.type(fx.buyer.pw,{delay:15});await L.clickBtn(p,'Log in');
  for(let i=0;i<30;i++){if(await p.evaluate(()=>!!localStorage.getItem('flutter.auth_token')))break;await sleep(1000);}}
 await sleep(1000);
 await p.goto(APP+'/#/search',{waitUntil:'load'}).catch(()=>{});await sleep(3200);
 const si=p.locator('input[type="text"]').first();await si.click({force:true}).catch(()=>{});await sleep(600);
 await p.keyboard.insertText('AU024 Enum Probe');await sleep(2000);
 await p.keyboard.press('Enter');await sleep(3500);
 // enumerate ALL semantics nodes containing the probe text with their attributes
 const nodes=await p.evaluate((lbl)=>{
   const out=[];
   document.querySelectorAll('flt-semantics').forEach(e=>{
     const t=(e.textContent||'').trim();
     if(!t.includes(lbl.slice(0,20)))return;
     const r=e.getBoundingClientRect();
     out.push({tag:e.tagName,role:e.getAttribute('role'),tappable:e.getAttribute('flt-tappable'),
       txt:t.slice(0,50),w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y)});});
   return out;},PROBE).catch(()=>[]);
 console.log(JSON.stringify(nodes,null,1));
 // click the smallest node by coordinates
 let T=await txt(p);
 const small=nodes.filter(n=>n.w>40&&n.h>40).sort((a,b)=>a.w*a.h-b.w*b.h)[0];
 console.log('clicking smallest:',small&&JSON.stringify(small));
 if(small){await p.mouse.click(small.x+Math.min(small.w/2,60),Math.min(small.y+small.h/2,660));await sleep(3200);}
 T=await txt(p);
 console.log('after tap:',T.slice(0,120).replace(/\n/g,'|'));
 await ctx.close();await b.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
