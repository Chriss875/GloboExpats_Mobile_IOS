const L = require('./lib_verify.js');
const APP='http://localhost:9131';
(async()=>{
 const b = await L.newBrowser();
 const ctx = await b.newContext({viewport:{width:375,height:667}});
 const p = await ctx.newPage();
 const reqs=[], fails=[];
 p.on('request', r=>{ if(/8083|8084/.test(r.url())) reqs.push({u:r.url().slice(0,110), m:r.method(), h:r.headers()['origin']||''}); });
 p.on('response', r=>{ if(/8083|8084/.test(r.url())) reqs.push({u:r.url().slice(0,110), status:r.status()}); });
 p.on('requestfailed', r=>{ if(/8083|8084/.test(r.url())) fails.push({u:r.url().slice(0,110), err:r.failure()&&r.failure().errorText}); });
 await p.goto(APP,{waitUntil:'load',timeout:60000});
 await p.waitForTimeout(14000);
 console.log('REQS:', JSON.stringify(reqs,null,1));
 console.log('FAILS:', JSON.stringify(fails,null,1));
 const t=await L.allText(p);
 console.log('HAS cat error:', t.includes('Could not load categories'), ' prod error:', t.includes('Could not load products'));
 await b.close();
})().catch(e=>{console.error('ERR',e);process.exit(1);});
