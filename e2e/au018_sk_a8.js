// Attack 7 FINAL-2: stale-cache reload after a REAL inventory mutation, using the seller's
// OWN account (owner-visible listing) so itemDetails resolves; then buyer-side reload check.
const { L, APP, SHOT, rec, a11yDump, tapRect, gotoProduct } = require('./au018_sk_lib.js');
const PW='StrongPass!1';
async function makeSeller(stamp){
  const email=`au018s8_${stamp}@gmail.com`;
  await L.api(null,'POST','/api/v1/auth/register',{firstName:'AU018S8',lastName:'Seller',password:PW,emailAddress:email});
  const stok=(await (await fetch(`${L.API}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:PW})})).json()).token;
  const atok=await L.apiLogin(L.ADMIN);
  const me=await L.api(stok,'GET','/api/v1/userManagement/user-details');
  await L.api(atok,'PATCH',`/api/v1/admin/users/${me.json.userId}/status`,{status:'VERIFIED'});
  return { email, stok, sid: me.json.userId };
}
async function postListing(tok,name,qty){
  const form=new FormData();
  form.append('product',new Blob([Buffer.from(JSON.stringify({categoryId:1,subcategoryId:5,productCountry:'Tanzania',productRegion:'Dar es Salaam',productStreet:'Mikocheni',currency:'TZS',condition:'NEW',productName:name,productQuantity:qty,askingPrice:7000}))],{type:'application/json'}),'p.json');
  // attach an image so the listing is public-ready (deliverySetupReady path)
  const img=require('fs').readFileSync(require('path').join(__dirname,'fixtures','receipt-proof.png'));
  form.append('images',new Blob([img],{type:'image/png'}),'receipt-proof.png');
  const r=await fetch(`${L.API}/api/v1/products/post-product`,{method:'POST',headers:{Authorization:'Bearer '+tok},body:form});
  const j=await r.json().catch(()=>null);
  return {status:r.status,id:j&&(j.productId||j.id||(j.product&&(j.product.productId||j.product.id)))};
}
(async () => {
  const stamp=Date.now();
  const s=await makeSeller(stamp);
  const fx=await postListing(s.stok, `AU018 StockFlip D ${stamp}`, 5);
  console.log('fixture', JSON.stringify(fx));
  if(!fx.id){ rec({attack:'stale_cache_reload_after_mutation',target:'seed',result:'BLOCKED',observed:'post failed '+fx.status}); process.exit(0); }
  // real inventory flip to 0 by the owner
  const inv=await L.api(s.stok,'PATCH',`/api/v1/products/${fx.id}/inventory`,{quantity:0});
  console.log('inventory flip ->', inv.status, JSON.stringify(inv.json).slice(0,150));
  // public view of stock after flip
  const det=await (await fetch(`${L.API}/api/v1/displayItem/itemDetails/${fx.id}`)).json().catch(()=>null);
  rec({ attack:'stale_cache_reload_after_mutation', target:`PATCH /products/${fx.id}/inventory {quantity:0}`,
        result:(inv.status===200)?'HELD':'BLOCKED',
        observed:`inventory status=${inv.status}; public itemDetails now=${det?(det.productName||det.errorCode):'parse-fail'} qty=${det&&det.productQuantity}` });
  if(inv.status!==200) process.exit(0);
  // BUYER reload
  const b=await L.newBrowser();
  const p=await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  await L.login(p,L.BUYER);
  const opened=await gotoProduct(p,fx.id,'AU018');
  const d=await a11yDump(p); const buy=d.find(n=>/^Buy now/i.test(n.t));
  const t=await L.allText(p);
  const oos=/Out of Stock/i.test(t);
  const base=await p.screenshot();
  let co=false;
  if(buy){ await tapRect(p,buy.r); await p.waitForTimeout(1300); const t2=await L.allText(p); co=/Order Summary|Delivery address|Place order/i.test(t2)&&!t2.includes('AU018 StockFlip'); }
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a8-stockflip.png`});
  rec({ attack:'stale_cache_reload_after_mutation', target:'buyer opens listing AFTER real stock flip 5->0',
        result:(buy&&buy.disabled==='true'&&oos&&!co)?'HELD':'DISPUTED',
        observed:`detail rendered=${opened}; Buy aria-disabled=${buy&&buy.disabled}; OutOfStock label=${oos}; checkout opened despite OOS=${co}`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a8-stockflip.png`] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
