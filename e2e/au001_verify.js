// AU-001 verify — auth/session persistence (Wave 0).
// Real browser against :9100 (flutter web build), sandbox :8083 backend.
// Steps: UI login -> signed-in render -> RELOAD persistence -> localStorage keys
// -> UI logout (+network POST /auth/logout + storage cleared) -> garbage-token 401 path
// -> reference parity capture at :3000.
const path = require('path');
const fs = require('fs');
const { APP, REF, BUYER, newBrowser, newCtx, allText, waitText, btn, clickBtn,
        listButtons, screenshot } =
  require('/home/devsystemadmin/GloboExpats_Mobile/e2e/lib_verify.js');

const UNIT = 'AU-001';
const SHOTS = '/home/devsystemadmin/GloboExpats_Mobile/e2e/shots/AU-001';
const VID_DIR = '/tmp/wf-videos-AU-001';
const R = { steps: [], images: {}, requests: [], failures: [] };
const t0 = Date.now();
function step(name, ok, detail) {
  R.steps.push({ name, ok: !!ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name} | ${detail || ''}`);
}

(async () => {
  const browser = await newBrowser();
  const ctx = await newCtx(browser, { viewport:{width:375,height:667}, videoPath: path.join(VID_DIR,'v.webm') });
  const page = await ctx.newPage();

  // network observers — every request logged; image assets tracked separately
  page.on('response', r => {
    const u = r.url(); const s = r.status();
    R.requests.push({ u, s });
    if (/\/uploads\/|\.png($|\?)|\.jpe?g($|\?)|\.webp($|\?)/i.test(u) && !/canvaskit|fonts/i.test(u)) R.images[u] = s;
    if (/\/api\/v1\/auth\//.test(u)) R.requests.push({ AUTH: r.request().method() + ' ' + u + ' -> ' + s });
  });
  page.on('requestfailed', rq => { const u=rq.url(); if(/uploads|assets.*\.(png|webp|jpg)/i.test(u)) R.images[u]='FAILED'; });

  // ---------- 1. load app ----------
  await page.goto(APP, { waitUntil:'load', timeout:90000 }).catch(e=>step('goto',false,e.message));
  await waitText(page, 'Buy now', 40000);
  step('app_loaded', await waitText(page,'Buy now',5000), 'home hero visible at :9100');
  await screenshot(page, `${SHOTS}/${UNIT}-375-01-home.png`);

  // guest state: Account tab should show Login screen
  await clickBtn(page, 'Account'); await page.waitForTimeout(1200);
  const guestLogin = await waitText(page, 'Welcome back', 6000);
  step('guest_account_shows_login', guestLogin, 'Account tab pre-login renders Login screen');
  await screenshot(page, `${SHOTS}/${UNIT}-375-02-guest-login.png`);

  // ---------- 2. UI login as BUYER ----------
  const ei = page.locator('input[type="text"]').first();
  const pi = page.locator('input[type="password"]').first();
  await ei.click({force:true}).catch(()=>{}); await page.waitForTimeout(300); await page.keyboard.type(BUYER.email);
  await pi.click({force:true}).catch(()=>{}); await page.waitForTimeout(300); await page.keyboard.type(BUYER.pw);
  await screenshot(page, `${SHOTS}/${UNIT}-375-03-login-filled.png`);
  await clickBtn(page, 'Log in');
  const loggedIn = await waitText(page, 'My account', 25000);
  step('ui_login', loggedIn, 'Log in -> My account view rendered');
  await page.waitForTimeout(1500);
  const acctTxt = await allText(page);
  const emailShown = acctTxt.includes(BUYER.email);
  step('signed_in_email_rendered', emailShown, `account tab shows ${BUYER.email}: ${emailShown}`);
  await screenshot(page, `${SHOTS}/${UNIT}-375-04-signed-in.png`);

  // ---------- 3. localStorage token key ----------
  const ls = await page.evaluate(() => {
    const o = {};
    for (let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); o[k]=(localStorage.getItem(k)||'').length; }
    return o;
  });
  R.localStorage_after_login = ls;
  const tokLen = ls['auth_token'] || 0;
  const emailLen = ls['auth_email'] || 0;
  step('ls_auth_token_present', tokLen>0, `localStorage auth_token length=${tokLen} (value NOT printed), auth_email length=${emailLen}, all_keys=${JSON.stringify(Object.keys(ls))}`);

  // ---------- 4. RELOAD -> still signed in (THE acceptance criterion) ----------
  await page.reload({ waitUntil:'load', timeout:60000 }).catch(()=>{});
  await waitText(page, 'Buy now', 40000);
  await page.waitForTimeout(1500);
  // go to Account tab after reload
  const accBtns = await listButtons(page);
  const hasAcctTab = accBtns.some(b=>b.label==='Account');
  if (hasAcctTab) { await clickBtn(page,'Account'); await page.waitForTimeout(1500); }
  const afterReload = await allText(page);
  const stillIn = afterReload.includes('My account') && afterReload.includes(BUYER.email);
  step('reload_persistence', stillIn, `after page.reload(): My account=${afterReload.includes('My account')}, email rendered=${afterReload.includes(BUYER.email)} (THE acceptance criterion)`);
  await screenshot(page, `${SHOTS}/${UNIT}-375-05-after-reload-signed-in.png`);

  // reload #2 via deep link to gated route /orders (authed screen survives reload)
  await page.goto(APP + '/orders', { waitUntil:'load', timeout:60000 }).catch(()=>{});
  await waitText(page, 'My account', 30000).catch(()=>{});
  await page.waitForTimeout(2000);
  const ordersTxt = await allText(page);
  const ordersAuthed = ordersTxt.includes(BUYER.email) || ordersTxt.includes('My account') || !ordersTxt.includes('Welcome back');
  step('deeplink_authed_orders_keeps_session', ordersAuthed && !ordersTxt.includes('Welcome back'),
    `deep link /orders while authed shows authed content (no login redirect): ${!ordersTxt.includes('Welcome back')}`);
  await screenshot(page, `${SHOTS}/${UNIT}-375-06-deeplink-orders-authed.png`);

  // ---------- 5. enumerate + click interactive controls on the signed-in Account tab ----------
  await clickBtn(page, 'Account'); await page.waitForTimeout(1000);
  let ctrls = await listButtons(page);
  // dedupe by label+kind
  const seen = new Set(); ctrls = ctrls.filter(c=>{ const k=c.kind+'|'+c.label; if(seen.has(k)||!c.label.trim())return false; seen.add(k); return true; });
  R.account_controls = ctrls;
  step('controls_enumerated', true, `Account tab interactive controls: ${ctrls.length} -> ${ctrls.map(c=>`[${c.kind}] ${c.label}`).join(' ; ')}`);
  await screenshot(page, `${SHOTS}/${UNIT}-375-07-account-controls.png`);

  // click each control that is safe (skip Log out until last; skip already-covered nav)
  for (const c of ctrls) {
    if (c.label === 'Log out' ) continue;
    if (c.kind === 'input') continue;
    try {
      const before = await allText(page);
      await clickBtn(page, c.label.slice(0,40));
      await page.waitForTimeout(1600);
      const after = await allText(page);
      const changed = before !== after;
      step(`click:${c.label}`, changed, changed ? 'view/state changed' : 'no visible change');
      await screenshot(page, `${SHOTS}/${UNIT}-375-click-${c.label.replace(/[^a-z0-9]+/gi,'_').slice(0,30)}.png`).catch(()=>{});
      // come back to account tab
      if (!after.includes('My account')) { await clickBtn(page,'Account'); await page.waitForTimeout(1200); }
    } catch(e){ step(`click:${c.label}`, false, e.message); }
  }

  // ---------- 6. UI logout with network watch ----------
  const logoutReqSeen = new Promise(res => {
    page.on('request', rq => { if (rq.method()==='POST' && /\/api\/v1\/auth\/logout/.test(rq.url())) res({ url:rq.url(), method:'POST' }); });
    setTimeout(()=>res(null), 30000);
  });
  await clickBtn(page, 'Log out');
  await page.waitForTimeout(2500);
  const postLogoutTxt = await allText(page);
  const loggedOutUi = postLogoutTxt.includes('Welcome back');
  step('logout_ui_logged_out', loggedOutUi, 'Log out -> Login screen ("Welcome back") renders again');
  await screenshot(page, `${SHOTS}/${UNIT}-375-08-after-logout.png`);

  const lsAfterLogout = await page.evaluate(() => {
    const o={}; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); o[k]=(localStorage.getItem(k)||'').length;} return o; });
  R.localStorage_after_logout = lsAfterLogout;
  step('logout_storage_cleared', !( 'auth_token' in lsAfterLogout ) && !('auth_email' in lsAfterLogout),
    `auth_token present=${('auth_token' in lsAfterLogout)}, auth_email present=${('auth_email' in lsAfterLogout)}, remaining keys=${JSON.stringify(Object.keys(lsAfterLogout))}`);

  const lr = await logoutReqSeen;
  R.logout_request = lr;
  step('logout_backend_post_seen', !!lr, lr ? `network saw ${lr.method} ${lr.url}` : 'NO POST /api/v1/auth/logout appeared on the network log');

  // ---------- 7. 401 path: garbage token in storage, then authed deep link ----------
  await page.evaluate(() => { localStorage.setItem('auth_token','garbage'); localStorage.setItem('auth_email','mobile.test.20260820@gmail.com'); });
  await page.goto(APP + '/checkout', { waitUntil:'load', timeout:60000 }).catch(()=>{});
  await waitText(page, 'Buy now', 40000).catch(()=>{});
  await page.waitForTimeout(2000);
  const g1 = await allText(page);
  const redirectedToLogin = g1.includes('Welcome back');
  const actedAuthed = !redirectedToLogin;
  await screenshot(page, `${SHOTS}/${UNIT}-375-09-garbage-token-checkout.png`);
  step('garbage_token_gated_redirect', redirectedToLogin,
    `with auth_token='garbage', deep link /checkout redirects to Login (gated route guard): ${redirectedToLogin}; page did NOT act authenticated`);

  // reload home with garbage token — app must not show signed-in UI
  await page.goto(APP, { waitUntil:'load', timeout:60000 }).catch(()=>{});
  await waitText(page, 'Buy now', 40000).catch(()=>{});
  await clickBtn(page, 'Account'); await page.waitForTimeout(1500);
  const g2 = await allText(page);
  step('garbage_token_not_signed_in', g2.includes('Welcome back') && !g2.includes('My account'),
    `garbage-token reload -> Account tab shows Login (not My account): welcomeback=${g2.includes('Welcome back')} myaccount=${g2.includes('My account')}`);
  await screenshot(page, `${SHOTS}/${UNIT}-375-10-garbage-token-account.png`);
  const lsGarbage = await page.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=(localStorage.getItem(k)||'').length;}return o;});
  R.localStorage_garbage_case = lsGarbage;

  // ---------- 8. desktop viewport shots of the key states ----------
  const ctx2 = await browser.newContext({ viewport:{width:768,height:1024} });
  const p2 = await ctx2.newPage();
  await p2.goto(APP, { waitUntil:'load', timeout:90000 }).catch(()=>{});
  await waitText(p2,'Buy now',40000);
  await clickBtn(p2,'Account'); await p2.waitForTimeout(1200);
  const ei2=p2.locator('input[type="text"]').first(); const pi2=p2.locator('input[type="password"]').first();
  await ei2.click({force:true}); await p2.waitForTimeout(250); await p2.keyboard.type(BUYER.email);
  await pi2.click({force:true}); await p2.waitForTimeout(250); await p2.keyboard.type(BUYER.pw);
  await clickBtn(p2,'Log in'); await waitText(p2,'My account',25000);
  await p2.waitForTimeout(1200);
  await screenshot(p2, `${SHOTS}/${UNIT}-768-signed-in.png`);
  await p2.reload({waitUntil:'load',timeout:60000}).catch(()=>{});
  await waitText(p2,'Buy now',40000); await p2.waitForTimeout(1200);
  await clickBtn(p2,'Account'); await p2.waitForTimeout(1500);
  const dTxt = await allText(p2);
  step('reload_persistence_768', dTxt.includes('My account') && dTxt.includes(BUYER.email),
    `768x1024 reload persistence: My account=${dTxt.includes('My account')} email=${dTxt.includes(BUYER.email)}`);
  await screenshot(p2, `${SHOTS}/${UNIT}-768-after-reload.png`);
  await ctx2.close();

  // ---------- 9. reference parity captures (:3000) ----------
  const ctx3 = await browser.newContext({ viewport:{width:375,height:667} });
  const p3 = await ctx3.newPage();
  await p3.goto(REF + '/login', { waitUntil:'load', timeout:90000 }).catch(e=>console.log('ref login goto:',e.message));
  await p3.waitForTimeout(3500);
  await screenshot(p3, `${SHOTS}/ref-375-login.png`);
  // fill ref login form generically
  const fE = p3.locator('input[type="email"],input[name="email"],input[placeholder*="mail" i]').first();
  const fP = p3.locator('input[type="password"]').first();
  if (await fE.count()) {
    await fE.fill(BUYER.email).catch(()=>{});
    await fP.first().fill(BUYER.pw).catch(()=>{});
    await screenshot(p3, `${SHOTS}/ref-375-login-filled.png`);
    const submit = p3.locator('button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login")').first();
    if (await submit.count()) { await submit.click().catch(()=>{}); await p3.waitForTimeout(4500); }
    await screenshot(p3, `${SHOTS}/ref-375-after-login.png`);
    const refSignedIn = (await p3.content()).includes(BUYER.email) || (await p3.locator('body').innerText().catch(()=>'')).includes(BUYER.email);
    const refLs = await p3.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=(localStorage.getItem(k)||'').length;}return o;}).catch(()=>({}));
    R.ref_ls_after_login = Object.keys(refLs);
    step('ref_login_works', refSignedIn, `reference :3000 login -> email in DOM=${refSignedIn}; localStorage keys=${JSON.stringify(R.ref_ls_after_login)}`);
    await p3.reload({waitUntil:'load'}).catch(()=>{});
    await p3.waitForTimeout(3500);
    const bodyTxt = await p3.locator('body').innerText().catch(()=> '');
    step('ref_reload_persistence', bodyTxt.includes(BUYER.email), `reference reload keeps session: email in DOM=${bodyTxt.includes(BUYER.email)}`);
    await screenshot(p3, `${SHOTS}/ref-375-after-reload.png`);
  } else {
    step('ref_login_form_found', false, 'could not locate reference login inputs');
  }
  await ctx3.close();

  // ---------- summary ----------
  const imgVals = Object.entries(R.images);
  R.imgSummary = { total: imgVals.length, ok: imgVals.filter(([k,v])=>v===200||v===304).length,
                   broken: imgVals.filter(([k,v])=>v!==200&&v!==304).map(([k,v])=>`${k} -> ${v}`) };
  console.log('\nIMG_SUMMARY ' + JSON.stringify(R.imgSummary));
  console.log('AUTH_REQUESTS ' + JSON.stringify(R.requests.filter(r=>r.AUTH)));
  console.log('RESULT_JSON ' + JSON.stringify({steps:R.steps, img:R.imgSummary, ls_login:Object.keys(ls), ls_logout:R.localStorage_after_logout, logout_req:R.logout_request}));
  fs.writeFileSync('/tmp/au001_result.json', JSON.stringify(R, null, 1));
  await ctx.close();
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
