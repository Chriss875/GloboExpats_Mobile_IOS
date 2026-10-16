// FINAL-3: use the APP's own JSON shape (from /tmp/app_cart.json), bump qty to 5
// (stale > stock 2), write to the key, reload, then open cart via icon.
const L=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs=require('fs');
const PA=JSON.parse(fs.readFileSync('/tmp/au021_fixtures.json','utf8')).productADetail;
const PB=JSON.parse(fs.readFileSync('/tmp/au021_fixtures.json','utf8')).productBDetail;
(async()=>{
  // app-shape cart with stale qty: A=5 (stock 2) + B=2 (stock 4)
  const lineA=JSON.parse(fs.readFileSync('/tmp/app_cart.json','utf8'))[0];
  lineA.quantity=5; lineA.selected=true;
  const lineB=Object.assign({},lineA,{lineId:'p641',productId:641,sellerId:'447',title:PB.title,price:PB.price,imageUrl:'uploads/319701b5-d840-48d5-9484-d58e33de12cf_item.webp',maxQuantity:4,quantity:2});
  const CART=JSON.stringify([lineA,lineB]);

  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:375,height:667},videoPath:'/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-021-skeptic-final3.webm'});
  const p=await ctx.newPage();
  const det=[];
  p.on('response',r=>{ if(/itemDetails\/64[01]/.test(r.url())) det.push(r.status()); });
  await p.goto('http://localhost:9108/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  for(let i=0;i<40;i++){ if(await p.evaluate(()=>document.querySelectorAll('flt-semantics').length>3)) break; await p.waitForTimeout(1000); }
  let tok=await p.evaluate(()=>localStorage.getItem('flutter.auth_token')||'');
  if(tok.length<=10){
    await L.clickBtn(p,'Login'); await L.waitText(p,'Welcome back',25000);
    const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
    await ei.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type('au021buyer1787545167584@gmail.com');
    await pi.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type('StrongPass!1');
    await L.clickBtn(p,'Log in');
    for(let i=0;i<25;i++){ tok=await p.evaluate(()=>localStorage.getItem('flutter.auth_token')||''); if(tok.length>10)break; await p.waitForTimeout(1000);}
  }
  console.log('login:',tok.length>10);
  await p.evaluate((j)=>localStorage.setItem('flutter.expatCartItems_au021buyer1787545167584@gmail.com',j),CART);
  console.log('seeded app-shape stale cart');
  // RELOAD with the stale cart persisted — the real user-return path
  await p.goto('http://localhost:9108/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  let sem=false;
  for(let i=0;i<50;i++){ if(await p.evaluate(()=>document.querySelectorAll('flt-semantics').length>3)){sem=true;break;} await p.waitForTimeout(1000); }
  await p.waitForTimeout(5000);
  const tBoot=await L.allText(p).catch(()=>'');
  console.log('RELOAD booted:',sem&&tBoot.length>200,'len:',tBoot.length);
  if(!(sem&&tBoot.length>200)){ console.log('BOOT DEAD after stale-cart reload'); 
    await L.screenshot(p,'/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-021/AU-021-skeptic-final3-bootdead.png');
    await L.closeVideo(ctx,'/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-021-skeptic-final3.webm');
    await b.close(); return; }
  const cb=await p.evaluate(()=>{
    let hit=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(t!=='Cart'||e.getAttribute('role')!=='button')return;
      const bb=e.getBoundingClientRect(); if(hit||bb.width>60)return;
      hit={cx:Math.round(bb.x+bb.width/2),cy:Math.round(bb.y+bb.height/2)};});
    return hit;});
  console.log('cartIcon:',JSON.stringify(cb));
  if(cb){ await p.mouse.click(cb.cx,cb.cy);
    for(let i=0;i<16;i++){
      await p.waitForTimeout(1500);
      const t=await L.allText(p);
      const ls=await p.evaluate(()=>{for(let k=0;k<localStorage.length;k++){const key=localStorage.key(k);if(/expatCartItems_/.test(key))return localStorage.getItem(key);}return '';});
      try{ const arr=JSON.parse(ls);
        const qa=(arr.find(x=>x.productId===640)||{}).quantity,qb=(arr.find(x=>x.productId===641)||{}).quantity;
        console.log(`t+${(i+1)*1.5}s qtyA=${qa} qtyB=${qb} notice=${/Quantities reduced/.test(t)} subtotal74k=${/TSh 74,000/.test(t)} fetches=${det.length}`);
        if(qa===2&&i>=3) break;
        if(i>=10) break;
      }catch(e){}
    } }
  await L.screenshot(p,'/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-021/AU-021-skeptic-final3-cart.png');
  await L.closeVideo(ctx,'/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-021-skeptic-final3.webm');
  await b.close();
})().catch(e=>console.error('FATAL',e.message));
