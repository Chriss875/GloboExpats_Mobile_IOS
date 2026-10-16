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
 const nodes=(vis=false)=>p.evaluate((vis)=>{
   const out=[...document.querySelectorAll('flt-semantics')].map(e=>{const r=e.getBoundingClientRect();
     return {role:e.getAttribute('role'),ac:e.getAttribute('aria-checked'),label:(e.textContent||'').trim().slice(0,50),
       x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};});
   return out.filter(n=>n.w>5&&n.h>5&&(vis||(n.y<innerHeight-2&&n.y+n.h>2))); },vis);
 // pick Furniture
 let ns=await nodes();
 const cat=ns.filter(n=>n.label.startsWith('Category *')).sort((a,b)=>(a.w*a.h)-(b.w*b.h))[0];
 await p.mouse.click(cat.x+cat.w*0.5,cat.y+cat.h*0.5); await sleep(1800);
 ns=await nodes(true);
 const furn=ns.filter(n=>n.label.startsWith('Furniture')&&n.role==='button').sort((a,b)=>(a.w*a.h)-(b.w*b.h))[0];
 await p.mouse.click(furn.x+furn.w*0.5,furn.y+furn.h*0.5); await sleep(1600);
 ns=await nodes();
 console.log('radios:',JSON.stringify(ns.filter(n=>n.role==='radio')));
 const radio=ns.filter(n=>n.role==='radio')[0];
 // click LEFT EDGE (radio circle)
 await p.mouse.click(radio.x+14,radio.y+radio.h/2); await sleep(1300);
 ns=await nodes();
 console.log('after left-edge click radios:',JSON.stringify(ns.filter(n=>n.role==='radio')));
 // scroll top, type title
 await p.mouse.move(187,330); await p.mouse.wheel(0,-3000); await sleep(700);
 const ins=await p.evaluate(()=>[...document.querySelectorAll('input')].map(i=>({al:i.getAttribute('aria-label'),ro:i.readOnly,y:Math.round(i.getBoundingClientRect().y)})));
 console.log('inputs:',JSON.stringify(ins));
 const ti=p.locator('input[aria-label="Item title *"]').first();
 await ti.click({force:true}); await sleep(400);
 await p.keyboard.type('Probe Title X1',{delay:40}); await sleep(900);
 console.log('title value:', await ti.inputValue().catch(e=>'ERR '+e.message.slice(0,60)));
 const cont=ns.filter(n=>n.label==='Continue'&&n.role==='button')[0] || (await nodes()).filter(n=>n.label==='Continue')[0];
 await p.mouse.click(cont.x+cont.w/2,cont.y+cont.h/2); await sleep(1600);
 const T=await L.allText(p);
 console.log('AFTER CONTINUE: step2?',T.includes('Step 2 of 4'),'| error slice:',(T.match(/required[^]{0,60}|Please[^]{0,60}|Choose[^]{0,60}/)||['none'])[0].replace(/\n/g,' | '));
 console.log('fulltext head:',T.replace(/\n/g,' | ').slice(0,600));
})();
