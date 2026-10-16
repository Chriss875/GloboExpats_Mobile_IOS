// Probe: chip rect visibility across tab switches at 375x667 on :9130.
const { newBrowser, newCtx, waitText } = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP='http://localhost:9130';
(async()=>{
  const b=await newBrowser();
  const ctx=await newCtx(b,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await waitText(p,'GloboExpats',45000);
  await p.waitForTimeout(1500);
  const chips=async()=>p.evaluate(()=>{
    const out={};
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(['Newest','Featured','Top Picks'].includes(t)&&e.getAttribute('flt-tappable')!==null){
        const r=e.getBoundingClientRect();
        out[t]={x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};
      }
    });
    return {scrollY:Math.round(window.scrollY),chips:out};
  });
  // scroll until chips visible
  let geo=await chips();
  for(let i=0;i<18&&!(geo.chips.Newest);i++){ await p.mouse.move(187,360); await p.mouse.wheel(0,340); await p.waitForTimeout(230); geo=await chips(); }
  console.log('BEFORE any click:',JSON.stringify(geo));
  const click=async(label)=>{
    const g=await chips(); const c=g.chips[label];
    if(!c){console.log('click '+label+': NOT FOUND');return;}
    console.log('click '+label+' at',c.x+c.w/2,c.y+c.h/2,'visibleY=',c.y>=0&&c.y<667);
    await p.mouse.click(c.x+c.w/2,c.y+c.h/2);
    await p.waitForTimeout(1800);
    console.log('  after:',JSON.stringify(await chips()));
  };
  await click('Featured');
  await click('Top Picks');
  await click('Newest');
  await b.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
