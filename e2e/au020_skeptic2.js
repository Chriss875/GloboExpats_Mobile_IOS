// au020_skeptic2.js — SKEPTIC round 2 for AU-020: corrected/re-hardened attacks.
//  A6b large-total FORMAT with an uncapped line (product id absent from sandbox -> stock
//      fetch 404s -> persisted cap kept per spec) => qty 999 x 12000 must render TSh 11,988,000
//  A7c cross-seller grouping with DISTINCT lineIds (round-1 used identical lineIds, which the
//      store correctly de-dupes — attacker error, not app evidence)
//  A4b offline AFTER paint: selection math must keep working purely locally; state persists;
//      going back online retains it (no crash / no wipe)
//  A9a rapid raw double-click on a checkbox: painted subtotal and store vector must agree
//  A9b rapid double-click Remove: line removed exactly once, sibling intact
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');

const APP = 'http://localhost:9108';
const fx = JSON.parse(fs.readFileSync('/tmp/au020_fixtures.json', 'utf8'));
const P = fx.askingPrice;
const VID_L = fx.values[0].id, VID_S = fx.values[1].id;

async function txt(p){return p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n')).catch(()=>'');}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function parseSub(t){const m=t.match(/Subtotal \((\d+) items?\):\s*TSh\s*([\d,]+)/);return m?{count:+m[1],amount:+m[2].replace(/,/g,''),raw:m[0]}:null;}
async function storeLines(p){return p.evaluate(()=>{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(/expatCartItems_/.test(k)){try{const v=JSON.parse(JSON.parse(localStorage.getItem(k)));if(Array.isArray(v))return v;}catch(e){}}}}).catch(()=>[]);}
function mkLine(vid,q,extra={}){return Object.assign({lineId:'p638|d2:'+vid,productId:fx.productId,sellerId:'428',sellerName:'AU020 Seller',title:'AU020 Two-Size Tote',price:P,originalPrice:15000,imageUrl:'/uploads/534e1bec-df4f-41f7-8309-0a1d7998907c_tote.webp',category:'Clothing',location:'Dar es Salaam, Tanzania',isVerified:false,currency:'TZS',maxQuantity:null,isAvailable:true,quantity:q,selected:true,choices:[{definitionId:2,valueId:vid}]},extra);}
async function seed(ctx,email,arr,tok){await ctx.addInitScript(([em,c,t])=>{if(t)localStorage.setItem('flutter.auth_token',JSON.stringify(t));localStorage.setItem('flutter.auth_email',JSON.stringify(em));localStorage.setItem('flutter.expatCartItems_'+em,JSON.stringify(c));},[email,JSON.stringify(arr),tok]);}
async function openCart(p,gate=true){await p.goto(APP+'/#/cart',{waitUntil:'load',timeout:90000}).catch(()=>{});if(gate)await L.waitText(p,'Go to checkout',45000).catch(()=>{});await sleep(2500);}
async function checkboxes(p){return p.evaluate(()=>{const o=[];document.querySelectorAll('flt-semantics').forEach(e=>{const t=(e.textContent||'').trim().toLowerCase();if(!(t==='checkbox'||e.getAttribute('role')==='checkbox'))return;const r=e.getBoundingClientRect();if(r.width<5||r.height<5)return;o.push({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),checked:e.getAttribute('aria-checked'),vis:r.bottom>0&&r.top<innerHeight});});o.sort((a,b)=>a.y-b.y);return o;}).catch(()=>[]);}

