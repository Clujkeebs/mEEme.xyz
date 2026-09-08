const { chromium } = require('playwright');

const ROUTES = ['/', '/lock', '/pricing', '/track-record', '/blog', '/dashboard', '/signin',
  '/signin/forgot', '/signin/reset', '/terms', '/privacy', '/cookies', '/risk', '/accessibility'];

const PROFILES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const problems = [];

  for (const profile of PROFILES) {
    const ctx = await browser.newContext(profile);
    for (const route of ROUTES) {
      const page = await ctx.newPage();
      const errs = [];
      page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/ERR_CONNECTION_RESET|fonts\.g/.test(t)) errs.push(t.slice(0,150)); });
      page.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0,150)));
      let status = 0;
      try {
        const r = await page.goto('http://localhost:3000' + route, { waitUntil: 'networkidle', timeout: 45000 });
        status = r ? r.status() : 0;
      } catch (e) { problems.push(`${profile.name} ${route}: NAV ${String(e).slice(0,90)}`); await page.close(); continue; }
      if (status >= 400) problems.push(`${profile.name} ${route}: HTTP ${status}`);

      const o = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
      if (o.s > o.c + 2) problems.push(`${profile.name} ${route}: H-SCROLL ${o.s}>${o.c}`);

      if (profile.isMobile) {
        const small = await page.evaluate(() => [...document.querySelectorAll('a,button,input,select,[role="button"]')]
          .filter(el => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
            if (!r.width || !r.height || st.visibility === 'hidden') return false;
            if (el.closest('p,li')) return false;            // inline links are exempt (WCAG 2.5.8)
            if (el.className && String(el.className).includes('sr-only')) return false;
            return r.height < 24 || r.width < 24; })
          .map(el => `${el.tagName.toLowerCase()}"${(el.textContent||'').trim().slice(0,22)}"`).slice(0,4));
        if (small.length) problems.push(`${profile.name} ${route}: SMALL TAP ${small.join(' | ')}`);
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
      if (a11y.noAlt) problems.push(`${profile.name} ${route}: ${a11y.noAlt} img no alt`);
      if (a11y.h1s !== 1) problems.push(`${profile.name} ${route}: ${a11y.h1s} h1`);
      if (a11y.skip) problems.push(`${profile.name} ${route}: heading skip ${a11y.skip}`);
      if (a11y.noLabel) problems.push(`${profile.name} ${route}: ${a11y.noLabel} unlabelled input`);
      if (errs.length) problems.push(`${profile.name} ${route}: CONSOLE ${errs.slice(0,2).join(' ;; ')}`);
      await page.close();
    }
    await ctx.close();
  }

  // Functional: the reset form's own validation, and the link off sign-in.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/signin', { waitUntil: 'networkidle' });
  const forgot = await page.$('a[href="/signin/forgot"]');
  if (!forgot) problems.push('functional: sign-in has no "Forgot your password?" link');

  await page.goto('http://localhost:3000/signin/reset?token=' + 'a'.repeat(50), { waitUntil: 'networkidle' });
  if (!(await page.$('#new-password'))) problems.push('functional: reset page with a token shows no form');
  await page.fill('#new-password', 'short');
  await page.fill('#confirm-password', 'short');
  const tooShort = await page.textContent('#new-password-problem').catch(() => null);
  if (!tooShort || !/8 characters/.test(tooShort)) problems.push('functional: short password not rejected client-side');
  if (!(await page.isDisabled('button[type=submit]'))) problems.push('functional: submit enabled on an invalid password');
  await page.fill('#new-password', 'correcthorsebattery');
  await page.fill('#confirm-password', 'correcthorsebatteryX');
  const mism = await page.textContent('#confirm-password-problem').catch(() => null);
  if (!mism) problems.push('functional: mismatched confirmation not flagged');
  await page.fill('#confirm-password', 'correcthorsebattery');
  if (await page.isDisabled('button[type=submit]')) problems.push('functional: submit still disabled on a valid password');

  await page.goto('http://localhost:3000/signin/reset', { waitUntil: 'networkidle' });
  const body = await page.textContent('body');
  if (!/Request a new one/.test(body)) problems.push('functional: reset page without a token gives no way forward');
  // The token must never be rendered into the page.
  await page.goto('http://localhost:3000/signin/reset?token=SECRETTOKENVALUE123456789', { waitUntil: 'networkidle' });
  const html = await page.content();
  if (html.includes('SECRETTOKENVALUE123456789')) problems.push('functional: reset token is rendered into the page HTML');
  await ctx.close();

  await browser.close();
  console.log(problems.length ? 'PROBLEMS (' + problems.length + '):\n - ' + problems.join('\n - ') : 'CLEAN across ' + ROUTES.length + ' routes x 2 profiles + functional checks');
})();
