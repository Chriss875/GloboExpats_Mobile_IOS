// Attack 7 STALE-CACHE RELOAD AFTER MUTATION + tablet-viewport gate re-check.
// Seller (524) reduces control stock to 0 via REAL API; buyer's already-open detail
// screen must not let them Buy now into an unfulfillable order on reload.
const { L, APP, FX, SHOT, rec, a11yDump, toastProbe, tapButton, gotoProduct } = require('./au018_sk_lib.js');
(async () => {
  // find the sandbox token for seller 524? We don't own that account. Instead: create a FRESH
  // pair (seller S2 + control listing) through the API so we own both sides.
  const PW='StrongPass!1'; const stamp=Date.now();
  const sEmail=`au018s7_${stamp}@gmail.com`;
  await L.api(null,'POST','/api/v1/auth/register',{firstName:'AU018S7',lastName:'Seller',password:PW,emailAddress:sEmail});
  const stok=(await (await fetch(`${L.API}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:sEmail,password:PW})})).json()).token;
  const atok=await L.apiLogin(L.ADMIN);
  const me=await L.api(stok,'GET','/api/v1/userManagement/user-details'); const sid=me.json.userId;
  await L.api(atok,'PATCH',`/api/v1/admin/users/${sid}/status`,{status:'VERIFIED'});
  const form=new FormData();
  form.append('product',new Blob([Buffer.from(JSON.stringify({categoryId:1,subcategoryId:5,productCountry:'Tanzania',productRegion:'Dar es Salaam',productStreet:'Mikocheni',currency:'TZS',condition:'NEW',productName:`AU018 Stock Flip Probe ${stamp}`,productQuantity:5,askingPrice:7000}))],{type:'application/json'}),'p.json');
  const pr=await fetch(`${L.API}/api/v1/products/post-product`,{method:'POST',headers:{Authorization:'Bearer '+stok},body:form});
  const pj=await pr.json().catch(()=>null);
  const pid=pj&&(pj.productId||pj.id||(pj.product&&(pj.product.productId||pj.product.id)));
  console.log('stock-flip fixture', pid, pr.status);
  if(!pid) throw new Error('fixture failed');

  const b=await L.newBrowser();
  const p=await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  await L.login(p, L.BUYER);
  await gotoProduct(p, pid, 'AU018 Stock Flip Probe');
  let d=await a11yDump(p); let buy=d.find(n=>/^Buy now/i.test(n.t));
  rec({ attack:'stale_cache_reload_pre', target:`fresh listing ${pid} qty=5`,
        result:(buy&&buy.disabled!=='true')?'HELD':'DISPUTED', observed:`Buy dis=${buy&&buy.disabled}` });
  // MUTATION: seller sets stock to 0 via real API (update-product)
  const up=new FormData();
  up.append('product',new Blob([Buffer.from(JSON.stringify({productId:pid,categoryId:1,subcategoryId:5,productCountry:'Tanzania',productRegion:'Dar es Salaam',productStreet:'Mikocheni',currency:'TZS',condition:'NEW',productName:`AU018 Stock Flip Probe ${stamp}`,productQuantity:0,askingPrice:7000}))],{type:'application/json'}),'p.json');
  const ur=await fetch(`${L.API}/api/v1/products/update-product`,{method:'PUT',headers:{Authorization:'Bearer '+stok},body:up});
  console.log('update-product ->',ur.status);
  // buyer RELOADS the same deep link (stale-cache reload after mutation)
  await p.evaluate(()=>{ window.location.hash='/'; }); await p.waitForTimeout(1200);
  await gotoProduct(p, pid, 'AU018 Stock Flip Probe');
  d=await a11yDump(p); buy=d.find(n=>/^Buy now/i.test(n.t));
  const t=await L.allText(p);
  const oosLabel=/Out of Stock/i.test(t);
  const base=await p.screenshot();
  if(buy){ await p.mouse.click(buy.r[0]+buy.r[2]/2, Math.max(16,buy.r[1]+buy.r[3]/2)); await p.waitForTimeout(1200); }
  const t2=await L.allText(p);
  const checkoutOpened=/Order Summary|Delivery address|Place order/i.test(t2)&&!t2.includes('AU018 Stock Flip Probe');
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a7-stockflip.png`});
  rec({ attack:'stale_cache_reload_after_mutation', target:`seller flips stock 5->0 via real API; buyer reloads`,
        result:(buy&&(buy.disabled==='true')&&oosLabel&&!checkoutOpened)?'HELD':'DISPUTED',
        observed:`after reload: Buy aria-disabled=${buy&&buy.disabled}; 'Out of Stock' label=${oosLabel}; checkout opened despite OOS=${checkoutOpened}`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a7-stockflip.png`] });
  await b.close();

  // TABLET viewport regression of the three gates (768x1024 quick re-check)
  const b2=await L.newBrowser();
  const p2=await (await b2.newContext({viewport:{width:768,height:1024}})).newPage();
  await L.login(p2, L.BUYER);
  for(const [id,title] of [[FX.ownInStockId,'Own In Stock Teak Set'],[FX.ownOosId,'Own Out Of Stock Bowl']]){
    await gotoProduct(p2,id,title);
    const dd=await a11yDump(p2);
    const bb=dd.find(n=>/^Buy now/i.test(n.t));
    const baseShot=await p2.screenshot();
    let toastTxt=null;
    if(id===FX.ownInStockId){ await tapButton(p2,'Add to cart'); await p2.waitForTimeout(800); toastTxt=await toastProbe(p2,baseShot); }
    await p2.screenshot({path:id===FX.ownInStockId?`${SHOT}/AU-018-768x1024-sk-reg-own.png`:`${SHOT}/AU-018-768x1024-sk-reg-oos.png`});
    rec({ attack:'tablet_gate_regression', target:`768x1024 ${title}`,
          result:(id===FX.ownInStockId ? (toastTxt&&bb.disabled!=='true') : (bb.disabled==='true'))?'HELD':'BROKEN',
          observed:`Buy dis=${bb&&bb.disabled}; own-item toast=${toastTxt||'n/a'}`,
          evidence:[id===FX.ownInStockId?`shots/AU-018/AU-018-768x1024-sk-reg-own.png`:`shots/AU-018/AU-018-768x1024-sk-reg-oos.png`] });
  }
  await b2.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
