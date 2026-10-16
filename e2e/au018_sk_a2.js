// Attack 2 OUT-OF-ORDER SEQUENCES + MID-FLOW BACK-OUT (375x667).
const { L, APP, FX, SHOT, rec, a11yDump, toastProbe, tapButton, tapRect, gotoProduct, cartLs } = require('./au018_sk_lib.js');
(async () => {
  // ---- A. Buy now on CONTROL -> checkout -> Back mid-flow -> must land back on detail,
  //         then Add to cart still works (no stuck state)
  let b = await L.newBrowser();
  let p = await (await b.newContext({ viewport:{width:375,height:667} })).newPage();
  await L.login(p, L.BUYER);
  await gotoProduct(p, FX.controlId, 'Other Seller Control Rug');
  await tapButton(p,'Buy now');
  await p.waitForTimeout(3200);
  const inCheckout = /Order Summary|Delivery address|Place order|Continue to review/i.test(await L.allText(p));
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a2-checkout.png`});
  const back = p.locator('flt-semantics[role="button"]').filter({hasText:'Back'}).first();
  const backOk = await back.click({force:true}).then(()=>true).catch(()=>false);
  await p.waitForTimeout(2200);
  const afterBackTxt = await L.allText(p);
  const backOnDetail = afterBackTxt.includes('Other Seller Control Rug');
  const addStillWorks = await tapButton(p,'Add to cart');
  await p.waitForTimeout(900);
  rec({ attack:'out_of_order_midflow_back', target:'control Buy now -> checkout -> Back -> detail',
        result:(inCheckout&&backOnDetail)?'HELD':'DISPUTED',
        observed:`reached checkout=${inCheckout}; back tapped=${backOk}; back on detail=${backOnDetail}; post-back AddToCart tap=${addStillWorks}`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a2-checkout.png`] });
  await b.close();

  // ---- B. OOS first THEN own-in-stock THEN control in one session — gates must not leak between products
  b = await L.newBrowser();
  p = await (await b.newContext({ viewport:{width:375,height:667} })).newPage();
  await L.login(p, L.BUYER);
  await gotoProduct(p, FX.ownOosId, 'Own Out Of Stock Bowl');
  let d = await a11yDump(p); const buyOos = d.find(n=>/^Buy now/i.test(n.t));
  await gotoProduct(p, FX.ownInStockId, 'Own In Stock Teak Set');
  d = await a11yDump(p); const buyOwn = d.find(n=>/^Buy now/i.test(n.t)); const addOwn = d.find(n=>/Add to cart/i.test(n.t));
  await gotoProduct(p, FX.controlId, 'Other Seller Control Rug');
  d = await a11yDump(p); const buyCtrl = d.find(n=>/^Buy now/i.test(n.t)); const addCtrl = d.find(n=>/Add to cart/i.test(n.t));
  rec({ attack:'state_leak_between_products', target:'OOS -> own-instock -> control in one session',
        result:(buyOos&&buyOos.disabled==='true'&&buyOwn&&buyOwn.disabled!=='true'&&addOwn&&addOwn.disabled!=='true'&&buyCtrl&&buyCtrl.disabled!=='true')?'HELD':'BROKEN',
        observed:`OOS Buy dis=${buyOos&&buyOos.disabled} | own-instock Buy dis=${buyOwn&&buyOwn.disabled} add dis=${addOwn&&addOwn.disabled} | control Buy dis=${buyCtrl&&buyCtrl.disabled}`,
        evidence:['a11y dumps per product'] });
  await b.close();

  // ---- C. Deep-link straight into CHECKOUT with empty cart (#/checkout) — guard?
  b = await L.newBrowser();
  p = await (await b.newContext({ viewport:{width:375,height:667} })).newPage();
  await L.login(p, L.BUYER);
  await p.evaluate(()=>{ window.location.hash='/checkout'; });
  await p.waitForTimeout(3500);
  const tC = await L.allText(p);
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a2-empty-checkout.png`});
  rec({ attack:'empty_state_deeplink', target:'#/checkout deep link with EMPTY cart',
        result:'RECORDED', observed:`url=${p.url().replace(APP,'')} text="${tC.replace(/\n/g,' | ').slice(0,260)}"`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a2-empty-checkout.png`] });
  await b.close();

  // ---- D. Deep-link product page signed OUT (unauthenticated deep link) -> gate must show Login Required
  b = await L.newBrowser();
  p = await (await b.newContext({ viewport:{width:375,height:667} })).newPage();
  await p.goto(APP+'/',{waitUntil:'load'});
  await L.waitText(p,'Buy now',25000);
  await p.evaluate(h=>{ window.location.hash=h; }, '/product/'+FX.controlId);
  await p.waitForTimeout(4000);
  const base = await p.screenshot();
  await tapButton(p,'Add to cart'); await p.waitForTimeout(800);
  const tb1 = await toastProbe(p, base);
  const txt1 = await L.allText(p);
  const loggedOut1 = !(await L.isLoggedIn(p));
  const base2 = await p.screenshot();
  await tapButton(p,'Buy now'); await p.waitForTimeout(1500);
  const tb2 = await toastProbe(p, base2);
  const txt2 = await L.allText(p);
  const noCheckout = !(/Order Summary|Place order|Delivery address/i.test(txt2));
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a2-signed-out.png`});
  rec({ attack:'unauthenticated_deep_link', target:'signed-out deep link #/product/654 + both CTAs',
        result:(loggedOut1 && !/Order Summary/.test(txt2))?'HELD':'BROKEN',
        observed:`token absent=${loggedOut1}; AddToCart toast=${tb1||'none'}; BuyNow toast=${tb2||'none'}; checkout blocked=${noCheckout}`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a2-signed-out.png`] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
