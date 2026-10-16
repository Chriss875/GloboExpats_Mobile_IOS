// STAGE 2b: invalid-input matrix (fixed reset path: hard logout via storage+reload each case)
const {L,APP,rec,shot,sleep,lsDump,dumpTxt,head,fillLogin} = require('./au001_sk2_lib.js');
const {btn,clickBtn}=L;
(async()=>{
  const browser=await L.newBrowser();
  const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
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
  let first=true;
  for(const [name,em,pw] of cases){
    // clean guest state every iteration
    await p.goto(APP+'/',{waitUntil:'load',timeout:90000}).catch(()=>{});
    await L.waitText(p,'Buy now',40000).catch(()=>{});
    await p.evaluate(()=>{localStorage.clear();});
    await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{});
    await L.waitText(p,'Buy now',40000).catch(()=>{}); await sleep(1600);
    await clickBtn(p,'Account'); await sleep(1700);
    const tPre=await dumpTxt(p);
    if(!tPre.includes('Welcome back')){ console.log('[skip] '+name+' no form: '+head(tPre,60)); continue; }
    await fillLogin(p,em,pw);
    const evPre=await shot(p,'13-invalid-'+name+'-filled');
    await btn(p,'Log in').click({force:true}).catch(()=>{});
    await sleep(3400);
    const tt=await dumpTxt(p); const lst=await lsDump(p); const snk=await L.hasSnackBar(p);
    const ev=await shot(p,'13-invalid-'+name);
    const tokenStored=(lst['flutter.auth_token']||0)>10;
    const surfacedError=/invalid|incorrect|error|failed|not found|not valid|required|please|credential|enter a/i.test(tt)||snk.found;
    rec('invalid_'+name,'invalid_input',(tokenStored)?'BROKEN':(surfacedError?'HELD':'DISPUTED'),
      `login("${em.length>26?em.slice(0,26)+'…':em}", pwLen=${pw.length}) -> tokenStored=${tokenStored}, errorSurfaced=${surfacedError}, snackBar=${snk.found}${snk.found?'@y='+snk.atY:''}, page="${head(tt)}"`,[ev,evPre]);
    first=false;
  }
  console.log('\nSTAGE2B_DONE');
  await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e&&e.stack||e);process.exit(2);});
