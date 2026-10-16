// Attack 7 FINAL: real stock flip via PATCH /api/v1/products/{id}/inventory {quantity:0}
// then buyer reloads the deep link -> OOS gate must engage (stale-cache reload after mutation).
const { L, APP, SHOT, rec, a11yDump, tapRect, gotoProduct, toastProbe } = require('./au018_sk_lib.js');
(async () => {
  const PW='StrongPass!1'; const stamp=Date.now();
  const sEmail=`au018s7c_${stamp}@gmail.com`;
  await L.api(null,'POST','/api/v1/auth/register',{firstName:'AU018S7C',lastName:'Seller',password:PW,emailAddress:sEmail});
  const stok=(await (await fetch(`${L.API}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:sEmail,password:PW})})).json()).token;
  const atok=await L.apiLogin(L.ADMIN);
  const me=await L.api(stok,'GET','/api/v1/userManagement/user-details'); const sid=me.json.userId;
  await L.api(atok,'PATCH',`/api/v1/admin/users/${sid}/status`,{status:'VERIFIED'});
  const P={categoryId:1,subcategoryId:5,productCountry:'Tanzania',productRegion:'Dar es Salaam',productStreet:'Mikocheni',currency:'TZS',condition:'NEW',productName:`AU018 StockFlip C ${stamp}`,productQuantity:5,askingPrice:7000};
  const form=new FormData(); form.append('product',new Blob([Buffer.from(JSON.stringify(P))],{type:'application/json'}),'p.json');
  const pr=await fetch(`${L.API}/api/v1/products/post-product`,{method:'POST',headers:{Authorization:'Bearer '+stok},body:form});
  const pj=await pr.json().catch(()=>null);
  const pid=pj&&(pj.productId||pj.id||(pj.product&&(pj.product.productId||pj.product.id)));
  console.log('fixture status',pr.status,'pid',pid);
  if(!pid){ rec({attack:'stale_cache_reload_after_mutation',target:'fixture',result:'BLOCKED',observed:'post failed '+pr.status}); process.exit(0); }
  // seller flips stock to 0 through the REAL inventory endpoint
  const inv=await L.api(stok,'PATCH',`/api/v1/products/${pid}/inventory`,{quantity:0});
  console.log('inventory ->',inv.status,JSON.stringify(inv.json).slice(0,120));
  const det=await (await fetch(`${L.API}/api/v1/displayItem/itemDetails/${pid}`)).json().catch(()=>null);
  const qty=det!=null?(det.productQuantity??det.quantity):undefined;
  console.log('itemDetails qty after flip:',qty);
  rec({ attack:'stale_cache_reload_after_mutation', target:`PATCH /products/${pid}/inventory quantity=0`,
        result:(inv.status===200&&Number(qty)===0)?'HELD':'BLOCKED', observed:`inventory status=${inv.status}; itemDetails qty=${qty}` });
  if(Number(qty)!==0) process.exit(0);

  // BUYER side: fresh browser, login, deep-link the now-OOS listing
  const b=await L.newBrowser();
  const p=await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  await L.login(p,L.BUYER);
  await gotoProduct(p,pid,'AU018');
  const d=await a11yDump(p); const buy=d.find(n=>/^Buy now/i.test(n.t)); const add=d.find(n=>/Out of Stock|Add to cart/i.test(n.t));
  const t=await L.allText(p);
  const oos=/Out of Stock/i.test(t);
  const base=await p.screenshot();
  if(buy){ await tapRect(p,buy.r); }
  await p.waitForTimeout(1200);
  const t2=await L.allText(p);
  const co=/Order Summary|Delivery address|Place order/i.test(t2)&&!t2.includes('AU018 StockFlip C');
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a7c-stockflip.png`});
  rec({ attack:'stale_cache_reload_after_mutation', target:'buyer reloads listing after real stock flip 5->0',
        result:(buy&&buy.disabled==='true'&&oos&&!co)?'HELD':'DISPUTED',
        observed:`Buy aria-disabled=${buy&&buy.disabled}; OutOfStock label=${oos}; checkout opened=${co}; add-label="${add?add.t.slice(-20):'missing'}"`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a7c-stockflip.png`] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
