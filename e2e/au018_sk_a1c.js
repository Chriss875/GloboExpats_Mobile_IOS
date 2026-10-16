// Attack 1 REPAIR (no video): isolated contexts, clean cart.
const { L, APP, FX, SHOT, rec, a11yDump, toastProbe, tapButton, tapRect, gotoProduct, cartLs } = require('./au018_sk_lib.js');
function cartParse(ls){ try{ const k=Object.keys(JSON.parse(ls))[0]; const raw=JSON.parse(ls)[k]; const v=JSON.parse(raw); return Array.isArray(v)?v:(v.items||[]);}catch(e){ return null; } }
(async () => {
  // ---- clean-cart rapid x4 Add to cart on control
  let b = await L.newBrowser();
  let p = await (await b.newContext({ viewport:{width:375,height:667} })).newPage();
  await L.login(p, L.BUYER);
  await gotoProduct(p, FX.controlId, 'Other Seller Control Rug');
  const loc = p.locator('flt-semantics[role="button"]').filter({hasText:'Add to cart'}).first();
  await Promise.all([loc.click({force:true}).catch(()=>{}), loc.click({force:true}).catch(()=>{})]).catch(()=>{});
  await p.waitForTimeout(150); await tapButton(p,'Add to cart'); await tapButton(p,'Add to cart');
  await p.waitForTimeout(1000);
  const after = await cartLs(p);
  const lines = cartParse(after)||[];
  const q654 = lines.filter(l=>String(l.productId)==='654').reduce((s,l)=>s+(l.quantity||l.qty||1),0);
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a1b-clean-cart.png`});
  rec({ attack:'rapid_double_tap', target:'clean-cart Add to cart x4 rapid (control 654, stock 6)',
        result:(lines.length===1 && q654>=1 && q654<=6)?'HELD':'BROKEN',
        observed:`cart lines=${JSON.stringify(lines.map(l=>({p:l.productId,q:l.quantity||l.qty})))}; stock cap=6`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a1b-clean-cart.png`] });
  await b.close();

  // ---- clean-cart coordinate x3 on DISABLED OOS Buy now + keyboard Enter path
  b = await L.newBrowser();
  p = await (await b.newContext({ viewport:{width:375,height:667} })).newPage();
  await L.login(p, L.BUYER);
  await gotoProduct(p, FX.ownOosId, 'Own Out Of Stock Bowl');
  const d2 = await a11yDump(p);
  const buyB = d2.find(n=>/^Buy now/i.test(n.t));
  const base = await p.screenshot();
  if(buyB){ await tapRect(p,buyB.r); await tapRect(p,buyB.r); await tapRect(p,buyB.r); }
  await p.waitForTimeout(1000);
  const tb = await toastProbe(p, base);
  const txt = await L.allText(p);
  const cartAfter = await cartLs(p);
  const checkoutOpened = /Order Summary|Delivery address|Place order|Continue to review|Payment method/i.test(txt) && !txt.includes('Own Out Of Stock Bowl');
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a1b-oos-clean.png`});
  rec({ attack:'rapid_double_tap', target:'clean-cart coordinate x3 tap DISABLED OOS Buy now (652)',
        result:(!checkoutOpened && cartAfter==='{}')?'HELD':'BROKEN',
        observed:`aria-disabled=${buyB&&buyB.disabled}; toast=${tb||'none'}; checkoutOpened=${checkoutOpened}; cartEmpty=${cartAfter==='{}'}; url=${p.url().replace(APP,'')}`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a1b-oos-clean.png`] });
  const locB = p.locator('flt-semantics[role="button"]').filter({hasText:'Buy now'}).first();
  await locB.focus().catch(()=>{}); await p.keyboard.press('Enter').catch(()=>{});
  await p.waitForTimeout(900);
  const txt2 = await L.allText(p);
  const co2 = /Order Summary|Delivery address|Place order/i.test(txt2) && !txt2.includes('Own Out Of Stock Bowl');
  rec({ attack:'keyboard_activation_disabled', target:'focus+Enter on aria-disabled OOS Buy now',
        result:!co2?'HELD':'BROKEN', observed:`checkout opened via Enter=${co2}`, evidence:['a11y text scan'] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
