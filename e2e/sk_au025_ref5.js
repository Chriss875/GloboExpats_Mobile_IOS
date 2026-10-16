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
 // add product to cart from its detail page
 await p.goto('http://localhost:3010/product/'+fx.productId,{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
 await sleep(5000);
 const dtext=await p.evaluate(()=>document.body.innerText).catch(()=>'');
 fs.writeFileSync('/tmp/au025_sk_ref_detail.txt',dtext);
 console.log('detail-has-product:',dtext.includes('AU025 Quote Probe Table'),'| add-to-cart-btn:',/add to cart/i.test(dtext));
 await L.screenshot(p,'e2e/shots/AU-025-ref/sk-ref-detail-mobile.png');
 const btn=p.locator('button',{hasText:/add to cart/i}).first();
 if(await btn.count().catch(()=>0)){ await btn.click({force:true}).catch(()=>{}); await sleep(2500); console.log('clicked add'); }
 await p.goto('http://localhost:3010/checkout',{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
 for(let i=0;i<10;i++){ await sleep(1500); }
 const ctext=await p.evaluate(()=>document.body.innerText).catch(()=>'');
 fs.writeFileSync('/tmp/au025_sk_ref_checkout.txt',ctext);
 await L.screenshot(p,'e2e/shots/AU-025-ref/sk-ref-checkout-mobile.png');
 console.log('REF-CHECKOUT:',ctext.slice(0,2000).replace(/\n+/g,'|'));
 await ctx.close(); await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
