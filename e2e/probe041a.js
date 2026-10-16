const L=require('./lib_verify.js'); const fs=require('fs');
const API='http://localhost:8083';
(async()=>{
 // find the au041 seller created last run
 const stamp=1787693274023;
 const email=`au041s${stamp}@gmail.com`;
 const tok=await L.apiLogin({email,pw:'StrongPass!1'});
 const addrs=((await L.api(tok,'GET','/api/v1/get-addresses')).json)||[];
 console.log('ADDRESSES:',JSON.stringify(addrs,null,1).slice(0,1200));
})();
