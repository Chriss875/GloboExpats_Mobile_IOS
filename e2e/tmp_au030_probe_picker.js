const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ env:{...process.env, LD_LIBRARY_PATH:'/home/devsystemadmin/chromium-libs/usr/lib/x86_64-linux-gnu'},
    args:['--force-color-profile=srgb','--disable-gpu','--use-gl=swiftshader'] });
  const ctx = await b.newContext({ viewport:{width:375,height:667} });
  const p = await ctx.newPage();
  await p.goto('http://localhost:9113/', { waitUntil:'load', timeout:90000 }).catch(()=>{});
  await p.waitForTimeout(6000);
  const probe = await p.evaluate(() => {
    const el = document.querySelector('#__image_picker_web-file-input') || document.querySelector('flt-image-picker-inputs');
    const inputs = [...document.querySelectorAll('input[type=file]')].map(i => ({accept:i.accept, id:i.id}));
    return { pickerHost: !!el, inputs };
  });
  console.log('PICKER PROBE:', JSON.stringify(probe));
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
