const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ env:{...process.env, LD_LIBRARY_PATH:process.env.HOME+'/chromium-libs/usr/lib/x86_64-linux-gnu'},
    args:['--force-color-profile=srgb','--disable-gpu','--use-gl=swiftshader'] });
  const p = await b.newPage();
  for (const f of process.argv.slice(2)) {
    const data = require('fs').readFileSync(f).toString('base64');
    const hist = await p.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await new Promise(r => img.onload = r);
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const cnt = {};
      for (let i = 0; i < d.length; i += 40) {
        const k = d[i] + ',' + d[i+1] + ',' + d[i+2];
        cnt[k] = (cnt[k] || 0) + 1;
      }
      const top = Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,6);
      return { w: img.width, h: img.height, top };
    }, data);
    console.log(f.split('/').pop(), JSON.stringify(hist));
  }
  await b.close();
})();
