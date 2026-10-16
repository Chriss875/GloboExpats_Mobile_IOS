const {chromium}=require('/home/devsystemadmin/GloboExpats_Mobile/e2e/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({env:{...process.env,LD_LIBRARY_PATH:(process.env.HOME||'/home/devsystemadmin')+'/chromium-libs/usr/lib/x86_64-linux-gnu'},args:['--disable-gpu','--use-gl=swiftshader']});
 const ctx=await b.newContext({viewport:{width:375,height:667}});
 const p=await ctx.newPage();
 p.on('console',m=>{ if(!/GL Driver|service worker/.test(m.text())) console.log('[console.'+m.type()+']', m.text().slice(0,200)); });
 await p.goto('http://localhost:9131/',{waitUntil:'load',timeout:60000});
 for (let i=1;i<=24;i++){
   await p.waitForTimeout(1000);
   const s=await p.evaluate(()=>({sem:document.querySelectorAll('flt-semantics').length, canv:document.querySelectorAll('canvas').length, view:document.querySelectorAll('flutter-view').length}));
   if(i%4===0) console.log(i+'s', JSON.stringify(s));
   if(s.sem>50){ console.log('semantics up at '+i+'s'); break; }
 }
 // try enabling semantics via flutter configuration API
 const r = await p.evaluate(async ()=>{
   try{
     if (window._flutter && window._flutter.engineInitializingApp) return 'engineInitializingApp';
   }catch(e){}
   try{
     if (window._flutter && window._flutter.loader) return 'loader:'+(typeof window._flutter.loader.didCreateEngineInitializer);
   }catch(e){}
   return Object.keys(window).filter(k=>k.startsWith('_flutter')).join(',');
 });
 console.log('flutter globals:', r);
 await b.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1)});
