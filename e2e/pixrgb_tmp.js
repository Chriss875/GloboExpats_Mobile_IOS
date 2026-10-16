// Re-encode any PNG to truecolor RGB PNG (flattened on white) so viewers see it right.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ env:{...process.env, LD_LIBRARY_PATH:process.env.HOME+'/chromium-libs/usr/lib/x86_64-linux-gnu'},
    args:['--disable-gpu'] });
  const p = await b.newPage();
  for (const f of process.argv.slice(2)) {
    const data = require('fs').readFileSync(f).toString('base64');
    const out = await p.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await new Promise(r => img.onload = r);
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0,0,c.width,c.height);
      g.drawImage(img, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    }, data);
    require('fs').writeFileSync(f.replace(/\.png$/, '.rgb.png'), Buffer.from(out, 'base64'));
    console.log('wrote', f.replace(/\.png$/, '.rgb.png'));
  }
  await b.close();
})();
