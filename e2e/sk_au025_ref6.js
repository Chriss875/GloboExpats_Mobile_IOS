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
 // Buy now goes straight to checkout with the item
 await p.goto('http://localhost:3010/product/'+fx.productId,{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
 await sleep(5000);
 const buyBtn=p.locator('button',{hasText:/^buy now$/i}).first();
 console.log('buy-now-count:',await buyBtn.count());
 if(await buyBtn.count()){ await buyBtn.click({force:true}).catch(e=>console.log('buy-err')); }
 for(let i=0;i<12;i++){ await sleep(1500); const u=p.url(); if(/checkout|cart/.test(u)) break; }
 console.log('after-buy-url:',p.url());
 await sleep(5000);
 const ctext=await p.evaluate(()=>document.body.innerText).catch(()=>'');
 fs.writeFileSync('/tmp/au025_sk_ref_checkout.txt',ctext);
 await L.screenshot(p,'e2e/shots/AU-025-ref/sk-ref-checkout-mobile.png');
 console.log('REF-CHECKOUT:',ctext.slice(0,2200).replace(/\n+/g,'|'));
 await ctx.close(); await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
