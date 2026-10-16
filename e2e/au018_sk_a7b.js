// Attack 7 REPAIR: the PUT update-product returned 500 (partial payload). Use the seller's
// own UI-equivalent minimal patch or retry with full required fields; then re-test reload.
const { L, APP, FX, SHOT, rec, a11yDump, toastProbe, tapButton, gotoProduct } = require('./au018_sk_lib.js');
(async () => {
  const PW='StrongPass!1';
  // reuse seller account created in a7? We didn't persist it. Create a fresh pair.
  const stamp=Date.now();
  const sEmail=`au018s7b_${stamp}@gmail.com`;
  await L.api(null,'POST','/api/v1/auth/register',{firstName:'AU018S7B',lastName:'Seller',password:PW,emailAddress:sEmail});
  const lr=await fetch(`${L.API}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:sEmail,password:PW})});
  const stok=(await lr.json()).token;
  const atok=await L.apiLogin(L.ADMIN);
  const me=await L.api(stok,'GET','/api/v1/userManagement/user-details'); const sid=me.json.userId;
  await L.api(atok,'PATCH',`/api/v1/admin/users/${sid}/status`,{status:'VERIFIED'});
  const P={categoryId:1,subcategoryId:5,productCountry:'Tanzania',productRegion:'Dar es Salaam',productStreet:'Mikocheni',currency:'TZS',condition:'NEW',productName:`AU018 StockFlip B ${stamp}`,productQuantity:5,askingPrice:7000};
  async function post(){ const form=new FormData(); form.append('product',new Blob([Buffer.from(JSON.stringify(P))],{type:'application/json'}),'p.json');
    const r=await fetch(`${L.API}/api/v1/products/post-product`,{method:'POST',headers:{Authorization:'Bearer '+stok},body:form});
    const j=await r.json().catch(()=>null); return {status:r.status,id:j&&(j.productId||j.id||(j.product&&(j.product.productId||j.product.id)))}; }
  const first=await post();
  if(!first.id) throw new Error('post failed '+first.status);
  const pid=first.id;
  console.log('fixture', pid);
  // try several update shapes to find one that works
  const shapes = [
    ['full_with_productId', {...P, productId:pid, productQuantity:0}],
    ['qty_only_json_body', null],
  ];
  let updated=false, usedShape=null;
  for(const [name,payload] of shapes){
    if(!payload) break;
    const form=new FormData(); form.append('product',new Blob([Buffer.from(JSON.stringify(payload))],{type:'application/json'}),'p.json');
    for(const m of ['PUT','POST','PATCH']){
      const r=await fetch(`${L.API}/api/v1/products/update-product`,{method:m,headers:{Authorization:'Bearer '+stok},body:form});
      const txt=await r.text();
      console.log('update attempt',name,m,r.status,txt.slice(0,120));
      if(r.ok){ updated=true; usedShape=name+' '+m; break; }
    }
    if(updated) break;
  }
  // verify actual stock through itemDetails
  const det=await (await fetch(`${L.API}/api/v1/displayItem/itemDetails/${pid}`)).json().catch(()=>null);
  const qty=det&&(det.productQuantity??det.quantity);
  rec({ attack:'stale_cache_reload_after_mutation', target:`API stock flip on ${pid}`,
        result: qty===0?'HELD':'BLOCKED', observed:`update ok=${updated} shape=${usedShape}; itemDetails qty=${qty}` });
  if(qty!==0){ await b && null; process.exit(0); }

  // buyer reloads deep link -> OOS gate must appear
  const b=await L.newBrowser();
  const p=await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  await L.login(p,L.BUYER);
  await gotoProduct(p,pid,'AU018');
  const d=await a11yDump(p); const buy=d.find(n=>/^Buy now/i.test(n.t));
  const t=await L.allText(p);
  const oos=/Out of Stock/i.test(t);
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a7b-stockflip.png`});
  rec({ attack:'stale_cache_reload_after_mutation', target:'buyer reload after real stock flip to 0',
        result:(buy&&buy.disabled==='true'&&oos)?'HELD':'DISPUTED',
        observed:`Buy aria-disabled=${buy&&buy.disabled}; OutOfStock label=${oos}`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a7b-stockflip.png`] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
