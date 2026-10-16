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
 // real UI add: Buy now navigates to /checkout?buyNow=<id> per web app — try direct
 for (const u of ['http://localhost:3010/checkout?buyNow='+fx.productId,'http://localhost:3010/cart?add='+fx.productId]) {
  await p.goto(u,{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
  await sleep(5000);
  const t=await p.evaluate(()=>document.body.innerText).catch(()=>'');
  console.log('URL',u.slice(21),'->',t.slice(0,150).replace(/\n+/g,'|'));
 }
 // fallback: click Buy now via JS dispatch (scroll into view first)
 await p.goto('http://localhost:3010/product/'+fx.productId,{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
 await sleep(4500);
 const clicked=await p.evaluate(()=>{const bs=[...document.querySelectorAll('button')];const b=bs.find(x=>/^buy now$/i.test((x.innerText||'').trim()));if(!b)return false;b.scrollIntoView({block:'center'});b.click();return true;});
 console.log('js-click-buy-now:',clicked);
 for(let i=0;i<10;i++){ await sleep(1200); if(/checkout/.test(p.url())) break; }
 console.log('url-after-buy:',p.url());
 await sleep(6000);
 const ctext=await p.evaluate(()=>document.body.innerText).catch(()=>'');
 fs.writeFileSync('/tmp/au025_sk_ref_checkout.txt',ctext);
 await L.screenshot(p,'e2e/shots/AU-025-ref/sk-ref-checkout-mobile.png');
 console.log('REF-CHECKOUT:',ctext.slice(0,2200).replace(/\n+/g,'|'));
 await ctx.close(); await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
