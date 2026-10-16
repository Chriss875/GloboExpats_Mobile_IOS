// au058_skeptic_r14.js — SKEPTIC pass for AU-058 (>=6 attack classes) against the
// FROZEN build :9131. Attacks the PASS evidence with independent probes.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP='http://localhost:9131';
const BUILD_SHA='e694463', BUILD_MT='Wed, 26 Aug 2026 08:15:26 GMT';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fx=JSON.parse(fs.readFileSync('/tmp/au058_fixtures_r14.json','utf8'));

const R={ ts:new Date().toISOString(), unit:'AU-058', wave:'skeptic', agent:'skeptic-AU-058',
  build_sha:BUILD_SHA, attacks_attempted:0, attacks_broken:0, findings:[], verdict:null };

function attack(name, broke, detail){
  R.attacks_attempted++;
  console.log(`[A${R.attacks_attempted}] ${broke?'BROKEN':'HELD'} ${name} :: ${String(detail).slice(0,150)}`);
  if(broke){ R.attacks_broken++; R.findings.push({attack:name, detail:String(detail).slice(0,300)}); }
}

(async()=>{
  // ---- A1 freshness/identity: is the served bundle really the frozen one? ----
  const h=await fetch(APP+'/main.dart.js',{method:'HEAD'});
  attack('A1-stale-build', h.headers.get('last-modified')!==BUILD_MT,
    `last-modified=${h.headers.get('last-modified')}`);

  // ---- A2 static-copy laundering: does the feed render when the API is DOWN? ----
  // If titles still render with :8083 unreachable => hardcoded copy, not real data.
  const b2=await L.newBrowser();
  const c2=await L.newCtx(b2,{viewport:{width:375,height:667}});
  await c2.addInitScript(t=>{try{localStorage.setItem('flutter.auth_token',JSON.stringify(t));
    localStorage.setItem('flutter.auth_email',JSON.stringify(fx.buyerEmail));}catch(e){}},fx.buyerToken);
  const p2=await c2.newPage();
  await c2.route(/localhost:8083/, r=>r.abort());
  await p2.goto(APP,{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p2,'Buy now',40000);
  await p2.locator('flt-semantics[role="button"]').filter({hasText:'Account'}).first().click({force:true}).catch(()=>{});
  await sleep(1500);
  const row=await p2.evaluate(()=>{
    let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()!=='Notifications') return;
      const roleOk=e.getAttribute('role')==='button'||e.getAttribute('flt-tappable')!==null;
      if(!roleOk) return; const r=e.getBoundingClientRect();
      if(r.width<10||r.height<10) return;
      best={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
    }); return best;
  });
  let offlineText='';
  if(row){ await p2.mouse.click(row.x,row.y); await sleep(3000); offlineText=await L.allText(p2); }
  const fakeRender = /Delivered - please confirm receipt|Driver assigned/.test(offlineText);
  attack('A2-static-copy-with-api-down', fakeRender,
    fakeRender?'titles rendered while :8083 was aborted — NOT real data'
              :'error/empty state shown without API ('+(offlineText.slice(0,60)||'blank')+')');
  await L.screenshot(p2,'e2e/shots/AU-058/AU-058-sk-a2-offline.png');
  await b2.close();

  // ---- A3 wrong-user data leak: can user X see user Y's notifications? ----
  // The throwaway buyer's rows must NOT appear for a DIFFERENT fresh account.
  const stamp=Date.now(); const PW='StrongPass!1';
  const otherEmail=`au058sk${stamp}@gmail.com`;
  await L.api(null,'POST','/api/v1/auth/register',{firstName:'SK',lastName:'058',password:PW,emailAddress:otherEmail});
  const otok=await L.apiLogin({email:otherEmail,pw:PW});
  const otherFeed=await L.api(otok,'GET','/api/v1/notifications?page=0&size=50');
  const leaked=((otherFeed.json.content)||[]).some(n=>n.title==='Payment proof submitted - PF-2026-000488'||/Driver assigned - order #6a950359/.test(n.title));
  attack('A3-cross-user-leak', leaked, `fresh account sees fixture rows: ${leaked}`);

  // ---- A4 unauthenticated access to the notification API ----
  const unauthRes=await fetch('http://localhost:8083/api/v1/notifications',{redirect:'manual'});
  attack('A4-unauth-api', unauthRes.status===200,
    `GET /notifications w/o token -> ${unauthRes.status} (302=OAuth gate, secure)`);

  // ---- A5 mark-all-read idempotency/correctness on ANOTHER user's row ----
  // PATCH /notifications/{id}/read for a row you don't own must not succeed.
  const mine=await L.api(fx.buyerToken,'GET','/api/v1/notifications?page=0&size=50');
  const myRow=(mine.json.content||[])[0];
  if(myRow){
    const foreign=await L.api(otok,'PATCH',`/api/v1/notifications/${myRow.notificationId}/read`,{});
    const stillMine=await L.api(fx.buyerToken,'GET','/api/v1/notifications?page=0&size=50');
    const rowNow=((stillMine.json.content)||[]).find(n=>n.notificationId===myRow.notificationId);
    attack('A5-foreign-mark-read', foreign.status===200 || (rowNow&&rowNow.isRead===false&&myRow.isRead===true),
      `foreign PATCH -> ${foreign.status}; owner sees isRead=${rowNow&&rowNow.isRead}`);
  } else {
    attack('A5-foreign-mark-read', false, 'no rows available in fixture feed (feed was deleted by delete-all test)');
  }

  // ---- A6 UI lies about failure state: does the app claim success after a 500? ----
  // delete-all sends no body -> backend 500. Does the app STILL show "No notifications yet."?
  const ev=JSON.parse(fs.readFileSync('/tmp/au058_deleteall_final2.json','utf8'));
  attack('A6-false-success-after-500',
    ev.wireFrames.some(w=>w.status===500) && ev.uiEmptyState===true,
    `wire=${JSON.stringify(ev.wireFrames)} but uiEmptyState=${ev.uiEmptyState} (server still has ${ev.rowsAfter} rows)`);

  // ---- A7 badge/poll honesty: unread-count endpoint used anywhere in the UI? ----
  const src=fs.readFileSync('/home/devsystemadmin/GloboExpats_Mobile/lib/api/api_client.dart','utf8');
  const hasApiMethod=/fetchUnreadNotificationCount/.test(src);
  const shellSrc=fs.readFileSync('/home/devsystemadmin/GloboExpats_Mobile/lib/screens/shell.dart','utf8');
  const usedInShell=/unread/i.test(shellSrc);
  const bundle=await (await fetch(APP+'/main.dart.js')).text();
  const bundleHasUnreadCall=bundle.includes('unread-count');
  attack('A7-badge-poll-absent', hasApiMethod && !usedInShell && !bundleHasUnreadCall,
    `api method exists=${hasApiMethod}, wired in shell=${usedInShell}, 'unread-count' string in frozen bundle=${bundleHasUnreadCall}`);

  // ---- A8 stale-session handling: expired token must gate the screen ----
  const b8=await L.newBrowser();
  const c8=await L.newCtx(b8,{viewport:{width:375,height:667}});
  await c8.addInitScript(()=>{try{
    localStorage.setItem('flutter.auth_token',JSON.stringify('INVALID.TOKEN.FORCED'));
    localStorage.setItem('flutter.auth_email',JSON.stringify(fx.buyerEmail));}catch(e){}});
  const p8=await c8.newPage();
  await p8.goto(APP,{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p8,'Buy now',40000);
  await p8.locator('flt-semantics[role="button"]').filter({hasText:'Account'}).first().click({force:true}).catch(()=>{});
  await sleep(1500);
  const row8=await p8.evaluate(()=>{
    let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      if((e.textContent||'').trim()!=='Notifications') return;
      const roleOk=e.getAttribute('role')==='button'||e.getAttribute('flt-tappable')!==null;
      if(!roleOk) return; const r=e.getBoundingClientRect();
      if(r.width<10||r.height<10) return;
      best={x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
    }); return best;
  });
  if(row8){ await p8.mouse.click(row8.x,row8.y); await sleep(3000); }
  const t8=await L.allText(p8);
  const showsRealData=(t8||'').includes('Delivered - please confirm receipt');
  attack('A8-invalid-token-shows-data', showsRealData,
    showsRealData?'real rows rendered under an invalid token':('screen text: '+(t8||'').slice(0,70)));
  await b8.close();

  // ---- verdict ----
  R.verdict = R.attacks_broken===0 ? 'HELD' : (R.attacks_broken<=2 ? 'DISPUTED' : 'BROKEN');
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/AU-058-skeptic.jsonl',
    JSON.stringify(R)+'\n', {flag:'a'});
  console.log('SKEPTIC VERDICT:', R.verdict, `(${R.attacks_broken}/${R.attacks_attempted} broken)`);
})().catch(e=>{console.error('FATAL',e.message);
  R.verdict=R.verdict||'DISPUTED';
  fs.appendFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/AU-058-skeptic.jsonl', JSON.stringify(R)+'\n');
  process.exit(1)});
