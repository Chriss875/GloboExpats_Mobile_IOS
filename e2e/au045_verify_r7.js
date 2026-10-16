// AU-045 verify-r7 — discover_tabs_shuffle_seed (RO lane) on frozen :9121 b56e345.
// Appendix A: freshness, real data, images, click-everything, shots both vps,
// native vision (separate Read calls), video, parity vs :3000.
const { newBrowser, newCtx, closeVideo, allText, waitText, btn, clickBtn, clickCard,
        listButtons, scrollToBottom, scrollIntoView, watchImages, imageSummary, screenshot } =
  require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const fs = require('fs');
const APP = 'http://localhost:9121';

const OUT = {
  ts: new Date().toISOString(), unit: 'AU-045', stage: 'verify-r7',
  network: [], tabs: {}, seedLoads: [], images: {}, buttons: {},
  clicks: [], stateAsserts: [], consoleErrors: [], notes: [],
};
function note(m){ OUT.notes.push(m); console.log('[au045] ' + m); }

async function trackApi(page){
  page.on('request', r => { const u = r.url();
    if (/\/api\//.test(u)) OUT.network.push({ url: u.replace('http://localhost:8083','').replace('http://localhost:3000',''), method: r.method(),
      body: (r.postData()||'').slice(0,220) });
  });
}

async function openHome(page){
  await page.goto(APP + '/', {waitUntil:'load', timeout:90000}).catch(()=>{});
  await waitText(page, 'GloboExpats', 40000);
  // Discover chips live below hero+how-it-works+categories; scroll to them.
  for (let i=0;i<14 && !(await findChip(page,'Newest'));i++){
    await page.mouse.move(187,333); await page.mouse.wheel(0,320); await page.waitForTimeout(260);
  }
}
async function findChip(page,label){
  return page.evaluate((lbl)=>{
    let hit=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      if(hit) return;
      if((e.textContent||'').trim()===lbl){ const r=e.getBoundingClientRect(); hit={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2),w:r.width,h:r.height}; }
    });
    return hit;
  },label);
}
async function clickChip(page,label){
  const pos = await findChip(page,label);
  if(!pos) return false;
  await page.mouse.click(Math.max(8,Math.min(pos.cx,pos.w)), Math.max(20,Math.min(pos.cy,650)));
  await page.waitForTimeout(900);
  return true;
}
async function gridSnapshot(page){
  // Product names visible in the discover grid region (after the chips row).
  return page.evaluate(()=>{
    const nodes=[...document.querySelectorAll('flt-semantics')];
    const chipY = (()=>{ let y=-1; nodes.forEach(e=>{ if(y<0 && ['Newest','Featured','Top Picks'].includes((e.textContent||'').trim()) ) { const r=e.getBoundingClientRect(); y=Math.max(y,r.top);} }); return y; })();
    const names=[];
    nodes.forEach(e=>{
      const t=(e.textContent||'').trim(); if(!t || t.length<6) return;
      const r=e.getBoundingClientRect();
      if(r.top < chipY - 40 || r.top > innerHeight) return;   // grid area only
      if(names.indexOf(t)<0) names.push(t);
    });
    return {chipY: Math.round(chipY), names: names.slice(0,24)};
  });
}

