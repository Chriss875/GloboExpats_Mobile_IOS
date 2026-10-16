// A6 again: check ref input count/types + which input took the text
const fs=require('fs'); process.chdir('/home/devsystemadmin/GloboExpats_Mobile/e2e');
const lib=require('./lib_verify.js'); const {API}=lib;
(async()=>{
 const b=await lib.newBrowser();
 const c=await b.newContext({viewport:{width:375,height:667}}); const p=await c.newPage();
 const net=[];
 p.on('response',async r=>{if(r.url().includes('userManagement')){let bb='';try{bb=(await r.text()).slice(0,40);}catch(e){}net.push(r.status()+' '+r.url().split('/api/v1/')[1]+' :: '+bb);} });
 await p.goto('http://localhost:3000/reset-password',{waitUntil:'domcontentloaded',timeout:90000}).catch(()=>{});
 await p.waitForTimeout(8000);
 console.log('inputs:',await p.locator('input').count());
 for(let i=0;i<await p.locator('input').count();i++){
   console.log(i, await p.locator('input').nth(i).getAttribute('type'), 'visible:', await p.locator('input').nth(i).isVisible().catch(()=>false));
 }
 // use placeholder-based selection
 const email = `au012.ref2.${Date.now()}@gmail.com`;
 await fetch(`${API}/api/v1/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:'R',lastName:'F2',password:'RefOld!3333',emailAddress:email})});
 const byPh = p.locator('input[placeholder*="mail" i]').first();
 const cnt = await byPh.count();
 console.log('placeholder-email inputs:',cnt);
 const target = cnt?byPh:p.locator('input').nth(0);
 await target.click({force:true}); await p.waitForTimeout(200);
 await p.keyboard.type(email,{delay:25});
 console.log('value now:', JSON.stringify(await p.locator('input').nth(0).inputValue().catch(()=>'?')));
 const btn=p.getByRole('button').filter({hasText:/send verification/i}).first();
 console.log('btn found:', await btn.count());
 await btn.click({timeout:8000}).catch(e=>console.log('btn err:', e.message.split('\n')[0]));
 let adv=false;
 for(let i=0;i<20;i++){ await p.waitForTimeout(1000);
   const t=(await p.evaluate(()=>document.body.innerText||''));
   if(/enter the .*(code|otp)|code we sent|verify your email|verification code/i.test(t)){adv=true;break;}
 }
 console.log('REF advanced:',adv);
 console.log('REF network:',JSON.stringify(net));
 await lib.screenshot(p,'shots/AU-012/AU-012-ref-parity-after-send.png');
 await b.close();
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
