// Attack 5B: XSS probe — is the <script> tag INERT (painted as text, no execution)?
// Check: no dialog fired, no injected DOM element, title text is HTML-escaped/painted literally.
const { L, APP, SHOT, rec } = require('./au018_sk_lib.js');
(async () => {
  const b = await L.newBrowser();
  const p = await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  let dialogFired = false;
  p.on('dialog', async d => { dialogFired = true; await d.dismiss().catch(()=>{}); });
  const imgErr = [];
  await p.goto(APP+'/',{waitUntil:'load'});
  await L.waitText(p,'Buy now',25000);
  await p.evaluate(h=>{ window.location.hash=h; }, '/product/837');
  await p.waitForTimeout(6000);
  const t = await L.allText(p);
  const injectedNode = await p.evaluate(()=>!!document.querySelector('script[onerror], img[src="x"]'));
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a5b-xss-inert.png`});
  rec({ attack:'xss_inertness', target:'<script>alert + <img onerror> in listing title (id=837)',
        result:(!dialogFired && !injectedNode)?'HELD':'BROKEN',
        observed:`js dialog fired=${dialogFired}; injected live DOM node=${injectedNode}; title painted literally in canvas text=${t.includes('alert("au018")')}`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a5b-xss-inert.png`] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
