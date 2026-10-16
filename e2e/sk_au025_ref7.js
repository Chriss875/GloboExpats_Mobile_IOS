const L=require('./lib_verify.js');const fs=require('fs');
const fx=JSON.parse(fs.readFileSync('/tmp/au025_fixtures.json','utf8'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await L.newBrowser();
 const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
 const p=await ctx.newPage();
 p.setDefaultTimeout(15000);
 await p.goto('http://localhost:3010/login',{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
 await sleep(2500);
 await p.locator('input[name=email]').first().fill(fx.buyer.email,{timeout:10000});
 await p.locator('input[name=password]').first().fill(fx.buyer.pw,{timeout:10000});
 await Promise.all([p.waitForNavigation({waitUntil:'domcontentloaded',timeout:20000}).catch(()=>{}),p.locator('button',{hasText:/sign in/i}).first().click({force:true})]);
 await sleep(3000);
 // cart via localStorage using the web provider's own key, mirroring AU-025 fixture line
 await p.goto('http://localhost:3010/',{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
 await sleep(2500);
 const seeded = await p.evaluate((pid)=>{ 
   localStorage.setItem('expat_cart_items', JSON.stringify([{productId:pid,quantity:1,price:25000,name:'AU025 Quote Probe Table',expatName:'AU025 Seller',image:''}]));
   return localStorage.getItem('expat_cart_items'); }, fx.productId).catch(e=>'err:'+e.message);
 console.log('seed-cart:',(seeded||'').slice(0,80));
 // discover actual keys used
 const keys=await p.evaluate(()=>Object.keys(localStorage));
 console.log('ls-keys:',JSON.stringify(keys));
 await p.goto('http://localhost:3010/cart',{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
 await sleep(4000);
 const carttext=await p.evaluate(()=>document.body.innerText).catch(()=>'');
 console.log('CART:',carttext.slice(0,400).replace(/\n+/g,'|'));
 await L.screenshot(p,'e2e/shots/AU-025-ref/sk-ref-cart.png');
 await ctx.close(); await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
