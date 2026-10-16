// Attack 7 FINAL-3: stock flip via PATCH /api/v1/products/update/{id} multipart (sandbox route),
// then buyer reloads the deep link. Also re-checks the OOS gate on a listing that was in-stock.
const { L, APP, SHOT, rec, a11yDump, tapRect, gotoProduct } = require('./au018_sk_lib.js');
const fs=require('fs'), path=require('path');
const PW='StrongPass!1';
(async () => {
  const stamp=Date.now();
  const email=`au018s9_${stamp}@gmail.com`;
  await L.api(null,'POST','/api/v1/auth/register',{firstName:'AU018S9',lastName:'Seller',password:PW,emailAddress:email});
  const stok=(await (await fetch(`${L.API}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:PW})})).json()).token;
  const atok=await L.apiLogin(L.ADMIN);
  const me=await L.api(stok,'GET','/api/v1/userManagement/user-details');
  await L.api(atok,'PATCH',`/api/v1/admin/users/${me.json.userId}/status`,{status:'VERIFIED'});
  const P={categoryId:1,subcategoryId:5,productCountry:'Tanzania',productRegion:'Dar es Salaam',productStreet:'Mikocheni',currency:'TZS',condition:'NEW',productName:`AU018 StockFlip E ${stamp}`,productQuantity:5,askingPrice:7000};
  const form=new FormData();
  form.append('product',new Blob([Buffer.from(JSON.stringify(P))],{type:'application/json'}),'p.json');
  form.append('images',new Blob([fs.readFileSync(path.join(__dirname,'fixtures','receipt-proof.png'))],{type:'image/png'}),'r.png');
  const pr=await fetch(`${L.API}/api/v1/products/post-product`,{method:'POST',headers:{Authorization:'Bearer '+stok},body:form});
  const pj=await pr.json().catch(()=>null);
  const pid=pj&&(pj.productId||pj.id||(pj.product&&(pj.product.productId||pj.product.id)));
  console.log('fixture',pr.status,pid);
  if(!pid){ rec({attack:'stale_cache_reload_after_mutation',target:'seed',result:'BLOCKED',observed:'post '+pr.status}); process.exit(0); }

  // buyer opens it FIRST while qty=5 (pre-mutation state)
  let b=await L.newBrowser();
  let p=await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  await L.login(p,L.BUYER);
  const opened=await gotoProduct(p,pid,'AU018');
  let d=await a11yDump(p); let buy=d.find(n=>/^Buy now/i.test(n.t));
  rec({ attack:'stale_cache_reload_after_mutation', target:'pre-mutation view qty=5',
        result:(opened&&buy&&buy.disabled!=='true')?'HELD':'DISPUTED',
        observed:`rendered=${opened}; Buy dis=${buy&&buy.disabled} (public visibility of image-bearing listing)` });
  await b.close();

  // MUTATION via the real sandbox route
  const up=new FormData();
  up.append('product',new Blob([Buffer.from(JSON.stringify({...P, productId:pid, productQuantity:0}))],{type:'application/json'}),'p.json');
  const ur=await fetch(`${L.API}/api/v1/products/update/${pid}`,{method:'PATCH',headers:{Authorization:'Bearer '+stok},body:up});
  console.log('update ->',ur.status,(await ur.text()).slice(0,150));
  // verify public stock
  const btok=await L.apiLogin(L.BUYER);
  const det=await L.api(btok,'GET',`/api/v1/displayItem/itemDetails/${pid}`);
  console.log('qty after flip:', det.json && det.json.productQuantity);

  // BUYER reloads deep link AFTER mutation
  b=await L.newBrowser();
  p=await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  await L.login(p,L.BUYER);
  const opened2=await gotoProduct(p,pid,'AU018');
  d=await a11yDump(p); buy=d.find(n=>/^Buy now/i.test(n.t));
  const t=await L.allText(p);
  const oos=/Out of Stock/i.test(t);
  let co=false;
  if(buy){ await tapRect(p,buy.r); await p.waitForTimeout(1300); const t2=await L.allText(p); co=/Order Summary|Delivery address|Place order/i.test(t2)&&!t2.includes('AU018 StockFlip'); }
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a8b-stockflip.png`});
  rec({ attack:'stale_cache_reload_after_mutation', target:`real PATCH update/${pid} qty 5->0; buyer reload`,
        result:(buy&&buy.disabled==='true'&&oos&&!co)?'HELD':'DISPUTED',
        observed:`rendered after reload=${opened2}; Buy aria-disabled=${buy&&buy.disabled}; OutOfStock label=${oos}; checkout opened=${co}; serverQty=${det.json&&det.json.productQuantity}`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a8b-stockflip.png`] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
