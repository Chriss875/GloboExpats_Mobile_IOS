// MOBILE per-sort order for Lamp (same term, sandbox data) — direct parity compare.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ env:{...process.env, LD_LIBRARY_PATH:process.env.HOME+'/chromium-libs/usr/lib/x86_64-linux-gnu'},
    args:['--force-color-profile=srgb','--disable-gpu','--use-gl=swiftshader'] });
  const ctx = await b.newContext({ viewport:{width:375,height:667} });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9131/#/search?q=Lamp', { waitUntil:'load', timeout:90000 }).catch(()=>{});
  await p.waitForTimeout(10000);
  const dump=async()=>p.evaluate(()=>[...document.querySelectorAll('flt-semantics')].map(e=>e.textContent||'').join('\n'));
  async function pick(label){
    await p.mouse.move(187,300);
    for(let i=0;i<14;i++){await p.mouse.wheel(0,-2000);await p.waitForTimeout(80);}
    await p.locator('flt-semantics[role="button"]',{hasText:'Sort'}).first().click({force:true}).catch(()=>{});
    await p.waitForTimeout(800);
    const cands=await p.evaluate((lbl)=>{
      const out=[];
      document.querySelectorAll('flt-semantics').forEach(e=>{
        const t=(e.textContent||'').trim(); if(!t.includes(lbl))return;
        let child=false; e.querySelectorAll('flt-semantics').forEach(c=>{if((c.textContent||'').includes(lbl))child=true;});
        if(child)return;
        const r=e.getBoundingClientRect();
        if(r.width<8||r.height<8||r.bottom<0||r.top>innerHeight)return;
        out.push({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});
      });
      return out.slice(0,3);
    },label);
    for(const c of cands){await p.mouse.click(c.x,Math.min(c.y,650));break;}
    await p.waitForTimeout(1800);
  }
  const out={};
  for(const [lbl,key] of [['Relevance','relevance'],['Price: Low to High','price-asc'],['Price: High to Low','price-desc'],['Trending','trending']]){
    await pick(lbl);
    const t=await dump();
    out[key]=(t.match(/TSh [\d,]+/g)||[]).slice(0,6);
  }
  console.log(JSON.stringify(out,null,1));
  await b.close();
})();
