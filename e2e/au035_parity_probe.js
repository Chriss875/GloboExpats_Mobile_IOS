// parity probe: login the reference app via its UI form (page has Email +
// Password inputs) and then load /orders/<o12>.
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await b.newContext({viewport:{width:375,height:667}});
  const p=await ctx.newPage();
  p.on('response', r=>{ if(/auth\/login|\/orders\/2499/.test(r.url())) console.log('RESP',r.status(),r.url().slice(0,110)); });
  await p.goto('http://localhost:3000/login',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await p.waitForTimeout(4000);
  console.log('URL now:', p.url());
  const txt=await p.evaluate(()=>document.body.innerText.slice(0,300));
  console.log('BODY:', txt.replace(/\n+/g,' | '));
  const inputs=await p.locator('input').all();
  console.log('inputs:', inputs.length);
  for(const i of inputs){ console.log('  input type=', await i.getAttribute('type'), 'placeholder=', await i.getAttribute('placeholder')); }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
