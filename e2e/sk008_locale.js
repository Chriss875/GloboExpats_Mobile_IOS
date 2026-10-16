// Locale/number-format probe vs reference: TZS separators + date format on product 170
const L=require('./lib_verify.js');
(async()=>{
 const b=await L.newBrowser();
 const ctx=await b.newContext({viewport:{width:375,height:667}});
 const p=await ctx.newPage();
 // mobile app
 await p.goto('http://localhost:9131/#/product/170',{waitUntil:'load'});
 await p.waitForTimeout(9000);
 const mt=(await L.allText(p)).replace(/\s+/g,' ');
 const mPrice=(mt.match(/TSh ?[\d,]+(\.\d{2})?/)||['none'])[0];
 console.log('MOBILE price:', mPrice, '| date-ish:', (mt.match(/\d{1,2} \w+ \d{4}/)||['none'])[0]);
 await L.screenshot(p,'e2e/shots/AU-008/AU-008-sk2-375-locale-product170.png');
 // reference web
 await p.goto('http://localhost:3000/product/170',{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
 await p.waitForTimeout(9000);
 const rt=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' '));
 const rPrice=(rt.match(/TSh ?[\d,]+(\.\d{2})?|TZS ?[\d,]+/)||['none'])[0];
 console.log('REF price:', rPrice, '| ref excerpt:', JSON.stringify(rt.slice(0,180)));
 await p.screenshot({path:'e2e/shots/AU-008/AU-008-sk2-375-locale-ref170.png'}).catch(()=>{});
 await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
