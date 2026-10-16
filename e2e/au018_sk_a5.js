// Attack 5 INVALID INPUT: 500-char strings, emoji, UTF-8/Swahili, script tags via the REAL API
// (RW lane) — do these break the buy gates / detail render on :9121?
const { L, APP, FX, SHOT, rec, a11yDump, toastProbe, tapButton, gotoProduct } = require('./au018_sk_lib.js');
const fs = require('fs');
const path = require('path');
async function postProduct(token, product){
  const form = new FormData();
  form.append('product', new Blob([Buffer.from(JSON.stringify(product))],{type:'application/json'}),'product.json');
  const r = await fetch(`${L.API}/api/v1/products/post-product`,{method:'POST',headers:{Authorization:'Bearer '+token},body:form});
  const j = await r.json().catch(()=>null);
  return { status:r.status, id: j && (j.productId||j.id||(j.product&&(j.product.productId||j.product.id))) };
}
(async () => {
  const btok = await L.apiLogin(L.BUYER);
  const base = { categoryId:1, subcategoryId:5, productCountry:'Tanzania', productRegion:'Dar es Salaam',
    productStreet:'Mikocheni', currency:'TZS', condition:'NEW', productQuantity:3 };
  const longName = 'A'.repeat(500);
  const emoji = 'AU018 🚫🔥🛒 Kikapu cha Matunda — bei ya TSh 12,345.67 ✅';
  const xss = '<script>alert("au018")</script><img src=x onerror=alert(1)> AU018 XSS probe';
  const cases = [
    ['long_500_char_name', { ...base, productName:'AU018 '+longName, askingPrice:10000 }],
    ['emoji_swahili_utf8', { ...base, productName:emoji, askingPrice:12345.67 }],
    ['script_tag_xss',    { ...base, productName:xss, askingPrice:999 }],
    ['zero_price',        { ...base, productName:'AU018 Zero Price Probe '+Date.now(), askingPrice:0 }],
    ['negative_price',    { ...base, productName:'AU018 Negative Price Probe '+Date.now(), askingPrice:-5000 }],
    ['huge_qty',          { ...base, productName:'AU018 Huge Qty Probe '+Date.now(), askingPrice:2000, productQuantity:999999999 }],
  ];
  const created = [];
  for (const [name, payload] of cases){
    try{ const r = await postProduct(btok, payload); created.push({name, ...r}); console.log('created', name, r.status, r.id); }
    catch(e){ created.push({name, status:'ERR', err:e.message}); }
  }
  // negative price likely rejected by backend; check
  for (const c of created){
    if(!c.id){ rec({ attack:'invalid_input_api', target:c.name, result: (c.status===400||c.status===422||c.status==='ERR')?'HELD':'DISPUTED',
      observed:`post-product status=${c.status} ${c.err||''}` }); continue; }
    // open in UI and exercise the own-item gate (these are all BUYER-owned => own-item gate must fire)
    const b = await L.newBrowser();
    const p = await (await b.newContext({viewport:{width:375,height:667}})).newPage();
    await L.login(p, L.BUYER);
    const opened = await gotoProduct(p, c.id, 'AU018');
    const t = await L.allText(p);
    const rendered = opened && t.includes('AU018');
    const baseShot = await p.screenshot();
    const tapped = await tapButton(p,'Add to cart');
    await p.waitForTimeout(900);
    const tb = await toastProbe(p, baseShot);
    const scriptLeak = /<script>alert/.test(t);
    await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a5-${c.name}.png`});
    rec({ attack:'invalid_input_ui', target:`${c.name} (id=${c.id})`,
          result:(rendered && tb && !scriptLeak)?'HELD':'DISPUTED',
          observed:`rendered=${rendered}; addTapped=${tapped}; own-gate toast=${tb||'none'}; raw script tag painted=${scriptLeak}`,
          evidence:[`shots/AU-018/AU-018-375x667-sk-a5-${c.name}.png`] });
    await b.close();
  }
  fs.writeFileSync('/tmp/au018_invalid_ids.json', JSON.stringify(created));
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
