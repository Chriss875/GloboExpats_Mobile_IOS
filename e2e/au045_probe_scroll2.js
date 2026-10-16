// Probe 2: can mouse.wheel bring the discover chips into the 375x667 viewport?
const { newBrowser, newCtx, waitText } = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP='http://localhost:9130';
(async()=>{
  const b=await newBrowser();
  const ctx=await newCtx(b,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await waitText(p,'GloboExpats',45000);
  await p.waitForTimeout(1500);
  const chipY=()=>p.evaluate(()=>{
    let out=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if(out!=null) return;
      if((e.textContent||'').trim()==='Newest'&&e.getAttribute('flt-tappable')!==null){
        const r=e.getBoundingClientRect(); out={y:Math.round(r.y),x:Math.round(r.x)};
      }
    });
    return out;
  });
  console.log('initial',await chipY());
  // strategy A: wheel over center
  for(let i=0;i<16;i++){
    await p.mouse.move(187,333); await p.mouse.wheel(0,400); await p.waitForTimeout(250);
    const c=await chipY(); console.log('wheelA step',i,c);
    if(c&&c.y>10&&c.y<600){ console.log('REACHED via A'); break; }
  }
  const final=await chipY();
  if(!final||final.y<=10||final.y>=600){
    console.log('strategy A failed; try keyboard PageDown / touch drag');
    for(let i=0;i<12;i++){
      await p.mouse.move(187,500); await p.mouse.down();
      await p.mouse.move(187,120,{steps:8}); await p.mouse.up();
      await p.waitForTimeout(350);
      const c=await chipY(); console.log('drag step',i,c);
      if(c&&c.y>10&&c.y<600){ console.log('REACHED via drag'); break; }
    }
  }
  await b.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
