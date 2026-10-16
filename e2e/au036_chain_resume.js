// au036_chain_resume.js — resume order C: move the preferred delivery window to
// TODAY (EVENING, dispatch opens 15:00 EAT = 12:00 UTC) then dispatch ->
// verify-delivery => DELIVERED+HELD. Release-payment is left for the browser leg.
const fs=require('fs'); const path=require('path');
process.chdir(path.resolve(__dirname,'..'));
const L=require('./lib_verify.js');
const fx=JSON.parse(fs.readFileSync('/tmp/au036_r5.json','utf8'));
const step=(s,x)=>console.log('[resume]',s,x===undefined?'':JSON.stringify(x).slice(0,200));
(async()=>{
 const btok=await L.apiLogin({email:fx.buyer.email,pw:fx.buyer.pw});
 const stok=await L.apiLogin({email:fx.seller.email,pw:fx.seller.pw});
 const atok=await L.apiLogin(L.ADMIN);
 const cid=(fx.chainC&&fx.chainC.orderId)||"43e07c7a-575e-4c5d-9e43-4d4c35201a69";
 const today=new Date().toISOString().slice(0,10);
 // re-run confirm-availability with TODAY + EVENING (opens 16:00 EAT=13:00Z, -1h = 12:00Z)
 const ca=await L.api(stok,'POST',`/api/v1/orders/${cid}/confirm-availability`,
   {preferredDeliverySlot:'EVENING',preferredDeliveryDate:today,orderId:cid});
 step('confirm-availability today/evening',{status:ca.status,body:ca.json});
 const at=await L.api(stok,'POST',`/api/v1/orders/${cid}/transporter`,
   {transporterId:fx.transporterId,proposedDeliveryTime:new Date(Date.now()+3600*1000).toISOString(),note:'au036 r5'});
 step('assign transporter',{status:at.status});
 if(![200,201].includes(at.status)) throw new Error('assign failed '+at.status);
 const dp=await L.api(stok,'POST',`/api/v1/orders/${cid}/dispatch`);
 step('dispatch',{status:dp.status,body:dp.json&&dp.json.message});
 if(dp.status!==200) throw new Error('dispatch still blocked');
 const od=await L.api(btok,'GET',`/api/v1/orders/${cid}`);
 step('in-transit',{s:od.json.status,code:od.json.deliveryCode});
 if(!od.json.deliveryCode) throw new Error('no code');
 const vd=await L.api(stok,'POST',`/api/v1/orders/${cid}/verify-delivery`,{code:od.json.deliveryCode});
 step('verify-delivery',{status:vd.status});
 const s5=await L.api(btok,'GET',`/api/v1/orders/${cid}`);
 fx.chainC=fx.chainC||{}; fx.chainC.orderId=cid; fx.chainC.inTransit={status:'IN_TRANSIT'};
 fx.chainC.delivered={status:s5.json.status,payout:s5.json.payoutStatus};
 step('state5',{s:s5.json.status,po:s5.json.payoutStatus});
 if(!(s5.json.status==='DELIVERED'&&s5.json.payoutStatus==='HELD')) throw new Error('not DELIVERED+HELD');
 fs.writeFileSync('/tmp/au036_r5.json',JSON.stringify(fx,null,1));
 console.log('RESUME OK — paused at DELIVERED+HELD for the browser leg');
})().catch(e=>{console.error('RESUME FAIL',e.message);process.exit(1);});
