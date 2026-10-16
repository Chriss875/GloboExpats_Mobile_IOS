// Attack 1 RAPID DOUBLE-TAPS on every purchase CTA (mobile viewport).
// Question: can a double-tap slip a second line / duplicate into the cart, or
// double-fire checkout push?
const { L, APP, FX, UNIT, SHOT, rec, a11yDump, toastProbe, tapButton, tapRect, gotoProduct, cartLs } = require('./au018_sk_lib.js');
(async () => {
  const b = await L.newBrowser();
  const ctx = await b.newContext({ viewport:{width:375,height:667} });
  const p = await ctx.newPage();
  await L.login(p, L.BUYER);

  // --- 1a. control listing: double-tap Add to cart as fast as possible (no waits)
  await gotoProduct(p, FX.controlId, 'Other Seller Control Rug');
  const dump = await a11yDump(p);
  const addC = dump.find(n=>/Add to cart/i.test(n.t));
  const before = await cartLs(p);
  // two taps with zero delay
  const loc = p.locator('flt-semantics[role="button"]').filter({hasText:'Add to cart'}).first();
  await Promise.all([loc.click({force:true}).catch(()=>{}), loc.click({force:true}).catch(()=>{})]).catch(()=>{});
  await p.waitForTimeout(250);
  await tapButton(p,'Add to cart'); await tapButton(p,'Add to cart');
  await p.waitForTimeout(1200);
  const after = await cartLs(p);
  let totalQty=null, lineCount=null;
  try{ const key=Object.keys(JSON.parse(after))[0]; const val=JSON.parse(after)[key];
       const arr = Array.isArray(val)?val:(val.items||[]);
       lineCount=Array.isArray(arr)?arr.length:null;
       totalQty=Array.isArray(arr)?arr.reduce((s,i)=>s+(i.quantity||i.qty||1),0):null; }catch(e){}
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a1-doubletap-cart.png`});
  rec({ attack:'rapid_double_tap', target:'Add to cart x4 (control 654)', result: (totalQty!==null && totalQty<=6)?'HELD':'DISPUTED',
        observed:`cart before=${before.slice(0,80)} after=${after.slice(0,220)} lines=${lineCount} totalQty=${totalQty}; max stock=6`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a1-doubletap-cart.png`] });

  // --- 1b. own item: rapid double-tap must not add anything either
  await gotoProduct(p, FX.ownInStockId, 'Own In Stock Teak Set');
  const base = await p.screenshot();
  await tapButton(p,'Add to cart'); await tapButton(p,'Add to cart'); await tapButton(p,'Add to cart');
  await p.waitForTimeout(900);
  const tb = await toastProbe(p, base);
  const ownCart = await cartLs(p);
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a1-own-doubletap.png`});
  rec({ attack:'rapid_double_tap', target:'Add to cart x3 on OWN item (653)', result: (!ownCart.includes('"653"')&&!ownCart.includes('653,'))?'HELD':'BROKEN',
        observed:`own-item triple-tap -> toast=${tb||'none'}; cart=${ownCart.slice(0,200)}`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a1-own-doubletap.png`] });

  // --- 1c. OOS disabled button: coordinate double-tap on the DISABLED Buy now
  await gotoProduct(p, FX.ownOosId, 'Own Out Of Stock Bowl');
  const d2 = await a11yDump(p);
  const buyB = d2.find(n=>/^Buy now/i.test(n.t));
  const lsBefore = await cartLs(p);
  if(buyB){ await tapRect(p, buyB.r); await tapRect(p, buyB.r); }
  await p.waitForTimeout(1000);
  const urlAfter = p.url(); const txtAfter = await L.allText(p);
  const lsAfter = await cartLs(p);
  const stillOnDetail = txtAfter.includes('Own Out Of Stock Bowl');
  const checkoutOpened = /Order Summary|Delivery address|Place order|Continue to review/i.test(txtAfter) && !stillOnDetail;
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a1-oos-buy.png`});
  rec({ attack:'rapid_double_tap', target:'coordinate x2 tap on DISABLED OOS Buy now (652)', result: (!checkoutOpened && !lsAfter.includes('Other Seller') )?'HELD':'BROKEN',
        observed:`aria-disabled=${buyB&&buyB.disabled}; checkout opened=${checkoutOpened}; url=${urlAfter.replace(APP,'')}; cart changed=${lsBefore!==lsAfter}`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a1-oos-buy.png`] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
