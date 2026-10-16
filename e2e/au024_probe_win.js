// au024_probe_win.js — diagnose window-row click on step 2 (SD leg).
const fs = require('fs'); const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9113';
const fx = JSON.parse(fs.readFileSync('/tmp/au024_fixtures.json', 'utf8'));
const PROBE = `AU024 Enum Probe Chair ${fx.stamp}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function txt(p){ return p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')).catch(()=>''); }
async function rows(p){ return p.evaluate(()=>{
  return [...document.querySelectorAll('flt-semantics')]
   .filter(e=>e.getAttribute('role')==='checkbox')
   .map(e=>{const r=e.getBoundingClientRect();return {al:(e.getAttribute('aria-label')||'').split('\n')[0],checked:e.getAttribute('aria-checked'),x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),w:r.width,h:r.height};});
}).catch(()=>[]);}
(async()=>{
 const b=await L.newBrowser(); const ctx=await L.newCtx(b,{viewport:{width:375,height:667}});
 const p=await ctx.newPage();
 await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
 await L.waitText(p,'Buy now',45000);
 if(!(await p.evaluate(()=>localStorage.getItem('flutter.auth_token')))){
   await L.clickBtn(p,'Login'); await L.waitText(p,'Welcome back',25000);
   const ei=p.locator('input[type="text"]').first(); await ei.click({force:true}); await sleep(400);
   await p.keyboard.type(fx.buyer.email,{delay:15});
   const pi=p.locator('input[type="password"]').first(); await pi.click({force:true}); await sleep(400);
   await p.keyboard.type(fx.buyer.pw,{delay:15});
   await L.clickBtn(p,'Log in');
   for(let i=0;i<30;i++){ if(await p.evaluate(()=>!!localStorage.getItem('flutter.auth_token'))) break; await sleep(1000);} }
 // cart + checkout
 await p.evaluate(()=>{Object.keys(localStorage).filter(k=>/expatCartItems/.test(k)).forEach(k=>localStorage.removeItem(k));});
 await p.goto(APP+'/#/search',{waitUntil:'load'}).catch(()=>{}); await sleep(2500);
 await L.waitText(p,"Search",20000); const si=p.locator('input[type="text"]').first(); await si.click({force:true}).catch(()=>{}); await sleep(600);
 await p.keyboard.type(PROBE,{delay:20}); await sleep(1200); await p.keyboard.press('Enter'); await sleep(3000);
 await L.clickCard(p,PROBE); await sleep(2800);
 await L.clickBtn(p,'Add to cart'); await sleep(1800);
 await p.goto(APP+'/#/cart',{waitUntil:'load'}).catch(()=>{}); await sleep(2200);
 await L.clickBtn(p,'Go to checkout'); await sleep(2500);
 const inp=p.locator('input[type="text"]'); const n=await inp.count();
 await inp.nth(Math.max(0,n-1)).click({force:true}); await sleep(400);
 await p.keyboard.type('+255713000444',{delay:15});
 await p.mouse.move(187,400); for(let i=0;i<10;i++){await p.mouse.wheel(0,250); await sleep(140);} await sleep(700);
 console.log('radios before:', JSON.stringify(await rows(p).then(r=>r.slice(0,2))));
 await L.clickBtn(p,'Continue to review'); 
 for(let i=0;i<25;i++){ await sleep(1000); if((await txt(p)).includes('Step 2 of 4')) break; }
 await sleep(3000);
 let rs = await rows(p);
 console.log('ALL checkboxes at review (before scroll):', JSON.stringify(rs));
 await p.mouse.move(187,330); await p.mouse.wheel(0,260); await sleep(900);
 rs = await rows(p);
 console.log('after wheel+260:', JSON.stringify(rs));
 for (const r of rs.filter(x=>x.al.startsWith('Today')||x.al.startsWith('Tomorrow'))) {
   await p.mouse.click(r.x, Math.min(Math.max(r.y,30),640)); await sleep(1100);
   const after=await rows(p); const me=after.find(z=>z.al===r.al);
   console.log(`click "${r.al}" @(${r.x},${r.y}) -> aria-checked=${me?me.checked:'GONE'} allChecked=${after.filter(z=>z.checked==='true').length}`);
 }
 await ctx.close(); await b.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
