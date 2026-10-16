// sk008_lib.js — AU-008 skeptic-r12 shared helpers
const L = require('./lib_verify.js');
const SHOT = (vp,state)=>`/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-008/AU-008-sk2-${vp}-${state}.png`;
async function shot(p,vp,state){ await L.screenshot(p,SHOT(vp,state)); return SHOT(vp,state); }
async function apiStats(p){
  return await new Promise(res=>{
    const s={ok:0,bad:0,failed:0,urls:[],failedUrls:[]};
    const onR=r=>{ if(/localhost:808[34]/.test(r.url())){ if(r.status()<400){s.ok++;} else {s.bad++; s.urls.push(r.status()+' '+r.url().slice(21,90));} }};
    const onF=r=>{ if(/localhost:808[34]/.test(r.url())){s.failed++; s.failedUrls.push((r.failure()&&r.failure().errorText||'?')+' '+r.url().slice(21,90));}};
    p.on('response',onR); p.on('requestfailed',onF);
    setTimeout(()=>res(s), 100);
  });
}
module.exports={L,SHOT,shot,apiStats};
