// deep-link probe with FULL network capture: #/product/101 and friends
const lib = require('./lib_verify.js');
process.chdir(__dirname + '/..');
(async () => {
  const b = await lib.newBrowser();
  const ctx = await b.newContext({ viewport:{width:375,height:667} });
  const p = await ctx.newPage();
  const reqs = [];
  p.on('request', r => { if (r.url().includes(':8083')) reqs.push({m:r.method(), u:r.url().replace('http://localhost:8083',''), ph:r.resourceType()}); });
  p.on('response', async r => {
    if (r.url().includes(':8083')) { const q=reqs.find(x=>x.u===r.url().replace('http://localhost:8083','')); if(q) q.st=r.status(); }
  });
  p.on('requestfailed', r => { const q=reqs.find(x=>x.u===r.url().replace('http://localhost:8083','')); const f=(r.failure()&&r.failure().errorText)||''; if(!/ERR_ABORTED/.test(f)){ if(q)q.fail=f; else reqs.push({u:r.url(),fail:f}); } });

  for (const target of ['/', '/#/product/101', '/#/product/873']) {
    reqs.length = 0;
    await p.goto('http://localhost:9131' + target, { waitUntil:'load', timeout:60000 });
    await p.waitForFunction(()=>!!document.querySelector('flt-semantics'), null, {timeout:40000}).catch(()=>{});
    await p.waitForTimeout(6000);
    const txt = await lib.allText(p);
    console.log('\n=== ', target, ' ===');
    console.log('TEXT:', JSON.stringify(Array.from(new Set(txt.split('\n'))).slice(0,14)));
    for (const q of reqs) console.log('  ', q.m||'GET', q.u.slice(0,90), q.st?('-> '+q.st):'', q.fail?('FAIL '+q.fail):'');
  }
  // in-app path: home -> click a real product card
  reqs.length = 0;
  await p.goto('http://localhost:9131/#/', { waitUntil:'load', timeout:60000 });
  await p.waitForFunction(()=>!!document.querySelector('flt-semantics'), null, {timeout:40000});
  await p.waitForTimeout(4000);
  const cards = await p.evaluate(()=>{
    const out=[]; document.querySelectorAll('flt-semantics').forEach(e=>{
      if(e.getAttribute('flt-tappable')===null) return;
      const r=e.getBoundingClientRect(); const t=(e.textContent||'').trim();
      if(r.width>120&&r.height>60&&t.length>30&&r.bottom>100&&r.top<560) out.push({t:t.slice(0,40),cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)});
    }); return out.slice(0,3);
  });
  console.log('\ncards on home:', JSON.stringify(cards));
  if (cards.length){
    await p.mouse.click(cards[0].cx, Math.min(cards[0].cy,640));
    await p.waitForTimeout(5000);
    console.log('AFTER CARD CLICK url:', await p.evaluate(()=>location.hash));
    console.log('TEXT:', JSON.stringify(Array.from(new Set((await lib.allText(p)).split('\n'))).slice(0,12)));
    for (const q of reqs) console.log('  ', q.m||'GET', q.u.slice(0,90), q.st?('-> '+q.st):'', q.fail?('FAIL '+q.fail):'');
  }
  await b.close();
})();
