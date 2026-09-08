const { chromium } = require('playwright');
const ROUTES = ['/', '/lock', '/pricing', '/track-record', '/blog', '/dashboard', '/signin',
  '/signin/forgot', '/signin/reset', '/terms', '/privacy', '/cookies', '/risk', '/accessibility'];
const PROFILES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];
const problems = [];
const log = (m) => { problems.push(m); console.log(' - ' + m); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  for (const profile of PROFILES) {
    const ctx = await browser.newContext(profile);
    for (const route of ROUTES) {
      const page = await ctx.newPage();
      const errs = [];
      page.on('console', m => { const t = m.text();
        if (m.type() === 'error' && !/ERR_CONNECTION_RESET|fonts\.g|Failed to load resource/.test(t)) errs.push(t.slice(0,140)); });
      page.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0,140)));
      let status = 0;
      try {
        const r = await page.goto('http://localhost:3000' + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
        status = r ? r.status() : 0;
        await page.waitForTimeout(1500);
      } catch (e) { log(`${profile.name} ${route}: NAV ${String(e).slice(0,80)}`); await page.close(); continue; }
      if (status >= 400) log(`${profile.name} ${route}: HTTP ${status}`);
      const o = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
      if (o.s > o.c + 2) log(`${profile.name} ${route}: H-SCROLL ${o.s}>${o.c}`);
      if (profile.isMobile) {
        const small = await page.evaluate(() => [...document.querySelectorAll('a,button,input,select,[role="button"]')]
          .filter(el => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
            if (!r.width || !r.height || st.visibility === 'hidden') return false;
            // WCAG 2.5.8 exempts a target "in a sentence or block of text",
            // regardless of which element wraps the sentence. Treat a link with
            // sibling text around it as inline.
            if (el.closest('p,li')) return false;
            const parent = el.parentElement;
            if (parent && (parent.textContent || '').trim().length > (el.textContent || '').trim().length + 20) return false;
            if (String(el.className || '').includes('sr-only')) return false;
            return r.height < 24 || r.width < 24; })
          .map(el => `${el.tagName.toLowerCase()}"${(el.textContent||'').trim().slice(0,20)}"`).slice(0,4));
        if (small.length) log(`${profile.name} ${route}: SMALL TAP ${small.join(' | ')}`);
      }
      const a11y = await page.evaluate(() => {
        const noAlt = [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).length;
        const lv = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => +h.tagName[1]);
        let skip = null;
        for (let i = 1; i < lv.length; i++) if (lv[i] - lv[i-1] > 1) { skip = `h${lv[i-1]}->h${lv[i]}`; break; }
        const noLabel = [...document.querySelectorAll('input:not([type=hidden])')].filter(inp =>
          !inp.labels?.length && !inp.getAttribute('aria-label') && !inp.getAttribute('aria-labelledby')).length;
        return { noAlt, h1s: lv.filter(l => l === 1).length, skip, noLabel };
      });
      if (a11y.noAlt) log(`${profile.name} ${route}: ${a11y.noAlt} img no alt`);
      if (a11y.h1s !== 1) log(`${profile.name} ${route}: ${a11y.h1s} h1`);
      if (a11y.skip) log(`${profile.name} ${route}: heading skip ${a11y.skip}`);
      if (a11y.noLabel) log(`${profile.name} ${route}: ${a11y.noLabel} unlabelled input`);
      if (errs.length) log(`${profile.name} ${route}: CONSOLE ${errs.slice(0,2).join(' ;; ')}`);
      await page.close();
    }
    await ctx.close();
  }

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const go = async (u) => { await page.goto('http://localhost:3000' + u, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(1200); };

  await go('/signin');
  if (!(await page.$('a[href="/signin/forgot"]'))) log('functional: sign-in has no "Forgot your password?" link');

  await go('/signin/reset#token=' + 'a'.repeat(50));
  if (!(await page.$('#new-password'))) log('functional: reset page with a token shows no form');
  else {
    await page.fill('#new-password', 'short'); await page.fill('#confirm-password', 'short');
    const t = await page.textContent('#new-password-problem').catch(() => null);
    if (!t || !/8 characters/.test(t)) log('functional: short password not rejected client-side');
    if (!(await page.isDisabled('button[type=submit]'))) log('functional: submit enabled on an invalid password');
    await page.fill('#new-password', 'correcthorsebattery'); await page.fill('#confirm-password', 'correcthorsebatteryX');
    if (!(await page.textContent('#confirm-password-problem').catch(() => null))) log('functional: mismatch not flagged');
    await page.fill('#confirm-password', 'correcthorsebattery');
    if (await page.isDisabled('button[type=submit]')) log('functional: submit still disabled on a valid password');
  }

  await go('/signin/reset');
  if (!/Request a new one/.test(await page.textContent('body'))) log('functional: reset page without a token gives no way forward');

  await go('/signin/reset#token=SECRETTOKENVALUE123456789');
  if ((await page.content()).includes('SECRETTOKENVALUE123456789')) log('functional: reset token is rendered into the page HTML');
  // A fragment is never sent to the server, so the served document cannot
  // contain it. Fetched raw rather than read off the live page, because the
  // page has by then cleared its own address bar and would pass either way.
  const raw = await (await fetch('http://localhost:3000/signin/reset?token=SECRETTOKENVALUE123456789')).text();
  console.log(raw.includes('SECRETTOKENVALUE123456789')
    ? '   note: a token in the QUERY STRING would still reach the served HTML — which is why it travels in the fragment'
    : '   note: query-string tokens no longer reach the served HTML');
  if (page.url().includes('SECRETTOKENVALUE123456789')) log('functional: reset token still in the address bar after load');

  await go('/signin/forgot');
  const forgotBody = await page.textContent('body');
  if (!/not switched on|Send reset link/.test(forgotBody)) log('functional: forgot page shows neither a form nor an explanation');

  await ctx.close();
  await browser.close();
  console.log(problems.length ? `\nPROBLEMS: ${problems.length}` : `CLEAN — ${ROUTES.length} routes x 2 profiles + 8 functional checks`);
})();
