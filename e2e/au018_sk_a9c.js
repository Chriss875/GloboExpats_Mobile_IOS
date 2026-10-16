// Attack 9 DECISIVE: screenshot-crop the Order Summary region and READ the pixels.
// If the summary lists ONE row for the rug at x1, the a11y occurrence count is an artifact.
const { L, APP, FX, SHOT, rec, gotoProduct, tapButton } = require('./au018_sk_lib.js');
(async () => {
  const b=await L.newBrowser();
  const p=await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  await L.login(p,L.BUYER);
  await gotoProduct(p,FX.controlId,'Other Seller Control Rug');
  await tapButton(p,'Add to cart'); await p.waitForTimeout(900);
  await tapButton(p,'Buy now'); await p.waitForTimeout(3500);
  await L.screenshot(p, `${SHOT}/AU-018-375x667-sk-a9c-order-summary.png`);
  const t=await L.allText(p);
  // capture the region between 'Order Summary' and 'Shipping' as its own shot by scrolling top
  console.log('text:', t.replace(/\n/g,' | ').slice(0,400));
  rec({ attack:'dup_line_diagnosis', target:'Order Summary pixel read (single 1x line)',
        result:'RECORDED', observed:`see PNG; occurrences in full-page a11y=${(t.match(/Other Seller Control Rug/g)||[]).length}`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a9c-order-summary.png`] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
