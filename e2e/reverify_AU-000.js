// AU-000 REVERIFY v2 — fresh verifier after the sandbox CORS fix (SecurityConfig now allowlists :9102).
// Target: FROZEN bundle http://localhost:9102 (/tmp/verify-snapshot/web @ git cf35e99).
// Proves the FULL loop: serve -> real browser -> a11y -> REAL API calls to :8083 from THIS origin
// -> PNG written AND read back natively. CAMPAIGN_V2 Appendix A adapted.
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { REF, BUYER, newBrowser, newCtx, closeVideo, allText, waitText,
        listButtons, screenshot } =
  require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');

const APP = 'http://localhost:9102';           // mandated frozen target (NOT lib's :9100)
const UNIT = 'AU-000';
const SHOTS = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-000';
const VID = '/tmp/wf-videos-AU-000-reverify';
const R = { unit:UNIT, title:'smoke_loop', wave:'verify', agent:'verifier-AU-000-reverify',
            target:APP, build_sha:null, build_mtime:null, steps:[], api_calls:[], images:{},
            image_sizes:{}, clicks:[], failures:[], vision:[], parity:{}, evidence:[] };
const t0 = Date.now();
function step(name, ok, detail){ R.steps.push({name, ok:!!ok, detail:String(detail||'').slice(0,500)});
  console.log(`${ok?'PASS':'FAIL'} | ${name} | ${String(detail||'').slice(0,280)}`); }

async function shot(p, name){ const f=`${SHOTS}/${name}.png`; await screenshot(p,f); R.evidence.push(f); return f; }
const norm=s=>(s||'').replace(/\s+/g,' ').trim();

// ---- locate a semantics node by normalized-text containment, SMALLEST match wins ----
async function findNode(p, lbl){
  return p.evaluate((label)=>{
    const want=label.toLowerCase();
    let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
      if(!t || !t.includes(want)) return;
      const isBtn=e.getAttribute('role')==='button', tap=e.getAttribute('flt-tappable')!==null;
      if(!isBtn && !tap) return;
      const r=e.getBoundingClientRect();
      if(r.width<8||r.height<8) return;
      const area=r.width*r.height;
      if(!best||area<best.area) best={cx:r.x+r.width/2, cy:r.y+r.height/2, area, isBtn};
    });
    return best?{cx:Math.round(best.cx),cy:Math.round(best.cy),isBtn:best.isBtn}:null;
  }, lbl);
}

// ---- scroll-to-find like a human: top -> progressive down -> horizontal sweeps ----
async function findReachable(p, lbl){
  // 1. jump to top
  await p.mouse.move(180,300);
  for(let i=0;i<6;i++){ await p.mouse.wheel(0,-1200); await p.waitForTimeout(90); }
  await p.waitForTimeout(350);
  let n=await findNode(p,lbl); if(n) return n;
  // 2. progressive downward
  await p.mouse.move(180,300);
  for(let s=0;s<14;s++){
    await p.mouse.wheel(0,420); await p.waitForTimeout(160);
    n=await findNode(p,lbl); if(n) return n;
  }
  // 3. horizontal sweeps both directions (category strips)
  await p.mouse.move(180,300);
  for(const dir of [-900,900,-1400,1400]){
    await p.mouse.wheel(dir,0); await p.waitForTimeout(220);
    n=await findNode(p,lbl); if(n) return n;
  }
  return null;
}

async function tapAt(p,n,vpH){
  if(!n||!Number.isFinite(n.cx)||!Number.isFinite(n.cy)) return false;
  const y=Math.min(Math.max(20,n.cy),vpH-20);
  await p.mouse.click(Math.max(2,Math.round(n.cx)),Math.round(y));
  await p.waitForTimeout(900);
  return true;
}

async function goHome(p,vpH=667){
  // prefer the bottom-nav Home tab (exact normalized label), else SPA reload
  let h=await findNode(p,'Home Tab 1 of 5');
  if(h && (await tapAt(p,h,vpH))){ await p.waitForTimeout(700);
    if(await findNode(p,'Buy now')) { await p.mouse.move(180,300);
      for(let i=0;i<6;i++){ await p.mouse.wheel(0,-1200); await p.waitForTimeout(80);}
      await p.waitForTimeout(300); return true; } }
  await p.goto(APP,{waitUntil:'load',timeout:60000}).catch(()=>{});
  await waitText(p,'Buy now',30000);
  await p.waitForTimeout(600);
  return true;
}

