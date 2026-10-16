// A6 isolate: reference :3000 reset-password — drive it properly (React controlled inputs)
const fs=require('fs'); process.chdir('/home/devsystemadmin/GloboExpats_Mobile/e2e');
const lib=require('./lib_verify.js'); const {API}=lib;
(async()=>{
 const b=await lib.newBrowser();
 const c=await b.newContext({viewport:{width:375,height:667}}); const p=await c.newPage();
 const em=`au012.ref.${Date.now()}@gmail.com`;
 const oldPw='RefOld!2222';
 await fetch(`${API}/api/v1/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:'R',lastName:'F',password:oldPw,emailAddress:em})});
 const net=[];
 p.on('response',async r=>{const u=r.url(); if(u.includes('userManagement')){let bb='';try{bb=(await r.text()).slice(0,50);}catch(e){}net.push(r.status()+' '+u.split('/api/v1/')[1]+' :: '+bb);} });
 await p.goto('http://localhost:3000/reset-password',{waitUntil:'domcontentloaded',timeout:90000}).catch(e=>console.log('goto:',e.message.split('\n')[0]));
 await p.waitForTimeout(8000);
 console.log('REF text head:',(await p.evaluate(()=>document.body.innerText)).replace(/\n+/g,' | ').slice(0,220));
 const inputs=await p.locator('input').count();
 console.log('ref inputs:',inputs);
 // fill email via keyboard on first visible input
 for(let i=0;i<inputs;i++){ const vis=await p.locator('input').nth(i).isVisible().catch(()=>false); if(vis){ await p.locator('input').nth(i).click({force:true}); break; } }
 await p.keyboard.type(em,{delay:25});
 await lib.screenshot(p,'shots/AU-012/AU-012-ref-parity-filled.png');
 // find the submit button by role
 const btn=p.getByRole('button').filter({hasText:/send|continue|next/i}).first();
 const btxt=await btn.textContent().catch(()=>null);
 console.log('submit button label:',btxt);
 await btn.click({timeout:8000}).catch(async()=>{console.log('btn click fail; Enter'); await p.keyboard.press('Enter');});
 let adv=false;
 for(let i=0;i<20;i++){ await p.waitForTimeout(1000);
   const t=(await p.evaluate(()=>document.body.innerText||''));
   if(/enter the .*(code|otp)|code we sent|verify your email/i.test(t)){adv=true;break;}
 }
 console.log('REF advanced to OTP stage:',adv);
 console.log('REF network:',JSON.stringify(net,null,1));
 await p.waitForTimeout(500);
 await lib.screenshot(p,'shots/AU-012/AU-012-ref-parity-after-send.png');
 await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
