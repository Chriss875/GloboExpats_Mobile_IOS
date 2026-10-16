// Attack 4B session-expiry REPAIR: fresh context, login, open CONTROL detail, blank token,
// then Buy now WITHOUT any reload (true mid-flow expiry, no route re-init).
const { L, APP, FX, SHOT, rec, a11yDump, toastProbe, tapButton, gotoProduct } = require('./au018_sk_lib.js');
(async () => {
  const b = await L.newBrowser();
  const p = await (await b.newContext({ viewport:{width:375,height:667} })).newPage();
  await L.login(p, L.BUYER);
  await gotoProduct(p, FX.controlId, 'Other Seller Control Rug');
  const t0 = await L.allText(p);
  const viewerLoadedBefore = /Mobile Test|Verified/.test(t0);
  // mid-flow expiry: wipe token while the screen is live
  await p.evaluate(()=>{ localStorage.removeItem('flutter.auth_token'); });
  const base = await p.screenshot();
  const tapped = await tapButton(p,'Buy now');
  await p.waitForTimeout(2500);
  const t1 = await L.allText(p);
  const reachedCheckout = /Order Summary|Delivery address|Place order/i.test(t1);
  const toastTxt = /Login Required|sign in/i.test(t1);
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a4b-expired-noreload.png`});
  rec({ attack:'session_expiry_midflow', target:'token wiped mid-flow (no reload) -> Buy now on control',
        result:(reachedCheckout)?'HELD':'DISPUTED',
        observed:`viewer resolved before expiry=${viewerLoadedBefore}; buy tapped=${tapped}; checkout opened=${reachedCheckout}; login-required copy visible=${toastTxt}`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a4b-expired-noreload.png`] });

  // variant: wipe token BEFORE the detail screen mounts (fresh deep link after logout-like state)
  await p.evaluate(()=>{ window.location.hash='/'; }); await p.waitForTimeout(1500);
  await p.evaluate(h=>{ window.location.hash=h; }, '/product/'+FX.ownInStockId);
  await p.waitForTimeout(4500);
  const t2 = await L.allText(p);
  const ownToastFired = base ? null : null;
  const base2 = await p.screenshot();
  await tapButton(p,'Add to cart'); await p.waitForTimeout(900);
  const tb2 = await toastProbe(p, base2);
  rec({ attack:'session_expiry_midflow', target:'own-instock detail mounted AFTER token wipe -> Add to cart',
        result:'RECORDED',
        observed:`own gate toast=${tb2||'none'} (own-item guard is identity-based; with viewer unresolved it cannot detect ownership — see finding)`,
        evidence:['a11y text + pixel band'] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
