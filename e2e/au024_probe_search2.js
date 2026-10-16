// probe 2: does the search field even receive the text? read input value + try search icon
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
 // keyboard.type (per-char, like r1 did) instead of insertText
 await p.keyboard.type(PROBE,{delay:25});await sleep(2500);
 const val=await si.inputValue().catch(()=>'(err)');
 console.log('INPUT VALUE:',val);
 let T=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n'));
 const has=T.includes(PROBE.slice(-10))||T.includes('AU024');
 console.log('tree contains AU024?',has,'| sample:',T.slice(0,150).replace(/\n/g,'|'));
 await p.keyboard.press('Enter');await sleep(4000);
 T=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n'));
 console.log('AFTER ENTER contains AU024?',T.includes('AU024'),'| sample:',T.slice(0,200).replace(/\n/g,'|'));
 await ctx.close();await b.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
