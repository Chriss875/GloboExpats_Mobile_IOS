// Attack 9 CLEAN RUN: fresh browser context (fresh storage) -> confirm empty cart ->
// single add -> buy now. Decides whether merge-to-2 is real app behavior (parity with web)
// or contamination from the earlier leg.
const { L, APP, FX, SHOT, rec, gotoProduct, tapButton } = require('./au018_sk_lib.js');
(async () => {
  const b=await L.newBrowser();
  const ctx=await b.newContext({viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  const okLogin=await L.login(p,L.BUYER);
  await p.evaluate(()=>{window.location.hash='/cart';}); await p.waitForTimeout(2500);
  const t0=await L.allText(p);
  const cartEmpty=t0.includes('your cart is empty')||/\(0\)/.test(t0);
  console.log('login',okLogin,'cartEmpty=',cartEmpty, '|', t0.slice(0,80).replace(/\n/g,' '));
  if(!cartEmpty){
    // clear it via UI to make the run decisive
    const clr=p.locator('flt-semantics[role="button"]').filter({hasText:'Clear all items'}).first();
    await clr.click({force:true}).catch(()=>{});
    await p.waitForTimeout(800);
    // confirm dialog? click confirm if present
    const conf=p.locator('flt-semantics[role="button"]').filter({hasText:/Clear|Confirm|Yes/i}).first();
    await conf.click({force:true}).catch(()=>{});
    await p.waitForTimeout(1500);
    const t1=await L.allText(p);
    console.log('after clear:', t1.slice(0,90).replace(/\n/g,' '));
  }
  await gotoProduct(p,FX.controlId,'Other Seller Control Rug');
  await tapButton(p,'Add to cart'); await p.waitForTimeout(900);   // qty 1
  await p.evaluate(()=>{window.location.hash='/cart';}); await p.waitForTimeout(2200);
  const tCart=(await L.allText(p)).replace(/\n/g,' ');
  const cartQty=(tCart.match(/Cart\s*\((\d+)\s*items?\)/i)||[])[1];
  console.log('cart after one add:',cartQty, tCart.slice(0,100));
  // Buy now
  await p.evaluate(h=>{window.location.hash=h;},'/product/'+FX.controlId); await p.waitForTimeout(3200);
  await tapButton(p,'Buy now'); await p.waitForTimeout(3200);
  const tCk=await L.allText(p);
  const lineQty=(tCk.match(/Other Seller Control Rug[^×]*×\s*(\d+)/)||[])[1];
  console.log('checkout line qty after BuyNow from cart-of-',cartQty,'=>',lineQty);
  rec({ attack:'buynow_merge_semantics_clean', target:'clean-cart: add(1) then Buy now',
        result:'RECORDED',
        observed:`cartEmptyAtStart=${cartEmpty}; cartAfterAdd=${cartQty} item(s); checkout line qty after BuyNow=${lineQty}. Web parity reference: addToCart(item, qty) default overwriteQuantity=false => increments.`,
        evidence:[`a11y text`] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
