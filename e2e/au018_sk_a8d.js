// Attack 7 DIAGNOSIS: after the real qty 5->0 flip, why did the buyer's deep link fail to render?
// Check what the buyer sees: authed vs anonymous itemDetails + the not-found UI copy.
const { L, APP, SHOT, rec, a11yDump, gotoProduct } = require('./au018_sk_lib.js');
(async () => {
  const id=846;
  const btok=await L.apiLogin(L.BUYER);
  const det=await L.api(btok,'GET',`/api/v1/displayItem/itemDetails/${id}`);
  console.log('authed buyer itemDetails:', det.status, det.json&&(det.json.productName||det.json.errorCode), 'qty=',det.json&&det.json.productQuantity);
  const anon=await (await fetch(`${L.API}/api/v1/displayItem/itemDetails/${id}`)).json().catch(()=>null);
  console.log('anon itemDetails:', anon&&(anon.productName||anon.errorCode));

  const b=await L.newBrowser();
  const p=await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  await L.login(p,L.BUYER);
  await p.goto(APP+'/',{waitUntil:'load'});
  await L.waitText(p,'Buy now',25000);
  await p.evaluate(h=>{ window.location.hash=h; }, '/product/'+id);
  await p.waitForTimeout(6000);
  const t=await L.allText(p);
  console.log('UI text:', t.replace(/\n/g,' | ').slice(0,300));
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a8d-diag.png`});
  rec({ attack:'stale_cache_reload_after_mutation', target:`diagnose post-flip render of ${id}`,
        result:'RECORDED',
        observed:`authed=${det.json&&(det.json.productName||det.json.errorCode)}; uiText="${t.replace(/\n/g,' | ').slice(0,200)}"`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a8d-diag.png`] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
