// AU-011 step 7 — reference flow on :3000 at 375x667 (structural judge). v2: wait for OTP inputs.
const path=require('path'); const fs=require('fs');
const { REF, newBrowser, newCtx, closeVideo, screenshot } = require('./lib_verify.js');
const UNIT='AU-011';
const OUT=(f)=>path.join('/home/devsystemadmin/GloboExpats_Mobile/e2e',f);
const SH=(s)=>OUT(`shots/${UNIT}/ref-375-${s}.png`);
const log=(...a)=>console.log('[AU-011.ref]',...a);
(async()=>{
  const b=await newBrowser();
  const ctx=await newCtx(b,{viewport:{width:375,height:667},videoPath:OUT(`videos/${UNIT}-ref.webm`)});
  const p=await ctx.newPage();
  await p.goto(REF+'/verify-email?email=rw-au011-ref@example.com',{waitUntil:'domcontentloaded',timeout:90000});
  // wait for the 6 OTP boxes
  let boxes=0;
  for(let i=0;i<25;i++){ await p.waitForTimeout(1000); boxes=await p.locator('input:not([id^="search-input"])').count(); if(boxes>=6) break; }
  log('otp boxes:', boxes);
  await p.waitForTimeout(1200);
  await screenshot(p, SH('01-initial'));
  let txt = await p.evaluate(()=>document.body.innerText.slice(0,900));
  fs.writeFileSync(OUT('tmp/AU-011-ref-initial.txt'), txt);
  log('initial:', JSON.stringify(txt.slice(0,300)));
  if(boxes>=6){
    for(let i=0;i<6;i++){ await p.locator('input:not([id^="search-input"])').nth(i).click({force:true}); await p.keyboard.type(String(i+1)); }
    await p.waitForTimeout(600);
    const btns=await p.evaluate(()=>[...document.querySelectorAll('button')].map(x=>x.innerText.trim()).filter(Boolean));
    log('buttons:',JSON.stringify(btns));
    fs.writeFileSync(OUT('tmp/AU-011-ref-buttons.json'), JSON.stringify(btns,null,1));
    const confirm=p.locator('button',{hasText:'Confirm email'});
    if(await confirm.count()) await confirm.first().click({force:true}); else await p.keyboard.press('Enter');
    await p.waitForTimeout(3500);
    txt=await p.evaluate(()=>document.body.innerText.slice(0,900));
    fs.writeFileSync(OUT('tmp/AU-011-ref-wrong.txt'),txt);
    log('after wrong:',JSON.stringify(txt.slice(0,320)));
    await screenshot(p, SH('02-wrong'));
    const resend=p.locator('button',{hasText:'Resend'});
    log('resend visible:', await resend.count());
    if(await resend.count()){ await resend.first().click({force:true}); await p.waitForTimeout(2500); }
    txt=await p.evaluate(()=>document.body.innerText.slice(0,900));
    fs.writeFileSync(OUT('tmp/AU-011-ref-resend.txt'),txt);
    log('after resend:',JSON.stringify(txt.slice(0,320)));
    await screenshot(p, SH('03-resend'));
  }
  await closeVideo(ctx, OUT(`videos/${UNIT}-ref.webm`));
  await b.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1)});
