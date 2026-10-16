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
   return {role:e.getAttribute('role'),tappy:e.getAttribute('flt-tappable')!==null,label:(e.textContent||'').trim().slice(0,70),
     x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};})
   .filter(n=>n.w>5&&n.h>5));
 // open category, click Furniture at CENTER
 let ns=await nodes();
 const cat=ns.filter(n=>n.label.startsWith('Category *')).sort((a,b)=>(a.w*a.h)-(b.w*b.h))[0];
 await p.mouse.click(cat.x+cat.w*0.5,cat.y+cat.h*0.5); await sleep(1800);
 ns=await nodes();
 const furn=ns.filter(n=>n.label.startsWith('Furniture')&&n.role==='button');
 console.log('furniture option node:',JSON.stringify(furn));
 if(furn.length){const f=furn.sort((a,b)=>(a.w*a.h)-(b.w*b.h))[0];
   await p.mouse.click(f.x+f.w*0.5,f.y+f.h*0.5); await sleep(1600);}
 ns=await nodes();
 console.log('after furniture, all rows y>240:', JSON.stringify(ns.filter(n=>n.y>230).map(n=>`${n.role||'tap'}:${n.label.slice(0,40)}@${n.x},${n.y},${n.w}x${n.h}`),null,0).slice(0,1500));
})();
