// diag: home screen, click EVERY control, capture console/pageerror + text/url deltas
const lib = require('./lib_verify.js');
process.chdir(__dirname + '/..');
(async () => {
  const b = await lib.newBrowser();
  const ctx = await b.newContext({ viewport:{width:375,height:667} });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: '+String(e.message).slice(0,160)));
  p.on('console', m => { if (m.type()==='error'||m.type()==='warning') errs.push(m.type().toUpperCase()+': '+m.text().slice(0,160)); });
  p.on('requestfailed', r => { const f=r.failure()&&r.failure().errorText||''; if(!/ERR_ABORTED/.test(f)) errs.push('REQFAIL: '+r.url().slice(-60)+' '+f.slice(0,60)); });
  await p.goto('http://localhost:9131/', { waitUntil:'load', timeout:60000 });
  await p.waitForFunction(()=>!!document.querySelector('flt-semantics'), null, {timeout:40000});
  await p.waitForTimeout(3000);
  const btns = (await lib.listButtons(p)).filter(x=>x.kind!=='input');
  console.log('controls:', btns.length);
  for (let i=0;i<btns.length;i++){
    const lbl=(btns[i].label||'').trim();
    if(!lbl) continue;
    const t0=await lib.allText(p);
    const u0=await p.evaluate(()=>location.hash||'#/');
    const nErr=errs.length;
    let ok;
    if(btns[i].kind==='button') ok=await lib.clickBtn(p,lbl.slice(0,60));
    else ok=await lib.clickCard(p,lbl.slice(0,40));
    await p.waitForTimeout(900);
    const t1=await lib.allText(p);
    const u1=await p.evaluate(()=>location.hash||'#/');
    const sb=await lib.hasSnackBar(p);
    console.log(`[${i}] ${JSON.stringify(lbl.slice(0,34))} clicked=${ok} dText=${t1.length-t0.length} dUrl=${u1!==u0?'->'+u1:'same'} toast=${sb.found?'Y':'n'} newErr=${errs.length-nErr}`);
    for(let k=nErr;k<errs.length;k++) console.log('    ', errs[k].slice(0,150));
    if(u1!==u0){ await p.evaluate(()=>{window.location.hash='#/';}); await p.waitForTimeout(1800); }
  }
  await b.close();
})();
