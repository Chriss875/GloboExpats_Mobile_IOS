// probe: capture the neighbourhoods RESPONSE BODY from inside the page via fetch hook
const L=require('./lib_verify.js');
(async()=>{
  const b=await L.newBrowser();
  const ctx=await L.newCtx(b,{viewport:{width:768,height:1024}});
  const p=await ctx.newPage();
  await p.addInitScript(()=>{
    const of=window.fetch;
    window.__nb=null;
    window.fetch=function(...args){
      const u=String(args[0]&&args[0].url||args[0]||'');
      return of.apply(this,args).then(res=>{
        if(u.includes('neighbourhoods')){
          res.clone().text().then(t=>{ window.__nb={status:res.status, body:t.slice(0,300)}; });
        }
        return res;
      });
    };
  });
  await p.goto('http://localhost:9112/browse',{waitUntil:'load',timeout:90000}).catch(()=>{});
  await L.waitText(p,'Marketplace',40000); await p.waitForTimeout(5000);
  await L.clickBtn(p,'Filters'); await p.waitForTimeout(3500);
  const nb=await p.evaluate(()=>window.__nb);
  console.log('NB FETCH:',JSON.stringify(nb));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
