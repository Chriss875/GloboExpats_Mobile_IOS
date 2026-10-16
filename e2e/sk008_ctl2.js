// CONTROL: same bundle on :9132 (CORS-allowed after sandbox patch) — proves lane-config cause
const L = require('./lib_verify.js');
(async()=>{
 const b=await L.newBrowser();
 const ctx=await b.newContext({viewport:{width:375,height:667}});
 const p=await ctx.newPage();
 let ok=0,blocked=0; const samples=[];
 p.on('response',r=>{ if(/localhost:8083/.test(r.url())){ if(r.status()<400)ok++; else {blocked++; samples.push(r.status());} }});
 p.on('requestfailed',r=>{ if(/localhost:8083/.test(r.url())) blocked++; });
 await p.goto('http://localhost:9132/',{waitUntil:'load'});
 await p.waitForTimeout(13000);
 const t=await L.allText(p);
 console.log(JSON.stringify({apiOK:ok, blocked, catErr:t.includes('Could not load categories'), prodErr:t.includes('Could not load products'), price:(t.match(/TSh ?[\d,]+/)||['none'])[0], excerpt:t.slice(0,200).replace(/\s+/g,' ')}));
 await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
