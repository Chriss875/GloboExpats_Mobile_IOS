// STAGE 2: rapid login taps + invalid-input matrix (375x667)
const {L,APP,rec,reg,shot,sleep,lsDump,dumpTxt,head,fillLogin} = require('./au001_sk2_lib.js');
const {btn,clickBtn}=L;
(async()=>{
  const browser=await L.newBrowser();
  const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto(APP+'/',{waitUntil:'load',timeout:90000});
  await L.waitText(p,'Buy now',45000);

  // ensure logged out
  await p.evaluate(()=>{localStorage.clear();}); await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Buy now',45000); await sleep(1500);
  await clickBtn(p,'Account'); await sleep(1700);
  if(!(await dumpTxt(p)).includes('Welcome back')){ console.log('FATAL no login form'); process.exit(2); }

  // ATTACK 2: rapid triple-tap Log in (valid creds)
  await fillLogin(p,L.BUYER.email,L.BUYER.pw);
  for(let i=0;i<3;i++){ await btn(p,'Log in').click({force:true}).catch(()=>{}); await sleep(150); }
  let tk=false,z=0; while(!tk&&z<25){ tk=await L.isLoggedIn(p); if(!tk){await sleep(1000);z++;} }
  await sleep(1800);
  const tl=await dumpTxt(p); const lsL=await lsDump(p);
  let ev=await shot(p,'12-rapid-triple-tap-login');
  rec('rapid_triple_tap_login_valid_creds','rapid_double_tap',(tk && String(lsL['flutter.auth_token']||'').length>10)?'HELD':'DISPUTED',
    `3x Log in taps @~150ms w/ valid creds: tokenPersisted=${tk} (${z+1}s), myAccountUi=${tl.includes('My account')}, storageKeys=${JSON.stringify(Object.keys(lsL))}`,[ev]);

  // log back out to start the invalid matrix clean
  await clickBtn(p,'Account'); await sleep(1600);
  if((await dumpTxt(p)).includes('My account')){ await btn(p,'Log out').click({force:true}).catch(()=>{}); await sleep(2400); }

  // ATTACK 3: invalid input matrix on the login form
  const cases=[
    ['bad_email','not-an-email','StrongPass!1'],
    ['empty_pw','mobile.test.20260820@gmail.com',''],
    ['sql_quote',"' OR 1=1 --@",'x'],
    ['script_tag','<script>alert(1)</script>@x.y','pw'],
    ['emoji_email','\u{1F600}\u{1F389}@ex.com','pw'],
    ['swahili_utf8','mwananchi.karibu@habari.co.tz','nenosiriLa123'],
    ['huge_500char','a'.repeat(494)+'@x.com','p'.repeat(500)],
    ['wrong_pw_valid_format','mobile.test.20260820@gmail.com','DefinitelyWrong!99'],
  ];
  for(const [name,em,pw] of cases){
    await clickBtn(p,'Account'); await sleep(1300);
    let tPre=await dumpTxt(p);
    if(!tPre.includes('Welcome back')){ console.log('[skip] '+name+': no form ('+head(tPre,60)+')'); continue; }
    await fillLogin(p,em,pw);
    ev_pre = await shot(p,'13-invalid-'+name+'-filled');
    await btn(p,'Log in').click({force:true}).catch(()=>{});
    await sleep(3400);
    const tt=await dumpTxt(p); const lst=await lsDump(p); const snk=await L.hasSnackBar(p);
    ev=await shot(p,'13-invalid-'+name);
    const tokenStored=String(lst['flutter.auth_token']||'').length>10;
    const surfacedError=/invalid|incorrect|error|failed|not found|not valid|required|please|credential|enter a/i.test(tt)||snk.found;
    rec('invalid_'+name,'invalid_input',(tokenStored)?'BROKEN':(surfacedError?'HELD':'DISPUTED'),
      `login("${em.length>26?em.slice(0,26)+'…':em}", pwLen=${pw.length}) -> tokenStored=${tokenStored}, errorSurfaced=${surfacedError}, snackBar=${snk.found}${snk.found?'@y='+snk.atY:''}, page="${head(tt)}"`,[ev,ev_pre]);
    // reset fields
    const a=p.locator('input[type="text"]').first(), b=p.locator('input[type="password"]').first();
    for(const inp of [a,b]){ await inp.click({force:true}).catch(()=>{}); await sleep(200);
      await p.keyboard.down('Control'); await p.keyboard.press('KeyA'); await p.keyboard.up('Control');
      await p.keyboard.press('Delete'); await sleep(220); }
  }
  console.log('\nSTAGE2_DONE');
  await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e&&e.stack||e);process.exit(2);});
