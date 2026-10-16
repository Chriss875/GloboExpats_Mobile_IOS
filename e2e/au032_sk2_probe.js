// au032_sk2_probe.js — why did s1 stall at step2 while atkA passed? Dump a11y text.
const S = require('./au032_sk2_lib.js'); const L = S.L; const { fx, sleep } = S;
(async()=>{
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b,{viewport:{width:375,height:667},videoPath:null});
  const p = await ctx.newPage();
  console.log('login:', await S.loginUi(p));
  await S.hashNav(p,'#/product/'+fx.productId);
  for(let i=0;i<20;i++){ await sleep(1000); if((await S.txt(p)).includes('AU032 Cancel Tote')) break; }
  console.log('add:', await S.tap(p,'Add to cart',3)); await sleep(1200);
  await S.hashNav(p,'#/cart');
  for(let i=0;i<14;i++){ await sleep(900); if((await S.txt(p)).includes('Go to checkout')) break; }
  console.log('checkout:', await S.tap(p,'Go to checkout',4));
  let at1=false; for(let i=0;i<25&&!at1;i++){ await sleep(1000); at1=/Step 1 of 4/.test(await S.txt(p)); }
  console.log('step1:', at1);
  // dump inputs + step1 text
  let T = await S.txt(p);
  console.log('STEP1 TEXT>>>', T.split('\n').filter(Boolean).slice(0,40).join(' | ').slice(0,1500));
  await L.scrollToBottom(p,10); await sleep(600);
  console.log('cont:', await S.tap(p,'Continue to review',4));
  let at2=false; for(let i=0;i<28&&!at2;i++){ await sleep(1000); at2=/Step 2 of 4/.test(await S.txt(p)); if(at2) break; }
  console.log('step2 reached:', at2);
  T = await S.txt(p);
  console.log('STEP2 TEXT>>>', T.split('\n').filter(Boolean).slice(0,50).join(' | ').slice(0,2200));
  await L.scrollToBottom(p,18); await sleep(700);
  const boxes = await p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].filter(e=>e.getAttribute('role')==='checkbox').map(e=>{const r=e.getBoundingClientRect();return {t:(e.textContent||'').slice(0,40),y:Math.round(r.y),h:Math.round(r.height),vis:r.bottom>0&&r.top<innerHeight};}));
  console.log('CHECKBOXES>>>', JSON.stringify(boxes));
  await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
