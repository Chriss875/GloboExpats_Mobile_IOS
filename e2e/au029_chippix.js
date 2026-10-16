// au029_chippix.js — pixel-level selection probe for the step-3 method chips.
// Flutter web ChoiceChips expose NO aria-selected on this build (probe-proven),
// so selection is read from the RENDERED pixels: the selected chip paints a
// filled brand-blue pill; unselected is white with a grey border. We sample the
// chip interiors via Playwright screenshot + PNG decode (lib_verify.decodePng).
const fs=require('fs'),path=require('path');
process.chdir(path.resolve(__dirname,'..'));
const L=require('./lib_verify.js');
const APP='http://localhost:9113';
const fx=JSON.parse(fs.readFileSync('/tmp/au028_fixtures.json','utf8'));
const PROBE1=`AU028 Guard Tote ${fx.stamp}`;
const PROBE2=`AU028 Plain Mat ${fx.stamp}`;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await L.newBrowser();
  const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto(APP+'/',{waitUntil:'domcontentloaded',timeout:90000}).catch(()=>{});
  // login
  await L.waitText(p,'Buy now',45000);
  let logged=await p.evaluate(()=>!!(localStorage.getItem('flutter.auth_token')||'').length&&localStorage.getItem('flutter.auth_token').length>10);
  if(!logged){
    await L.clickBtn(p,'Login'); await L.waitText(p,'Welcome back',25000);
    const ei=p.locator('input[type="text"]').first(); await ei.click({force:true}).catch(()=>{}); await sleep(400);
    await p.keyboard.type(fx.buyer.email,{delay:12});
    const pi=p.locator('input[type="password"]').first(); await pi.click({force:true}).catch(()=>{}); await sleep(400);
    await p.keyboard.type(fx.buyer.pw,{delay:12});
    await L.clickBtn(p,'Log in');
    for(let i=0;i<30&&!logged;i++){await sleep(1000);logged=await p.evaluate(()=>(localStorage.getItem('flutter.auth_token')||'').length>10);}
  }
  console.log('login:',logged);
  async function txt(pg){return pg.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n'));}
  async function add(pid,title,pickSize){
    await p.evaluate((id)=>{location.hash='#/product/'+id;},pid);
    for(let i=0;i<18;i++){await sleep(900);if((await txt(p)).includes(title))break;}
    if(pickSize){
      const chip=await p.evaluate(()=>{
        let best=null;
        document.querySelectorAll('flt-semantics').forEach(e=>{
          const t=(e.textContent||'').trim();
          if(t!=='L'&&!/^L\b/.test(t))return;
          const r=e.getBoundingClientRect();
          if(r.width<8||r.height<8||r.bottom<0||r.top>innerHeight)return;
          if(!best||r.width*r.height<best.a)best={a:r.width*r.height,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
        });return best;});
      if(chip){await p.mouse.click(chip.x,chip.y);await sleep(700);}
    }
    const hit=await p.evaluate((lbl)=>{
      let best=null;
      document.querySelectorAll('flt-semantics').forEach(e=>{
        const t=(e.textContent||'').trim();
        if(!t.includes(lbl))return;
        const r=e.getBoundingClientRect();
        if(r.width<10||r.height<10||r.bottom<0||r.top>innerHeight)return;
        const ok=e.getAttribute('role')==='button'||e.getAttribute('flt-tappable')!==null;
        if(!ok)return;
        if(!best||r.width*r.height<best.a)best={a:r.width*r.height,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
      });return best;},'Add to cart');
    if(hit){await p.mouse.click(hit.x,hit.y);}
    await sleep(1200);await p.evaluate(()=>{location.hash='#/';});await sleep(2000);
  }
  await add(fx.productId1,PROBE1,true);
  await add(fx.productId2,PROBE2,false);
  await p.evaluate(()=>{location.hash='#/cart';});await sleep(2200);
  await p.evaluate(()=>{location.hash='#/checkout';});await sleep(2500);
  for(let i=0;i<20&&!(await txt(p)).includes('Order Summary');i++)await sleep(900);
  await L.scrollToBottom(p,8);await sleep(500);
  await p.evaluate(()=>{location.hash='#/checkout';});
  // click Continue to review by text
  async function clickText(lbl){const hit=await p.evaluate((l)=>{
    let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(!t.includes(l))return;
      const r=e.getBoundingClientRect();
      if(r.width<10||r.height<10||r.bottom<0||r.top>innerHeight)return;
      const ok=e.getAttribute('role')==='button'||e.getAttribute('flt-tappable')!==null;
      if(!ok)return;
      if(!best||r.width*r.height<best.a)best={a:r.width*r.height,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
    });return best;},lbl);
    if(hit){await p.mouse.click(hit.x,hit.y);await sleep(1000);return true;}return false;}
  await L.scrollToBottom(p,6);await sleep(300);
  await clickText('Continue to review');
  for(let i=0;i<22&&!(/Step\s*2\s*of\s*4/.test(await txt(p)));i++)await sleep(900);
  await L.scrollToBottom(p,16);await sleep(600);
  async function tickRow(which){
    const t=await p.evaluate((which)=>{
      const rows=[...document.querySelectorAll('flt-semantics')]
        .filter(e=>e.getAttribute('role')==='checkbox')
        .map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,h:r.height,vis:r.y>40&&(r.y+r.height)<innerHeight-10&&r.width>5};})
        .filter(b=>b.vis);
      if(!rows.length)return null;
      const pk=which==='first'?rows[0]:rows[rows.length-1];
      return{x:pk.x+18,y:Math.min(Math.max(pk.y+pk.h/2,25),1015)};},which);
    if(t){await p.mouse.click(t.x,t.y);await sleep(800);}}
  await tickRow('first');await tickRow('last');
  await L.screenshot(p,'/tmp/au029_pre_confirm.png');
  await clickText('Confirm & proceed to payment');
  let T3='';
  for(let i=0;i<30;i++){await sleep(1000);T3=await txt(p);if(/How will you pay\?|Amount due|Pay via/.test(T3))break;}
  console.log('step3 reached:',/How will you pay\?/.test(T3));

  // ---- chip geometry + pixel sampling helper ----
  async function chipGeom(){
    return p.evaluate(()=>{
      const out={};
      document.querySelectorAll('flt-semantics').forEach(e=>{
        const t=(e.textContent||'').trim();
        if(t!=='Lipa Namba'&&t!=='Bank Account')return;
        const r=e.getBoundingClientRect();
        if(r.width<20||r.height<10||r.bottom<0||r.top>innerHeight)return;
        if(!out[t]||r.width*r.height<out[t].a)out[t]={a:r.width*r.height,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};
      });
      return out;});
  }
  async function chipFill(tag){
    const g=await chipGeom();
    const buf=await p.screenshot();
    const decode=require('/tmp/au029_decode.js');
    const {width,height,rows}=decode(buf);
    const res={};
    for(const [label,c] of Object.entries(g)){
      // sample interior rows of the chip, count blue-ish vs light pixels
      let blue=0,total=0,samples=[];
      for(let y=c.y+4;y<c.y+c.h-4;y+=2){
        for(let x=c.x+6;x<c.x+c.w-6;x+=3){
          const o=(y*width+x)*3,r=rows[y][o],gg=rows[y][o+1],b=rows[y][o+2];
          total++;
          if(b>110&&b>r+25&&g_ok(gg,b))blue++;
          samples.push(`${r},${gg},${b}`);
        }
      }
      function g_ok(gv,bv){return bv-gv>15;}
      res[label]={geom:c,pctBlue:+(100*blue/Math.max(1,total)).toFixed(1),sample:samples[Math.floor(samples.length/2)]};
    }
    console.log(tag,JSON.stringify(res));
    return res;
  }
  const d=await chipFill('DEFAULT');
  await L.screenshot(p,'/tmp/au029_px_default.png');
  await clickText('Bank Account');await sleep(1200);
  const b=await chipFill('AFTER_BANK_TAP');
  await L.screenshot(p,'/tmp/au029_px_bank.png');
  await clickText('Lipa Namba');await sleep(1200);
  const l=await chipFill('AFTER_LIPA_TAP');
  await L.screenshot(p,'/tmp/au029_px_lipa.png');
  fs.writeFileSync('/tmp/au029_chip_pixels.json',JSON.stringify({default:d,bank:b,lipa:l},null,1));
  await ctx.close();await browser.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
