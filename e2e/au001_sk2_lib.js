// shared state/helpers for AU-001 skeptic r2b (staged runner)
const fs=require('fs'), path=require('path');
const L=require('./lib_verify.js');
const APP='http://localhost:9121';
const SHOTS='/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-001';
const SHARD='/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/AU-001-skeptic.jsonl';
const R={unit:'AU-001',wave:'skeptic',stage:'skeptic-backfill',build_sha:'b56e345',
  bundle_mtime:'2026-08-25T20:08:09Z', attacks:[], regression:{}, notes:[], started:new Date().toISOString()};
function rec(attack,cls,result,detail,evidence){
  const line={ts:new Date().toISOString(),attack,class:cls,result,detail,evidence:evidence||[]};
  R.attacks.push(line);
  fs.appendFileSync(SHARD, JSON.stringify({wave:'skeptic',stage:'skeptic-backfill',build_sha:'b56e345',...line})+'\n');
  console.log(`${result} | ${attack} | ${detail}`);
}
function reg(name,val){ R.regression[name]=val; fs.appendFileSync(SHARD,
  JSON.stringify({wave:'skeptic',stage:'skeptic-backfill',build_sha:'b56e345',kind:'regression_probe',name,value:val,ts:new Date().toISOString()})+'\n');
  console.log('REGRESSION |',name,'|',JSON.stringify(val).slice(0,300)); }
async function shot(p,name){ const f=`${SHOTS}/sk2-${name}.png`; await L.screenshot(p,f); return `e2e/shots/AU-001/${path.basename(f)}`; }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function lsDump(p){ return p.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=(localStorage.getItem(k)||'').length;}return o;}); }
async function dumpTxt(p){ return p.evaluate(()=>{const out=[];document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim(),l=(e.getAttribute('aria-label')||'').trim();if(t)out.push(t);if(l)out.push(l);});return out.join('\n');}); }
function head(t,n){ return String(t).slice(0,n||90).replace(/\n/g,' | '); }
// hard-deadline wrapper so one wedged step cannot stall the whole suite
async function bounded(label, ms, fn){
  let timer; const guard=new Promise((_,rej)=>{ timer=setTimeout(()=>rej(new Error('STEP_TIMEOUT '+label+' after '+ms+'ms')), ms); });
  const t0=Date.now();
  try{ const out=await Promise.race([fn(),guard]); console.log(`[t] ${label} ${Date.now()-t0}ms`); return out; }
  catch(e){ console.log(`[!] ${label}: ${e.message}`); return {__timeout:true,msg:e.message}; }
  finally{ clearTimeout(timer); }
}
// UI login helpers
async function fillLogin(p,email,pw){
  const a=p.locator('input[type="text"]').first(), b=p.locator('input[type="password"]').first();
  await a.click({force:true}).catch(()=>{}); await sleep(260); await p.keyboard.type(email,{delay:4});
  await b.click({force:true}).catch(()=>{}); await sleep(260); await p.keyboard.type(pw,{delay:4});
}
async function openLoginTab(p){
  await L.clickBtn(p,'Account'); await sleep(1500);
  if(!(await dumpTxt(p)).includes('Welcome back')) return false;
  return true;
}
module.exports={fs,path,L,APP,SHOTS,SHARD,R,rec,reg,shot,sleep,lsDump,dumpTxt,head,bounded,fillLogin,openLoginTab};
