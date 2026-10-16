// Attack 9 CONTROLLED: fresh context -> control detail -> exactly ONE Add to cart ->
// read cart screen -> Buy now -> read Order Summary line qty.
const { L, APP, FX, SHOT, rec, gotoProduct, tapButton } = require('./au018_sk_lib.js');
(async () => {
  const b=await L.newBrowser();
  const p=await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  await L.login(p,L.BUYER);
  // confirm cart empty first
  await p.evaluate(()=>{window.location.hash='/cart';}); await p.waitForTimeout(2200);
  const tCart0=await L.allText(p);
  console.log('cart before:', tCart0.replace(/\n/g,' | ').slice(0,120));
  await gotoProduct(p,FX.controlId,'Other Seller Control Rug');
  const d=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].filter(e=>/Quantity|available/.test(e.textContent||'')).map(e=>e.textContent.trim()).slice(0,3));
  console.log('quantity readout:', JSON.stringify(d));
  const tapped=await tapButton(p,'Add to cart');
  console.log('add tapped:',tapped);
  await p.waitForTimeout(1000);
  await p.evaluate(()=>{window.location.hash='/cart';}); await p.waitForTimeout(2400);
  const tCart1=await L.allText(p);
  console.log('cart after ONE add:', tCart1.replace(/\n/g,' | ').slice(0,180));
  rec({ attack:'single_add_cart_qty', target:'exactly one Add to cart on control',
        result:'RECORDED', observed:`cartBefore="${tCart0.slice(0,60)}" cartAfterOneAdd="${tCart1.slice(0,140)}"` });
  // now Buy now
  await p.evaluate(h=>{window.location.hash=h;},'/product/'+FX.controlId); await p.waitForTimeout(3500);
  await tapButton(p,'Buy now'); await p.waitForTimeout(3200);
  const tCk=await L.allText(p);
  const line=(tCk.match(/Other Seller Control Rug[^|]*×\s*\d+/)||[])[0];
  console.log('checkout line:', line);
  await L.screenshot(p, `${SHOT}/AU-018-375x667-sk-a9d-buynow-after-add.png`);
  rec({ attack:'buynow_overwrite_semantics', target:'Buy now after an existing cart line',
        result:'RECORDED', observed:`checkout line="${line}" (spec: BuyNow overwrites qty to stepper value=1)`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a9d-buynow-after-add.png`] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
