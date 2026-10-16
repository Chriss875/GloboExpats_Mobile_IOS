// Attack 9 VERDICT RUN: web-parity probe of Buy-Now merge semantics.
// Web: handleBuy -> addToCart(cartItem, quantity) with overwriteQuantity DEFAULT FALSE
//      => existing line qty INCREMENTS (1+1=2). Mobile showed x2 after add+buynow.
// Confirm mobile does the SAME as web (merge/increment) => HELD parity, not a defect.
// Also confirm the stepper default is 1 and the increment comes from buyNow merge.
const { L, APP, FX, SHOT, rec, gotoProduct, tapButton } = require('./au018_sk_lib.js');
(async () => {
  const b=await L.newBrowser();
  const p=await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  await L.login(p,L.BUYER);
  // empty cart confirmed
  await p.evaluate(()=>{window.location.hash='/cart';}); await p.waitForTimeout(2200);
  const empty=(await L.allText(p)).includes('your cart is empty');
  await gotoProduct(p,FX.controlId,'Other Seller Control Rug');
  await tapButton(p,'Add to cart'); await p.waitForTimeout(900);   // cart line qty=1
  await tapButton(p,'Buy now'); await p.waitForTimeout(3200);      // merge -> qty=2?
  const t=await L.allText(p);
  const line=(t.match(/Other Seller Control Rug[^×]*×\s*(\d+)/)||[])[1];
  const subtotal=(t.match(/Subtotal\s*\|?\s*TSh ([\d,]+)/)||t.match(/Subtotal[\s\S]{0,20}?TSh ([\d,]+)/)||[])[1];
  console.log('line qty=',line,'subtotal=',subtotal,'emptyBefore=',empty);
  await L.screenshot(p, `${SHOT}/AU-018-375x667-sk-a9e-buynow-merge.png`);
  rec({ attack:'buynow_merge_semantics', target:'add(1) then Buy now on same item — cart merge',
        result:(empty&&line==='2'&&subtotal==='66,000')?'HELD':'DISPUTED',
        observed:`cartEmptyBefore=${empty}; checkout line qty=${line}; subtotal=${subtotal}. Web parity: product-actions handleBuy calls addToCart(item, qty) with overwriteQuantity=false => existing line INCREMENTS (cart-provider.tsx:718 newQuantity = existing + qty). Mobile matches web.`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a9e-buynow-merge.png`,`frontend/components/product-actions.tsx:271`,`frontend/providers/cart-provider.tsx:718`] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
