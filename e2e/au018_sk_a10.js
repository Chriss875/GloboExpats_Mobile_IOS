// Attack 10: WEB REFERENCE behavior probe — does :3000 Buy-Now ALSO merge (x2) when the
// line already exists? If yes, mobile x2 is parity => HELD. Structural probe on the ref's
// own dataset (no dev writes): use its own product + its own guest/localStorage cart.
const { L, rec, SHOT } = require('./au018_sk_lib.js');
const REF='http://localhost:3000';
(async () => {
  const b=await L.newBrowser();
  const p=await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  await p.goto(REF+'/',{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
  await p.waitForTimeout(4000);
  // find any product link
  const href=await p.evaluate(()=>{ const a=[...document.querySelectorAll('a[href*="/product/"]')]; return a.length?a[0].getAttribute('href'):null; });
  console.log('ref product link:', href);
  if(!href){ rec({attack:'web_reference_buynow',target:'probe',result:'BLOCKED',observed:'no product links rendered'}); process.exit(0); }
  await p.goto(REF+href,{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
  await p.waitForTimeout(4000);
  // click Add to cart then Buy now, reading localStorage expatCartItems
  const readCart=()=>p.evaluate(()=>{ for(const k of Object.keys(localStorage)) if(/cart/i.test(k)) return k+'='+localStorage.getItem(k); return null; });
  const btns=await p.evaluate(()=>[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean).slice(0,20));
  console.log('buttons:',JSON.stringify(btns));
  const addB=p.locator('button',{hasText:/Add to Cart|Add to cart/i}).first();
  const buyB=p.locator('button',{hasText:/Buy now|Buy Now/i}).first();
  let steps=[];
  if(await addB.count()){ await addB.click().catch(()=>{}); await p.waitForTimeout(1500); steps.push('add'); }
  const c1=await readCart();
  if(await buyB.count()){ await buyB.click().catch(()=>{}); await p.waitForTimeout(2000); steps.push('buy'); }
  const c2=await readCart();
  console.log('cart after add:',c1&&c1.slice(0,220));
  console.log('cart after buy:',c2&&c2.slice(0,220));
  await p.screenshot({path:`${SHOT}/AU-018-ref-buynow-merge.png`}).catch(()=>{});
  rec({ attack:'web_reference_buynow_merge', target:`${href} add->buy cart merge on :3000`,
        result:'RECORDED',
        observed:`steps=${steps}; cartAfterAdd=${c1?c1.slice(0,160):'none'}; cartAfterBuy=${c2?c2.slice(0,200):'none'}`,
        evidence:[`shots/AU-018/AU-018-ref-buynow-merge.png`] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
