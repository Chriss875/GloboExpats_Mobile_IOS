// Attack 4 ROLE / PERMISSION PROBES + session expiry mid-flow (375x667).
const { L, APP, FX, SHOT, rec, a11yDump, toastProbe, tapButton, gotoProduct, cartLs } = require('./au018_sk_lib.js');
const PW='StrongPass!1';
(async () => {
  // ---- A. UNVERIFIED seller account: own-item gate must fire the same way; buy on control?
  //         Web canUserBuy = Boolean(user) -> even PENDING users can BUY. Mobile has no
  //         verification check at all -> parity. Prove a PENDING user CAN buy (control item).
  const STAMP = Date.now();
  const email = `au018pending${STAMP}@gmail.com`;
  await L.api(null,'POST','/api/v1/auth/register',{firstName:'AU018',lastName:'Pending',password:PW,emailAddress:email});
  const lr = await fetch(`${L.API}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:PW})});
  const lj = await lr.json();
  const ptok = lj.token;
  const me = await L.api(ptok,'GET','/api/v1/userManagement/user-details');
  const status = me.json.status || me.json.accountStatus || (me.json.roles||[]).map(r=>r.roleName).join('/');
  rec({ attack:'role_unverified_buyer', target:`fresh PENDING user ${email} (status=${status}) buys control item`,
        result:'RECORDED', observed:'see next line for UI gate result', evidence:[] });

  const b = await L.newBrowser();
  const p = await (await b.newContext({ viewport:{width:375,height:667} })).newPage();
  await L.login(p, {email, pw:PW});
  await gotoProduct(p, FX.controlId, 'Other Seller Control Rug');
  let base = await p.screenshot();
  const addOk = await tapButton(p,'Add to cart'); await p.waitForTimeout(900);
  const tb = await toastProbe(p, base);
  const t1 = await L.allText(p);
  // then Buy now -> checkout reachable? (canUserBuy parity)
  base = await p.screenshot();
  const buyTapped = await tapButton(p,'Buy now'); await p.waitForTimeout(2800);
  const t2 = await L.allText(p);
  const reachedCheckout = /Order Summary|Delivery address|Place order/i.test(t2);
  await p.screenshot({path:`${SHOT}/AU-018-375x667-sk-a4-pending-user.png`});
  rec({ attack:'role_unverified_buyer', target:'PENDING user AddToCart+BuyNow on control',
        result:(tb && reachedCheckout)?'HELD':'DISPUTED',
        observed:`add toast=${tb||'none'}; buy tapped=${buyTapped}; checkout reached=${reachedCheckout} (web canUserBuy=Boolean(user): pending users may buy — parity)`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a4-pending-user.png`] });
  await b.close();

  // ---- B. SESSION EXPIRY MID-FLOW: valid login, open detail, THEN invalidate token in storage
  //         and click Buy now. Gate should show Login Required (token empty) or API 401 handling.
  const b2 = await L.newBrowser();
  const p2 = await (await b2.newContext({ viewport:{width:375,height:667} })).newPage();
  await L.login(p2, L.BUYER);
  await gotoProduct(p2, FX.controlId, 'Other Seller Control Rug');
  // simulate expiry: blank the token (AU-016 fix says blank counts as signed-out)
  await p2.evaluate(()=>{ localStorage.setItem('flutter.auth_token',''); });
  await p2.evaluate(()=>{ window.location.hash='/'; }); await p2.waitForTimeout(1200);
  await p2.evaluate(h=>{ window.location.hash=h; }, '/product/'+FX.controlId);
  await p2.waitForTimeout(4000);
  const d = await a11yDump(p2);
  base = await p2.screenshot();
  await tapButton(p2,'Buy now'); await p2.waitForTimeout(1800);
  const tb2 = await toastProbe(p2, base);
  const t3 = await L.allText(p2);
  const blocked = !/Order Summary|Place order|Delivery address/.test(t3) || /Login Required|sign in/i.test(t3);
  await p2.screenshot({path:`${SHOT}/AU-018-375x667-sk-a4-expired.png`});
  rec({ attack:'session_expiry_midflow', target:'blank token mid-session -> Buy now',
        result: blocked?'HELD':'BROKEN',
        observed:`buy toast=${tb2||'none'}; checkout blocked=${blocked}; text="${t3.replace(/\n/g,' | ').slice(0,160)}"`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a4-expired.png`] });
  // restore token & confirm recovery
  await b2.close();

  // ---- C. GARBAGE TOKEN mid-flow (401 path)
  const b3 = await L.newBrowser();
  const p3 = await (await b3.newContext({ viewport:{width:375,height:667} })).newPage();
  await L.login(p3, L.BUYER);
  await p3.evaluate(()=>{ localStorage.setItem('flutter.auth_token','garbage.token.value'); });
  await p3.goto(APP+'/',{waitUntil:'load'});
  await p3.evaluate(h=>{ window.location.hash=h; }, '/product/'+FX.controlId);
  await p3.waitForTimeout(5000);
  const t4 = await L.allText(p3);
  const detailLoaded = t4.includes('Other Seller Control Rug');
  const base3 = await p3.screenshot();
  await tapButton(p3,'Buy now'); await p3.waitForTimeout(2500);
  const t5 = await L.allText(p3);
  const coGarbage = /Order Summary|Delivery address|Place order/i.test(t5);
  const authToast = await toastProbe(p3, base3);
  await p3.screenshot({path:`${SHOT}/AU-018-375x667-sk-a4-garbage-token.png`});
  rec({ attack:'session_garbage_token', target:'corrupt JWT then Buy now',
        result:'RECORDED',
        observed:`detail loaded with garbage token=${detailLoaded}; checkout opened=${coGarbage}; toast=${authToast||'none'}; url=${p3.url().replace(APP,'')} (note: gates are client-side; server rejects later calls)`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a4-garbage-token.png`] });
  await b3.close();

  // ---- D. buyer probing an ADMIN route deep-link (#/admin) while signed in as plain buyer-role user
  const b4 = await L.newBrowser();
  const p4 = await (await b4.newContext({ viewport:{width:375,height:667} })).newPage();
  await L.login(p4, {email, pw:PW}); // PENDING user, no ADMIN role
  await p4.evaluate(h=>{ window.location.hash=h; }, '/admin');
  await p4.waitForTimeout(3500);
  const t6 = await L.allText(p4);
  const adminLeak = /Admin dashboard|Verification queue|Payments review|Sales overview/i.test(t6);
  await p4.screenshot({path:`${SHOT}/AU-018-375x667-sk-a4-nonadmin-admin-route.png`});
  rec({ attack:'permission_probe_admin_route', target:'non-admin deep link #/admin',
        result:(!adminLeak)?'HELD':'DISPUTED',
        observed:`admin chrome leaked=${adminLeak}; text="${t6.replace(/\n/g,' | ').slice(0,160)}"`,
        evidence:[`shots/AU-018/AU-018-375x667-sk-a4-nonadmin-admin-route.png`] });
  await b4.close();
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
