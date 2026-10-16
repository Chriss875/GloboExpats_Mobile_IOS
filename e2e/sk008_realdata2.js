// Assert API entities verbatim in the :9131 app a11y tree (post-CORS-fix).
const L=require('./lib_verify.js');
(async()=>{
 const b=await L.newBrowser();
 const ctx=await b.newContext({viewport:{width:375,height:667}});
 const p=await ctx.newPage();
 await p.goto('http://localhost:9131/',{waitUntil:'load'});
 await L.waitText(p,'expat marketplace',30000);
 await p.waitForTimeout(9000);
 const t=await L.allText(p).then(s=>s.replace(/\s+/g,' '));
 const ents=JSON.parse(require('fs').readFileSync('/tmp/sk008_api_entities.json','utf8'));
 const out={};
 for(const it of ents.items){ out['product:'+it.id]= t.includes(String((it.productName||it.name))); }
 for(const c of ents.cats){ out['cat:'+c]= t.includes(c); }
 // price verbatim
 out.priceSample=(t.match(/TSh ?[\d,]+/)||['none'])[0];
 console.log(JSON.stringify(out,null,1));
 require('fs').writeFileSync('/tmp/sk008_realdata_verdict.json', JSON.stringify(out,null,1));
 await L.screenshot(p,'e2e/shots/AU-008/AU-008-sk2-375-realdata-home.png');
 await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
