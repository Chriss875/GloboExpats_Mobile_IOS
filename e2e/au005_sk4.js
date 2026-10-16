// au005_sk4.js — A7 follow-up: does the buyer-only admin screen EVER leak raw copy, and
// does it recover (render real data) when the session IS an admin? Plus: analytics
// blank-card convention check on the admin dashboard with a real admin token.
const path=require('path'); const fs=require('fs');
process.chdir(path.resolve(__dirname,'..'));
const L=require('./lib_verify.js');
const APP='http://localhost:9121';
(async()=>{
  const b=await L.newBrowser();
  const p=await (await L.newCtx(b,{viewport:{width:375,height:667}})).newPage();
  const net=[];
  p.on('response',r=>{ if(r.url().includes(':8083/api/')) net.push(`${r.request().method()} ${r.url().split(':8083')[1].slice(0,70)} -> ${r.status()}`); });
  // buyer-only throwaway
  const fx=fs.readFileSync('/tmp/au005_throwaway.txt','utf8').split(' ');
  await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Buy now',45000).catch(()=>{});
  await p.evaluate(({t,em})=>{localStorage.setItem('flutter.auth_token',JSON.stringify(t));localStorage.setItem('flutter.auth_email',JSON.stringify(em));},{t:fx[2].trim(),em:fx[0]});
  await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',45000).catch(()=>{});
  net.length=0;
  await p.evaluate(()=>{window.location.hash='#/admin';}).catch(()=>{});
  for(let i=0;i<20;i++){ const t=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')).catch(()=>''); if(/Access Denied|Admin data unavailable|Users/.test(t)) break; await new Promise(r=>setTimeout(r,1000)); }
  const tBuyer=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')).catch(()=>'');
  console.log('BUYER_ADMIN_TEXT:', tBuyer.slice(0,200).replace(/\n+/g,' | '));
  console.log('BUYER_NET:', net.filter(x=>x.includes('/admin/')).slice(0,6).join(' ; '));
  await L.screenshot(p,'e2e/shots/AU-005/sk-a7b-buyer-admin-settled.png');
  // now swap to the real ADMIN account and reload the same route — recovery proof
  const tok=fs.readFileSync('/tmp/au005_admin_tok.txt','utf8').trim();
  await p.evaluate(t=>{localStorage.setItem('flutter.auth_token',JSON.stringify(t));localStorage.setItem('flutter.auth_email',JSON.stringify('mobile.test.20260820@gmail.com'));},tok);
  await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',45000).catch(()=>{});
  await p.evaluate(()=>{window.location.hash='#/';}).catch(()=>{}); await new Promise(r=>setTimeout(r,800));
  await p.evaluate(()=>{window.location.hash='#/admin';}).catch(()=>{});
  for(let i=0;i<25;i++){ const t=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')).catch(()=>''); if(t.includes('Sales trend')) break; await new Promise(r=>setTimeout(r,1000)); }
  const tAdm=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')).catch(()=>'');
  console.log('ADMIN_TEXT:', tAdm.slice(0,420).replace(/\n+/g,' | '));
  await L.screenshot(p,'e2e/shots/AU-005/sk-a7c-admin-real-375.png');
  await b.close();
})().catch(e=>{console.error('FATAL',e.message); process.exit(1);});
