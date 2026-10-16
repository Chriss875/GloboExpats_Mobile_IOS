// au041_rw_seed_r6.js — RW fixtures: throwaway seller + PINNED pickup address via real API.
const fs=require('fs'); const path=require('path');
process.chdir(path.resolve(__dirname,'..'));
const L=require('./lib_verify.js');
const stamp=Date.now();
const SELLER={email:`au041s${stamp}@gmail.com`,pw:'StrongPass!1'};
const STREET=`AU041 Pin Way ${stamp}`;
(async()=>{
  const reg=await L.api(null,'POST','/api/v1/auth/register',{firstName:'AU041',lastName:'Seller',password:SELLER.pw,emailAddress:SELLER.email});
  if(![200,201,400,409].includes(reg.status)) throw new Error('register '+JSON.stringify(reg.json).slice(0,100));
  const tok=await L.apiLogin(SELLER);
  const me=await L.api(tok,'GET','/api/v1/userManagement/user-details');
  const uid=me.json.userId ?? me.json.user?.userId;
  const atok=await L.apiLogin(L.ADMIN);
  const ver=await L.api(atok,'PATCH',`/api/v1/admin/users/${uid}/status`,{status:'VERIFIED'});
  const addr=await L.api(tok,'POST','/api/v1/add-address',{street:STREET,city:'Dar es Salaam',region:'Dar es Salaam',
    country:'Tanzania',label:'AU041 Pin',latitude:-6.8023,longitude:39.2719,isDefault:true,phoneNumber:'+255713000441'});
  console.log(JSON.stringify({stamp,seller:SELLER,addressStatus:addr.status}));
})();
