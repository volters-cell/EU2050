const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const vp of [{width:375,height:780,name:'mobile'},{width:1440,height:900,name:'desktop'}]) {
    const p = await b.newPage({ viewport: vp });
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto('http://localhost:8000/index.html', { waitUntil: 'load' });
    await p.waitForTimeout(2000);
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(500);
    const w = await p.evaluate(() => document.documentElement.scrollWidth);
    console.log(`${vp.name} (${vp.width}px): scrollWidth=${w} overflow=${w > vp.width ? 'YES' : 'no'} errors=${errs.length ? errs : 'none'}`);
    await p.close();
  }

  // NaN/undefined sweep including new elements
  const p2 = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p2.goto('http://localhost:8000/index.html', { waitUntil: 'load' });
  await p2.waitForTimeout(2000);
  let bad = 0;
  for (let y = 2026; y <= 2050; y += 3) {
    await p2.evaluate((yy) => {
      const s = document.getElementById('yearSlider');
      s.value = yy;
      s.dispatchEvent(new Event('input', { bubbles: true }));
    }, y);
    await p2.waitForTimeout(60);
    const hit = await p2.evaluate(() => {
      const txt = document.getElementById('detailFrag').textContent + document.getElementById('detailFed').textContent;
      return /NaN|undefined/.test(txt);
    });
    if (hit) bad++;
  }
  console.log('years with NaN/undefined in detail panels:', bad);
  await b.close();
})();
