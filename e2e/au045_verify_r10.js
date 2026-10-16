// AU-045 verify-r10 — discover_tabs_shuffle_seed (RO lane) on FROZEN :9130 @ a405494.
// Appendix A: 1 freshness, 2 real data, 3 images, 4 click-every-control, 5 shots both vps,
// 6 native vision (Read PNGs), 7 video+frames, 8 parity vs :3000, 9 verdict, 10 shard line.
const { newBrowser, newCtx, closeVideo, allText, waitText, btn, clickBtn, clickCard,
        listButtons, watchImages, imageSummary, screenshot } =
  require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9130';
const API = 'http://localhost:8083';
const BUYER = { email: 'mobile.test.20260820@gmail.com', pw: 'StrongPass!1' };

const OUT = {
  ts: new Date().toISOString(), unit: 'AU-045', stage: 'verify-r10',
  freshness: {}, network: [], tabs: {}, seedLoads: [], images: {},
  buttons: {}, clicks: [], stateAsserts: [], consoleErrors: [], notes: [],
};
function note(m){ OUT.notes.push(m); console.log('[au045] ' + m); }

function trackApi(page){
  page.on('request', r => { const u = r.url();
    if (/\/api\//.test(u)) OUT.network.push({ url: u.replace(API,'').replace('http://localhost:3000',''),
      method: r.method(), body: (r.postData()||'').slice(0,260) });
  });
}

// A chip counts only when its rect is INSIDE the viewport; offscreen nodes
// silently no-op on force-clicks (probe: chips rest at y=781 below the fold).
async function findChip(page,label,vph){
  return page.evaluate(({lbl,lim})=>{
    let hit=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if(hit) return;
      if((e.textContent||'').trim()===lbl && e.getAttribute('flt-tappable')!==null){
        const r=e.getBoundingClientRect();
        if(r.top>8 && r.bottom<lim-8)
          hit={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2),w:r.width,h:r.height};
      }
    });
    return hit;
  },{lbl:label,lim:vph||667});
}
// Wheel until the Newest chip is actually on-screen (y in 8..vph-8).
async function scrollToChips(page,vpw,vph){
  for(let i=0;i<20;i++){
    const c=await findChip(page,'Newest',vph);
    if(c) return true;
    await page.mouse.move(vpw/2, Math.min(400,vph*0.55)); await page.mouse.wheel(0,340);
    await page.waitForTimeout(260);
  }
  // fallback: touch-style drag up
  for(let i=0;i<12;i++){
    const c=await findChip(page,'Newest',vph);
    if(c) return true;
    await page.mouse.move(vpw/2,vph*0.78); await page.mouse.down();
    await page.mouse.move(vpw/2,vph*0.18,{steps:8}); await page.mouse.up();
    await page.waitForTimeout(380);
  }
  return !!(await findChip(page,'Newest',vph));
}
async function clickChipAt(page,label,vph){
  const pos = await findChip(page,label,vph);
  if(!pos) return false;
  await page.mouse.click(Math.max(8,pos.cx), Math.max(20,Math.min(pos.cy,(vph||667)-20)));
  await page.waitForTimeout(1000);
  return true;
}
// Names visible in the discover grid region only (below chips row, on screen).
async function gridSnapshot(page){
  return page.evaluate(()=>{
    const nodes=[...document.querySelectorAll('flt-semantics')];
    let chipY=-1;
    nodes.forEach(e=>{ if(chipY<0 && ['Newest','Featured','Top Picks'].includes((e.textContent||'').trim())){
      const r=e.getBoundingClientRect(); if(chipY<0 || r.top<chipY) chipY=r.top; } });
    const names=[];
    nodes.forEach(e=>{
      const t=(e.textContent||'').trim();
      if(!t || t.length<6) return;
      const r=e.getBoundingClientRect();
      if(r.top < chipY - 30 || r.top > innerHeight) return;
      names.push(t.slice(0,70));
    });
    return {chipY: Math.round(chipY), names: names.slice(0,14)};
  });
}
// Distinct grid product titles (first line of each card block).
function cardTitles(gridNames){
  return gridNames.map(n=>n.split('\n')[0].replace(/\s*TSh [\d,]+$/,'').trim())
                  .filter(t=>t.length>4 && !/^(Marketplace|Filters|List view|All categories)/.test(t));
}

