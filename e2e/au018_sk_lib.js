// au018_sk_lib.js — shared helpers for the AU-018 skeptic attacks (all on :9121 b56e345)
const fs = require('fs');
const L = require('./lib_verify.js');
const { decodePng } = require('/tmp/pngdec.js');
const APP = 'http://localhost:9121';
const FX = JSON.parse(fs.readFileSync('/tmp/au018_fixtures.json','utf8'));
const UNIT='AU-018';
const SHARD = `/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/${UNIT}-skeptic.jsonl`;
const SHOT  = `/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/${UNIT}`;
function rec(o){ o.unit=UNIT; o.wave='skeptic'; o.stage='skeptic-backfill'; o.build_sha='b56e345'; o.ts=new Date().toISOString();
  fs.appendFileSync(SHARD, JSON.stringify(o)+'\n'); console.log('REC:',o.attack||o.check,'|',o.result,'|',(o.observed||o.evidence||'').slice(0,150)); }
async function a11yDump(page){
  return page.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>({
    role:e.getAttribute('role'), t:(e.textContent||'').trim(), tap:e.getAttribute('flt-tappable')!==null,
    r:(()=>{const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)];})(),
    disabled:e.getAttribute('aria-disabled')||null
  })).filter(n=>n.t||n.tap));
}
async function toastProbe(page, baseline){
  const buf = await page.screenshot().catch(()=>null); if(!buf) return null;
  const A = baseline ? decodePng(baseline) : null; const B = decodePng(buf);
  if(!B.rows) return null;
  let run=0, firstY=null;
  for(let y=Math.floor(B.height*0.45); y<B.height-6; y++){
    let dark=0,samples=0,sumDelta=0;
    for(let x=Math.floor(B.width*0.10); x<B.width*0.90; x+=3){
      const o=x*3;
      const lb=(B.rows[y][o]*299+B.rows[y][o+1]*587+B.rows[y][o+2]*114)/1000;
      samples++; if(lb<95) dark++;
      if(A && A.rows && A.height>y){ const la=(A.rows[y][o]*299+A.rows[y][o+1]*587+A.rows[y][o+2]*114)/1000; sumDelta+=Math.abs(lb-la); }
    }
    const isDark = dark > samples*0.55;
    const changed = !A || !A.rows ? true : (sumDelta/samples) > 22;
    if(isDark && changed){ run++; if(firstY===null) firstY=y; } else { if(run>=8) return `band y=${firstY}..${firstY+run}`; run=0; firstY=null; }
  }
  return run>=8 ? `band y=${firstY}..${firstY+run}` : null;
}
async function tapButton(page, re){
  const loc = page.locator('flt-semantics[role="button"]').filter({hasText:re}).first();
  try{ await loc.click({force:true,timeout:3500}); return true; }catch(e){ return false; }
}
// tap by coordinates from an a11y node (for disabled buttons force-click may no-op silently;
// coords are what a real finger does).
async function tapRect(page, r){ await page.mouse.click(r[0]+Math.max(4,r[2]/2), Math.max(16, Math.min(r[1]+r[3]/2, (await page.evaluate(()=>innerHeight))-20))); await page.waitForTimeout(500); return true; }
// deep link: load root of CURRENT origin then hash-nav
async function gotoProduct(page, id, title){
  const origin = new URL(page.url()).origin;
  await page.goto(origin+'/', {waitUntil:'load',timeout:90000}).catch(()=>{});
  await page.evaluate(h=>{ window.location.hash=h; }, '/product/'+id);
  const ok = await L.waitText(page,title,30000);
  await L.scrollToBottom(page); await page.waitForTimeout(600);
  return ok;
}
async function cartLs(page){
  return p2s(await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>/cart/i.test(k)).map(k=>[k,localStorage.getItem(k)]))));
}
function p2s(o){ return JSON.stringify(o); }
module.exports={ L, APP, FX, UNIT, SHARD, SHOT, rec, a11yDump, toastProbe, tapButton, tapRect, gotoProduct, cartLs, decodePng };
