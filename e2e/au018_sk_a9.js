// Attack 9 (final gap): mid-flow BACK-OUT from checkout then RE-ENTER via Buy now —
// does the second entry render a clean checkout (no duplicate order summary lines)?
// Plus: Buy now on control with a NON-empty cart containing the SAME item already
// (Buy Now overwrite semantics per BUYER_FLOW_SPEC §3).
const { L, APP, FX, SHOT, rec, a11yDump, toastProbe, tapButton, gotoProduct } = require('./au018_sk_lib.js');
async function cartScreen(p){
  await p.evaluate(()=>{ window.location.hash='/cart'; }); await p.waitForTimeout(2200);
  return await L.allText(p);
}
(async () => {
  const b=await L.newBrowser();
  const p=await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  await L.login(p,L.BUYER);
  // leg 1: add control to cart (qty 1), go to checkout, back out, re-enter
  await gotoProduct(p,FX.controlId,'Other Seller Control Rug');
  await tapButton(p,'Add to cart'); await p.waitForTimeout(900);
  const t1=await L.allText(p);
  // Buy now (overwrite qty semantics) -> checkout
  await tapButton(p,'Buy now'); await p.waitForTimeout(3200);
  const t2=await L.allText(p);
  const inCheckout1=/Order Summary/.test(t2);
  // count occurrences of product line inside Order Summary region
  const occ1=(t2.match(/Other Seller Control Rug/g)||[]).length;
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a9-checkout-entry1.png`});
  // back out
  const back=p.locator('flt-semantics[role="button"]').filter({hasText:'Back'}).first();
  await back.click({force:true}).catch(()=>{}); await p.waitForTimeout(2000);
  // re-enter via Buy now again
  await tapButton(p,'Buy now'); await p.waitForTimeout(3200);
  const t3=await L.allText(p);
  const inCheckout2=/Order Summary/.test(t3);
  const occ2=(t3.match(/Other Seller Control Rug/g)||[]).length;
  const dupLines=/Other Seller Control Rug[\s\S]*Other Seller Control Rug/.test(t3.replace(/Back to Browse/g,''));
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a9-checkout-reentry.png`});
  rec({ attack:'midflow_backout_reenter', target:'add + BuyNow -> Back -> BuyNow again',
        result:(inCheckout1&&inCheckout2&&!dupLines)?'HELD':'DISPUTED',
        observed:`entry1=${inCheckout1} occurrences=${occ1}; reentry=${inCheckout2} occurrences=${occ2}; duplicated-line suspicion=${dupLines}`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a9-checkout-entry1.png`,`shots/AU-018/AU-018-375x667-sk-a9-checkout-reentry.png`] });
  // cart state after all this: should be exactly 1 line for 654
  const tc=await cartScreen(p);
  const m=tc.match(/Cart\s*\((\d+)\s*items?\)/i)||tc.match(/\((\d+)\)/);
  rec({ attack:'midflow_backout_cart_integrity', target:'cart screen after add+buy+back+buy',
        result:'RECORDED', observed:`cart text="${tc.replace(/\n/g,' | ').slice(0,200)}"`,
        evidence:['a11y text'] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
