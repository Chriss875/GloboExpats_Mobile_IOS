// AU-045 followup v2: prove the Saved-items SCREEN reflects a save made from a
// discover-tab card. Fix: correct isLoggedIn, navigate home->Account tab->tile,
// assert AppBar title + product card + absence of empty-state.
const { newBrowser, newCtx, closeVideo, allText, waitText, btn, clickBtn,
        screenshot } = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
const APP='http://localhost:9130';
const API='http://localhost:8083';
const BUYER={email:'mobile.test.20260820@gmail.com',pw:'StrongPass!1'};
const OUT={ts:new Date().toISOString(),unit:'AU-045',stage:'verify-r10-followup',network:[],notes:[],asserts:[]};
function note(m){OUT.notes.push(m);console.log('[followup] '+m);}
function track(p){ p.on('request',r=>{ if(/\/api\//.test(r.url())) OUT.network.push(r.method()+' '+r.url().replace(API,'')); }); }

(async()=>{
  const b=await newBrowser();
  const ctx=await newCtx(b,{viewport:{width:375,height:667},videoPath:'/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-045-r10-followup.webm'});
  const p=await ctx.newPage();
  track(p);
  const SHOT=s=>`/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-045/AU-045-r10-mobile-${s}.png`;

  // login via real UI
  await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await waitText(p,'Buy now',30000); console.log('[followup] step: home loaded');
  if(!(await isLoggedIn(p))){
    let form=false;
    for(let i=0;i<5&&!form;i++){
      await clickBtn(p,'Login');
      form=await waitText(p,'Welcome back',8000);
      console.log('[followup] login attempt '+i+' form='+form);
    }
    const ei=p.locator('input[type="text"]').first(),pi=p.locator('input[type="password"]').first();
    await ei.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type(BUYER.email);
    await pi.click({force:true}); await p.waitForTimeout(300); await p.keyboard.type(BUYER.pw);
    await clickBtn(p,'Log in');
    let ok=false; for(let i=0;i<18&&!ok;i++){ok=await isLoggedIn(p);if(!ok)await p.waitForTimeout(800);} console.log('[followup] step: login done '+ok);
    OUT.asserts.push({assert:'ui_login',pass:ok}); note('login '+ok);
  }
  // discover chips -> NEWEST first card -> detail -> save
  await p.goto(APP+'/#/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await waitText(p,'GloboExpats',40000); await p.waitForTimeout(1500);
  for(let i=0;i<16;i++){ if(await chipVis(p)) break;
    await p.mouse.move(187,333); await p.mouse.wheel(0,400); await p.waitForTimeout(250); }
  const target='AU042R9S21787710530028 Kettle';
  // ensure Newest tab active (default) then open first newest card
  const {clickCard}=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
  const navOk=await clickCard(p,'Kettle');
  await p.waitForTimeout(2600);
  note('detail opened from NEWEST-tab card: '+navOk);
  const sb=await findSave(p);
  if(!sb) throw new Error('no save control');
  const mk=OUT.network.length;
  await p.mouse.click(sb.cx,sb.cy); await p.waitForTimeout(1700);
  const tog=OUT.network.slice(mk);
  note('toggle net: '+JSON.stringify(tog));
  OUT.asserts.push({assert:'toggle_POST_saved-products_fired',pass:tog.some(u=>u.includes('POST /api/saved-products')),net:tog});

  // back to root, then Account tab
  await p.goto(APP+'/#/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await waitText(p,'GloboExpats',40000); await p.waitForTimeout(1200);
  const accOk=await clickBtn(p,'Account');
  note('Account tab clicked: '+accOk);
  await p.waitForTimeout(1600);
  await screenshot(p,SHOT('08a-account-view'));
  let tile=false;
  for(let i=0;i<12&&!tile;i++){
    tile=await clickBtn(p,'Saved items');
    if(!tile){ await p.mouse.move(187,400); await p.mouse.wheel(0,300); await p.waitForTimeout(220); }
  }
  note('Saved items tile clicked: '+tile);
  await p.waitForTimeout(2000);
  const txt=await allText(p);
  const appBar=txt.includes('Saved items');
  const emptyState=/No Saved Items/.test(txt);
  const kettleShown=/Kettle/.test(txt);
  note(`saved-screen text: appBar=${appBar} emptyState=${emptyState} kettle=${kettleShown}`);
  note('saved screen text sample: '+txt.slice(0,260).replace(/\n+/g,' | '));
  await screenshot(p,SHOT('08-saved-screen'));
  OUT.asserts.push({assert:'saved_screen_reached_via_account_tab',pass:appBar&&tile});
  OUT.asserts.push({assert:'saved_screen_shows_newly_saved_product',
                    pass:appBar&&!emptyState&&kettleShown,target});

  // restore RO lane: remove product 870 via API
  const tok=await apiLogin();
  await fetch(API+'/api/saved-products/870',{method:'DELETE',headers:{Authorization:'Bearer '+tok}});
  const rest=await fetch(API+'/api/saved-products',{headers:{Authorization:'Bearer '+tok}}).then(r=>r.json());
  const ids=(rest||[]).map(x=>x.productId);
  note('restored saved ids: '+JSON.stringify(ids));
  OUT.asserts.push({assert:'ro_lane_restored_870_removed',pass:!ids.includes(870),ids});

  await closeVideo(ctx,'/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-045-r10-followup.webm');
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/tmp/au045_r10_followup.json',JSON.stringify(OUT,null,1));
  console.log('ASSERTS:',JSON.stringify(OUT.asserts));
  await b.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});

async function isLoggedIn(p){
  return p.evaluate(()=>{try{return (localStorage.getItem('flutter.auth_token')||'').length>10;}catch(e){return false;}});
}
async function chipVis(p){
  return p.evaluate(()=>{
    let f=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if(f)return;
      if((e.textContent||'').trim()==='Newest'&&e.getAttribute('flt-tappable')!==null){
        const r=e.getBoundingClientRect(); f=r.top>8&&r.bottom<660;}
    });
    return f;
  });
}
async function findSave(p){
  return p.evaluate(()=>{
    let hit=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const l=((e.getAttribute('aria-label')||'')+' '+(e.textContent||'')).toLowerCase();
      if(/save/.test(l)&&e.getAttribute('flt-tappable')!==null){
        const r=e.getBoundingClientRect(); hit={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)};
      }
    });
    return hit;
  });
}
async function apiLogin(){
  const r=await fetch(`${API}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:BUYER.email,password:BUYER.pw})});
  return (await r.json()).token;
}
