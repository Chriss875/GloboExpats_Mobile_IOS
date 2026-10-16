// ref_gate_walk.js — walk the reference verification funnel step by step in ONE
// session, dumping the page after each click so no state reset goes unnoticed.
const L = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await L.newBrowser();
  const ctx = await L.newCtx(b, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(()=>{});
  await sleep(6000);
  let inputs = await p.$$('input');
  await inputs[0].fill(L.ADMIN.email); await inputs[1].fill(L.ADMIN.pw);
  await p.$('form').then(f => f.evaluate(f => f.requestSubmit ? f.requestSubmit() : f.submit()));
  for (let i = 0; i < 20; i++) { await sleep(1000); if (!p.url().includes('login')) break; }

  const clickText = async (re, maxLen) => {
    const pos = await p.evaluate(({ re2, ml }) => {
      for (const e of document.querySelectorAll('div,span,p,button')) {
        const t = (e.textContent || '').trim();
        if (new RegExp(re2).test(t) && t.length < ml) {
          const r = e.getBoundingClientRect();
          if (r.width > 40 && r.y > 60 && r.y < 660) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    }, { re2: re, ml: maxLen });
    if (pos) { await p.mouse.click(pos.x, pos.y); return true; }
    return false;
  };
  const dump = async (tag) => {
    const t = await p.evaluate(() => document.body.innerText);
    console.log(`[${tag}] len=${t.length} | ${t.slice(150, 420).replace(/\n/g, ' | ').slice(0, 220)}`);
    return t;
  };

  await p.goto('http://localhost:3000/account/verification', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(()=>{});
  await sleep(9000);

  // Step 1: Yes
  await clickText('^Yes$', 10); await sleep(5000); await dump('after-yes');
  // Step 2: No work email button
  await clickText('No, I do not have one', 45); await sleep(6000); await dump('after-alt');
  // Step 3: Vendor/Seller
  await clickText('Vendor \\/ Seller', 70); await sleep(7000); await dump('after-vendor');
  // Step 4: Friend/Referral
  await clickText('Friend / Referral', 80); await sleep(8000); await dump('after-friend');
  // Step 5: Personal items
  await clickText('Personal items', 90); await sleep(9000); const t5 = await dump('after-personal');

  // If the funnel RESET to the start, re-walk quickly and check inputs each time
  let gateInputs = [];
  for (let round = 0; round < 3 && gateInputs.length < 5; round++) {
    for (let i = 0; i < 10; i++) { gateInputs = await p.$$('input'); if (gateInputs.length >= 5) break; await sleep(1000); }
    if (gateInputs.length >= 5) break;
    console.log('--- round ' + round + ': form not present, re-walking ---');
    await clickText('^Yes$', 10); await sleep(5000);
    await clickText('No, I do not have one', 45); await sleep(6000);
    await clickText('Vendor \\/ Seller', 70); await sleep(7000);
    await clickText('Friend / Referral', 80); await sleep(8000);
    await clickText('Personal items', 90); await sleep(9000);
  }
  console.log('final inputs:', gateInputs.length);
  if (gateInputs.length >= 5) {
    await gateInputs[2].click().catch(()=>{}); await gateInputs[2].type('693749306', { delay: 8 }); await sleep(500);
    await gateInputs[3].click().catch(()=>{}); await gateInputs[3].type('Wizard Office', { delay: 8 }); await sleep(700);
    await gateInputs[4].click().catch(()=>{}); await gateInputs[4].type('Coco Beach', { delay: 8 });
    for (let i = 0; i < 12; i++) { await sleep(1000);
      const has = await p.evaluate(() => [...document.querySelectorAll('li')].some(e => /coco/i.test(e.innerText || '')));
      if (has) break; }
    const li = await p.evaluate(() => {
      const l = [...document.querySelectorAll('li')].find(e => /coco/i.test(e.innerText || ''));
      if (!l) return null; const r = l.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: Math.min(Math.max(r.y + r.height / 2, 10), 650) };
    });
    if (li) { await p.mouse.click(li.x, li.y); await sleep(3000); }
    await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Save details/i.test(x.innerText)); if (b) b.scrollIntoView({ block: 'center' }); });
    await sleep(1500);
    const sb = await p.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Save details/i.test(x.innerText));
      if (!b) return null; const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    console.log('save:', JSON.stringify(sb));
    if (sb && sb.y > 60 && sb.y < 660) { await p.mouse.click(sb.x, sb.y); await sleep(10000); }
    console.log('url:', p.url());
    await p.goto('http://localhost:3000/sell', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(()=>{});
    await sleep(12000);
    console.log('sell url:', p.url());
    const t2 = await p.evaluate(() => document.body.innerText);
    require('fs').writeFileSync('/tmp/ref_sell_final.txt', t2);
    console.log('Photos/Pricing/Review:', /photos/i.test(t2), /pricing/i.test(t2), /review/i.test(t2));
    console.log(t2.slice(0, 1100));
    await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-040/ref-375-sell-authed-top.png' }).catch(()=>{});
    await p.mouse.move(187, 350); await p.mouse.wheel(0, 900); await sleep(900);
    await p.screenshot({ path: '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-040/ref-375-sell-authed-scrolled.png' }).catch(()=>{});
  }
  await ctx.close().catch(()=>{});
  await b.close().catch(()=>{});
})().catch(e => console.log('ERR', String(e).slice(0, 200)));
