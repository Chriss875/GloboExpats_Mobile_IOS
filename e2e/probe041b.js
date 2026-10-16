// Probe step-3 pricing inputs on :9121 — what does the DOM expose?
const L=require('./lib_verify.js'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const APP='http://localhost:9121';
(async()=>{
 const b=await L.newBrowser();
 const ctx=await L.newCtx(b,{viewport:{width:375,height:667}});
 const p=await ctx.newPage();
 await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
 await L.waitText(p,'Buy now',40000);
 console.log('login:', await L.login(p,{email:'au041s1787693274023@gmail.com',pw:'StrongPass!1'}));
 await p.evaluate(()=>{for(const k of Object.keys(localStorage)) if(k.includes('sell_form_draft')) localStorage.removeItem(k); location.hash='#/sell';});
 for(let i=0;i<60;i++){ if((await L.allText(p)).includes('Step 1 of 4')) break; await sleep(500);}
 // fill minimum to reach step3: category + address + title
 const dumpInputs=(tag)=>p.evaluate(()=>{
   return [...document.querySelectorAll('input,textarea')].map(i=>{const r=i.getBoundingClientRect();
     return {tag:'in', al:i.getAttribute('aria-label'), type:i.type, ph:i.placeholder,
       x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),v:(i.value||'').slice(0,20)};});
 });
 console.log('step1 inputs:', JSON.stringify(await dumpInputs()));
})();
