// Attack 7 FINAL-4: stock flip on a listing that STAYS public after the update.
// Fixture 846 lost public visibility because PATCH /update wiped delivery setup
// (server-side behavior, not a mobile defect). Retry preserving all fields: send the
// FULL original payload (as the seller app does) — only productQuantity changed.
const { L, APP, SHOT, rec, a11yDump, tapRect, gotoProduct } = require('./au018_sk_lib.js');
const fs=require('fs'), path=require('path');
const PW='StrongPass!1';
(async () => {
  const stamp=Date.now();
  const email=`au018sa_${stamp}@gmail.com`;
  await L.api(null,'POST','/api/v1/auth/register',{firstName:'AU018SA',lastName:'Seller',password:PW,emailAddress:email});
  const stok=(await (await fetch(`${L.API}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:PW})})).json()).token;
  const atok=await L.apiLogin(L.ADMIN);
  const me=await L.api(stok,'GET','/api/v1/userManagement/user-details');
  await L.api(atok,'PATCH',`/api/v1/admin/users/${me.json.userId}/status`,{status:'VERIFIED'});
  const P={categoryId:1,subcategoryId:5,productCountry:'Tanzania',productRegion:'Dar es Salaam',productStreet:'Mikocheni',currency:'TZS',condition:'NEW',productName:`AU018 StockFlip F ${stamp}`,productQuantity:5,askingPrice:7000};
  function formFor(payload){
    const f=new FormData();
    f.append('product',new Blob([Buffer.from(JSON.stringify(payload))],{type:'application/json'}),'p.json');
    f.append('images',new Blob([fs.readFileSync(path.join(__dirname,'fixtures','receipt-proof.png'))],{type:'image/png'}),'r.png');
    return f;
  }
  let pr=await fetch(`${L.API}/api/v1/products/post-product`,{method:'POST',headers:{Authorization:'Bearer '+stok},body:formFor(P)});
  let pj=await pr.json().catch(()=>null);
  const pid=pj&&(pj.productId||pj.id||(pj.product&&(pj.product.productId||pj.product.id)));
  console.log('fixture',pr.status,pid);
  if(!pid) process.exit(0);
  // capture the FULL server payload before mutation (what the seller edit screen loads)
  const btok=await L.apiLogin(L.BUYER);
  const before=await L.api(btok,'GET',`/api/v1/displayItem/itemDetails/${pid}`);
  console.log('before qty=',before.json&&before.json.productQuantity);
  // seller flips ONLY quantity via the real route, echoing every other field back
  const full = {...P, productQuantity:0};
  const ur=await fetch(`${L.API}/api/v1/products/update/${pid}`,{method:'PATCH',headers:{Authorization:'Bearer '+stok},body:formFor(full)});
  console.log('update ->',ur.status,(await ur.text()).slice(0,100));
  const det=await L.api(btok,'GET',`/api/v1/displayItem/itemDetails/${pid}`);
  console.log('after flip: status',det.status,'qty=',det.json&&det.json.productQuantity);

  // buyer reload
  const b=await L.newBrowser();
  const p=await (await b.newContext({viewport:{width:375,height:667}})).newPage();
  await L.login(p,L.BUYER);
  const opened=await gotoProduct(p,pid,'AU018');
  const d=await a11yDump(p); const buy=d.find(n=>/^Buy now/i.test(n.t));
  const t=await L.allText(p);
  const oos=/Out of Stock/i.test(t);
  let co=false;
  if(buy){ await tapRect(p,buy.r); await p.waitForTimeout(1300); const t2=await L.allText(p); co=/Order Summary|Delivery address|Place order/i.test(t2)&&!t2.includes('AU018 StockFlip'); }
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a8e-stockflip.png`});
  rec({ attack:'stale_cache_reload_after_mutation', target:`real PATCH update/${pid} qty->0 (full payload); buyer reload`,
        result:(opened&&buy&&buy.disabled==='true'&&oos&&!co)?'HELD':'DISPUTED',
        observed:`rendered=${opened}; Buy aria-disabled=${buy&&buy.disabled}; OutOfStock=${oos}; checkoutOpened=${co}`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a8e-stockflip.png`] });
  await b.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
