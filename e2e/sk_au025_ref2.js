const L=require('./lib_verify.js');const fs=require('fs');
const fx=JSON.parse(fs.readFileSync('/tmp/au025_fixtures.json','utf8'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await L.newBrowser();
 const ctx=await L.newCtx(browser,{viewport:{width:375,height:667},videoPath:'e2e/videos/AU-025-skeptic-ref.webm'});
 const p=await ctx.newPage();
 // :3010 is the working Next reference proxy to the same sandbox backend (:3000's login 404s)
 await p.goto('http://localhost:3010/login',{waitUntil:'load',timeout:60000}).catch(()=>{});
 await sleep(3000);
 await p.locator('input[name=email]').first().fill(fx.buyer.email);
 await p.locator('input[name=password]').first().fill(fx.buyer.pw);
 await Promise.all([p.waitForNavigation({waitUntil:'load',timeout:30000}).catch(()=>{}),p.locator('button',{hasText:/sign in/i}).first().click({force:true})]);
 await sleep(3500);
 console.log('after-login-url:',p.url());
 const tok=await p.evaluate(()=>localStorage.getItem('expat_auth_token')||'');
 console.log('ref-token-present:',tok.length>20);
 // seed cart via localStorage then go checkout
 await p.goto('http://localhost:3010/product/'+fx.productId,{waitUntil:'load',timeout:60000}).catch(()=>{}); await sleep(4000);
 const dtext=await p.evaluate(()=>document.body.innerText);
 fs.writeFileSync('/tmp/au025_sk_ref_detail.txt',dtext);
 console.log('ref-detail-has-product:',dtext.includes('AU025 Quote Probe Table'),'| add-btn:',/add to cart/i.test(dtext));
 await L.screenshot(p,'e2e/shots/AU-025-ref/sk-ref-detail-mobile.png');
 const btn=p.locator('button',{hasText:/add to cart/i}).first();
 if(await btn.count()){ await btn.click({force:true}); await sleep(2000); }
 await p.goto('http://localhost:3010/checkout',{waitUntil:'load',timeout:60000}).catch(()=>{}); await sleep(7000);
 const ctext=await p.evaluate(()=>document.body.innerText);
 fs.writeFileSync('/tmp/au025_sk_ref_checkout.txt',ctext);
 await L.screenshot(p,'e2e/shots/AU-025-ref/sk-ref-checkout-mobile.png');
 console.log('REF-CHECKOUT:',ctext.slice(0,1800).replace(/\n+/g,'|'));
 await L.closeVideo(ctx,'e2e/videos/AU-025-skeptic-ref.webm');
 await ctx.close(); await browser.close();
})().catch(e=>console.error('FATAL',e.message));
