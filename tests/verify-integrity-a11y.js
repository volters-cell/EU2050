const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const fail = [];
  const ok = (c, m, x) => { console.log((c?'PASS  ':'FAIL  ')+m+(x!==undefined?'  '+x:'')); if(!c) fail.push(m); };
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs=[]; p.on('pageerror', e=>errs.push(String(e)));
  await p.goto('http://localhost:8000/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1800);

  // --- feed integrity ---
  // Every credited item must name one of the three feeds actually collected
  // from, and link to the original — the failure this guards against is a
  // fabricated byline attributing invented copy to a real newsroom.
  const credits = await p.evaluate(() => [...document.querySelectorAll('.feed-item')].map(row => {
    const src = row.querySelector('.feed-source');
    const a = row.querySelector('.feed-source a');
    return { name: src ? src.textContent.trim() : null, href: a ? a.getAttribute('href') : null };
  }));
  const KNOWN = ['BBC News', 'The New York Times', 'Euronews'];
  ok(credits.length > 0, 'feed rendered some items', credits.length);
  ok(credits.every(c => c.name === null || KNOWN.includes(c.name)),
     'every credit names a feed actually collected from',
     JSON.stringify([...new Set(credits.map(c => c.name))]));
  ok(credits.every(c => c.name === null || (c.href && /^https?:\/\//.test(c.href))),
     'every credited item links to the original');
  const body = await p.evaluate(() => document.body.innerText);
  ok(!/Auto-refreshes daily|Updated Today/i.test(body), 'no live/updated claim');
  ok(/Illustrative scenario model/i.test(body), 'page states it is illustrative');
  ok(/illustrative scenarios, not statistical forecasts/i.test(body), 'disclaimer states scenarios are illustrative');
  ok(/collects real headlines from the public RSS feeds/i.test(body), 'disclaimer states where signals come from');
  ok(/publisher's own wording, credited and linked/i.test(body), 'disclaimer states the copy is the publisher\'s');
  ok(/scenario readings attached to each signal are our own interpretation/i.test(body), 'disclaimer disowns the readings from publishers');
  const dates = await p.evaluate(() => [...document.querySelectorAll('.feed-date')].map(e=>e.textContent));
  ok(dates.length > 0 && dates.every(d => /\d/.test(d)), 'feed items carry a date', dates[0]);

  // --- a11y: country keyboard reachable ---
  const a11y = await p.evaluate(() => {
    const c = document.querySelector('#mapFrag path[data-iso="DEU"]');
    return { tabindex: c.getAttribute('tabindex'), role: c.getAttribute('role'), label: c.getAttribute('aria-label') };
  });
  ok(a11y.tabindex === '0' && a11y.role === 'button' && a11y.label === 'Germany', 'country path is focusable + labelled', JSON.stringify(a11y));

  // keyboard activation opens the panel
  await p.evaluate(() => document.querySelector('#mapFrag path[data-iso="DEU"]').focus());
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  let d = await p.evaluate(() => document.getElementById('detailFrag').textContent);
  ok(/Germany/.test(d), 'Enter opens detail panel from keyboard');
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  d = await p.evaluate(() => document.getElementById('detailFrag').textContent);
  ok(/Click any country/.test(d), 'Enter again closes it');

  // stat cards + chips exposed
  const roles = await p.evaluate(() => ({
    card: document.getElementById('fragMembers').closest('.stat').getAttribute('role'),
    cardTab: document.getElementById('fragMembers').closest('.stat').getAttribute('tabindex'),
    chip: document.querySelector('.chip[data-membership]').getAttribute('aria-pressed'),
    statVal: document.getElementById('fragGDP').getAttribute('role'),
  }));
  ok(roles.card==='button' && roles.cardTab==='0', 'member card is a keyboard button', JSON.stringify(roles));
  ok(roles.chip==='false', 'chips expose aria-pressed');
  await p.click('.scenario.fragmented .chip[data-membership="s"]'); await p.waitForTimeout(150);
  ok(await p.evaluate(()=>document.querySelector('.scenario.fragmented .chip[data-membership="s"]').getAttribute('aria-pressed'))==='true','chip aria-pressed flips on');
  const skip = await p.evaluate(()=>!!document.querySelector('.skip-link'));
  ok(skip, 'skip link present');

  // --- compare feature ---
  await p.click('#mapFrag path[data-iso="ESP"]'); await p.waitForTimeout(200);
  const hasBtn = await p.evaluate(()=>!!document.querySelector('#detailFrag .compare-btn'));
  ok(hasBtn, 'compare button rendered');
  await p.click('#detailFrag .compare-btn'); await p.waitForTimeout(250);
  const cmp = await p.evaluate(() => {
    const box = document.querySelector('#detailFrag .detail-compare');
    return { hidden: box.hidden, rows: box.querySelectorAll('.compare-row').length,
             cells: box.querySelectorAll('.compare-cell').length,
             text: box.textContent.replace(/\s+/g,' ').slice(0,120) };
  });
  ok(!cmp.hidden && cmp.rows===4 && cmp.cells===8, 'comparison shows 4 rows x 2 scenarios', JSON.stringify({rows:cmp.rows,cells:cmp.cells}));
  console.log('   sample:', cmp.text);
  await p.click('#detailFrag .compare-btn'); await p.waitForTimeout(200);
  ok(await p.evaluate(()=>document.querySelector('#detailFrag .detail-compare').hidden), 'comparison collapses again');

  // --- equal map widths ---
  const w = await p.evaluate(() => {
    const a = document.querySelector('.scenario.fragmented .map-wrap').getBoundingClientRect().width;
    const bb = document.querySelector('.scenario.federal .map-wrap').getBoundingClientRect().width;
    return { a: Math.round(a), b: Math.round(bb) };
  });
  ok(Math.abs(w.a-w.b) <= 1, 'both maps render at the same width', JSON.stringify(w));

  // --- precision framing ---
  const badges = await p.evaluate(()=>document.querySelectorAll('.modelled-badge').length);
  ok(badges===2, 'modelled badge on both scenarios', badges);

  console.log('errors:', errs.length?errs:'none');
  console.log(fail.length?`\n${fail.length} FAILURES`:'\nALL PASSED');
  await b.close();
  process.exit(fail.length?1:0);
})();
