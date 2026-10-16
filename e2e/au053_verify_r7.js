// AU-053 verify-r7 — sell_edit_listing_screen (RW lane, frozen b56e345 @ :9121)
// Drives the REAL edit path end-to-end at 375x667 (+768x1024 states):
//   nav from Seller > My listings row -> /edit-listing/:id (dead-tile bug)
//   prefill from itemDetails (incl. SPECIFICATIONS parse-out)
//   WhatsApp readOnly lock; promo>asking inverse validation
//   price-only change => EXACTLY ONE PATCH w/ price field + intact fields
//   image preservation across save (no delete-all/re-upload UI exists — probe)
const { chromium } = require('playwright');
const fs = require('fs');
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9121';
const fx = JSON.parse(fs.readFileSync('/tmp/au053_fixtures.json', 'utf8'));
const OUT = { ts: new Date().toISOString(), unit: 'AU-053', vp: '375', steps: [], net: [], reqs: [], imgs: {}, clicks: [], asserts: [] };

function ok(name, cond, detail) {
  OUT.asserts.push({ name, pass: !!cond, detail: String(detail || '').slice(0, 400) });
  console.log((cond ? 'PASS ' : 'FAIL ') + name + ' :: ' + String(detail ?? '').slice(0, 220));
}
async function dump(p){ return p.evaluate(()=>{ const els=[...document.querySelectorAll('flt-semantics')];
  return els.map(e=>({tag:e.tagName,role:e.getAttribute('role'),tap:e.getAttribute('flt-tappable')!==null,
    txt:(e.textContent||'').trim().slice(0,120), lbl:e.getAttribute('aria-label'),
    r:(b=>({x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}))(e.getBoundingClientRect())}))
    .filter(e=>e.txt||e.lbl||e.tap); }); }
function step(s, d){ OUT.steps.push({ s, d: String(d||'').slice(0,300) }); console.log('#', s, d||''); }

