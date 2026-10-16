// au005_sk3.js — resolve A10 DISPUTED: tablet 404 re-probe with longer settle + fresh context.
const path=require('path'); const fs=require('fs');
process.chdir(path.resolve(__dirname,'..'));
const L=require('./lib_verify.js');
const APP='http://localhost:9121';
(async()=>{
  const b=await L.newBrowser();
  const q=await (await L.newCtx(b,{viewport:{width:768,height:1024}})).newPage();
  const net=[];
  q.on('response',r=>{ if(r.url().includes(':8083/api/')) net.push(`${r.request().method()} ${r.url().split(':8083')[1].slice(0,60)} -> ${r.status()}`); });
  await q.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(q,'Buy now',45000).catch(()=>{});
  await q.evaluate(()=>{window.location.hash='#/product/999999';}).catch(()=>{});
  for(let i=0;i<25;i++){ const t=await q.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')).catch(()=>'');
    if(t.includes('Product not found')||t.includes('Could not load')){ console.log('settled at',i,'s'); break; } await new Promise(r=>setTimeout(r,1000)); }
  const t=await q.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')).catch(()=>'');
  console.log('TEXT:', t.slice(0,200).replace(/\n+/g,' | '));
  console.log('NET:', net.join(' ; '));
  await L.screenshot(q,'e2e/shots/AU-005/sk-a10b-tablet-404-settled.png');
  // also check the analytics blank-card convention on tablet with an admin session
  const tok=fs.readFileSync('/tmp/au005_admin_tok.txt','utf8').trim();
  await q.evaluate(t2=>{localStorage.setItem('flutter.auth_token',JSON.stringify(t2)); localStorage.setItem('flutter.auth_email',JSON.stringify('mobile.test.20260820@gmail.com'));},tok);
  await q.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(q,'Buy now',45000).catch(()=>{});
  await q.evaluate(()=>{window.location.hash='#/admin';}).catch(()=>{}); 
  for(let i=0;i<20;i++){ const t2=await q.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')).catch(()=>''); if(t2.includes('Sales trend')||t2.includes('Admin data unavailable')) break; await new Promise(r=>setTimeout(r,1000)); }
  const ta=await q.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')).catch(()=>'');
  console.log('ADMIN_TEXT:', ta.slice(0,400).replace(/\n+/g,' | '));
  await L.screenshot(q,'e2e/shots/AU-005/sk-a11-tablet-admin-charts.png');
  await b.close();
})().catch(e=>{console.error('FATAL',e.message); process.exit(1);});
