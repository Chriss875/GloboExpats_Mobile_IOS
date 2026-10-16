// probe: what does the search screen show after typing full stamp? dump a11y text
const fs=require('fs');const path=require('path');
process.chdir(path.resolve(__dirname,'..'));
const L=require('./lib_verify.js');
const APP='http://localhost:9113';
const fx=JSON.parse(fs.readFileSync('/tmp/au024_fixtures.json','utf8'));
const PROBE=`AU024 Enum Probe Chair ${fx.stamp}`;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await L.newBrowser();const ctx=await L.newCtx(b,{viewport:{width:375,height:667}});
 const p=await ctx.newPage();
 await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
 await L.waitText(p,'Buy now',45000);
 await p.goto(APP+'/#/search',{waitUntil:'load'}).catch(()=>{});await sleep(3500);
 const si=p.locator('input[type="text"]').first();
 await si.click({force:true}).catch(()=>{});await sleep(700);
 await p.keyboard.insertText(PROBE);await sleep(2500);
 // DON'T press Enter — check live-as-you-type results first
 let T=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n'));
 console.log('LIVE (no enter):',T.slice(0,300).replace(/\n/g,'|'));
 await p.keyboard.press('Enter');await sleep(4000);
 T=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n'));
 console.log('AFTER ENTER:',T.slice(0,400).replace(/\n/g,'|'));
 await ctx.close();await b.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
