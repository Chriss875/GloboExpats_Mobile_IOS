// probe4: refusal DID fire (regenCount=1) — check where the message text went.
// Compare whole-DOM before/after with a locator click and print the exact
// aria-label delta (probe18 showed it lands in the INPUT node's label).
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await b.newContext({viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:9112/',{waitUntil:'load'});
  await L.waitText(p,'Buy now',25000);
  await L.clickBtn(p,'Login'); await L.waitText(p,'Welcome back',25000);
  const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
  await ei.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type(L.BUYER.email);
  await pi.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type(L.BUYER.pw);
  await L.clickBtn(p,'Log in');
  for(let i=0;i<25;i++){ if(await L.isLoggedIn(p)) break; await p.waitForTimeout(1000); }
  await p.goto('http://localhost:9112/orders/2499e6e9-b5f9-4b47-982e-1d50f99144c5',{waitUntil:'load'});
  for(let i=0;i<20;i++){ const t=await L.allText(p); if(t.includes('Placed on')) break; await p.waitForTimeout(900); }
  async function findBtn(re){
    return p.evaluate((rx)=>{ let hit=null;
      document.querySelectorAll('flt-semantics').forEach(e=>{
        if(hit) return;
        if(new RegExp(rx).test((e.textContent||'')+' '+(e.getAttribute('aria-label')||'')) && e.getAttribute('flt-tappable')!==null){
          const r=e.getBoundingClientRect();
          if(r.width>0&&r.top>=60&&r.bottom<=innerHeight-10) hit={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
        }});
      return hit;
    }, re);
  }
  let tb=null;
  for(let i=0;i<12&&!tb;i++){ tb=await findBtn('Track delivery'); if(!tb){ await p.mouse.move(190,350); await p.mouse.wheel(0,320); await p.waitForTimeout(240);} }
  await p.mouse.click(tb.x,Math.min(tb.y,640)); await p.waitForTimeout(2200);
  const before=await p.evaluate(()=>{ const i=document.querySelector('input[aria-label]'); return i?i.getAttribute('aria-label'):''; });
  console.log('BEFORE input label tail:', JSON.stringify(before.slice(-60)));
  const gb=await findBtn('Generate new code');
  await p.mouse.click(gb.x,gb.y);
  await p.waitForTimeout(3500);
  const after=await p.evaluate(()=>{ const i=document.querySelector('input[aria-label]'); return i?i.getAttribute('aria-label'):''; });
  console.log('AFTER input label tail:', JSON.stringify(after.slice(-90)));
  console.log('refusal rendered:', /Could not regenerate/i.test(after));
  // also verify the visible pixels changed
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