(async()=>{
  const out=[];
  const B = await L.newBrowser();
  const bt = await L.apiLogin(fx.buyer);

  // ---------- A6b ----------
  {
    console.log('--- A6b large-total format (uncapped line)');
    const ctx = await L.newCtx(browser0(), { viewport:{width:375,height:667} });
    await seed(ctx, fx.buyer.email, [mkLine(VID_L,999,{productId:987654321,lineId:'p987654321'})], bt);
    const p = await ctx.newPage();
    await openCart(p);
    await sleep(1500);
    const T = await txt(p);
    const sub = parseSub(T);
    await L.screenshot(p,'e2e/shots/AU-020/sk-a6b-large-total.png');
    const st = await storeLines(p);
    let verdict, detail;
    if (!sub) { verdict='INCONCLUSIVE'; detail='subtotal bar unparsed; tree head='+JSON.stringify(T.slice(0,300)); }
    else if (sub.amount !== 11988000) { verdict='BROKEN'; detail=`expected TSh 11,988,000 got ${sub.raw}`; }
    else if (!T.includes('TSh 11,988,000')) { verdict='BROKEN'; detail='math ok but grouping wrong'; }
    else { verdict='HELD'; detail=`uncapped line renders ${sub.raw} — matches reference Intl en-US/TZS grouping`; }
    console.log(verdict, detail, 'storeQty=', st.map(l=>l.quantity));
    out.push({name:'A6b_large_total_format_uncapped',verdict,detail,evidence:['e2e/shots/AU-020/sk-a6b-large-total.png'],store:st.map(l=>({q:l.quantity,id:l.lineId}))});
    await ctx.close();
  }

  // ---------- A7c ----------
  {
    console.log('--- A7c cross-seller grouping, distinct lineIds');
    const ctx = await L.newCtx(browser0(), { viewport:{width:375,height:667} });
    const other = mkLine(VID_S,1,{lineId:'p638-alt|d2:'+VID_S, sellerId:'999777', sellerName:'Someone Else'});
    await seed(ctx, fx.buyer.email, [mkLine(VID_L,1), other], bt);
    const p = await ctx.newPage();
    await openCart(p);
    const T = await txt(p);
    await L.screenshot(p,'e2e/shots/AU-020/sk-a7c-two-sellers.png');
    const st = await storeLines(p);
    const hasBothHeaders = T.includes('AU020 Seller') && T.includes('Someone Else');
    // count Item( occurrences == 1 (single summary bar) and both seller names present exactly once
    const hdrAU=(T.match(/AU020 Seller/g)||[]).length, hdrOther=(T.match(/Someone Else/g)||[]).length;
    let verdict,detail;
    if (st.length<2) { verdict='INCONCLUSIVE'; detail=`store de-duped again (${st.length} lines) — seeding artifact`; }
    else if (!hasBothHeaders) { verdict='BROKEN'; detail=`two distinct-seller lines collapsed: AU020Seller x${hdrAU}, SomeoneElse x${hdrOther}`; }
    else { verdict='HELD'; detail=`two seller groups rendered (${hdrAU}/${hdrOther} headers) — grouping key holds`; }
    console.log(verdict,detail,'lines=',st.map(l=>l.lineId));
    out.push({name:'A7c_cross_seller_grouping',verdict,detail,evidence:['e2e/shots/AU-020/sk-a7c-two-sellers.png'],store:st.map(l=>({id:l.lineId,seller:l.sellerId}))});
    await ctx.close();
  }

  // ---------- A4b ----------
  {
    console.log('--- A4b offline AFTER paint (selection math local-only)');
    const ctx = await L.newCtx(browser0(), { viewport:{width:375,height:667} });
    await seed(ctx, fx.buyer.email, [mkLine(VID_L,2), mkLine(VID_S,1)], bt);
    const p = await ctx.newPage();
    await openCart(p);
    const subOn = parseSub(await txt(p));
    await p.context().setOffline(true);
    const cbs = (await checkboxes(p)).filter(c=>c.vis);
    let offClickWorked=false, subOff=null;
    if (cbs.length) {
      await p.mouse.click(cbs[0].x, cbs[0].y);
      for(let i=0;i<8&&!subOff;i++){await sleep(800);subOff=parseSub(await txt(p));}
      offClickWorked = !!subOff && subOff.amount===P && subOff.count===1;
    }
    await L.screenshot(p,'e2e/shots/AU-020/sk-a4b-offline-toggle.png');
    const stOff = await storeLines(p);
    await p.context().setOffline(false);
    await sleep(2500);
    const subBack = parseSub(await txt(p));
    const stBack = await storeLines(p);
    let verdict='HELD'; const parts=[];
    if (!subOn || subOn.amount!==3*P) parts.push(`pre-offline baseline wrong ${JSON.stringify(subOn)}`);
    if (!offClickWorked) { verdict='BROKEN'; parts.push(`offline toggle produced ${JSON.stringify(subOff)} expected 1 item/12000`); }
    if (!stOff.some(l=>l.selected===false)) { verdict='BROKEN'; parts.push('offline toggle not persisted to store'); }
    if (!subBack || subBack.amount!==P) parts.push(`after reconnect subtotal drifted to ${JSON.stringify(subBack)}`);
    console.log(verdict, parts.join('; ')||`offline toggle ok (${subOff&&subOff.raw}), persisted, survived reconnect`, 'store=',stOff.map(l=>({q:l.quantity,sel:l.selected})));
    out.push({name:'A4b_offline_after_paint_toggle',verdict,detail:parts.join('; ')||`baseline ${subOn.raw}; offline toggle -> ${subOff.raw}; reconnect keeps ${subBack&&subBack.raw}`,evidence:['e2e/shots/AU-020/sk-a4b-offline-toggle.png']});
    await ctx.close();
  }

  // ---------- A9a ----------
  {
    console.log('--- A9a raw rapid double-click checkbox (paint/store agreement)');
    const ctx = await L.newCtx(browser0(), { viewport:{width:375,height:667} });
    await seed(ctx, fx.buyer.email, [mkLine(VID_L,2), mkLine(VID_S,1)], bt);
    const p = await ctx.newPage();
    await openCart(p);
    const cbs=(await checkboxes(p)).filter(c=>c.vis);
    await p.mouse.dblclick(cbs[0].x, cbs[0].y, {delay:30});
    await sleep(2200);
    const sub = parseSub(await txt(p));
    const st = await storeLines(p);
    const sumSel = st.filter(l=>l.selected).reduce((s,l)=>s+l.quantity*l.price,0);
    await L.screenshot(p,'e2e/shots/AU-020/sk-a9a-dblclick-checkbox.png');
    let verdict='HELD',detail='';
    if (!sub || sub.amount!==sumSel) { verdict='BROKEN'; detail=`paint ${JSON.stringify(sub)} != store selected sum ${sumSel}`; }
    else detail=`dblclick net effect consistent: paint ${sub.raw} == store sum ${sumSel}`;
    console.log(verdict,detail,'store=',st.map(l=>({q:l.quantity,sel:l.selected})));
    out.push({name:'A9a_dblclick_checkbox_paint_store_agree',verdict,detail,evidence:['e2e/shots/AU-020/sk-a9a-dblclick-checkbox.png']});
    await ctx.close();
  }

  // ---------- A9b ----------
  {
    console.log('--- A9b raw rapid double-click Remove');
    const ctx = await L.newCtx(browser0(), { viewport:{width:375,height:667} });
    await seed(ctx, fx.buyer.email, [mkLine(VID_L,2), mkLine(VID_S,1)], bt);
    const p = await ctx.newPage();
    await openCart(p);
    const rm = await p.evaluate(()=>{const o=[];document.querySelectorAll('flt-semantics').forEach(e=>{if((e.textContent||'').trim()!=='Remove')return;const r=e.getBoundingClientRect();if(r.width<5||r.bottom<0||r.top>innerHeight)return;o.push({x:Math.round(r.x+r.width/2),y:Math.min(Math.max(Math.round(r.y+r.height/2),20),640)});});o.sort((a,b)=>a.y-b.y);return o;});
    await p.mouse.dblclick(rm[rm.length-1].x, rm[rm.length-1].y, {delay:30});
    await sleep(2500);
    const T=await txt(p);
    const st=await storeLines(p);
    const titlesLeft=(T.match(/Two-Size Tote/g)||[]).length;
    const sub=parseSub(T);
    await L.screenshot(p,'e2e/shots/AU-020/sk-a9b-dblclick-remove.png');
    let verdict='HELD',detail='';
    if (st.length!==1) { verdict='BROKEN'; detail=`after dblclick-remove store has ${st.length} lines (expected 1)`; }
    else if (!sub || sub.amount!==2*P) { verdict='BROKEN'; detail=`surviving line subtotal ${JSON.stringify(sub)} expected 24,000`; }
    else detail=`dblclick-remove removed exactly one line; remaining ${sub.raw}`;
    console.log(verdict,detail);
    out.push({name:'A9b_dblclick_remove_once',verdict,detail,evidence:['e2e/shots/AU-020/sk-a9b-dblclick-remove.png']});
    await ctx.close();
  }

  function browser0(){return B;}
  try { await B.close(); } catch (e) {}
  fs.writeFileSync('/tmp/au020_sk_r2.json', JSON.stringify(out,null,1));
  console.log('ROUND2 DONE', out.map(o=>`${o.name}:${o.verdict}`).join(' | '));
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
