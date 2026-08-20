const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read','clipboard-write'] });
  const p = await ctx.newPage();
  const fail = [];
  const ok = (c, m, x) => { console.log((c?'PASS  ':'FAIL  ')+m+(x!==undefined?'  '+x:'')); if(!c) fail.push(m); };
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:8000/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1800);

  // share band exists and is visible
  const band = await p.$('.share-band');
  ok(!!band, 'share band present');
  ok(await band.isVisible(), 'share band visible');

  // context copy tracks the slider
  const setYear = y => p.evaluate(yy => { const s=document.getElementById('yearSlider'); s.value=yy; s.dispatchEvent(new Event('input',{bubbles:true})); }, y);
  await setYear(2037); await p.waitForTimeout(200);
  let ctxTxt = await p.evaluate(() => document.getElementById('shareContext').textContent);
  ok(/2037/.test(ctxTxt), 'share context names the current year', ctxTxt.slice(0,60));

  // context names an opened country
  await (await p.$('#mapFrag path[data-iso="POL"]')).click(); await p.waitForTimeout(250);
  ctxTxt = await p.evaluate(() => document.getElementById('shareContext').textContent);
  ok(/Poland/.test(ctxTxt) && /2037/.test(ctxTxt), 'share context names the open country', ctxTxt.slice(0,80));

  // and reverts when it is closed again
  await (await p.$('#mapFrag path[data-iso="POL"]')).click(); await p.waitForTimeout(250);
  ctxTxt = await p.evaluate(() => document.getElementById('shareContext').textContent);
  ok(!/Poland/.test(ctxTxt), 'share context drops the country on deselect');

  // copy button copies the deep link, and shows feedback
  await (await p.$('#mapFed path[data-iso="ESP"]')).click(); await p.waitForTimeout(250);
  const href = await p.evaluate(() => location.href);
  await p.click('.share-primary[data-share="copy"]'); await p.waitForTimeout(400);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  ok(clip === href, 'copy button copies the current deep link', clip.split('?')[1]);
  ok(/country=ESP/.test(clip) && /year=/.test(clip), 'copied link carries year + country');
  const label = await p.evaluate(() => document.querySelector('.share-primary span').textContent);
  const copied = await p.evaluate(() => document.querySelector('.share-primary').classList.contains('copied'));
  ok(label === 'Copied' && copied, 'copy button confirms visually', `${label}/${copied}`);
  const toast = await p.evaluate(() => document.querySelector('.share-toast')?.textContent || '');
  ok(/Link copied/.test(toast), 'toast shown', toast);
  await p.waitForTimeout(2200);
  const label2 = await p.evaluate(() => document.querySelector('.share-primary span').textContent);
  ok(label2 === 'Copy link', 'copy button label resets', label2);

  // share text is view-specific
  const txt = await p.evaluate(() => { let t=null; const o=window.open; window.open=(u)=>{t=u; return null;}; document.querySelector('[data-share="x"]').click(); window.open=o; return t; });
  ok(/Spain/.test(decodeURIComponent(txt||'')), 'X share text names the open country', decodeURIComponent(txt||'').slice(0,110));

  // deep link round-trip: reopen the copied URL
  const p2 = await ctx.newPage();
  await p2.goto(clip, { waitUntil: 'load' }); await p2.waitForTimeout(1800);
  const d = await p2.evaluate(() => document.getElementById('detailFed').textContent);
  ok(/Spain/.test(d), 'copied link reopens the same country');

  // OG/meta for link previews
  const meta = await p.evaluate(() => ({
    title: document.querySelector('meta[property="og:title"]')?.content,
    img: document.querySelector('meta[property="og:image"]')?.content,
    desc: document.querySelector('meta[property="og:description"]')?.content,
    card: document.querySelector('meta[name="twitter:card"]')?.content,
    icon: document.querySelector('link[rel="icon"]')?.getAttribute('href')
  }));
  ok(!!meta.title && !!meta.img && !!meta.desc && meta.card === 'summary_large_image' && !!meta.icon, 'link-preview meta complete', JSON.stringify(meta));

  console.log('\nerrors:', errs.length ? errs : 'none');
  console.log(fail.length ? `\n${fail.length} FAILURES:\n - `+fail.join('\n - ') : '\nALL PASSED');
  await b.close();
  process.exit(fail.length?1:0);
})();