(async ()=>{
  const browser = await newBrowser();

  // ============== PASS 1: mobile 375x667, video + full tracking =================
  const vp={width:375,height:667};
  const ctx = await newCtx(browser,{viewport:vp, videoPath:'/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-045-r10-mobile.webm'});
  const page = await ctx.newPage();
  const imgMap = watchImages(page);
  trackApi(page);
  page.on('console', m=>{ if(m.type()==='error') OUT.consoleErrors.push(m.text().slice(0,180)); });
  const SHOT=s=>`/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-045/AU-045-r10-mobile-${s}.png`;

  // --- login via real UI so save toggles are authenticated --------------------
  await page.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await waitText(page,'Buy now',45000);
  await screenshot(page, SHOT('01-home-top'));
  const alreadyIn = await page.evaluate(()=>!!localStorage.getItem('flutter.auth_token'));
  note('pre-existing token: '+alreadyIn);
  if(!alreadyIn){
    await clickBtn(page,'Login');
    await waitText(page,'Welcome back',25000);
    const ei=page.locator('input[type="text"]').first(), pi=page.locator('input[type="password"]').first();
    await ei.click({force:true}).catch(()=>{}); await page.waitForTimeout(350); await page.keyboard.type(BUYER.email);
    await pi.click({force:true}).catch(()=>{}); await page.waitForTimeout(350); await page.keyboard.type(BUYER.pw);
    await clickBtn(page,'Log in');
    let ok=false; for(let i=0;i<25&&!ok;i++){ ok=await isLoggedIn(page); if(!ok) await page.waitForTimeout(900); }
    note('UI login ok: '+ok);
    OUT.stateAsserts.push({assert:'ui_login', ok});
  }
  // back to home root
  await page.goto(APP+'/#/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await waitText(page,'GloboExpats',40000);
  await page.waitForTimeout(1500);
  await scrollToChips(page,375,667);
  await screenshot(page, SHOT('02-discover-tabs-newest'));

  // ---- TAB SWITCH #1: Featured -> POST /displayItem/filter SHUFFLE ----------
  const visBefore = await scrollToChips(page,375,667);
  OUT.stateAsserts.push({assert:'discover_chips_reached_in_mobile_viewport', pass:visBefore});
  note('chips visible before tab clicks: '+visBefore);
  const mkF = OUT.network.length;
  const c1 = await clickChipAt(page,'Featured',667);
  await page.waitForTimeout(2200);
  const fNet = OUT.network.slice(mkF).filter(n=>/displayItem/.test(n.url));
  OUT.tabs.featured = { clicked:c1, requests:fNet.map(n=>n.method+' '+n.url+(n.body?' :: '+n.body:'')) };
  note('FEATURED net: '+JSON.stringify(OUT.tabs.featured.requests));
  const gF = await gridSnapshot(page);
  OUT.tabs.featured.gridNames = gF.names; OUT.tabs.featured.titles = cardTitles(gF.names);
  await screenshot(page, SHOT('03-tab-featured'));

  // ---- TAB SWITCH #2: Top Picks -> GET /displayItem/top-picks ----------------
  await scrollToChips(page,375,667);   // re-ensure visible after re-render
  const mkT = OUT.network.length;
  const c2 = await clickChipAt(page,'Top Picks',667);
  await page.waitForTimeout(2200);
  const tNet = OUT.network.slice(mkT).filter(n=>/displayItem/.test(n.url));
  OUT.tabs.topPicks = { clicked:c2, requests:tNet.map(n=>n.method+' '+n.url+(n.body?' :: '+n.body:'')) };
  note('TOP PICKS net: '+JSON.stringify(OUT.tabs.topPicks.requests));
  const gT = await gridSnapshot(page);
  OUT.tabs.topPicks.gridNames = gT.names; OUT.tabs.topPicks.titles = cardTitles(gT.names);
  await screenshot(page, SHOT('04-tab-toppicks'));

  // ---- TAB SWITCH #3: Newest -> GET /displayItem/newest ----------------------
  await scrollToChips(page,375,667);
  const mkN = OUT.network.length;
  const c3 = await clickChipAt(page,'Newest',667);
  await page.waitForTimeout(2000);
  const nNet = OUT.network.slice(mkN).filter(n=>/displayItem/.test(n.url));
  OUT.tabs.newest = { clicked:c3, requests:nNet.map(n=>n.method+' '+n.url+(n.body?' :: '+n.body:'')) };
  note('NEWEST net: '+JSON.stringify(OUT.tabs.newest.requests));
  const gN = await gridSnapshot(page);
  OUT.tabs.newest.gridNames = gN.names; OUT.tabs.newest.titles = cardTitles(gN.names);
  await screenshot(page, SHOT('05-back-to-newest'));

  // distinct endpoint assertion
  const pth = [fNet,tNet,nNet].map(l=>{
    const u=l.map(n=>n.url.split('?')[0]).find(u=>u.includes('displayItem'))||'';
    return u;
  });
  const uniq = [...new Set(pth)];
  OUT.stateAsserts.push({assert:'three_tabs_distinct_endpoints', value:pth, pass: uniq.length===3});
  note('tab paths: '+JSON.stringify(pth)+' unique='+uniq.length);

  // content-differs assertion between tabs (grid titles sets differ)
  const setOf=a=>[...new Set(a)].sort().join('|');
  const fvsN = OUT.tabs.featured.titles.length&&OUT.tabs.newest.titles.length
      ? setOf(OUT.tabs.featured.titles)!==setOf(OUT.tabs.newest.titles) : null;
  OUT.stateAsserts.push({assert:'featured_vs_newest_content_differs', pass:fvsN});

  // ---- SAVE toggle from a discover-tab card ---------------------------------
  // Card hearts are static icons in this build; the functional Save lives on the
  // product detail opened FROM the tab's card. Drive it from NEWEST tab data.
  const target = (OUT.tabs.newest.titles.find(t=>/AU039 Handoff|AU042|Probe/i.test(t))
                 || OUT.tabs.newest.titles[0] || '');
  OUT.saveTarget = target;
  note('save target from NEWEST tab: '+target);
  const TOK = (await apiLogin());
  const idsBefore = await fetch(API+'/api/saved-products',{headers:{Authorization:'Bearer '+TOK}}).then(r=>r.json()).catch(()=>[]);
  const beforeIds = Array.isArray(idsBefore)?idsBefore.map(p=>p.productId):[];
  note('server saved BEFORE toggle: '+JSON.stringify(beforeIds));

  const mkD = OUT.network.length;
  const navOk = await clickCard(page, target.split(' ').slice(0,4).join(' '));
  await page.waitForTimeout(2600);
  const dNet = OUT.network.slice(mkD).map(n=>n.method+' '+n.url.replace(API,''));
  OUT.saveProbe = { clickCard:navOk, detailRequests:dNet.filter(u=>/itemDetails|saved-products/.test(u)) };
  note('detail nav: '+navOk+' net: '+JSON.stringify(OUT.saveProbe.detailRequests));
  await screenshot(page, SHOT('06-detail-from-tab-card'));

  const saveBtn = await page.evaluate(()=>{
    let hit=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const lbl=((e.getAttribute('aria-label')||'')+' '+(e.textContent||'')).toLowerCase();
      if(/save/.test(lbl) && e.getAttribute('flt-tappable')!==null){
        const r=e.getBoundingClientRect(); hit={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)};
      }
    });
    return hit;
  });
  note('detail save control: '+JSON.stringify(saveBtn));

  if(saveBtn){
    const mkS = OUT.network.length;
    await page.mouse.click(saveBtn.cx, Math.max(20,Math.min(saveBtn.cy,650)));
    await page.waitForTimeout(1700);
    OUT.saveProbe.toggleRequests = OUT.network.slice(mkS).map(n=>n.method+' '+n.url.replace(API,''));
    note('toggle net: '+JSON.stringify(OUT.saveProbe.toggleRequests));
    await screenshot(page, SHOT('07-after-save-toggle'));
    const idsAfter = await fetch(API+'/api/saved-products',{headers:{Authorization:'Bearer '+TOK}}).then(r=>r.json()).catch(()=>[]);
    const afterIds = Array.isArray(idsAfter)?idsAfter.map(p=>p.productId):[];
    OUT.saveProbe.beforeIds=beforeIds; OUT.saveProbe.afterIds=afterIds;
    const changed = JSON.stringify(afterIds)!==JSON.stringify(beforeIds);
    OUT.stateAsserts.push({assert:'server_saved_set_changed_after_toggle', pass:changed, before:beforeIds, after:afterIds});
    note('saved AFTER: '+JSON.stringify(afterIds)+' changed='+changed);

    // Saved screen reflects it
    await clickBtn(page,'GloboExpats').catch(()=>{});
    await page.mouse.click(12,40).catch(()=>{});
    await page.waitForTimeout(900);
    let okNav = await clickBtn(page,'Saved items');
    for(let i=0;i<8&&!okNav;i++){ await page.mouse.move(187,333); await page.mouse.wheel(0,280); await page.waitForTimeout(200); okNav=await clickBtn(page,'Saved items'); }
    const reached = await waitText(page,'Saved items',12000);
    OUT.saveProbe.savedScreenReached = reached;
    await page.waitForTimeout(1600);
    const savedTxt = await allText(page);
    const tgtId = afterIds.find(id=>!beforeIds.includes(id)) || null;
    OUT.saveProbe.reflectedTargetId = tgtId;
    await screenshot(page, SHOT('08-saved-screen'));
    // find target title on saved screen
    const shown = tgtId!=null && savedTxt.includes(target.split(' ').slice(0,3).join(' '));
    OUT.stateAsserts.push({assert:'saved_screen_shows_newly_saved_product', pass:shown, tgtId, snippet:target.slice(0,40)});
    note('saved screen shows target: '+shown);
    // unsave to restore RO-lane cleanliness (only rows we touched)
    const uns = await page.evaluate(()=>{
      const els=[...document.querySelectorAll('flt-semantics')];
      for(const e of els){ const l=(e.getAttribute('aria-label')||'');
        if(/remove from saved/i.test(l)){ const r=e.getBoundingClientRect(); return {cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)}; } }
      return null;
    });
    if(uns){ await page.mouse.click(uns.cx,uns.cy); await page.waitForTimeout(1400);
      const idsRestored = await fetch(API+'/api/saved-products',{headers:{Authorization:'Bearer '+TOK}}).then(r=>r.json()).catch(()=>[]);
      OUT.saveProbe.restoredIds=(idsRestored||[]).map(p=>p.productId);
      note('after unsave restore: '+JSON.stringify(OUT.saveProbe.restoredIds)); }
  } else {
    OUT.saveProbe.error='no-save-control-on-detail';
  }

  // ---- CLICK SWEEP: every control on home discover area (mobile) ------------
  await page.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await waitText(page,'GloboExpats',40000);
  await page.waitForTimeout(1500);
  await scrollToChips(page,375,667);
  OUT.buttons.discover_mobile = await listButtons(page);
  note('discover-area buttons mobile: '+OUT.buttons.discover_mobile.length);
  for(const b of OUT.buttons.discover_mobile.slice(0,40)){
    const lbl=(b.label||b.text||'').slice(0,50);
    if(/Newest|Featured|Top Picks/.test(lbl)){
      const before=OUT.network.length;
      const did=await clickChipAt(page,b.label||b.text,667);
      await page.waitForTimeout(700);
      const fired=OUT.network.length>before;
      OUT.clicks.push({label:lbl,clicked:did,networkDelta:fired});
    }
  }
  note('tab clicks recorded: '+JSON.stringify(OUT.clicks));

  // ---- SEED PROOF: two fresh loads must carry DIFFERENT seeds ---------------
  await page.evaluate(()=>localStorage.removeItem('flutter.auth_token'));
  for(const load of ['A','B']){
    const mark=OUT.network.length;
    await page.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
    await waitText(page,'GloboExpats',45000);
    let tries=0;
    while(tries++<34){
      const seen=OUT.network.slice(mark).filter(n=>/priceSort=SHUFFLE/.test(n.url+n.body));
      if(seen.length) break;
      await page.waitForTimeout(500);
    }
    const reqs=OUT.network.slice(mark).filter(n=>/SHUFFLE/.test(n.url+n.body));
    const seeds=reqs.map(r=>{const m=(r.url+r.body).match(/seed[=":\s]+([0-9]+)/);return m?m[1]:null;}).filter(Boolean);
    OUT.seedLoads.push({load,seeds:[...new Set(seeds)],urls:[...new Set(reqs.map(r=>r.method+' '+r.url.split('?')[0]))]});
    note(`fresh load ${load}: seeds=${JSON.stringify([...new Set(seeds)])} endpoints=${JSON.stringify(OUT.seedLoads.at(-1).urls)}`);
  }
  const sa=OUT.seedLoads[0].seeds, sb=OUT.seedLoads[1].seeds;
  const seedDiff = sa.length>0 && sb.length>0 && sa.join()!==sb.join();
  OUT.stateAsserts.push({assert:'shuffle_seed_changes_between_fresh_loads', pass:seedDiff, loadA:sa, loadB:sb});

  OUT.images.mobile = imageSummary(imgMap);
  OUT.images.mobile_urls = Object.entries(imgMap).map(([u,s])=>({status:s,url:u.replace(API,'')})).slice(0,60);

  await closeVideo(ctx,'/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-045-r10-mobile.webm');

  // ============== PASS 2: tablet 768x1024 — all three tabs =====================
  const ctx2 = await newCtx(browser,{viewport:{width:768,height:1024}});
  const p2 = await ctx2.newPage();
  const img2 = watchImages(p2); trackApi(p2);
  const S2=s=>`/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-045/AU-045-r10-tablet-${s}.png`;
  await p2.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await waitText(p2,'GloboExpats',40000);
  await p2.waitForTimeout(1500);
  await screenshot(p2,S2('01-home-top'));
  await scrollToChips(p2,768,1024);
  for(const t of ['Featured','Top Picks','Newest']){
    await scrollToChips(p2,768,1024);
    const mk=OUT.network.length;
    const okc=await clickChipAt(p2,t,1024);
    await p2.waitForTimeout(1900);
    const net=OUT.network.slice(mk).filter(n=>/displayItem/.test(n.url)).map(n=>n.method+' '+n.url.split('?')[0]);
    OUT.tabs['tablet_'+t]={clicked:okc,requests:net};
    note('tablet '+t+' -> '+JSON.stringify(net));
    await screenshot(p2,S2('02-'+t.toLowerCase().replace(' ','-')));
  }
  OUT.images.tablet=imageSummary(img2);
  await ctx2.close();

  // ============== PASS 3: parity vs reference :3000 same viewport ==============
  const ctx3 = await newCtx(browser,{viewport:vp});
  const p3 = await ctx3.newPage();
  const refNet=[];
  p3.on('request',r=>{ const u=r.url(); if(/\/api\//.test(u)) refNet.push(r.method()+' '+u.replace('http://localhost:3000','')); });
  await p3.goto('http://localhost:3000/',{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
  await p3.waitForTimeout(7000);
  await p3.screenshot({path:'/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-045/AU-045-r10-ref-mobile-top.png'}).catch(()=>{});
  await p3.evaluate(()=>{ const h=[...document.querySelectorAll('h2,h3,h4')].find(x=>/(New Arrivals|Discover)/i.test(x.textContent)); if(h&&h.scrollIntoView) h.scrollIntoView({block:'start'}); });
  await p3.waitForTimeout(2500);
  await p3.screenshot({path:'/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-045/AU-045-r10-ref-discover.png'}).catch(()=>{});
  const refTabs=[...new Set(refNet.filter(u=>/displayItem/.test(u)))];
  OUT.parityRefNetwork=refTabs;
  note('ref displayItem net: '+JSON.stringify(refTabs.slice(0,8)));
  await ctx3.close();

  await browser.close();
  fs.mkdirSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/tmp',{recursive:true});
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/tmp/au045_r10_out.json', JSON.stringify(OUT,null,1));
  note('DONE netevents='+OUT.network.length+' asserts='+JSON.stringify(OUT.stateAsserts.map(a=>a.assert+':'+a.pass)));
})().catch(e=>{ console.error('FATAL',e); process.exit(1); });

async function isLoggedIn(p){
  return p.evaluate(()=>{ try{ const v=localStorage.getItem('flutter.auth_token'); return !!(v&&v.length>10);}catch(e){return false;} });
}
async function apiLogin(){
  const r=await fetch(`${API}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:BUYER.email,password:BUYER.pw})});
  const j=await r.json(); if(!j.token) throw new Error('login failed'); return j.token;
}
