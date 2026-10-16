// probe: chip bar scroll state + dropdown open mechanics at 768 (bigger target)
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:768,height:1024}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:9112/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Marketplace',40000); await p.waitForTimeout(4500);
  let t=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'').trim()).filter(x=>x&&x.length<40));
  console.log('CHIPS VISIBLE:', JSON.stringify(t.slice(0,30)));
  // open the sheet and tap dropdown twice with real mouse
  await L.clickBtn(p,'Filters'); await p.waitForTimeout(1500);
  for(let round=0;round<3;round++){
    const dd=await p.evaluate(()=>{let hit=null;document.querySelectorAll('flt-semantics').forEach(e=>{if(hit)return;const tx=(e.textContent||'').trim();if(tx==='Neighbourhood'){const r=e.getBoundingClientRect();if(r.width>40)hit={cx:r.x+r.width/2,cy:r.y+r.height/2,w:r.width,h:r.height};}});return hit;});
    console.log('round',round,'dd node',dd);
    if(!dd) break;
    await p.mouse.click(dd.cx,dd.cy); await p.waitForTimeout(1600);
    const t2=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>(e.textContent||'').trim()).filter(Boolean));
    const opened=['Bamaga','Mangkaile','Oyster Bay','Uhuru','Mwenge'].some(n=>t2.some(x=>x.includes(n)));
    console.log('round',round,'menu open?',opened, 'nodecount',t2.length);
    if(opened){ await p.screenshot({path:'/tmp/au049_menu.png'}); 
      // try clicking Oyster Bay
      const ob=await p.evaluate(()=>{let hit=null;document.querySelectorAll('flt-semantics').forEach(e=>{if(hit)return;const tx=(e.textContent||'').trim();if(tx.includes('Oyster Bay')){const r=e.getBoundingClientRect();if(r.width>10){hit={cx:r.x+r.width/2,cy:r.y+r.height/2};}}});return hit;});
      console.log('oyster bay node',ob);
      if(ob){await p.mouse.click(ob.cx,ob.cy);await p.waitForTimeout(900);}
      await p.screenshot({path:'/tmp/au049_picked.png'});
      break;
    }
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
