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
 await p.goto('http://localhost:3010/product/'+fx.productId,{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
 await sleep(4500);
 await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^buy now$/i.test((x.innerText||'').trim()));if(b){b.scrollIntoView({block:'center'});b.click();}});
 for(let i=0;i<10;i++){ await sleep(1200); if(/checkout/.test(p.url())) break; }
 await sleep(5000);
 // step 1: fill phone + continue to review (SELLER_DELIVERY default)
 const t1=await p.evaluate(()=>document.body.innerText);
 console.log('REF-S1-has-continue:',/Continue to Review/i.test(t1));
 const cont=p.locator('button',{hasText:/Continue to Review/i}).first();
 if(await cont.count()){ await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Continue to Review/i.test((x.innerText||'').trim()));if(b)b.scrollIntoView({block:'center'});}); await cont.click({force:true}).catch(e=>console.log('cont-err')); }
 let review=false; for(let i=0;i<12;i++){ await sleep(1500); const t=await p.evaluate(()=>document.body.innerText); if(/Step\s*2|Review/i.test(t)&&/Delivery fee|fee/i.test(t)) {review=true; break;} }
 await sleep(4000);
 const ctext=await p.evaluate(()=>document.body.innerText).catch(()=>'');
 fs.writeFileSync('/tmp/au025_sk_ref_review.txt',ctext);
 await L.screenshot(p,'e2e/shots/AU-025-ref/sk-ref-review-mobile.png');
 console.log('REF-REVIEW:',ctext.slice(0,2400).replace(/\n+/g,'|'));
 await ctx.close(); await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
