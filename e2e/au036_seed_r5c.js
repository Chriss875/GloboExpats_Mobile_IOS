// au036_seed_r5c.js — mint order C on the SAME r5 product and drive the real
// admin/seller chain: confirm-payment -> confirm-availability -> transporter ->
// dispatch -> verify-delivery => DELIVERED with payoutStatus=HELD (state 5).
// STOPS there: release-payment happens MID-BROWSER so the UI state flip is filmed.
const fs=require('fs'); const path=require('path');
process.chdir(path.resolve(__dirname,'..'));
const L=require('./lib_verify.js');
const fx=JSON.parse(fs.readFileSync('/tmp/au036_r5.json','utf8'));
const step=(s,x)=>console.log('[chain]',s,x===undefined?'':JSON.stringify(x).slice(0,220));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const btok=await L.apiLogin({email:fx.buyer.email,pw:fx.buyer.pw});
 const stok=await L.apiLogin({email:fx.seller.email,pw:fx.seller.pw});
 fx.buyer.token=btok; fx.seller.token=stok;
 const atok=await L.apiLogin(L.ADMIN); fx.adminToken=atok;
 // transporter (MOTORBIKE carries the BODA tariff class — AU-037 lesson)
 const tr=await L.api(stok,'POST','/api/v1/transporters',{
   fullName:`AU036 R5 Rider ${fx.stamp}`,phoneNumber:'+255715000444',whatsAppPhoneNumber:'+255715000444',
   vehicleType:'MOTORBIKE',plateNumber:`AU36R5-${fx.stamp%10000}`,active:true});
 step('transporter',{status:tr.status,id:tr.json&&tr.json.transporterId});
 if(tr.status!==201) throw new Error('transporter failed');
 fx.transporterId=tr.json.transporterId;
 // checkout order C
 const buyDetails={
   firstName:'AU036R5',lastName:'Buyer',emailAddress:fx.buyer.email,phoneNumber:'+255713000555',
   address:`AU036 R5 Street ${fx.stamp}`,city:'Dar es Salaam',state:'Dar es Salaam',country:'Tanzania',
   zipCode:'',deliveryMethod:"Seller's delivery",paymentMethodType:'MOBILE_MONEY',agreeToTerms:true,
   fulfillmentType:'SELLER_DELIVERY',currency:'TZS',latitude:-6.7924,longitude:39.2083,
   preferredDeliveryWindows:[{date:new Date(Date.now()+86400000).toISOString().slice(0,10),slot:'AFTERNOON'}]};
 const pf=await L.api(btok,'POST','/api/v1/checkout/proforma',{buyDetails,items:[{productId:fx.productId,quantity:1}]});
 step('proforma C',{status:pf.status,num:pf.json&&pf.json.proformaNumber,total:pf.json&&pf.json.grandTotal});
 if(![200,201].includes(pf.status)) throw new Error('proforma C failed');
 const sp=await L.api(btok,'POST',`/api/v1/proformas/${pf.json.proformaId}/submit-payment`,
   {transactionReferences:[`AU036R5-C-${fx.stamp}`],paymentMethodType:'MOBILE_MONEY'});
 step('submit-payment C',{status:sp.status});
 let ids=((pf.json.sellerGroups)||[]).map(g=>g.orderId).filter(Boolean);
 if(!ids.length) ids=((sp.json&&sp.json.sellerGroups)||[]).map(g=>g.orderId).filter(Boolean);
 let cid=ids[0];
 if(!cid){ const rows=await L.api(btok,'GET','/api/v1/orders');
   cid=(Array.isArray(rows.json)?rows.json:[]).find(o=>o.totalAmount===pf.json.grandTotal&&o.status==='AWAITING_PAYMENT');
   cid=cid&&cid.orderId; }
 step('order C id',{cid});
 const cp=await L.api(atok,'POST',`/api/v1/admin/proformas/${pf.json.proformaId}/confirm-payment`,{});
 step('admin confirm-payment',{status:cp.status});
 const s3=await L.api(btok,'GET',`/api/v1/orders/${cid}`);
 fx.chain={orderId:cid,proformaNumber:pf.json.proformaNumber,
   asc:{status:s3.json.status,payout:s3.json.payoutStatus}};
 step('state3',{s:s3.json.status,po:s3.json.payoutStatus});
 if(s3.json.status!=='AWAITING_SELLER_CONFIRMATION') throw new Error('not ASC');
 const ca=await L.api(stok,'POST',`/api/v1/orders/${cid}/confirm-availability`,
   {preferredDeliverySlot:'AFTERNOON',preferredDeliveryDate:new Date(Date.now()+86400000).toISOString().slice(0,10),orderId:cid});
 step('confirm-availability',{status:ca.status,body:ca.json});
 const s4=await L.api(btok,'GET',`/api/v1/orders/${cid}`);
 fx.chain.awd={status:s4.json.status,payout:s4.json.payoutStatus};
 step('state4',{s:s4.json.status,po:s4.json.payoutStatus});
 await sleep(1500);
 const at=await L.api(stok,'POST',`/api/v1/orders/${cid}/transporter`,
   {transporterId:fx.transporterId,proposedDeliveryTime:new Date(Date.now()+3600*1000).toISOString(),note:'au036 r5'});
 step('assign transporter',{status:at.status,body:at.json});
 if(![200,201].includes(at.status)) throw new Error('assign failed');
 const dp=await L.api(stok,'POST',`/api/v1/orders/${cid}/dispatch`);
 step('dispatch',{status:dp.status,body:dp.json});
 if(dp.status!==200) throw new Error('dispatch failed');
 const od=await L.api(btok,'GET',`/api/v1/orders/${cid}`);
 fx.chain.inTransit={status:od.json.status,code:od.json.deliveryCode};
 step('in-transit',{s:od.json.status,code:od.json.deliveryCode});
 if(!od.json.deliveryCode) throw new Error('no deliveryCode');
 const vd=await L.api(stok,'POST',`/api/v1/orders/${cid}/verify-delivery`,{code:od.json.deliveryCode});
 step('verify-delivery',{status:vd.status});
 const s5=await L.api(btok,'GET',`/api/v1/orders/${cid}`);
 fx.chain.delivered={status:s5.json.status,payout:s5.json.payoutStatus};
 step('state5 delivered-held',{s:s5.json.status,po:s5.json.payoutStatus});
 if(!(s5.json.status==='DELIVERED'&&s5.json.payoutStatus==='HELD')) throw new Error('not DELIVERED+HELD');
 fs.writeFileSync('/tmp/au036_r5.json',JSON.stringify(fx,null,1));
 console.log('CHAIN OK — paused at DELIVERED+HELD, release left for the browser leg');
})().catch(e=>{console.error('CHAIN FAIL',e.message);process.exit(1);});