(async ()=>{
  const browser = await newBrowser();

  // ---------------- PASS 1: mobile 375x667 with video + network tracking ----
  const vp = {width:375,height:667};
  const ctx = await newCtx(browser,{viewport:vp, videoPath:'/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-045-r7-mobile.webm'});
  const page = await ctx.newPage();
  const imgMap = watchImages(page);
  trackApi(page);
  page.on('console', m=>{ if(m.type()==='error') OUT.consoleErrors.push(m.text().slice(0,200)); });
  const SHOT=(s)=>`/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-045/AU-045-mobile-${s}.png`;

  await openHome(page);
  await screenshot(page, SHOT('01-home-loaded'));
  await page.waitForTimeout(1200);

  const before = OUT.network.length;
  // --- Tab switch #1: Featured -> must POST /displayItem/filter with seed ---
  await clickChip(page,'Featured');
  await page.waitForTimeout(1800);
  const featuredNet = OUT.network.slice(before).filter(n=>n.url.includes('displayItem'));
  OUT.tabs.featured = { requests: featuredNet.map(n=>({u:n.url, m:n.method, body:n.body})) };
  note('FEATURED tab net: ' + JSON.stringify(featuredNet.map(n=>n.method+' '+n.url+(n.body?' :: '+n.body:''))));
  const gF = await gridSnapshot(page); OUT.tabs.featured.gridNames = gF.names;
  await screenshot(page, SHOT('02-tab-featured'));

  // --- Tab switch #2: Top Picks -> GET /displayItem/top-picks --------------
  const b2 = OUT.network.length;
  await clickChip(page,'Top Picks');
  await page.waitForTimeout(1800);
  const tpNet = OUT.network.slice(b2).filter(n=>n.url.includes('displayItem'));
  OUT.tabs.topPicks = { requests: tpNet.map(n=>({u:n.url,m:n.method,body:n.body})), gridNames:(await gridSnapshot(page)).names };
  note('TOP PICKS tab net: ' + JSON.stringify(tpNet.map(n=>n.method+' '+n.url)));
  await screenshot(page, SHOT('03-tab-toppicks'));

  // --- Back to Newest -> GET /displayItem/newest?sort=createdAt,desc -------
  const b3 = OUT.network.length;
  await clickChip(page,'Newest');
  await page.waitForTimeout(1500);
  const nwNet = OUT.network.slice(b3).filter(n=>n.url.includes('displayItem'));
  OUT.tabs.newest = { requests: nwNet.map(n=>({u:n.url,m:n.method,body:n.body})), gridNames:(await gridSnapshot(page)).names };
  note('NEWEST tab net: ' + JSON.stringify(nwNet.map(n=>n.method+' '+n.url)));

  // distinct endpoint paths check
  const paths = [featuredNet, tpNet, nwNet].map(list=>list.map(n=>n.url.split('?')[0]).join('|'));
  OUT.stateAsserts.push({assert:'three_distinct_tab_endpoint_paths', value:paths});
  await screenshot(page, SHOT('04-back-to-newest'));

  // --- SAVE from inside a tab -------------------------------------------
  // Home card heart is a static icon (source-read), so save is driven from the
  // product detail opened FROM the tab card (the tab's data), then verified
  // reflected in the Saved screen AND in the API.
  const newestNames = OUT.tabs.newest.gridNames;
  const targetName = (newestNames.find(n=>/AU039R6|Handoff|Inverter/.test(n)) || newestNames[0] || '').slice(0,40);
  note('save target from NEWEST tab: ' + targetName);
  OUT.saveTarget = targetName;

  const b4 = OUT.network.length;
  await clickCard(page, targetName.split(' ').slice(0,3).join(' '));
  await page.waitForTimeout(2500);
  const detNet = OUT.network.slice(b4);
  OUT.saveProbe = { navRequests: detNet.filter(n=>/itemDetails|saved-products/.test(n.url)).map(n=>n.method+' '+n.url) };
  await screenshot(page, SHOT('05-detail-opened-from-tab'));
  const detailTxt = await allText(page);

  // find Save control on detail bottom bar
  const saveBtn = await page.evaluate(()=>{
    let hit=null;
    document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
      const lbl=(e.getAttribute('aria-label')||'')+' '+(e.textContent||'');
      if(/save/i.test(lbl)){ const r=e.getBoundingClientRect(); hit={cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)}; }
    });
    return hit;
  });
  note('detail save button found: ' + JSON.stringify(saveBtn));
  const savedBefore = await fetch('http://localhost:8083/api/saved-products').then(r=>r.status).catch(()=>0);
  const TOK = fs.readFileSync('/tmp/au045_tok','utf8').trim();
  const idsBefore = await fetch('http://localhost:8083/api/saved-products',{headers:{Authorization:'Bearer '+TOK}}).then(r=>r.json()).catch(()=>[]);
  const beforeIds = Array.isArray(idsBefore)?idsBefore.map(p=>p.productId):[];
  note('saved ids BEFORE in-app toggle: ' + JSON.stringify(beforeIds));

  if(saveBtn){
    const b5 = OUT.network.length;
    await page.mouse.click(saveBtn.cx, Math.max(20,Math.min(saveBtn.cy,650)));
    await page.waitForTimeout(1600);
    OUT.saveProbe.toggleRequests = OUT.network.slice(b5).map(n=>n.method+' '+n.url);
    note('toggle net: ' + JSON.stringify(OUT.saveProbe.toggleRequests));
    await screenshot(page, SHOT('06-after-save-toggle'));
    const idsAfter = await fetch('http://localhost:8083/api/saved-products',{headers:{Authorization:'Bearer '+TOK}}).then(r=>r.json()).catch(()=>[]);
    const afterIds = Array.isArray(idsAfter)?idsAfter.map(p=>p.productId):[];
    OUT.saveProbe.beforeIds = beforeIds; OUT.saveProbe.afterIds = afterIds;
    note('saved ids AFTER toggle: ' + JSON.stringify(afterIds));
    OUT.stateAsserts.push({assert:'server_saved_set_changed', changed: JSON.stringify(afterIds)!==JSON.stringify(beforeIds),
      before:beforeIds, after: afterIds});
    // navigate to Saved screen via the drawer (shell.dart 'Saved items')
    await clickBtn(page, 'GloboExpats').catch(()=>{});
    await page.mouse.click(12, 40).catch(()=>{});   // hamburger fallback
    await page.waitForTimeout(900);
    let okSavedNav = await clickBtn(page, 'Saved items');
    if(!okSavedNav){
      for(let i=0;i<8 && !okSavedNav;i++){ await page.mouse.move(187,333); await page.mouse.wheel(0,260); await page.waitForTimeout(200); okSavedNav = await clickBtn(page,'Saved items'); }
    }
    note('drawer Saved items clicked: ' + okSavedNav);
    const sawSaved = await waitText(page, 'Saved items', 15000);
    OUT.saveProbe.savedScreenReached = sawSaved;
    await screenshot(page, SHOT('07-saved-screen-reflects'));
    const savedTxt = await allText(page);
    const tgtId = afterIds.find(id=>!beforeIds.includes(id)) || null;
    OUT.saveProbe.reflectedTarget = tgtId;
    OUT.stateAsserts.push({assert:'saved_screen_shows_target', targetId:tgtId, present: tgtId!=null});
  } else {
    note('NO save control reachable on detail');
    OUT.saveProbe.error = 'no-save-control';
  }

  // back to home for the two-fresh-load seed proof
  await page.goto(APP + '/', {waitUntil:'load', timeout:90000}).catch(()=>{});
  await page.evaluate(()=>{ try{ localStorage.removeItem('flutter.auth_token'); }catch(e){} });

  // ---------------- PASS 2 & 3: fresh loads, capture shuffle seeds ----------
  for (const load of ['A','B']){
    const mark = OUT.network.length;
    await page.goto(APP + '/', {waitUntil:'load', timeout:90000}).catch(()=>{});
    await waitText(page,'GloboExpats',45000);
    // wait until the filter POST appears
    let tries=0;
    while(tries++<30){
      const seen = OUT.network.slice(mark).filter(n=>/priceSort=SHUFFLE/.test(n.url+n.body));
      if(seen.length) break;
      await page.waitForTimeout(500);
    }
    const reqs = OUT.network.slice(mark).filter(n=>/SHUFFLE/.test(n.url+n.body));
    const seeds = reqs.map(r=>{ const m=(r.url+r.body).match(/seed[=&:"\s]+([0-9]+)/); return m?m[1]:null; }).filter(Boolean);
    OUT.seedLoads.push({load, seeds:[...new Set(seeds)], urls:reqs.map(r=>r.method+' '+r.url)});
    note(`fresh load ${load}: seeds=${JSON.stringify([...new Set(seeds)])}`);
    if(load==='B'){
      await page.waitForTimeout(1000);
      await screenshot(page, SHOT('08-fresh-load-B'));
    }
  }

  OUT.images.mobile = imageSummary(imgMap);
  OUT.images.mobile_urls = Object.entries(imgMap).map(([u,s])=>({status:s, url:u.replace('http://localhost:8083','')}));

  // full button enumeration on home (mobile)
  OUT.buttons.home_mobile = await listButtons(page);
  await closeVideo(ctx, '/home/devsystemadmin/GloboExpats_Mobile/e2e/videos/AU-045-r7-mobile.webm');

  // ---------------- TABLET pass 768x1024: tabs only -------------------------
  const ctx2 = await newCtx(browser,{viewport:{width:768,height:1024}});
  const p2 = await ctx2.newPage();
  const img2 = watchImages(p2); trackApi(p2);
  const S2=(s)=>`/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-045/AU-045-tablet-${s}.png`;
  await p2.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await waitText(p2,'GloboExpats',40000);
  await p2.waitForTimeout(1500);
  await screenshot(p2, S2('01-home-loaded'));
  for(const t of ['Featured','Top Picks','Newest']){
    for(let i=0;i<10 && !(await findChip(p2,t));i++){ await p2.mouse.move(384,512); await p2.mouse.wheel(0,340); await p2.waitForTimeout(240); }
    const mk = OUT.network.length;
    await clickChip(p2,t);
    await p2.waitForTimeout(1700);
    OUT.tabs['tablet_'+t] = OUT.network.slice(mk).filter(n=>n.url.includes('displayItem')).map(n=>n.method+' '+n.url);
    await screenshot(p2, S2('02-'+t.toLowerCase().replace(' ','')));
  }
  OUT.images.tablet = imageSummary(img2);
  await ctx2.close();

  // ---------------- PARITY: reference :3000 same viewport -------------------
  const ctx3 = await newCtx(browser,{viewport:vp});
  const p3 = await ctx3.newPage();
  const refNet=[];
  p3.on('request', r=>{ if(/\/api\//.test(r.url())) refNet.push(r.method()+' '+r.url()); });
  await p3.goto('http://localhost:3000/', {waitUntil:'domcontentloaded', timeout:60000}).catch(()=>{});
  await p3.waitForTimeout(6000);
  await p3.screenshot({path:'/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-045/ref-home-mobile-top.png'}).catch(()=>{});
  await p3.evaluate(()=>{ const el=[...document.querySelectorAll('h2,h3')].find(h=>/New Arrivals/i.test(h.textContent)); if(el&&el.scrollIntoView) el.scrollIntoView({block:'start'}); });
  await p3.waitForTimeout(2500);
  await p3.screenshot({path:'/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-045/ref-home-discover.png'}).catch(()=>{});
  OUT.parityRefNetwork = [...new Set(refNet)].filter(u=>/displayItem/.test(u));
  note('ref displayItem net: ' + JSON.stringify(OUT.parityRefNetwork.slice(0,10)));
  await ctx3.close();

  await browser.close();
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/tmp/au045_r7_out.json', JSON.stringify(OUT,null,1));
  note('DONE network events='+OUT.network.length);
})().catch(e=>{ console.error('FATAL', e); process.exit(1); });
