// STAGE 6: precise diagnostics — post-login Account view content, Log out presence,
// exact residual storage bytes after logout.
const {L,APP,sleep,lsDump,dumpTxt,head,fillLogin} = require('./au001_sk2_lib.js');
const {btn,clickBtn,listButtons}=L;
(async()=>{
  const browser=await L.newBrowser();
  const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto(APP+'/',{waitUntil:'load',timeout:90000}); await L.waitText(p,'Buy now',45000);
  await p.evaluate(()=>{localStorage.clear();}); await sleep(150);
  await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',45000); await sleep(1500);

  await clickBtn(p,'Account'); await sleep(1700);
  console.log('GUEST account view:', head(await dumpTxt(p),100));
  await fillLogin(p,L.BUYER.email,L.BUYER.pw);
  await btn(p,'Log in').click({force:true}).catch(()=>{});
  let ok=false,w=0; while(!ok&&w<25){ ok=await L.isLoggedIn(p); if(!ok){await sleep(1000);w++;} }
  await sleep(2000);
  console.log('\nauthed:',ok);
  console.log('URL:',p.url(),'hash:',await p.evaluate(()=>location.hash));
  const t=await dumpTxt(p);
  console.log('POST-LOGIN view (no tab click):', head(t,160));
  // now tap Account explicitly
  await clickBtn(p,'Account'); await sleep(2200);
  const t2=await dumpTxt(p);
  console.log('\nPOST-LOGIN after Account tap:', head(t2,220));
  console.log('contains My account:',t2.includes('My account'),'| contains Log out:',t2.includes('Log out'));
  const ctrls=await listButtons(p);
  console.log('CONTROLS:',JSON.stringify(ctrls.filter(c=>c.kind==='button').map(c=>c.label)).slice(0,600));
  // scroll down within account view
  await p.mouse.move(190,400); for(let i=0;i<8;i++){ await p.mouse.wheel(0,240); await sleep(140); }
  await sleep(800);
  const t3=await dumpTxt(p);
  console.log('\nAFTER SCROLL:', head(t3,260));
  console.log('now contains Log out:',t3.includes('Log out'));

  // click Log out ONLY if present
  const loBtn=btn(p,'Log out');
  const visible=await loBtn.isVisible().catch(()=>false);
  console.log('Log out visible:',visible);
  if(visible){
    await loBtn.click({force:true}).catch(e=>console.log('click err',e.message));
    await sleep(3000);
    const raw=await p.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);let v=String(localStorage.getItem(k));if(/auth/i.test(k))v='<'+v.length+'ch>';o[k]=v;}return o;});
    console.log('\nSTORAGE AFTER LOGOUT:',JSON.stringify(raw));
    const tv=await dumpTxt(p);
    console.log('VIEW AFTER LOGOUT:',head(tv,120),'| welcomeBack=',tv.includes('Welcome back'));
  }
  await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e&&e.stack||e);process.exit(2);});
