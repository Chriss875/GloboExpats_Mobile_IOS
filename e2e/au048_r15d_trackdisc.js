// DUPLICATE WIDGET-0 NODE: the read shows widget 0 TWICE (top 581 AND 3997).
// One of them is a phantom (a11y node reuse). Disambiguate by matching each card
// node to its PRICE text: widget 0 has price 5,000. Read pairs (widget,price) and
// drop nodes whose price mismatches GT. Then recompute trending order.
const fs = require('fs');
const { chromium } = require('playwright');
const GT = JSON.parse(fs.readFileSync('/tmp/au048_widgets.json','utf8'));
(async () => {
  const b = await chromium.launch({ env:{...process.env, LD_LIBRARY_PATH:process.env.HOME+'/chromium-libs/usr/lib/x86_64-linux-gnu'},
    args:['--force-color-profile=srgb','--disable-gpu','--use-gl=swiftshader'] });
  const ctx = await b.newContext({ viewport:{width:375,height:667} });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9131/#/,', { waitUntil:'load', timeout:90000 }).catch(()=>{});
  await p.goto('http://localhost:9131/#/search?q=AU048R71787692116574', { waitUntil:'load', timeout:90000 }).catch(()=>{});
  await p.waitForTimeout(12000);
  for (let i=0;i<10;i++){ await p.mouse.move(187,400); await p.mouse.wheel(0,1600); await p.waitForTimeout(450); }
  await p.mouse.move(187,400);
  for (let i=0;i<16;i++){ await p.mouse.wheel(0,-3000); await p.waitForTimeout(110); }
  await p.waitForTimeout(600);
  await p.locator('flt-semantics[role="button"]', {hasText:'Sort'}).first().click({force:true}).catch(()=>{});
  await p.waitForTimeout(900);
  const cands = await p.evaluate(() => {
    const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim(); if(!t.includes('Trending'))return;
      let child=false; e.querySelectorAll('flt-semantics').forEach(c=>{if((c.textContent||'').includes('Trending'))child=true;});
      if(child)return;
      const r=e.getBoundingClientRect();
      if(r.width<8||r.height<8||r.bottom<0||r.top>innerHeight)return;
      out.push({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});
    });
    return out.slice(0,3);
  });
  for (const c of cands){ await p.mouse.click(c.x, Math.min(c.y,650)); break; }
  await p.waitForTimeout(1800);
  // read (widget, price, top) triples — innermost node containing BOTH name & price
  const rows = await p.evaluate(() => {
    const out=[];
    document.querySelectorAll('flt-semantics').forEach(e=>{
      const t=(e.textContent||'').trim();
      const m=t.match(/Probe Widget (\d+)/); if(!m) return;
      const pm=t.match(/TSh ([\d,]+)/); if(!pm) return;   // must contain price too
      let child=false;
      e.querySelectorAll('flt-semantics').forEach(c=>{ if((c.textContent||'').includes('Probe Widget') && /TSh /.test(c.textContent||'')) child=true; });
      if(child) return;
      out.push({ w:Number(m[1]), price:Number(pm[1].replace(/,/g,'')), top:e.getBoundingClientRect().top });
    });
    return out;
  });
  // validate against ground truth prices; drop mismatches
  const gtPrice={}; for(const k of Object.keys(GT)) gtPrice[Number(k)]=GT[k].price;
  const valid = rows.filter(r=>gtPrice[r.w]===r.price);
  const dropped = rows.filter(r=>gtPrice[r.w]!==r.price);
  console.log('valid',valid.length,'dropped',dropped.length, JSON.stringify(dropped));
  valid.sort((a,b)=>a.top-b.top);
  const seen=new Set(); const order=[];
  for(const r of valid){ if(!seen.has(r.w)){ seen.add(r.w); order.push(r); } }
  console.log('TRENDING ORDER:', JSON.stringify(order.map(o=>o.w)));
  const ccSeq = order.map(o=>GT[String(o.w)].cc);
  console.log('cc seq:', JSON.stringify(ccSeq));
  let mono=true; for(let i=1;i<ccSeq.length;i++) if(ccSeq[i]>ccSeq[i-1]) mono=false;
  console.log('clickcount-desc monotonic:', mono);
  await b.close();
})();
