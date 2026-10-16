const L = require('./lib_verify.js');
const APP='http://localhost:9131';
(async()=>{
 const b = await L.newBrowser();
 const ctx = await b.newContext({viewport:{width:375,height:667}});
 const p = await ctx.newPage();
 await p.goto(APP,{waitUntil:'load',timeout:60000});
 await p.waitForTimeout(9000);
 const t = await L.allText(p);
 console.log('HOME TEXT >>>\n'+t.slice(0,1500));
 console.log('URL:',p.url());
 console.log('BTN COUNT:', JSON.stringify(await p.evaluate(()=>document.querySelectorAll('flt-semantics[role="button"]').length)));
 console.log('INPUTS:', JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('input')].map(i=>i.type))));
 // hash nav
 await p.evaluate(()=>{window.location.hash='#/product/999999';});
 await p.waitForTimeout(6000);
 console.log('P404 TEXT >>>\n'+(await L.allText(p)).slice(0,600));
 console.log('URL2:',p.url());
 await b.close();
})().catch(e=>{console.error('ERR',e);process.exit(1);});
