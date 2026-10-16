// What does the sandbox backend do with client-sent pricing/commission fields?
const L=require('./lib_verify.js');
const API='http://localhost:8083';
const stamp=Date.now();
const email=`au041p${stamp}@gmail.com`, pw='StrongPass!1';
(async()=>{
 await L.api(null,'POST','/api/v1/auth/register',{firstName:'P',lastName:'T',password:pw,emailAddress:email});
 const tok=await L.apiLogin({email,pw});
 const me=await L.api(tok,'GET','/api/v1/userManagement/user-details');
 const uid=me.json.userId ?? me.json.user?.userId;
 const atok=await L.apiLogin(L.ADMIN);
 await L.api(atok,'PATCH',`/api/v1/admin/users/${uid}/status`,{status:'VERIFIED'});
 const cats=(await(await fetch(API+'/api/v1/products/categories')).json());
 const f=cats.find(c=>c.categoryName==='Furniture');
 const png=require('fs').readFileSync('fixtures/receipt-proof.png');
 async function pub(tag, extra){
   const prod=Object.assign({
     productName:`AU041 ${tag} ${stamp}`,categoryId:f.categoryId,
     subcategoryId:(f.subcategories.find(s=>(s.subcategoryName||'').startsWith('Sofas'))||{}).subcategoryId,
     productCountry:'tanzania',productRegion:'dar es salaam',productStreet:'probe way',
     productZipCode:'Not specified',whatsappNumber:'',productDescription:'pricing probe',
     currency:'TZS',productQuantity:1,latitude:-6.8023,longitude:39.2719,
     transportRequirement:'REQUIRED',deliveryTransportMode:'BODA'},extra);
   const form=new FormData();
   form.append('product',new Blob([Buffer.from(JSON.stringify(prod))],{type:'application/json'}));
   form.append('images',new Blob([png],{type:'image/png'}),'m.png');
   const r=await fetch(API+'/api/v1/products/post-product',{method:'POST',headers:{Authorization:'Bearer '+tok},body:form});
   const b=await r.json().catch(()=>null);
   const pid=b&&(b.productId||(b.data&&b.data.productId));
   if(!pid){console.log(tag,'POST',r.status,JSON.stringify(b).slice(0,150));return;}
   const d=((await L.api(null,'GET',`/api/v1/displayItem/itemDetails/${pid}`)).json)||{};
   console.log(JSON.stringify({tag,pid,sent:extra,
     back:{ask:d.productAskingPrice??d.askingPrice,ftsp:d.finalTotalSellingPrice,payout:d.sellerPayout,
       sfca:d.sellerFacingCommissionAmount,gpc:d.grossPlatformCommission,vat:d.vat,scf:d.selcomCommissionFee,
       npac:d.platformNetProfitAfterCuts,ra:d.roundingAdjustment,ccp:d.categoryCommissionPercentage}}));
   await L.api(tok,'PATCH',`/api/v1/products/status/${pid}`,{status:'ARCHIVED'});
 }
 await pub('A_payout_only',{sellerPayout:100000});
 await pub('B_price_only',{askingPrice:117000,finalTotalSellingPrice:117000});
 await pub('C_both_spec',{sellerPayout:100000,askingPrice:117000,finalTotalSellingPrice:117000,
   categoryCommissionPercentage:10,sellerFacingCommissionAmount:17000,grossPlatformCommission:12406.78,
   vat:2593.22,selcomCommissionFee:2340,selcomTransactionFee:2000,platformNetProfitBeforeCuts:12406.78,
   platformNetProfitAfterCuts:10066.78,roundingAdjustment:66.78,
   sameRegionDeliveryFeeMin:4000,sameRegionDeliveryFeeMax:17000,outsideRegionDeliveryFeeMin:17000,outsideRegionDeliveryFeeMax:137000});
})();
