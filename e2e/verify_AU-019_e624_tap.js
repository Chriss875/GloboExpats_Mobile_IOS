// The bbox y=-399 means scrollIntoViewIfNeeded scrolled PAST the row (row above viewport).
// Fix: after scrollIntoView, poll until bbox.y is INSIDE the viewport; only then click.
const L = require('./lib_verify.js');
const SHOTS='/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-019';
(async () => {
  const b = await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto('http://localhost:9108/',{waitUntil:'load',timeout:90000});
  await L.waitText(p,'Buy now',45000);
  await p.waitForTimeout(5000);
  let opened=false;
  for(let round=0;round<14&&!opened;round++){
    const c=await p.evaluate(()=>{let best=null;document.querySelectorAll('flt-semantics').forEach(e=>{if(e.getAttribute('flt-tappable')===null)return;const tx=(e.textContent||'').trim();if(!tx.includes('Body Oil - Midnight Jasmine'))return;const r=e.getBoundingClientRect();if(r.width<40||r.height<40||r.bottom<0||r.top>innerHeight-20)return;if(!best||r.width*r.height<best.area)best={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)};});return best;});
    if(c){await p.mouse.click(c.cx,Math.min(c.cy,650));await p.waitForTimeout(2600);opened=/Add to cart/i.test(await L.allText(p));if(opened)break;}
    const present=await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].some(e=>(e.textContent||'').includes('Body Oil - Midnight Jasmine')));
    if(!present&&round>4){console.log('624 not in feed');break;}
    await p.mouse.move(190,400);await p.mouse.wheel(0,600);await p.waitForTimeout(550);
  }
  console.log('opened:',opened);
  if(!opened){await b.close();return;}
  const btnLoc=p.locator('flt-semantics[role="button"]').filter({hasText:'WhatsApp seller'}).first();
  // scroll the page until row is fully onscreen (poll)
  let bb=null, ok=false;
  for(let i=0;i<25&&!ok;i++){
    bb=await btnLoc.boundingBox().catch(()=>null);
    if(bb && bb.y>=10 && (bb.y+bb.height)<=657){ok=true;break;}
    if(bb==null || bb.y+bb.height<10) await p.mouse.move(190,400),await p.mouse.wheel(0,-350);
    else if(bb.y>650) await p.mouse.move(190,400),await p.mouse.wheel(0,350);
    else {ok=true;break;}
    await p.waitForTimeout(250);
  }
  console.log('row onscreen:',ok,'bbox:',JSON.stringify(bb));
  if(!ok){await b.close();return;}
  await p.evaluate(()=>{window.__openLog=[];const o=window.open;window.open=function(u,n,f){window.__openLog.push(String(u));return o?o.call(window,u,n,f):null;};}).catch(()=>{});
  // re-read bbox AFTER instrumentation
  bb=await btnLoc.boundingBox().catch(()=>null);
  console.log('bbox after instr:',JSON.stringify(bb));
  const cx=Math.round(bb.x+bb.width/2), cy=Math.min(Math.max(Math.round(bb.y+bb.height/2),10),657);
  await p.mouse.click(cx,cy);
  await p.waitForTimeout(2800);
  const openCalls=await p.evaluate(()=>window.__openLog||[]).catch(()=>[]);
  const cdp=await ctx.newCDPSession(p).catch(()=>null);
  const tg=cdp?await cdp.send('Target.getTargets').catch(()=>null):null;
  const targets=tg?tg.targetInfos.filter(x=>x.type==='page').map(x=>x.url.slice(0,100)):[];
  const t=await L.allText(p);
  console.log(JSON.stringify({openCalls,targets,noErrorSnackbar:!/Could not open WhatsApp/i.test(t)}));
  await L.screenshot(p,`${SHOTS}/flutter-375-wa624-after-wa-tap.png`);
  await b.close();
})().catch(e=>console.error('FATAL',String(e).slice(0,250)));
