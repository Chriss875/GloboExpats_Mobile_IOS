// au043_lib.js — AU-043 harness additions on top of lib_verify.js (do not modify lib_verify).
const { chromium } = require('/home/devsystemadmin/GloboExpats_Mobile/e2e/node_modules/playwright');

async function launch() {
  return chromium.launch({
    env: { ...process.env, LD_LIBRARY_PATH: process.env.HOME + '/chromium-libs/usr/lib/x86_64-linux-gnu' },
    args: ['--force-color-profile=srgb', '--disable-gpu', '--use-gl=swiftshader'],
  });
}

// App boot: goto /, wait for the home hero ('Buy now') in flt-semantics.
async function bootApp(p, appUrl) {
  await p.goto(appUrl + '/', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 40; i++) {
    await p.waitForTimeout(800);
    const t = await dump(p);
    if (t.includes('Buy now')) return true;
  }
  return false;
}

// Click a bottom-nav tab by its "Label\nTab n of 5" semantics node.
async function tapTab(p, label) {
  const hit = await p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.startsWith(lbl + '\nTab ') && t !== lbl) return;
      const r = e.getBoundingClientRect();
      if (r.width < 20 || r.height < 20 || r.bottom < 0 || r.top > innerHeight - 4) return;
      if (!best || r.width * r.height < best.area) {
        best = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), area: r.width * r.height };
      }
    });
    return best;
  }, label);
  if (!hit) return false;
  await p.mouse.click(hit.cx, hit.cy);
  return true;
}

async function dump(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n'));
}

module.exports = { launch, bootApp, tapTab, dump };
