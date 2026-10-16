// Step-1 interaction probe: dropdown + radio + typing on :9121
const L=require('./lib_verify.js'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const APP='http://localhost:9121';
(async()=>{
 const b=await L.newBrowser();
 const ctx=await L.newCtx(b,{viewport:{width:375,height:667}});
 const p=await ctx.newPage();
 await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
 await L.waitText(p,'Buy now',40000);
 console.log('login:', await L.login(p,{email:'au041s1787694437741@gmail.com',pw:'StrongPass!1'}));
 await p.evaluate(()=>{for(const k of Object.keys(localStorage)) if(k.includes('sell_form_draft')) localStorage.removeItem(k); location.hash='#/sell';});
 for(let i=0;i<60;i++){ if((await L.allText(p)).includes('Step 1 of 4')) break; await sleep(500);}
 await sleep(1500);
 const nodes=()=>p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>{const r=e.getBoundingClientRect();
   return {role:e.getAttribute('role'),tappy:e.getAttribute('flt-tappable')!==null,label:(e.textContent||'').trim().slice(0,60),
     x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};})
   .filter(n=>n.w>5&&n.h>5&&n.y<innerHeight-2&&n.y+n.h>2));
 let ns=await nodes();
 console.log('STEP1 visible labels:', JSON.stringify(ns.map(n=>`${n.role||'tap'}:${n.label.slice(0,28)}@${n.x},${n.y},${n.w}x${n.h}`),null,0).slice(0,1400));
 // tap Category
 const cat=ns.filter(n=>n.label.startsWith('Category')).sort((a,b)=>(a.w*a.h)-(b.w*b.h))[0];
 console.log('cat node:',JSON.stringify(cat));
 await p.mouse.click(cat.x+cat.w*0.5,cat.y+cat.h*0.5); await sleep(1800);
 ns=await nodes();
 console.log('AFTER CAT TAP options:', JSON.stringify(ns.filter(n=>n.role==='button'&&n.tappy).map(n=>n.label.slice(0,24)).slice(0,20)));
})();
