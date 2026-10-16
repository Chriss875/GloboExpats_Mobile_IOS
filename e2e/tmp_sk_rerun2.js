// A5 isolate: unknown email at stage1 — poll body.innerText (snackbar may not reach semantics)
const fs=require('fs'); process.chdir('/home/devsystemadmin/GloboExpats_Mobile/e2e');
const lib=require('./lib_verify.js'); const APP='http://localhost:9108';
(async()=>{
 const b=await lib.newBrowser();
 const c=await b.newContext({viewport:{width:375,height:667}}); const p=await c.newPage();
 await p.goto(APP+'/#/reset-password',{waitUntil:'load',timeout:90000}).catch(()=>{});
 await lib.waitText(p,'Reset Your Password',30000); await p.waitForTimeout(5000);
 const ghost=`au012.ghost.${Date.now()}@gmail.com`;
 const ei=p.locator('input[type="text"]').first();
 await ei.click({force:true}); await p.keyboard.type(ghost,{delay:20});
 await p.locator('flt-semantics[role="button"]',{hasText:'Send Verification Code'}).first().click({timeout:8000});
 let msg=null;
 for(let i=0;i<48;i++){ await p.waitForTimeout(250);
   const t=await p.evaluate(()=>document.body.innerText||'');
   const m=t.match(/No account found[^\n]*|Failed to send[^\n]*/);
   if(m){msg=m[0]+' @'+((i+1)*0.25)+'s';break;} }
 console.log('A5 message:',msg ?? 'NONE');
 const still=(await lib.allText(p)).includes('Reset Your Password');
 console.log('A5 stays stage1:',still);
 await p.screenshot({path:'shots/AU-012/AU-012-skeptic-ghost.png'});
 // A3-mismatch isolate: does the mismatch error show in innerText?
 await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
