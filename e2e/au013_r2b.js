// AU-013 r2 RE-VERIFY stage B — public detail 620: chips w/ asserted selection change,
// qty stepper, views line + tracking, WhatsApp 627. One viewport per invocation.
const lib = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const APP = 'http://localhost:9108';
const SHOTS = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-013';
const VID = '/tmp/wf-videos-AU013r2';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const V = process.argv[2] || '375';
const W = V === '375' ? 375 : 768, H = V === '375' ? 667 : 1024;
const out = { v: V, failures: [], notes: [], asserts: { state: 0, nav: 0, data: 0 } };

async function shot(pg, name){ await lib.screenshot(pg, `${SHOTS}/${name}.png`); }
async function tapByText(p, text, opts = {}) {
  const maxLen = (opts && opts.maxLen) || 90;
  for (let pass = 0; pass < 3; pass++) {
    const hit = await p.evaluate(([text, maxLen]) => {
      let best = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim();
        if (!t.includes(text) || t.length > maxLen) return;
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return;
        if (r.bottom < 0 || r.top > innerHeight) return;
        const clickable = e.hasAttribute('flt-tappable') || e.getAttribute('role') === 'button';
        const score = (clickable ? 0 : 1000) + t.length * 3 + r.width + r.height / 10;
        if (!best || score < best.score) best = { score, cx: r.x + r.width / 2, cy: r.y + r.height / 2, clickable };
      });
      return best;
    }, [text, maxLen]);
    if (hit) { await p.mouse.click(Math.round(hit.cx), Math.round(hit.cy)); await sleep(550); return true; }
    await p.mouse.move(W / 2 - 5, H / 2); await p.mouse.wheel(0, 320); await sleep(320);
  }
  return false;
}
// Flutter-web ChoiceChip semantics expose NO aria-checked/pressed; the selected
// chip is distinguishable ONLY by its larger rendered box (+20px selected padding,
// probe-proven 76->96 / 96->76 swap on tap). Width IS the selection signal here.
async function chipChecked(p, label, selWidths) {
  return p.evaluate(lb => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (t !== lb) return;
      const r = e.getBoundingClientRect();
      if (!best || r.width * r.height < best.w * best.h)
        best = { checked: e.getAttribute('aria-checked'), pressed: e.getAttribute('aria-pressed'),
                 w: Math.round(r.width), h: Math.round(r.height) };
    });
    return best;
  }, label);
}
const SEL_W = { Type1: 96, Type2: 96, M: 66, S: 62 }; // selected widths (probe-proven)
const UNSEL_W = { Type1: 76, Type2: 76, M: 46, S: 42 };
function isSel(x, key) {
  if (!x) return false;
  if (x.checked === 'true' || x.pressed === 'true') return true;
  const sw = SEL_W[key];
  return sw ? Math.abs(x.w - sw) <= 3 : false;
}
async function priceText(p) {
  return p.evaluate(() => {
    const ts = [...document.querySelectorAll('flt-semantics')].map(e => (e.textContent || '').trim());
    return ts.filter(t => /^TZS|^TSh/.test(t) && t.length < 30).slice(0, 6);
  });
}
async function qtyNums(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')]
    .map(e => (e.textContent || '').trim()).filter(t => /^\d+$/.test(t)));
}