(async () => {
  const browser = await L.newBrowser();
  const ctx = await browser.newContext({ viewport:{width:375,height:667}, recordVideo:{dir:'/home/devsystemadmin/GloboExpats_Mobile/e2e/videos', size:{width:375,height:667}} });
  const p = await ctx.newPage();

  // full network log
  p.on('request', r => { const u=r.url(); if(u.includes('8083')||u.includes('9121')) OUT.reqs.push({m:r.method(),u:u.slice(0,160),post:r.postData()?r.postData().slice(0,1500):null}); });
  p.on('response', r => { const u=r.url(); OUT.net.push({s:r.status(),u:u.slice(0,160)});
    if(/\/uploads\/[^?]*\.(png|jpe?g|webp)(\?|#|$)/i.test(u)||/\/assets\/.*\.(png|webp|jpg)$/i.test(u)) OUT.imgs[u]=r.status(); });

  // ---- login as the throwaway seller
  await p.goto(APP, {waitUntil:'load', timeout:90000});
  await L.waitText(p,'Buy now',30000);
  const logged = await L.login(p, {email:fx.seller.email, pw:fx.seller.pw});
  ok('login', logged, 'token persisted');
  await L.screenshot(p, 'e2e/shots/AU-053/AU-053-375-01-home.png');

  // ---- Account tab -> Seller dashboard -> My listings
  await L.clickBtn(p, 'Account'); await p.waitForTimeout(2400);
  await L.screenshot(p, 'e2e/shots/AU-053/AU-053-375-02-account.png');
  step('account opened');
  // seller dashboard tile
  let dashTapped = false;
  for (const lbl of ['Seller dashboard','Seller','Dashboard']) {
    if (await L.clickBtn(p, lbl)) { dashTapped=true; break; }
    if (await L.clickCard(p, lbl)) { dashTapped=true; break; }
  }
  await p.waitForTimeout(2400);
  step('seller dashboard tap', dashTapped);
  await L.screenshot(p, 'e2e/shots/AU-053/AU-053-375-03-dashboard.png');
  let listTapped=false;
  for (const lbl of ['My listings','Listings']) {
    if (await L.clickBtn(p,lbl)) { listTapped=true; break; }
    if (await L.clickCard(p,lbl)) { listTapped=true; break; }
  }
  await p.waitForTimeout(2600);
  step('my listings tap', listTapped);
  const snapList = await dump(p);
  fs.writeFileSync('/tmp/au053_snap_listings_375.json', JSON.stringify(snapList,null,1));
  await L.screenshot(p, 'e2e/shots/AU-053/AU-053-375-04-listings.png');
  const listTxt = snapList.map(n=>n.txt+' '+(n.lbl||'')).join('\n');
  ok('listings row visible', listTxt.includes('AU053 Ebony Statue Fixture'), 'fixture name in list');
  ok('listings price verbatim', listTxt.includes('45,000'), 'TSh 45,000 shown');

  // ---- click Edit on the row (dead-tile bug: id must be non-null)
  const patchReqs = [];
  p.on('request', r => { if(r.method()==='PATCH'&&r.url().includes('/products/update/')) patchReqs.push({url:r.url(), post:r.postData()}); });
  const beforeHash = await p.evaluate(()=>location.hash);
  let editClicked = false;
  for (const lbl of ['Edit']) {
    if (await L.clickBtn(p,lbl)) { editClicked=true; break; }
  }
  if(!editClicked){ // coordinate-click smallest tappable node containing 'Edit'
    const c = await p.evaluate(()=>{let best=null;document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim(); if(t!=='Edit') return; const r=e.getBoundingClientRect();
      if(r.width<10||r.height<10) return; if(!best||r.width*r.height<best.a) best={x:r.x+r.width/2,y:r.y+r.height/2,a:r.width*r.height};});return best;});
    if(c){ await p.mouse.click(c.x,c.y); editClicked=true; }
  }
  await p.waitForTimeout(2800);
  const hashAfter = await p.evaluate(()=>location.hash);
  step('edit tapped', `${editClicked} hash ${beforeHash} -> ${hashAfter}`);
  ok('nav to /edit-listing/:id', /edit-listing\/\d+/.test(hashAfter) && !/edit-listing\/null/.test(hashAfter) && !/edit-listing\/0\b/.test(hashAfter), hashAfter);
  await L.screenshot(p, 'e2e/shots/AU-053/AU-053-375-05-edit-loading.png');

  // ---- wait for prefill
  const gotTitle = await L.waitText(p, 'Item title', 25000);
  ok('edit form rendered', gotTitle, 'Item title label present');
  await p.waitForTimeout(1800);
  const snapEdit = await dump(p);
  fs.writeFileSync('/tmp/au053_snap_edit_375.json', JSON.stringify(snapEdit,null,1));
  const editTxt = snapEdit.map(n=>n.txt+' '+(n.lbl||'')).join('\n');
  await L.screenshot(p, 'e2e/shots/AU-053/AU-053-375-06-edit-prefilled.png');

  // input values (Flutter exposes real <input>s)
  async function inputVals(){
    return p.evaluate(()=>{const o={};document.querySelectorAll('input,textarea').forEach(i=>{
      const k=(i.getAttribute('aria-label')||i.placeholder||i.type||'el');o[k]=i.value;});return o;});
  }
  const v1 = await inputVals();
  fs.writeFileSync('/tmp/au053_inputs_before.json', JSON.stringify(v1,null,1));
  const allVals = Object.values(v1).join(' | ');
  ok('prefill title', allVals.includes(fx.detail.productName), Object.keys(v1).join(','));
  ok('prefill price 45000', /\b45000\b/.test(allVals.replace(/,/g,'')), allVals.slice(0,400));
  ok('prefill qty 3', /(^|\D)3(\D|$)/.test(allVals), '');
  ok('SPECIFICATIONS stripped from desc', !allVals.includes('SPECIFICATIONS'), 'separator absent from fields');
  ok('desc prose kept', allVals.includes('Makonde ebony statue'), 'prose survives parse');

  // category dropdown shows loaded category name
  ok('category label present', editTxt.includes('Category'), '');
  ok('subcategory control', editTxt.includes('Subcategory'), '');

  // WhatsApp readOnly lock
  const waIdx = await p.evaluate(()=>{let i=-1;document.querySelectorAll('input,textarea').forEach((el,j)=>{if((el.value||'').includes('+255761002200'))i=j;});return i;});
  ok('whatsapp prefilled', waIdx>=0, 'wa idx '+waIdx);
  if (waIdx>=0){
    const ro = await p.evaluate((idx)=>{const el=document.querySelectorAll('input,textarea')[idx];return el?(el.readOnly||el.disabled):null;},waIdx);
    ok('whatsapp readOnly/disabled', ro===true, 'readOnly='+ro);
    const before = await p.evaluate((idx)=>document.querySelectorAll('input,textarea')[idx].value,waIdx);
    const el = p.locator('input,textarea').nth(waIdx); await el.click({force:true}).catch(()=>{});
    await p.keyboard.type('0712999000'); await p.waitForTimeout(600);
    const after = await p.evaluate((idx)=>document.querySelectorAll('input,textarea')[idx].value,waIdx);
    ok('whatsapp locked against typing', after===before, `"${before}" -> "${after}"`);
    await L.screenshot(p,'e2e/shots/AU-053/AU-053-375-07-whatsapp-lock.png');
  }

  // promo inverse validation: enter originalPrice BELOW asking
  const origIdx = await p.evaluate(()=>{const els=[...document.querySelectorAll('input,textarea')];
    return els.findIndex(e=>(e.getAttribute('id')||'')===''&&false)>=0?-1:-1;});
  // locate by adjacency: fill every numeric input except price/payout/qty/wa is risky; instead use label order from snapshot:
  // price idx = index of input whose value == '45000'; payout='39000'; original='' numeric; qty='3'
  function idxOf(pred){ return p.evaluate((predStr)=>{const f=eval(predStr);const els=[...document.querySelectorAll('input,textarea')];return els.findIndex(f);}, '('+pred.toString()+')'); }
  const priceI = await idxOf(e=>e.value==='45000');
  ok('found price input', priceI>=0, 'idx '+priceI);
  // original-price field: empty text input right AFTER payout in DOM order — find empty number-ish inputs
  const empties = await p.evaluate(()=>{const els=[...document.querySelectorAll('input,textarea')];
    return els.map((e,i)=>({i,type:e.type,val:e.value,ro:e.readOnly})).filter(x=>x.val==='');});
  fs.writeFileSync('/tmp/au053_empty_inputs.json', JSON.stringify(empties,null,1));
  const origCand = empties.find(x=>x.i!==priceI && x.type!=='textarea');
  step('empty inputs', JSON.stringify(empties));
  if (origCand){
    const el = p.locator('input,textarea').nth(origCand.i);
    await el.click({force:true}).catch(()=>{}); await p.waitForTimeout(300);
    await p.keyboard.type('1000'); await p.waitForTimeout(500);
    // trigger validation by tapping elsewhere then Save
    await L.clickBtn(p,'Save changes');
    await p.waitForTimeout(2200);
    const txt2 = (await dump(p)).map(n=>n.txt).join('\n');
    fs.writeFileSync('/tmp/au053_promo_error_snap.json', txt2);
    const gotErr = txt2.includes('Promotional price must be HIGHER than the final asking price.');
    ok('promo<=asking blocked', gotErr, 'inverse rule message');
    await L.screenshot(p,'e2e/shots/AU-053/AU-053-375-08-promo-error.png');
    // clear it
    await p.locator('input,textarea').nth(origCand.i).click({force:true}).catch(()=>{});
    await p.keyboard.press('Control+A'); await p.keyboard.press('Backspace'); await p.waitForTimeout(400);
    await p.keyboard.press('Tab'); await p.waitForTimeout(300);
  } else {
    ok('promo field located', false, 'no empty non-text input found');
  }

  // ---- PRICE-ONLY CHANGE => exactly ONE PATCH
  const updBefore = patchReqs.length;
  await p.evaluate((i)=>{const els=document.querySelectorAll('input,textarea');els[i].focus();},priceI);
  await p.locator('input,textarea').nth(priceI).click({force:true}).catch(()=>{});
  await p.keyboard.press('Control+A'); await p.waitForTimeout(200);
  await p.keyboard.insertText('48500'); await p.waitForTimeout(700);
  const vMid = await inputVals();
  ok('price edited to 48500', Object.values(vMid).some(v=>v==='48500'), JSON.stringify(vMid));
  await L.screenshot(p,'e2e/shots/AU-053/AU-053-375-09-price-edited.png');
  await L.clickBtn(p,'Save changes');
  await p.waitForTimeout(3500);
  const patches = patchReqs.slice(updBefore);
  ok('exactly ONE PATCH fired', patches.length===1, 'count='+patches.length);
  if (patches.length===1){
    const post = patches[0].post||'';
    const m = post.match(/\{[\s\S]*\}/); let body=null; try{body=JSON.parse(m&&m[0]||'{}')}catch(e){}
    fs.writeFileSync('/tmp/au053_patch_body.json', JSON.stringify(body,null,1));
    ok('PATCH carries new price', body && Number(body.askingPrice)===48500, 'askingPrice='+JSON.stringify(body&&body.askingPrice));
    ok('PATCH preserves other fields', !!body && body.productName===fx.detail.productName && Number(body.productQuantity)===3, 'name/qty intact');
    ok('PATCH keeps specs-stripped desc', !!body && typeof body.productDescription==='string' && !body.productDescription.includes('SPECIFICATIONS'), (body&&body.productDescription||'').slice(0,80));
    ok('PATCH has no image mutation field', !!body && !('images' in body) && !('imageIds' in body) && !('imagesToRemove' in body), Object.keys(body||{}).filter(k=>/imag/i.test(k)).join(',')||'none');
  }
  const respUpd = OUT.net.filter(n=>n.u.includes('/products/update/'));
  ok('update returned 2xx', respUpd.some(n=>n.s>=200&&n.s<300), JSON.stringify(respUpd));
  await p.waitForTimeout(1200);
  await L.screenshot(p,'e2e/shots/AU-053/AU-053-375-10-after-save.png');
  const sn = await L.hasSnackBar(p); ok('snackbar feedback', sn.found, JSON.stringify(sn));

  // ---- backend truth after save: price changed, images INTACT (no silent delete-all)
  const det2 = await L.api(null,'GET','/api/v1/displayItem/itemDetails/'+fx.listingId);
  ok('backend price updated', det2.json && Math.round(det2.json.productAskingPrice)===48500, 'price='+JSON.stringify(det2.json&&det2.json.productAskingPrice));
  const imgCount = (det2.json&&det2.json.productImages||[]).length;
  ok('images survived save (no wipe)', imgCount===fx.detail.images.length, `before=${fx.detail.images.length} after=${imgCount}`);
  ok('description round-trip', !!(det2.json&&String(det2.json.productDescription).includes('AU053 RW fixture')), (det2.json&&det2.json.productDescription||'').slice(0,80));
  OUT.afterSaveDetail = det2.json;

  // ---- error path: nonexistent listing id
  await p.evaluate(()=>{window.location.hash='#/edit-listing/999999';}); await p.waitForTimeout(3500);
  const errSnap = (await dump(p)).map(n=>n.txt).join('\n');
  ok('missing-id error state', errSnap.includes('Could not load this listing')||errSnap.includes("don't have permission")||errSnap.includes('not found'), errSnap.slice(-200));
  await L.screenshot(p,'e2e/shots/AU-053/AU-053-375-11-missing-id.png');

  // ---- controls enumeration + clicks on the editor (reopen fresh)
  await p.evaluate(()=>{window.location.hash='#/edit-listing/'+fx.listingId;}); await p.waitForTimeout(3200);
  await L.waitText(p,'Item title',20000); await p.waitForTimeout(1200);
  const ctrls = await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const role=e.getAttribute('role'); const t=(e.textContent||'').trim().slice(0,60);
      const r=e.getBoundingClientRect(); const vis=r.width>4&&r.height>4;
      if(!vis) return;
      if(role==='button') out.push({kind:'button',label:t});
      else if(e.getAttribute('flt-tappable')!==null) out.push({kind:'tappable',label:t});
    });
    document.querySelectorAll('input,textarea').forEach((i,j)=>out.push({kind:'input',label:'input['+j+'] '+(i.readOnly?'RO':'RW'),ro:i.readOnly}));
    return out; });
  OUT.controls = ctrls;
  fs.writeFileSync('/tmp/au053_ctrls_375.json', JSON.stringify(ctrls,null,1));
  step('controls enumerated', JSON.stringify(ctrls.length)+' controls');

  // click the AppBar back arrow (button without text)
  const backBtn = await p.evaluate(()=>{let b=null;document.querySelectorAll('flt-semantics').forEach(e=>{
    if(b)return; if(e.getAttribute('role')!=='button')return; const t=(e.textContent||'').trim();
    const r=e.getBoundingClientRect(); if(t===''&&r.width<90&&r.height<70&&r.y<90) b={x:r.x+r.width/2,y:r.y+r.height/2};});return b;});
  if(backBtn){ await p.mouse.click(backBtn.x,backBtn.y); await p.waitForTimeout(2200);
    const h=await p.evaluate(()=>location.hash);
    OUT.clicks.push({ctl:'appbar-back', effect:h}); step('appbar back clicked', h);
    ok('back leaves editor', !h.includes('edit-listing'), h);
  } else { OUT.clicks.push({ctl:'appbar-back', effect:'not found'}); }

  await browser.close();
  fs.writeFileSync('/home/devsystemadmin/GloboExpats_Mobile/e2e/results/shards/raw-AU-053-run.json', JSON.stringify(OUT,null,1));
  const pass=OUT.asserts.filter(a=>a.pass).length, tot=OUT.asserts.length;
  console.log(`\n==== AU-053 r7 mobile: ${pass}/${tot} asserts ====`);
})().catch(e=>{ console.error('FATAL', e.stack||e.message); process.exit(1); });
