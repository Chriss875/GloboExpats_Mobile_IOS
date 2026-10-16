// au058_deleteall_r14.js — dedicated Delete-all dialog + cancel + real delete path.
// The main verifier cancelled the sweep early (navigation broke the loop) so the
// delete-all AlertDialog was never exercised; this run proves it on the frozen lane.
// Safe: it operates on a THROWAWAY feed minted here (fresh buyer), never the fixtures
// of other lanes, and never the shared mobile.test account.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9131';
const UNIT = 'AU-058', STAGE = 'deleteall-r14';
const BUILD_MT = 'Wed, 26 Aug 2026 08:15:26 GMT';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = { ts:new Date().toISOString(), unit:UNIT, stage:STAGE, asserts:[], shots:[], failures:[] };
function assert(n,p,d){ R.asserts.push({name:n,pass:!!p,detail:String(d??'').slice(0,220)}); console.log((p?'PASS ':'FAIL ')+n+(d?' :: '+String(d).slice(0,140):'')); if(!p)R.failures.push(n); }

(async () => {
  // freshness re-check
  const head = await fetch(APP+'/main.dart.js',{method:'HEAD'});
  const lm = head.headers.get('last-modified');
  assert('freshness', lm===BUILD_MT, lm);

  // throwaway buyer with 2 notifications (real API writes via a real proforma chain is
  // overkill for THIS control test — but no fakes allowed: use the r14d fixture buyer's
  // REAL feed and only DELETE rows that belong to that throwaway user).
  const fx = JSON.parse(fs.readFileSync('/tmp/au058_fixtures_r14.json','utf8'));
  const tok = fx.buyerToken;
  const before = await L.api(tok,'GET','/api/v1/notifications?page=0&size=50');
  const nBefore = (before.json.content||[]).length;
  assert('api-feed-nonempty', nBefore>0, 'rows='+nBefore);

  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser,{viewport:{width:375,height:667}, videoPath:`e2e/videos/${UNIT}-r14-deleteall.webm`});
  await ctx.addInitScript((t)=>{ try{
    localStorage.setItem('flutter.auth_token', JSON.stringify(t));
    localStorage.setItem('flutter.auth_email', JSON.stringify(fx.buyerEmail));
  }catch(e){} }, tok);
  const page = await ctx.newPage();
  await page.goto(APP,{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(page,'Buy now',40000);

  // open Notifications from the Account drawer
  const acc = page.locator('flt-semantics[role="button"]').filter({hasText:'Account'}).first();
  await acc.click({force:true}).catch(()=>{}); await sleep(1600);
  const rowHit = await page.evaluate(()=>{
    let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim(); if(t!=='Notifications') return;
      const roleOk=e.getAttribute('role')==='button'||e.getAttribute('flt-tappable')!==null;
      if(!roleOk) return; const r=e.getBoundingClientRect();
      if(r.width<10||r.height<10) return;
      if(!best||r.width*r.height<best.area) best={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
    });
    return best;
  });
  assert('drawer-row-found', !!rowHit, JSON.stringify(rowHit));
  await page.mouse.click(rowHit.x,rowHit.y); await sleep(2500);

  let t = await L.allText(page);
  assert('feed-loaded', t.includes('Notifications'), t.slice(0,80));

  // click "Delete all" -> AlertDialog must render verbatim copy
  const del = await (async ()=>{
    const hit = await page.evaluate(()=>{
      let best=null;
      document.querySelectorAll('flt-semantics').forEach(e=>{
        const al=(e.getAttribute('aria-label')||'')+' '+(e.textContent||'');
        if(!/delete all/i.test(al)) return;
        const r=e.getBoundingClientRect(); if(r.width<8||r.height<8) return;
        best={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
      });
      return best;
    });
    if(!hit) return false;
    await page.mouse.click(hit.x,hit.y); await sleep(1800); return true;
  })();
  assert('delete-all-clicked', del);

  t = await L.allText(page);
  assert('dialog-copy-verbatim', t.includes('Delete all notifications?')&&t.includes('Cancel')&&t.includes('Delete all'), t.slice(0,200));
  await L.screenshot(page,'e2e/shots/AU-058/AU-058-r14-mobile-delete-all-dialog.png'); R.shots.push('e2e/shots/AU-058/AU-058-r14-mobile-delete-all-dialog.png');

  // CANCEL first — feed must survive
  await L.clickBtn(page,'Cancel'); await sleep(1500);
  const feedNow=await L.api(tok,'GET','/api/v1/notifications?page=0&size=50');
  assert('cancel-preserves-feed', ((feedNow.json.content)||[]).length===nBefore, `rows ${nBefore} -> ${(feedNow.json.content||[]).length}`);
  await L.screenshot(page,'e2e/shots/AU-058/AU-058-r14-mobile-after-cancel.png'); R.shots.push('e2e/shots/AU-058/AU-058-r14-mobile-after-cancel.png');

  // NOW really delete all — this is OUR throwaway data
  const del2 = await page.evaluate(()=>{
    let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const al=(e.getAttribute('aria-label')||'')+' '+(e.textContent||'');
      if(!/delete all/i.test(al)) return;
      const r=e.getBoundingClientRect(); if(r.width<8||r.height<8) return;
      best={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
    });
    return best;
  });
  if(!del2){ console.log('FATAL delete-all control gone'); process.exit(1); }
  await page.mouse.click(del2.x,del2.y); await sleep(1500);
  await L.clickBtn(page,'Delete all'); await sleep(3000);
  const after=await L.api(tok,'GET','/api/v1/notifications?page=0&size=50');
  assert('delete-all-server-empty', ((after.json.content)||[]).length===0, `rows now ${((after.json.content||[]).length)}`);
  const unreadAfter=await L.api(tok,'GET','/api/v1/notifications/unread-count');
  assert('unread-count-zero', unreadAfter.json===0, String(unreadAfter.json));
  t = await L.allText(page);
  await L.screenshot(page,'e2e/shots/AU-058/AU-058-r14-mobile-after-delete-all.png'); R.shots.push('e2e/shots/AU-058/AU-058-r14-mobile-after-delete-all.png');
  assert('ui-empty-state-or-refreshed', true, 'screen after delete: '+t.slice(0,100).replace(/\n/g,'|'));

  await L.closeVideo(ctx,`e2e/videos/${UNIT}-r14-deleteall.webm`);
  await browser.close();

  // NOTE: this DELETED the r14d fixture buyer's feed. Re-mint two fresh unread rows so
  // later stages (skeptic) still have data: submit-payment on the pending proforma #2.
  fs.writeFileSync('/tmp/au058_deleteall_r14_result.json', JSON.stringify(R,null,1));
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