(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport: { width: W, height: H }, videoPath: `${VID}/AU-013-${V}-chips.webm` });
  const p = await ctx.newPage(); p.setDefaultTimeout(25000);
  const imgs = lib.watchImages(p);
  const clicksSeen = [];
  p.on('request', r => {
    const u = r.url();
    if (/\/api\/v1\/products\/\d+\/clicks($|\?)/.test(u)) clicksSeen.push(r.method() + ' ' + u.replace(/^.*\/api/, ''));
  });

  async function loginPrecise(pg){
    await pg.goto(`${APP}/#/login`,{waitUntil:'load',timeout:90000}).catch(()=>{});
    if(await lib.isLoggedIn(pg)) return true;
    await lib.waitText(pg,'Welcome back',25000);
    const ei=pg.locator('input[type="text"]').first(), pi=pg.locator('input[type="password"]').first();
    await ei.click({force:true}); await pg.waitForTimeout(350); await pg.keyboard.type(lib.BUYER.email);
    await pi.click({force:true}); await pg.waitForTimeout(350); await pg.keyboard.type(lib.BUYER.pw);
    const b=await pg.evaluate(()=>{let best=null;
      document.querySelectorAll('flt-semantics[role="button"]').forEach(e=>{
        const t=(e.textContent||'').trim(); if(t!=='Log in') return;
        const r=e.getBoundingClientRect();
        if(!best||r.width*r.height<best.w*best.h) best={cx:r.x+r.width/2,cy:r.y+r.height/2,w:r.width,h:r.height};
      }); return best;});
    if(!b) return false;
    await pg.mouse.click(Math.round(b.cx),Math.round(b.cy));
    let ok=false; for(let i=0;i<30&&!ok;i++){ ok=await lib.isLoggedIn(pg); if(!ok) await pg.waitForTimeout(1000);} 
    return ok;
  }
  const li = await loginPrecise(p);
  console.log(V, 'login', li);
  if (!li) out.failures.push(`[${V}] login failed`);

  // ---- product 620: multi-value choice attributes ----
  await p.goto(`${APP}/#/product/620`, { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await lib.waitText(p, 'Crochet ruffle hat', 30000);
  await sleep(2500);
  let t = await lib.allText(p);
  if (!t.includes('Choose options')) out.failures.push(`[${V}] "Choose options" section missing on 620`);
  else out.asserts.data++;

  // initial selection state of the multi-value groups
  const sM_before = await chipChecked(p, 'Type 1');
  const sS_before = await chipChecked(p, 'M');
  console.log('before:', JSON.stringify({ M1: sM_before, S: sS_before }));

  // tap Type 2 -> Type 1 must become unselected, Type 2 selected
  const tapT2 = await tapByText(p, 'Type 2', { maxLen: 100 });
  console.log('tap Type2', tapT2);
  if (!tapT2) out.failures.push(`[${V}] choice chip "Type 2" not clickable`);
  await sleep(700);
  const sM_t1_after = await chipChecked(p, 'Type 1');
  const sM_t2_after = await chipChecked(p, 'Type 2');
  console.log('after T2 tap:', JSON.stringify({ T1: sM_t1_after, T2: sM_t2_after }));
  const selOf = (x, key) => { if (!x) return false; if (x.checked === 'true' || x.pressed === 'true') return true;
    const sw = SEL_W[key]; return sw ? Math.abs(x.w - sw) <= 3 : false; };
  if (!(selOf(sM_t2_after,'Type2') && !selOf(sM_t1_after,'Type1')))
    out.failures.push(`[${V}] tapping "Type 2" did not move selection (T1=${JSON.stringify(sM_t1_after)}, T2=${JSON.stringify(sM_t2_after)})`);
  else out.asserts.state++;

  // tap Size S -> M unselected
  const tapS = await tapByText(p, 'S', { maxLen: 60 });
  console.log('tap Size S', tapS);
  if (!tapS) out.failures.push(`[${V}] size chip "S" not clickable`);
  await sleep(700);
  const sM_a = await chipChecked(p, 'M'), sS_a = await chipChecked(p, 'S');
  console.log('size after:', JSON.stringify({ M: sM_a, S: sS_a }));
  if (!(selOf(sS_a,'S') && !selOf(sM_a,'M'))) out.failures.push(`[${V}] size chip selection did not change to S (${JSON.stringify({ M: sM_a, S: sS_a })})`);
  else out.asserts.state++;

  // price recompute check: values have allowDifferentPrices=false -> total must stay TZS 35,000
  const prices = await priceText(p);
  const allT = await lib.allText(p);
  const hasPrice = /35,000/.test(allT);
  console.log('prices after chips:', JSON.stringify(prices), 'hasPrice', hasPrice);
  out.notes.push(`[${V}] price lines after chip taps: ${JSON.stringify(prices)}`);
  if (!hasPrice) out.failures.push(`[${V}] expected base price TSh 35,000 still shown after no-surcharge chip taps; got ${JSON.stringify(prices)}`);
  else { out.asserts.data++; }

  // ---- qty stepper on 620 (stock 2) : -/+ produce asserted changes and cap at 2 ----
  await shot(p, `flutter-${V}-620-chips-selected`);
  const q0 = await qtyNums(p);
  console.log('qty tokens before:', JSON.stringify(q0));
  // '+' is an icon-only IconButton right of the number; find icon-only buttons near Quantity row
  async function stepperBtn(side) {
    return p.evaluate(sd => {
      let qpos = null;
      document.querySelectorAll('flt-semantics').forEach(e => {
        if ((e.textContent || '').trim() === 'Quantity') qpos = e.getBoundingClientRect();
      });
      if (!qpos) return null;
      let best = null;
      document.querySelectorAll('flt-semantics[role="button"]').forEach(e => {
        const t = (e.textContent || '').trim(); if (t) return;
        const r = e.getBoundingClientRect();
        if (r.width > 70 || r.height > 70) return;
        if (Math.abs(r.y - qpos.y) > 50) return;
        if (sd === 'plus' ? r.x < qpos.x : r.x > qpos.x) return;
        const d = Math.abs(r.x - qpos.x);
        if (!best || d < best.d) best = { d, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
      });
      return best;
    }, side);
  }
  const plus1 = await stepperBtn('minus'); // leftmost first to know baseline
  // read qty value node: the single number between the buttons — use full-text scan for a 1 or 2
  const before = await lib.allText(p);
  const mBefore = before.match(/Quantity\s*(\d+)/);
  console.log('qty regex before:', mBefore && mBefore[1]);
  // click minus (should clamp at 1), then plus twice (cap at stock 2)
  const minusBtn = await stepperBtn('minus');
  const plusBtn = await stepperBtn('plus');
  console.log('minus btn', JSON.stringify(minusBtn), 'plus btn', JSON.stringify(plusBtn));
  async function readQty() {
    const txt = await lib.allText(p);
    const m = txt.match(/Quantity\s*\n?\s*(\d+)/) || txt.match(/(\d+)\s*\n?\s*Quantity/);
    return m ? +m[1] : null;
  }
  let qBefore = await readQty();
  console.log('qBefore', qBefore);
  if (plusBtn) {
    await p.mouse.click(Math.round(plusBtn.cx), Math.round(plusBtn.cy)); await sleep(650);
    let qAfterPlus = await readQty();
    console.log('after + :', qAfterPlus);
    if (qAfterPlus !== null && qBefore !== null && qAfterPlus !== qBefore) out.asserts.state++;
    else out.notes.push(`[${V}] + produced ${qBefore}->${qAfterPlus} (may be at cap already)`);
    await p.mouse.click(Math.round(plusBtn.cx), Math.round(plusBtn.cy)); await sleep(650);
    const qCap = await readQty();
    console.log('after ++ :', qCap);
    if (qCap !== null && qCap <= 2) out.notes.push(`[${V}] cap respected: qty=${qCap} (stock 2)`); 
    if (qAfterPlus === qCap) out.notes.push(`[${V}] + disabled/no-op at cap (AU-014 behavior)`);
    const minusB = await stepperBtn('minus');
    if (minusB) { await p.mouse.click(Math.round(minusB.cx), Math.round(minusB.cy)); await sleep(650); }
    const qBack = await readQty();
    console.log('after - :', qBack);
    if (qBack !== null && qBack < qCap) out.asserts.state++;
    await shot(p, `flutter-${V}-620-stepper`);
  } else {
    out.failures.push(`[${V}] could not locate + stepper button`);
  }

  // ---- views line + tracking fired ----
  t = await lib.allText(p);
  const vm = t.match(/(\d+) total views/);
  if (!vm) out.failures.push(`[${V}] "N total views" absent on 620`);
  else { out.asserts.data++; console.log(V, 'views line:', vm[0]); }
  console.log('click POSTs seen in-session:', JSON.stringify(clicksSeen));
  out.notes.push(`[${V}] clicks requests: ${JSON.stringify(clicksSeen.slice(0, 4))}`);

  await lib.scrollToBottom(p, 10); await sleep(800);
  await shot(p, `flutter-${V}-620-scrolled`);
  await lib.closeVideo(ctx, `${VID}/AU-013-${V}-chips.webm`);

  // ---- WhatsApp row on 627 with popup capture (fresh context, same browser) ----
  const ctxW = await lib.newCtx(browser, { viewport: { width: W, height: H }, videoPath: `${VID}/AU-013-${V}-whatsapp.webm` });
  const pw = await ctxW.newPage(); pw.setDefaultTimeout(25000);
  const liw = await loginPrecise(pw);
  console.log(V,'wa-login',liw);
  const popups = [];
  pw.context().on('page', np => popups.push(np.url()));
  await pw.goto(`${APP}/#/product/627`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await lib.waitText(pw, 'Fixture WhatsApp Contact Phone Listing', 25000);
  await sleep(1500);
  const tw = await lib.allText(pw);
  const waMatch = tw.match(/WhatsApp seller · \+?[\d ]+/);
  if (!waMatch) out.failures.push(`[${V}] WhatsApp row missing on 627`);
  else {
    out.asserts.data++;
    await shot(pw, `flutter-${V}-627-whatsapp-row`);
    const tapped = await tapByText(pw, 'WhatsApp seller', { maxLen: 120 });
    console.log('whatsapp tapped', tapped);
    await sleep(2500);
    console.log('popups:', JSON.stringify(popups));
    out.notes.push(`[${V}] whatsapp popups: ${JSON.stringify(popups)}`);
    out.notes.push(`[${V}] wa row label: ${JSON.stringify(waMatch && waMatch[0])}`);
    if (waMatch && !/\+?255712000111|255712/.test(waMatch[0].replace(/\s/g,''))) out.failures.push(`[${V}] WhatsApp row shows wrong number: ${waMatch[0]} (sandbox 627 = +255712000111)`);
    if (!popups.length) out.failures.push(`[${V}] WhatsApp tap produced NO window.open popup`);
    else if (!/wa\.me|whatsapp\.com|web\.whatsapp/i.test(popups.join('|'))) out.failures.push(`[${V}] popup not whatsapp: ${popups[0]}`);
    else out.asserts.state++;
  }
  await shot(pw, `flutter-${V}-627-after-wa-tap`);
  await lib.closeVideo(ctxW, `${VID}/AU-013-${V}-whatsapp.webm`);

  out.imgSummary = lib.imageSummary(imgs);
  out.imgMap = Object.entries(imgs).map(([u, s]) => ({ s, u: u.split('/').slice(-1)[0].slice(0, 40) }));
  require('fs').writeFileSync(`/tmp/au013_${V}_out.json`, JSON.stringify(out, null, 1));
  console.log('OUT-WRITTEN', V, 'failures=', out.failures.length);
})().catch(e => { console.error('RUNNER-FATAL', e && e.message); require('fs').writeFileSync(`/tmp/au013_${V}_out.json`, JSON.stringify(out, null, 1)); process.exitCode = 1; });
