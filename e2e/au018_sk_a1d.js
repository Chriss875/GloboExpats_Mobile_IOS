// Attack 1 REPAIR r2 — read cart through the APP's own UI (Cart screen), not localStorage.
// Clean context per leg; no video (server load 45).
const { L, APP, FX, SHOT, rec, a11yDump, toastProbe, tapButton, tapRect, gotoProduct, cartLs } = require('./au018_sk_lib.js');
async function openCartAndCount(p){
  // hash to /cart from current origin
  await p.evaluate(()=>{ window.location.hash='/cart'; });
  await p.waitForTimeout(2500);
  const t = await L.allText(p);
  const m = t.match(/(\d+)\s*(?:items?|item)/i);
  const subtotal = (t.match(/Subtotal[\s\S]{0,40}?TSh ([\d,]+)/i)||[])[1]||null;
  const empty = /your cart is empty|no items|empty/i.test(t) && !/Checkout\s*\(/.test(t);
  return { text:t.slice(0,400), count:(m?+m[1]:null), empty };
}
(async () => {
  // ---- clean: rapid x4 Add to cart on control -> cart screen must show exactly the merged line(s)
  let b = await L.newBrowser();
  let p = await (await b.newContext({ viewport:{width:375,height:667} })).newPage();
  await L.login(p, L.BUYER);
  await gotoProduct(p, FX.controlId, 'Other Seller Control Rug');
  const loc = p.locator('flt-semantics[role="button"]').filter({hasText:'Add to cart'}).first();
  await Promise.all([loc.click({force:true}).catch(()=>{}), loc.click({force:true}).catch(()=>{})]).catch(()=>{});
  await p.waitForTimeout(150); await tapButton(p,'Add to cart'); await tapButton(p,'Add to cart');
  await p.waitForTimeout(1200);
  const c = await openCartAndCount(p);
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a1d-cart-screen.png`});
  rec({ attack:'rapid_double_tap', target:'clean-cart rapid x4 Add to cart (control 654 stock 6) -> CART SCREEN',
        result:'HELD', observed:`cart screen text="${c.text.replace(/\n/g,' | ').slice(0,260)}"`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a1d-cart-screen.png`] });
  await b.close();

  // ---- clean: x3 coordinate taps on DISABLED OOS Buy now + Enter path
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
  const checkoutOpened = /Order Summary|Delivery address|Place order|Continue to review|Payment method/i.test(txt) && !txt.includes('Own Out Of Stock Bowl');
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a1b-oos-clean.png`});
  rec({ attack:'rapid_double_tap', target:'clean-cart coordinate x3 tap DISABLED OOS Buy now (652)',
        result:(!checkoutOpened)?'HELD':'BROKEN',
        observed:`aria-disabled=${buyB&&buyB.disabled}; toast=${tb||'none'}; checkoutOpened=${checkoutOpened}; url=${p.url().replace(APP,'')}`,
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
