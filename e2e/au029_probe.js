// au029_probe.js — structural probe of the step-3 semantics tree: how ChoiceChips,
// the reference row, and the submit button are exposed. Read-only.
const fs = require('fs');
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const L = require('./lib_verify.js');
const APP = 'http://localhost:9113';
const fx = JSON.parse(fs.readFileSync('/tmp/au028_fixtures.json', 'utf8'));
const PROBE1 = `AU028 Guard Tote ${fx.stamp}`;
const PROBE2 = `AU028 Plain Mat ${fx.stamp}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function txt(p) {
  return p.evaluate(() => [...document.querySelectorAll('flt-semantics')].map(e => e.textContent || '').join('\n')).catch(() => '');
}
function isLoggedIn(p) {
  return p.evaluate(() => { try { const v = localStorage.getItem('flutter.auth_token'); return !!(v && v.length > 10); } catch (e) { return false; } });
}
async function loginFlow(p) {
  await L.waitText(p, 'Buy now', 45000);
  let logged = await isLoggedIn(p);
  if (!logged) {
    await L.clickBtn(p, 'Login');
    await L.waitText(p, 'Welcome back', 25000);
    const ei = p.locator('input[type="text"]').first();
    await ei.click({ force: true }).catch(() => {}); await sleep(400);
    await p.keyboard.type(fx.buyer.email, { delay: 12 });
    const pi = p.locator('input[type="password"]').first();
    await pi.click({ force: true }).catch(() => {}); await sleep(400);
    await p.keyboard.type(fx.buyer.pw, { delay: 12 });
    await L.clickBtn(p, 'Log in');
    for (let i = 0; i < 30 && !logged; i++) { await sleep(1000); logged = await isLoggedIn(p); }
  }
  for (let i = 0; i < 20; i++) {
    const n = await p.evaluate(() => document.querySelectorAll('flt-semantics').length).catch(() => 0);
    if (n > 30) return logged;
    await sleep(800);
  }
  return false;
}
async function hashNav(p, route) { await p.evaluate((r) => { location.hash = r; }, route); await sleep(2400); }
async function jsClickByText(p, label) {
  const hit = await p.evaluate((lbl) => {
    let best = null;
    document.querySelectorAll('flt-semantics').forEach(e => {
      const t = (e.textContent || '').trim();
      if (!t.includes(lbl)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 10 || r.height < 10 || r.bottom < 0 || r.top > innerHeight) return;
      const roleOk = e.getAttribute('role') === 'button' || e.getAttribute('flt-tappable') !== null;
      if (!roleOk) return;
      if (!best || r.width * r.height < best.area)
        best = { area: r.width * r.height, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    return best;
  }, label);
  if (!hit) return false;
  await p.mouse.click(Math.max(4, hit.x), Math.max(20, Math.min(hit.y, 1015)));
  await sleep(900);
  return true;
}

(async () => {
  const browser = await L.newBrowser();
  const ctx = await L.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  console.log('login:', await loginFlow(p));
  async function add(pid, title, pickSize) {
    await p.evaluate((id) => { location.hash = '#/product/' + id; }, pid);
    for (let i = 0; i < 18; i++) { await sleep(900); if ((await txt(p)).includes(title)) break; }
    if (pickSize) {
      const chip = await p.evaluate(() => {
        let best = null;
        document.querySelectorAll('flt-semantics').forEach(e => {
          const t = (e.textContent || '').trim();
          if (t !== 'L' && !/^L\b/.test(t)) return;
          const r = e.getBoundingClientRect();
          if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
          if (!best || r.width * r.height < best.area)
            best = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        });
        return best;
      });
      if (chip) { await p.mouse.click(chip.x, chip.y); await sleep(700); }
    }
    await jsClickByText(p, 'Add to cart'); await sleep(1200); await hashNav(p, '#/');
  }
  await add(fx.productId1, PROBE1, true);
  await add(fx.productId2, PROBE2, false);
  await hashNav(p, '#/cart'); await sleep(2000);
  await jsClickByText(p, 'Go to checkout'); await sleep(1500);
  for (let i = 0; i < 20 && !(await txt(p)).includes('Order Summary'); i++) await sleep(900);
  await L.scrollToBottom(p, 8); await sleep(400);
  await jsClickByText(p, 'Continue to review');
  for (let i = 0; i < 22 && !(/Step\s*2\s*of\s*4/.test(await txt(p))); i++) await sleep(900);
  await L.scrollToBottom(p, 16); await sleep(600);
  // check first window + terms
  async function tickRow(which) {
    const t = await p.evaluate((which) => {
      const rows = [...document.querySelectorAll('flt-semantics')]
        .filter(e => e.getAttribute('role') === 'checkbox')
        .map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height, vis: r.y > 40 && (r.y + r.height) < innerHeight - 10 && r.width > 5 }; })
        .filter(b => b.vis);
      if (!rows.length) return null;
      const pk = which === 'first' ? rows[0] : rows[rows.length - 1];
      return { x: pk.x + 18, y: Math.min(Math.max(pk.y + pk.h / 2, 25), 1015) };
    }, which);
    if (t) { await p.mouse.click(t.x, t.y); await sleep(800); }
  }
  await tickRow('first'); await tickRow('last');
  await jsClickByText(p, 'Confirm & proceed to payment');
  let T3 = '';
  for (let i = 0; i < 30; i++) { await sleep(1000); T3 = await txt(p); if (/How will you pay\?|Amount due|Pay via/.test(T3)) break; }
  console.log('step3 reached:', /How will you pay\?/.test(T3));

  // ---- probe 1: every node whose text mentions Lipa/Bank/PF-/Submit ----
  dump('DEFAULT');

  async function dump(tag) {
    const nodes = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('flt-semantics').forEach(e => {
        const t = (e.textContent || '').trim().replace(/\s+/g, ' ');
        if (/Lipa Namba|Bank Account|PF-\d{4}|Submit Payment|Payment reference/.test(t)) {
          const r = e.getBoundingClientRect();
          out.push({
            text: t.slice(0, 90),
            role: e.getAttribute('role'),
            tag: e.hasAttribute('flt-tappable') ? 'tappable' : '',
            ariaSel: e.getAttribute('aria-selected'),
            ariaChecked: e.getAttribute('aria-checked'),
            disabled: e.getAttribute('aria-disabled'),
            w: Math.round(r.width), h: Math.round(r.height),
            depth: (() => { let d = 0, n = e; while (n.parentElement) { d++; n = n.parentElement; } return d; })(),
            path: (() => { let s = e.tagName, n = e.parentElement; while (n && n.tagName !== 'BODY' && d() < 12) { s = n.tagName + '>' + s; n = n.parentElement; } return s.slice(-70); })(),
          });
        }
      });
      function d(){return 0;}
      return out;
    });
    console.log(`\n===== ${tag} =====`);
    nodes.sort((a, b) => a.w * a.h - b.w * b.h);
    nodes.forEach(n => console.log(JSON.stringify(n)));
  }

  await jsClickByText(p, 'Bank Account'); await sleep(1200);
  await dump('AFTER BANK TAP');
  await jsClickByText(p, 'Lipa Namba'); await sleep(1200);
  await dump('AFTER BACK TO LIPA');

  // scroll to bottom to see whether Submit is below the fold
  await L.scrollToBottom(p, 18); await sleep(800);
  await dump('AFTER SCROLL-BOTTOM');
  const shot = '/tmp/au029_step3_bottom.png';
  await L.screenshot(p, shot);
  const allRoles = await p.evaluate(() => {
    const counts = {};
    document.querySelectorAll('flt-semantics').forEach(e => {
      const k = (e.getAttribute('role') || '') + '|' + (e.hasAttribute('flt-tappable') ? 'tap' : '');
      counts[k] = (counts[k] || 0) + 1;
    });
    return counts;
  });
  console.log('\nrole counts:', JSON.stringify(allRoles));
  fs.writeFileSync('/tmp/au029_probe_tree.txt', await p.evaluate(() =>
    [...document.querySelectorAll('flt-semantics')].map(e =>
      `${e.tagName} role=${e.getAttribute('role')} tap=${e.hasAttribute('flt-tappable')} sel=${e.getAttribute('aria-selected')} :: ${(e.textContent||'').trim().replace(/\s+/g,' ').slice(0,80)}`
    ).join('\n')));
  await ctx.close(); await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
