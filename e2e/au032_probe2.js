// au032_probe2.js — diagnostic: why does the review step not show windows/terms?
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const fx = JSON.parse(fs.readFileSync('/tmp/au032_fixtures.json', 'utf8'));
const APP = 'http://localhost:9112';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function txt(p) { return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => ''); }
async function isLoggedIn(p) { try { return !!(await p.evaluate(() => localStorage.getItem('flutter.auth_token') || '')); } catch (e) { return false; } }

(async () => {
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 }, videoPath: 'e2e/videos/AU-032-probe.webm' });
  const p = await ctx.newPage();
  p.on('console', m => console.log('CONSOLE:', m.text().slice(0, 200)));
  await p.goto(APP + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await L.waitText(p, 'Buy now', 45000);
  if (!await isLoggedIn(p)) {
    await L.clickBtn(p, 'Login'); await L.waitText(p, 'Welcome back', 25000);
    await p.locator('input[type="text"]').first().click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fx.buyer.email, { delay: 12 });
    await p.locator('input[type="password"]').first().click({ force: true }).catch(() => {}); await sleep(300); await p.keyboard.type(fx.buyer.pw, { delay: 12 });
    await L.clickBtn(p, 'Log in');
    for (let i = 0; i < 30 && !await isLoggedIn(p); i++) await sleep(1000);
  }
  await sleep(1200);
  // add to cart from detail
  await p.goto(`${APP}/product/${fx.productId}`, { waitUntil: 'load' }).catch(()=>{});
  await sleep(5000);
  // click the Add to cart button node precisely
  const hit = await p.evaluate(() => {
    let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(t!=='Add to cart') return;
      if(e.getAttribute('role')!=='button') return;
      const r=e.getBoundingClientRect();
      if(r.width<4||r.bottom<0||r.top>innerHeight) return;
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),t};
    });
    return best;
  });
  console.log('ADD NODE:', JSON.stringify(hit));
  if (hit) { await p.mouse.click(hit.x, hit.y); await sleep(1500); }
  console.log('AFTER ADD:', (await txt(p)).split('\n').filter(Boolean).slice(0,8).join('|'));

  // cart via deep link
  await p.goto(`${APP}/cart`, { waitUntil: 'load' }).catch(()=>{});
  await sleep(4000);
  let T = await txt(p);
  console.log('CART TEXT:', T.split('\n').filter(Boolean).slice(0,14).join('|'));
  // find "Go to checkout" button and click by coordinates
  const co = await p.evaluate(() => {
    let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(!t.includes('Go to checkout')) return;
      const r=e.getBoundingClientRect();
      if(r.width<4||r.bottom<0||r.top>innerHeight) return;
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),role:e.getAttribute('role'),tap:e.getAttribute('flt-tappable')!==null};
    });
    return best;
  });
  console.log('GO-TO-CHECKOUT NODE:', JSON.stringify(co));
  if (co) { await p.mouse.click(co.x, Math.min(co.y,660)); await sleep(3500); }
  T = await txt(p);
  console.log('URL NOW:', p.url());
  console.log('STEP1 TEXT:', T.split('\n').filter(Boolean).slice(0,20).join('|'));
  // find Continue to review
  const cont = await p.evaluate(() => {
    let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(!t.includes('Continue to review')) return;
      const r=e.getBoundingClientRect();
      if(r.width<4||r.bottom<0||r.top>innerHeight) return;
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
    });
    return best;
  });
  console.log('CONTINUE NODE:', JSON.stringify(cont));
  // click via Playwright locator on the exact-text button (real hit-target path)
  const loc = p.locator('flt-semantics[role="button"]', { hasText: 'Continue to review' }).first();
  let clickedHow = null;
  try { await loc.click({ timeout: 8000 }); clickedHow = 'locator-click'; }
  catch (e) {
    console.log('locator click failed:', String(e).slice(0,140));
    if (cont) { await p.mouse.click(Math.min(cont.x,371), Math.min(cont.y,660)); clickedHow = 'mouse-coords'; }
  }
  console.log('CLICKED VIA:', clickedHow);
  await sleep(6000);
  T = await txt(p);
  console.log('URL NOW 2:', p.url());
  console.log('REVIEW STEP TEXT (first 45 lines):');
  console.log(T.split('\n').filter(Boolean).slice(0,45).join('\n'));
  console.log('HAS Morning:', T.includes('Morning'), '| HAS I agree:', T.includes('I agree to the'), '| HAS Step 2 of 4:', T.includes('Step 2 of 4'), '| HAS Confirm &:', T.includes('Confirm & proceed to payment'));
  // scroll down to bottom hunting windows
  await p.mouse.move(190,350); for(let i=0;i<12;i++){ await p.mouse.wheel(0,260); await sleep(200);} 
  T = await txt(p);
  console.log('AFTER FULL SCROLL — has Today:', T.includes('Today'), 'has I agree:', T.includes('I agree to the'), 'has Select at least:', T.includes('Select at least'));
  console.log(T.split('\n').filter(Boolean).slice(0,50).join('\n'));
  await p.screenshot({ path: 'e2e/shots/AU-032/probe-review-step.png' }).catch(()=>{});
  // try clicking Confirm anyway and capture any ErrorBox copy
  const cf = await p.evaluate(() => {
    let best=null;
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(t!=='Confirm & proceed to payment') return;
      const r=e.getBoundingClientRect();
      if(r.width<4||r.bottom<0||r.top>innerHeight) return;
      if(!best||r.width*r.height<best.area) best={area:r.width*r.height,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
    });
    return best;
  });
  console.log('CONFIRM NODE:', JSON.stringify(cf));
  if (cf){ await p.mouse.click(Math.min(cf.x,371), Math.min(cf.y,660)); await sleep(2500);}
  T = await txt(p);
  console.log('AFTER CONFIRM — has PF number:', /PF-\d{4}-\d{5}/.test(T), '| has Step 3:', T.includes('Step 3 of 4'), '| err?', T.includes('Select at least') || T.includes('Please agree'));
  console.log(T.split('\n').filter(Boolean).slice(0,20).join('|'));
  await p.screenshot({ path: 'e2e/shots/AU-032/probe-after-confirm.png' }).catch(()=>{});
  await ctx.close(); await browser.close();
})().catch(e => { console.error('PROBE FAIL', e); process.exit(1); });