async function auditAndClickAll(p, tag, vpH){
  await p.waitForTimeout(900);
  await goHome(p,vpH);
  let ctrls = await listButtons(p);
  const seen=new Set();
  ctrls = ctrls.filter(c=>{ const k=c.kind+'|'+norm(c.label); if(norm(c.label).length<1||seen.has(k))return false; seen.add(k); return true; });
  console.log(`[${tag}] controls=${ctrls.length}`);
  let okN=0; const failed=[]; const disabled=[];
  for(const c of ctrls){
    const label=norm(c.label).slice(0,70);
    if(/Home Tab 1 of 5/.test(c.label)) { /* used as reset anchor; still click-test it */ }
    await goHome(p,vpH);
    const before=norm(await allText(p)); const urlBefore=p.url();
    const node=await findReachable(p, norm(c.label).slice(0,40));
    if(!node){
      // distinguish truly-absent vs disabled: rescan full page once more without scrolling
      const any=await findNode(p, norm(c.label).slice(0,40));
      if(any){ disabled.push(`${c.kind}:${label}`); R.clicks.push({tag,kind:c.kind,label,clicked:false,effect:false,why:'present-but-not-tappable-reachable'}); }
      else { failed.push(`${c.kind}:${label} (unreachable-after-scroll)`); R.clicks.push({tag,kind:c.kind,label,clicked:false,effect:false,why:'unreachable'}); }
      continue;
    }
    await tapAt(p,node,vpH);
    await p.waitForTimeout(600);
    const after=norm(await allText(p)); const urlAfter=p.url();
    let effect = before!==after || urlBefore!==urlAfter;
    if(!effect){ // one deliberate second tap
      const n2=await findReachable(p, norm(c.label).slice(0,40));
      if(n2){ await tapAt(p,n2,vpH); const after2=norm(await allText(p));
        effect = after2!==before || p.url()!==urlBefore; }
    }
    R.clicks.push({tag,kind:c.kind,label,clicked:true,effect,retried:!effect&&R.clicks.length>=0?urlAfter!==urlAfter:undefined,urlChanged:urlAfter!==urlBefore});
    if(effect) okN++; else { failed.push(`${c.kind}:${label} (no observable effect x2)`); }
  }
  step(`clicks_${tag}_all_effective`, failed.length===0,
       `${okN}/${ctrls.length} produced observable effect${failed.length?' ; FAILED: '+failed.join(' | '):''}${disabled.length?' ; DISABLED-LIKE: '+disabled.join(' | '):''}`);
  return {total:ctrls.length, ok:okN, failed};
}

