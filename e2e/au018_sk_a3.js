// Attack 3 OFFLINE MID-REQUEST + RETRY (route-abort localhost:8083) on the detail screen.
const { L, APP, FX, SHOT, rec, a11yDump, toastProbe, tapButton, gotoProduct } = require('./au018_sk_lib.js');
(async () => {
  const b = await L.newBrowser();
  const p = await (await b.newContext({ viewport:{width:375,height:667} })).newPage();
  await L.login(p, L.BUYER);

  // ---- A. Abort the itemDetails request mid-load -> error state? then unblock and retry
  await p.goto(APP+'/',{waitUntil:'load'});
  await L.waitText(p,'Buy now',25000);
  let aborted = 0;
  await p.context().route('**/api/v1/**', route => {
    if (/itemDetails/.test(route.request().url()) && aborted < 2) { aborted++; return route.abort('failed'); }
    return route.continue();
  });
  await p.evaluate(h=>{ window.location.hash=h; }, '/product/'+FX.controlId);
  await p.waitForTimeout(6000);
  const tAb = await L.allText(p);
  const gotError = /error|failed|try again|not found|couldn't|could not/i.test(tAb);
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a3-abort-detail.png`});
  rec({ attack:'offline_mid_request', target:'abort itemDetails x2 during detail load',
        result: gotError?'HELD':'DISPUTED',
        observed:`aborted=${aborted}; rendered="${tAb.replace(/\n/g,' | ').slice(0,220)}"`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a3-abort-detail.png`] });
  await p.context().unroute('**/api/v1/**').catch(()=>{});
  // retry: reload root and re-open
  await gotoProduct(p, FX.controlId, 'Other Seller Control Rug');
  const recovered = (await L.allText(p)).includes('Other Seller Control Rug');
  rec({ attack:'offline_mid_request_retry', target:'unblock network -> reopen detail',
        result: recovered?'HELD':'BROKEN',
        observed:`detail renders after retry=${recovered}` });

  // ---- B. Add to cart while offline is impossible client-side; instead kill API then Buy now:
  //         checkout push is client-side so it must still open (cart is local), but any
  //         address/delivery fetch inside checkout will fail. Verify no crash + recoverable.
  let killed = 0;
  await p.context().route('**/api/v1/**', route => { killed++; return route.abort('failed'); });
  await tapButton(p,'Buy now');
  await p.waitForTimeout(4000);
  const tOff = await L.allText(p);
  const stillAlive = (await p.evaluate(()=>!!document.querySelector('flt-semantics')));
  const crashed = /Unimplemented|RenderFlex|Exception/i.test(tOff);
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a3-offline-checkout.png`});
  await p.context().unroute('**/api/v1/**').catch(()=>{});
  rec({ attack:'offline_mid_request', target:'all :8083 requests aborted -> Buy now -> checkout',
        result: (stillAlive && !crashed)?'HELD':'BROKEN',
        observed:`api aborted=${killed}; semantics alive=${stillAlive}; crash markers=${crashed}; text="${tOff.replace(/\n/g,' | ').slice(0,200)}"`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a3-offline-checkout.png`] });
  // recovery
  await p.goto(APP+'/',{waitUntil:'load'}); await p.waitForTimeout(2500);
  const back = await L.waitText(p,'Buy now',20000);
  rec({ attack:'offline_mid_request_retry', target:'recover to home after offline burst',
        result: back?'HELD':'BROKEN', observed:`home re-rendered with CTAs=${back}` });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
