// au032_sk2_stage9.js — LAST probes: empty-cart 'Go to checkout' reality + cleanup.
const S = require('./au032_sk2_lib.js'); const L = S.L; const fs = require('fs');
const { fx, sleep } = S;
const R = { ts:new Date().toISOString(), unit:'AU-032', stage:'skeptic-r14-stage9', wave:'skeptic',
  build_sha:S.BUILD_SHA, bundle_mtime:null, asserts:[], attacks:[], shots:[], cleanup:[] };
function A(name, pass, detail=''){ R.asserts.push({name,pass:!!pass,detail:String(detail).slice(0,320)}); console.log((pass?'PASS ':'FAIL ')+name+(detail?' :: '+String(detail).slice(0,170):'')); }
async function proformas(tok){ const r=await L.api(tok,'GET','/api/v1/payments/my'); return Array.isArray(r.json)?r.json:[]; }
(async()=>{
  const head = await fetch(S.APP+'/main.dart.js',{method:'HEAD'});
  R.bundle_mtime = head.headers.get('last-modified');
  A('freshness-frozen-e694463', head.status===200 && R.bundle_mtime===S.BUILD_MT, `${head.status} ${R.bundle_mtime}`);
  const btok=(await L.api(null,'POST','/api/v1/auth/login',{email:fx.buyer.email,password:fx.buyer.pw})).json.token;

  const b = await L.newBrowser();
  const c = await b.newContext({viewport:{width:375,height:667}});
  const p = await c.newPage();
  try{
    await S.loginUi(p);
    // make sure the cart is EMPTY: fresh context starts empty
    await S.hashNav(p,'#/cart'); await sleep(4000);
    const T0 = await S.txt(p);
    A('ec-cart-is-empty', /Your cart is empty/.test(T0), T0.split('\n').filter(Boolean).slice(0,4).join('|').slice(0,100));
    // enumerate ALL role=button nodes with geometry+text to see what a screen reader meets
    const btns = await p.evaluate(()=>{
      return [...document.querySelectorAll('flt-semantics')]
        .filter(e=>e.getAttribute('role')==='button')
        .map(e=>{const r=e.getBoundingClientRect();return {t:(e.textContent||'').trim().slice(0,40),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};})
        .filter(b=>b.w>2&&b.h>2&&b.y>-50&&b.y<700);
    });
    console.log('EMPTY-CART buttons:', JSON.stringify(btns));
    const goHit = await S.hit(p,'Go to checkout');
    A('ec-go-to-checkout-node-exists-empty-cart', !!goHit, goHit?`x=${goHit.x},y=${goHit.y}`:'absent');
    if(goHit){
      await p.mouse.click(goHit.x,goHit.y); await sleep(3000);
      const T1 = await S.txt(p);
      const wentToCheckout = /Step 1 of 4|Order Summary|Contact/.test(T1);
      A('ec-click-goes-to-checkout-with-empty-cart', !wentToCheckout,
        wentToCheckout?'DEFECT: checkout opened with an empty cart':'stayed on cart (dead/inert control)');
      await S.shot(p,'sk14-m-23-after-empty-cart-checkout-click');
      if(wentToCheckout){
        // escape: pop back
        await p.goBack();
      }
    }
    await S.shot(p,'sk14-m-24-empty-cart-final');
  }catch(e){ A('fatal-ec',false,e.message); }
  await c.close(); await b.close();

  // ---------- CLEANUP: cancel every leftover PENDING proforma owned by our fixture buyer ----------
  const mine = await proformas(btok);
  for(const o of mine){
    if(o.status==='PENDING_PAYMENT'){
      const r = await L.api(btok,'POST',`/api/v1/proformas/${o.proformaId}/cancel`,{});
      R.cleanup.push(`${o.proformaNumber}->${r.status}`);
    }
  }
  console.log('CLEANUP:', R.cleanup.join(', ')||'nothing pending');
  const left = (await proformas(btok)).filter(o=>o.status==='PENDING_PAYMENT');
  A('cleanup-no-pending-left', left.length===0, `${left.map(o=>o.proformaNumber)}`);
  fs.writeFileSync('/tmp/au032_sk_r14_stage9.json', JSON.stringify(R,null,1));
})();
