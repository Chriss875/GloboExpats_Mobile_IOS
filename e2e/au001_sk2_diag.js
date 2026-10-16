// DIAG: enumerate ALL flt-semantics nodes containing 'Log out'/'Logout' + their rects.
const {L,APP,sleep,fillLogin} = require('./au001_sk2_lib.js');
const {btn,clickBtn}=L;
(async()=>{
  const browser=await L.newBrowser();
  const ctx=await L.newCtx(browser,{viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  await p.goto(APP+'/',{waitUntil:'load',timeout:90000}); await L.waitText(p,'Buy now',45000);
  await p.evaluate(()=>{localStorage.clear();}); await sleep(150);
  await p.reload({waitUntil:'load',timeout:90000}).catch(()=>{}); await L.waitText(p,'Buy now',45000); await sleep(1500);
  await clickBtn(p,'Account'); await sleep(1700);
  await fillLogin(p,L.BUYER.email,L.BUYER.pw);
  await btn(p,'Log in').click({force:true}).catch(()=>{});
  let ok=false,w=0; while(!ok&&w<25){ ok=await L.isLoggedIn(p); if(!ok){await sleep(1000);w++;} }
  await sleep(2000);
  console.log('authed:',ok);
  const dump=(lbl)=>p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      if(/log\s?out/i.test(t)){
        const r=e.getBoundingClientRect();
        out.push({txt:t.slice(0,40),role:e.getAttribute('role'),tap:e.getAttribute('flt-tappable')!==null,
          x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)});
      }
    });
    return out;
  }).then(v=>console.log(lbl,JSON.stringify(v)));
  await dump('VIEWPORT-AS-IS:');
  // scroll the ListView to the very bottom
  for(let i=0;i<16;i++){ await p.mouse.wheel(0,500); await sleep(90); }
  await sleep(800);
  await dump('AFTER WHEEL-DOWN:');
  // also try keyboard End
  await p.keyboard.press('End'); await sleep(700);
  await dump('AFTER END KEY:');
  await browser.close(); process.exit(0);
})().catch(e=>{console.error('FATAL',e&&e.stack||e);process.exit(2);});
