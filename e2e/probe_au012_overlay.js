// probe_au012_overlay.js — diagnose the Change Email Address miss:
// dump ALL candidate semantics nodes (rect + DOM order) at stage 2, then click
// the topmost-overlay candidate and report the heading transition.
const fs = require('fs');
process.chdir('/home/devsystemadmin/GloboExpats_Mobile/e2e');
const lib = require('./lib_verify.js');
const { API } = lib;
const APP = 'http://localhost:9108';
const { execSync } = require('child_process');
const SH = 'e2e/shots/AU-012';
const dbOtp = (email) => execSync(`docker exec sandbox-db psql -U postgres -d expat_platform -tAc "select coalesce(reset_password_otp,'NULL') from users where logging_email='${email}'"`, { encoding: 'utf8' }).trim();

(async () => {
  const browser = await lib.newBrowser();
  const ctx = await lib.newCtx(browser, { viewport: { width: 375, height: 667 } });
  const p = await ctx.newPage();
  const email = `au012.ovprobe.${Date.now()}@mail.com`;
  const pw = 'OvProbe!' + Math.floor(Math.random() * 9000 + 100);
  await fetch(`${API}/api/v1/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName: 'Ov', lastName: 'P', password: pw, emailAddress: email }) });

  await p.goto(APP + '/#/reset-password', { waitUntil: 'load', timeout: 90000 }).catch(() => {});
  await lib.waitText(p, 'Reset Your Password', 40000);
  await p.waitForTimeout(2000);

  const cands = async (lbl) => p.evaluate((l) => {
    const out = [];
    document.querySelectorAll('flt-semantics').forEach((e, i) => {
      const txt = ((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || ''));
      if (!txt.includes(l)) return;
      const r = e.getBoundingClientRect();
      out.push({ domIdx: i, role: e.getAttribute('role'), tap: e.getAttribute('flt-tappable'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), txt: txt.trim().slice(0, 60) });
    });
    return out;
  }, lbl);
  const headings = () => lib.allText(p).then((t) => ({ reset: (t.match(/Reset Your Password/g) || []).length, verify: (t.match(/Verify Your Email/g) || []).length, setnew: (t.match(/Set New Password/g) || []).length }));

  console.log('S1 heading counts:', JSON.stringify(await headings()));
  console.log('S1 "Send Verification Code" nodes:', JSON.stringify(await cands('Send Verification Code')));
  // enter email, send -> stage 2 (via proven primitive)
  const ei = p.locator('input[type="text"]').first();
  await ei.click({ force: true }); await p.waitForTimeout(300);
  await p.keyboard.type(email, { delay: 20 });
  let sent = await lib.clickBtn(p, 'Send Verification Code');
  let s2 = false;
  for (let i = 0; i < 30 && !s2; i++) s2 = await lib.waitText(p, 'Verify Your Email', 1000);
  console.log('sent:', sent, 's2:', s2);
  await p.waitForTimeout(1500);
  console.log('S2 heading counts:', JSON.stringify(await headings()));
  console.log('ALL "Change Email Address" nodes:', JSON.stringify(await cands('Change Email Address')));
  console.log('ALL "Verify Code" nodes:', JSON.stringify(await cands('Verify Code')));
  console.log('ALL "Back to login" nodes:', JSON.stringify(await cands('Back to login')));
  // scroll state
  console.log('scrollY:', await p.evaluate(() => window.scrollY));
  await lib.screenshot(p, `${SH}/ovprobe-s2-before.png`);

  // click the LAST (topmost overlay) candidate regardless of size
  const target = await p.evaluate(() => {
    const els = [...document.querySelectorAll('flt-semantics')];
    for (let i = els.length - 1; i >= 0; i--) {
      const e = els[i];
      const txt = ((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || ''));
      if (!txt.includes('Change Email Address')) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) continue;
      return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), domIdx: i };
    }
    return null;
  });
  console.log('clicking topmost candidate:', JSON.stringify(target));
  if (target) {
    await p.mouse.click(target.cx, target.cy);
    await p.waitForTimeout(1200);
    console.log('AFTER CLICK heading counts:', JSON.stringify(await headings()));
    await lib.screenshot(p, `${SH}/ovprobe-after-changeemail-click.png`);
    // elementFromPoint check at that coordinate
    console.log('elementAtPoint:', await p.evaluate(({ cx, cy }) => { const el = document.elementFromPoint(cx, cy); return el ? el.tagName + '|' + (el.textContent || '').slice(0, 40) : 'none'; }, target));
  }
  await ctx.close();
  await browser.close();
})().catch((e) => { console.error('CRASH', e.message); process.exit(1); });