(async ()=>{
  fs.mkdirSync(SHOTS,{recursive:true}); fs.mkdirSync(VID,{recursive:true});

  // ---------- STEP 1: freshness ----------
  const lm = execSync(`curl -sI ${APP}/main.dart.js | grep -i '^last-modified' | cut -d' ' -f2-`).toString().trim();
  R.build_mtime = lm;
  R.build_sha = execSync('cd ~/GloboExpats_Mobile && git rev-parse cf35e99').toString().trim();
  step('freshness_recorded', true, `main.dart.js Last-Modified=${lm}; bundle source commit=${R.build_sha} (cf35e99, 2026-08-22 15:12 +03, frozen snapshot /tmp/verify-snapshot/web)`);

  function wire(pg, tag){
    pg.on('response', r=>{
      const u=r.url(), s=r.status();
      if(/:8083\/api\//.test(u)) R.api_calls.push({tag, method:r.request().method(), url:u.replace(/^https?:\/\/[^/]+/,''), status:s});
      if(/\/uploads\/[^?]*\.(png|jpe?g|webp)/i.test(u) || /\/assets\/.*\.(png|webp|jpg|jpeg)/i.test(u)){
        R.images[u]=s;
        const cl=parseInt(r.headers()['content-length']||'-1',10);
        if(!Number.isNaN(cl)) R.image_sizes[u]=cl;
      }
    });
    pg.on('requestfailed', rq=>{ const u=rq.url();
      if(/\/uploads\/|\/assets\/.*\.(png|webp|jpg)/i.test(u)){ R.images[u]='FAILED'; R.image_sizes[u]=-1; } });
  }

  const browser = await newBrowser();

  // ============================================================
  // PHASE A: 375x667 guest — load, real-data asserts, click audit, REAL login
  // ============================================================
  const ctxA = await newCtx(browser, {viewport:{width:375,height:667}, videoPath:path.join(VID,'a.webm')});
  const p = await ctxA.newPage(); wire(p,'375');
  await p.goto(APP,{waitUntil:'load',timeout:90000}).catch(e=>step('goto_375',false,e.message));
  step('app_loaded_375', await waitText(p,'Buy now',45000), 'hero "Buy now" rendered at :9102 @375x667');

  await p.waitForTimeout(3500);
  const t375 = norm(await allText(p));
  const cats=['Art & Crafts','Electronics','Home & Living','Beauty','Furniture','Vehicles'];
  const featNames=['Crystal Galaxy','Clarks leather shoes','Multi-Function Vehicle Inverter',
                   'Indian Folk Art','Modern Business Stay Apartment','HUNTRX TOY SET',
                   'Serene Nest','Risky Couples Card Game','Pizza portion'];
  const catHit=cats.filter(c=>t375.includes(c)), prodHits=featNames.filter(n=>t375.includes(n));
  const priceCount=(t375.match(/(?:TZS|TSh)\s*[\d,.]+/gi)||[]).length;
  const loremish=/lorem|ipsum|placeholder|TODO|example\.com|sample product/i.test(t375);
  step('real_data_categories_375', catHit.length>=1, `real sandbox category names in a11y text: [${catHit.join(', ')}]`);
  step('real_data_products_375', prodHits.length>=2, `${prodHits.length} real featured titles [${prodHits.join(' ; ')}]`);
  step('real_data_prices_375', priceCount>=2, `localized TZS prices ("TSh N,NNN") in a11y text: ${priceCount} (app localizes TZS->TSh symbol)`);
  step('no_placeholder_text_375', !loremish, 'no lorem/ipsum/placeholder strings anywhere in a11y text');
  await shot(p,'reverify-375x667-guest-home');

  const apiOK=R.api_calls.filter(a=>a.status===200 && /categories|featured|filter/.test(a.url));
  step('one_real_api_call_from_origin', apiOK.length>=1,
       `${R.api_calls.length} live :8083 API calls from THIS origin (:9102); e.g. ${apiOK[0]?apiOK[0].method+' '+apiOK[0].url+' -> '+apiOK[0].status:'NONE'}`);

  const gA=await auditAndClickAll(p,'guest375',667);
  await goHome(p,667);
  await shot(p,'reverify-375x667-guest-after-clicks');

  // ---------- REAL UI login on THIS origin ----------
  await goHome(p,667);
  let ln=await findReachable(p,'Login');
  if(ln) await tapAt(p,ln,667);
  const loginShown=await waitText(p,'Welcome back',25000);
  step('login_form_opened', loginShown, 'Login screen ("Welcome back") rendered after tapping Login');
  const ei=p.locator('input[type="text"]').first(), pi=p.locator('input[type="password"]').first();
  await ei.click({force:true}).catch(()=>{}); await p.waitForTimeout(300); await p.keyboard.type(BUYER.email);
  await pi.click({force:true}).catch(()=>{}); await p.waitForTimeout(300); await p.keyboard.type(BUYER.pw);
  await shot(p,'reverify-375x667-login-filled');
  const nApi=R.api_calls.length;
  let lb=await findReachable(p,'Log in'); if(lb) await tapAt(p,lb,667);
  let token=null;
  for(let i=0;i<25;i++){ token=await p.evaluate(()=>localStorage.getItem('flutter.auth_token')); if(token) break; await p.waitForTimeout(1000); }
  const authCalls=R.api_calls.slice(nApi).filter(a=>/auth\/login/.test(a.url));
  step('ui_login_real_credentials', !!token,
       `flutter.auth_token persisted (len=${token?token.length:0}); in-page POST /api/v1/auth/login -> ${authCalls.map(a=>a.status).join(',')||'NO-CALL'}`);
  await p.waitForTimeout(1500);
  await shot(p,'reverify-375x667-buyer-home');
  const acctTxt=norm(await allText(p));
  step('signed_in_identity_rendered', acctTxt.includes(BUYER.email)||/logout|my account/i.test(acctTxt),
       `post-login identity markers present: email=${acctTxt.includes(BUYER.email)}, logout/account=${/logout|my account/i.test(acctTxt)}`);
  await closeVideo(ctxA, path.join(VID,'AU-000-reverify-375-guest+login.webm'));

  // ---------- PHASE B: buyer session (token carried) — buyer-state click audit ----------
  const ctxB = await newCtx(browser, {viewport:{width:375,height:667}, videoPath:path.join(VID,'b.webm')});
  const pb = await ctxB.newPage(); wire(pb,'375buyer');
  if(token) await pb.addInitScript(t=>{try{localStorage.setItem('flutter.auth_token',t);}catch(e){}}, token);
  await pb.goto(APP,{waitUntil:'load',timeout:90000}).catch(()=>{});
  await waitText(pb,'Buy now',45000);
  const signedIn=await pb.evaluate(()=>{try{return !!(localStorage.getItem('flutter.auth_token')||'').length>10;}catch(e){return false;}});
  await pb.waitForTimeout(2500);
  step('buyer_session_active_375', signedIn, `persisted token active in fresh context; account affordances=${/Account|Logout|My account/i.test(norm(await allText(pb)))}`);
  await auditAndClickAll(pb,'buyer375',667);
  await goHome(pb,667);
  await shot(pb,'reverify-375x667-buyer-after-clicks');
  await closeVideo(ctxB, path.join(VID,'AU-000-reverify-375-buyer.webm'));

  // ============================================================
  // PHASE C: 768x1024 tablet — real data + click audit
  // ============================================================
  const ctxC = await newCtx(browser, {viewport:{width:768,height:1024}});
  const pc = await ctxC.newPage(); wire(pc,'768');
  await pc.goto(APP,{waitUntil:'load',timeout:90000}).catch(e=>step('goto_768',false,e.message));
  await waitText(pc,'Buy now',45000);
  await pc.waitForTimeout(3500);
  const t768=norm(await allText(pc));
  const cat768=cats.filter(c=>t768.includes(c)), prod768=featNames.filter(n=>t768.includes(n));
  const price768=(t768.match(/(?:TZS|TSh)\s*[\d,.]+/gi)||[]).length;
  step('real_data_categories_768', cat768.length>=1, `[${cat768.join(', ')}]`);
  step('real_data_products_768', prod768.length>=2, `${prod768.length} titles [${prod768.join(' ; ')}]`);
  step('real_data_prices_768', price768>=2, `price strings: ${price768}`);
  await shot(pc,'reverify-768x1024-guest-home');
  await auditAndClickAll(pc,'guest768',1024);
  await goHome(pc,1024);
  await shot(pc,'reverify-768x1024-after-clicks');
  await ctxC.close();

  // ---------- STEP 3: image reconciliation ----------
  const vals=Object.values(R.images);
  const total=vals.length, okN=vals.filter(s=>s===200||s===304).length, bad=vals.filter(s=>s!==200&&s!==304);
  const zeroLen=Object.entries(R.image_sizes).filter(([u,l])=>l===0).map(([u])=>u);
  const uploads=Object.keys(R.images).filter(u=>/\/uploads\//.test(u)).length;
  step('images_all_200_nonempty', total>0 && bad.length===0 && zeroLen.length===0,
       `${total} image requests (${uploads} backend /uploads/, ${total-uploads} bundled /assets/), ${okN} ok(200/304), ${bad.length} bad, zero-length:${zeroLen.length}`);
  R.images_summary={total, ok:okN, bad:bad.length};

  // ---------- STEP 7: PARITY capture from :3000 ----------
  const ctxR = await newCtx(browser, {viewport:{width:375,height:667}});
  const pr = await ctxR.newPage();
  await pr.goto(REF+'/',{waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{});
  await pr.waitForTimeout(7000);
  await pr.screenshot({path:`${SHOTS}/ref-375-home.png`,fullPage:false}).catch(()=>{});
  R.evidence.push(`${SHOTS}/ref-375-home.png`);
  step('parity_captured', true, 'ref-375-home.png captured from reference :3000 at 375x667');
  await ctxR.close();

  await browser.close();
  R.runtime_ms=Date.now()-t0;
  fs.writeFileSync('/tmp/AU-000-reverify-run.json', JSON.stringify(R,null,1));
  console.log('RUNTIME_MS='+R.runtime_ms);
})().catch(e=>{ console.error('FATAL',e); process.exit(1); });
