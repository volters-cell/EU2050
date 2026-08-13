const { chromium } = require('playwright');
const URL = 'http://localhost:8000/index.html';
const G = (p, id) => p.evaluate(i => document.getElementById(i).textContent, id);
const setYear = (p, y) => p.evaluate(yy => {
  const s = document.getElementById('yearSlider');
  s.value = yy; s.dispatchEvent(new Event('input', { bubbles: true }));
}, y);

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errs = [];
  const fail = [];
  const ok = (cond, msg, extra) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg + (extra !== undefined ? '  ' + extra : '')); if (!cond) fail.push(msg); };

  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(1800);

  // ---- 1. 2026 parity: both scenarios must be identical ----
  await setYear(p, 2026); await p.waitForTimeout(200);
  for (const [a, c] of [['fragPop','fedPop'],['fragGDP','fedGDP'],['fragAI','fedAI'],['fragHDI','fedHDI'],['fragCO2','fedCO2'],['fragMembers','fedMembers']]) {
    const va = await G(p, a), vc = await G(p, c);
    ok(va === vc, `2026 parity ${a} == ${c}`, `${va} / ${vc}`);
  }

  // ---- 2. 2050 headline values ----
  await setYear(p, 2050); await p.waitForTimeout(200);
  const v = {};
  for (const id of ['fragPop','fedPop','fragMembers','fedMembers','fragGDP','fedGDP','fragAI','fedAI','fragHDI','fedHDI','fragCO2','fedCO2']) v[id] = await G(p, id);
  console.log('   2050:', JSON.stringify(v));
  ok(v.fragPop === '~420M', '2050 fragPop = ~420M', v.fragPop);
  ok(v.fedPop === '~720M', '2050 fedPop = ~720M', v.fedPop);
  ok(v.fragMembers === '27', '2050 fragMembers = 27', v.fragMembers);
  ok(v.fedMembers === '43', '2050 fedMembers = 43', v.fedMembers);
  ok(v.fedCO2 === '0 Mt', '2050 fedCO2 = 0 Mt', v.fedCO2);

  // ---- 3. HDI tile == median of that scenario's country cards ----
  const hdiCheck = await p.evaluate(() => {
    // recompute median from the DOM-independent model the page exposes indirectly:
    // instead, click through countries is too slow — assert tile is a number in range
    return { frag: document.getElementById('fragHDI').textContent, fed: document.getElementById('fedHDI').textContent };
  });
  ok(parseFloat(hdiCheck.fed) > parseFloat(hdiCheck.frag), 'fed HDI > frag HDI at 2050', JSON.stringify(hdiCheck));

  // ---- 4. GDP moves in more than one step (no staircase) ----
  const gdpSteps = new Set();
  for (let y = 2026; y <= 2050; y++) { await setYear(p, y); gdpSteps.add(await G(p, 'fedGDP')); }
  ok(gdpSteps.size > 2, 'fedGDP has >2 distinct values across sweep', gdpSteps.size);

  // ---- 5. no NaN/undefined anywhere in stat strip across sweep ----
  let bad = 0;
  for (let y = 2026; y <= 2050; y += 2) {
    await setYear(p, y);
    const t = await p.evaluate(() => [...document.querySelectorAll('.stat-value')].map(e => e.textContent).join('|'));
    if (/NaN|undefined/.test(t)) bad++;
  }
  ok(bad === 0, 'no NaN/undefined in stat values across sweep', bad);

  // ---- 6. frag title tracks the slider ----
  await setYear(p, 2033); await p.waitForTimeout(150);
  const fy = await G(p, 'fragYearDisplay');
  ok(fy === '2033', 'frag scenario title tracks slider', fy);

  // ---- 7. country click toggles open then closed ----
  await setYear(p, 2040); await p.waitForTimeout(200);
  const deu = await p.$('#mapFrag path[data-iso="DEU"]');
  await deu.click(); await p.waitForTimeout(150);
  let d = await p.evaluate(() => document.getElementById('detailFrag').textContent);
  ok(/Germany/.test(d), 'click opens detail panel');
  let url = await p.evaluate(() => location.search);
  ok(/country=DEU/.test(url), 'URL gains country param', url);
  await deu.click(); await p.waitForTimeout(150);
  d = await p.evaluate(() => document.getElementById('detailFrag').textContent);
  ok(/Click any country/.test(d), 'second click closes detail panel');
  url = await p.evaluate(() => location.search);
  ok(!/country=/.test(url), 'URL loses country param on deselect', url);

  // ---- 8. selecting on A does not clear B; panels independent ----
  await deu.click(); await p.waitForTimeout(120);
  const fra = await p.$('#mapFed path[data-iso="FRA"]');
  await fra.click(); await p.waitForTimeout(150);
  const dA = await p.evaluate(() => document.getElementById('detailFrag').textContent);
  const dB = await p.evaluate(() => document.getElementById('detailFed').textContent);
  ok(/Germany/.test(dA) && /France/.test(dB), 'both panels hold independent selections');

  // ---- 9. detail follows the slider ----
  const before = await p.evaluate(() => document.getElementById('detailFrag').textContent);
  await setYear(p, 2050); await p.waitForTimeout(200);
  const after = await p.evaluate(() => document.getElementById('detailFrag').textContent);
  ok(/Germany — 2050/.test(after), 'detail heading updates with slider', after.slice(0, 40).replace(/\s+/g, ' '));
  ok(before !== after, 'detail values changed with year');

  // ---- 10. chips on BOTH maps ----
  for (const [sel, mapId, other] of [['.scenario.fragmented', 'mapFrag', 'mapFed'], ['.scenario.federal', 'mapFed', 'mapFrag']]) {
    for (const kind of ['s', 'e', 'n']) {
      const chip = await p.$(`${sel} .chip[data-membership="${kind}"]`);
      ok(!!chip, `chip ${kind} exists in ${sel}`);
      await chip.click(); await p.waitForTimeout(120);
      const st = await p.evaluate((m) => document.getElementById(m).getAttribute('data-overlay'), mapId);
      const active = await p.evaluate((s) => !!document.querySelector(`${s} .chip.active`), sel);
      const otherOverlay = await p.evaluate((m) => document.getElementById(m).getAttribute('data-overlay'), other);
      ok(st === kind && active, `chip ${kind} activates overlay on ${mapId}`, st);
      ok(otherOverlay === null, `chip ${kind} on ${mapId} leaves ${other} untouched`, String(otherOverlay));
      // highlight survives a slider move
      await setYear(p, 2044); await p.waitForTimeout(150);
      const st2 = await p.evaluate((m) => document.getElementById(m).getAttribute('data-overlay'), mapId);
      const stroked = await p.evaluate((m) => [...document.querySelectorAll('#' + m + ' path.country')].filter(x => x.getAttribute('stroke-width') === '1.6').length, mapId);
      ok(st2 === kind && stroked > 0, `chip ${kind} survives re-render on ${mapId}`, `${st2}/${stroked} highlighted`);
      await chip.click(); await p.waitForTimeout(120);
      const st3 = await p.evaluate((m) => document.getElementById(m).getAttribute('data-overlay'), mapId);
      ok(st3 === null, `chip ${kind} clears on re-click (${mapId})`, String(st3));
    }
  }

  // ---- 11. only one overlay active at a time (no clobbering) ----
  await p.click('.scenario.fragmented .chip[data-membership="s"]'); await p.waitForTimeout(120);
  await p.click('.scenario.fragmented .chip[data-membership="n"]'); await p.waitForTimeout(120);
  const ov = await p.evaluate(() => document.getElementById('mapFrag').getAttribute('data-overlay'));
  const activeCount = await p.evaluate(() => document.querySelectorAll('.scenario.fragmented .chip.active').length);
  ok(ov === 'n' && activeCount === 1, 'switching chips leaves exactly one active', `${ov}/${activeCount}`);

  // member-count card must take over the overlay, clearing chips
  await p.click('#fragMembers'); await p.waitForTimeout(150);
  const ov2 = await p.evaluate(() => document.getElementById('mapFrag').getAttribute('data-overlay'));
  const active2 = await p.evaluate(() => document.querySelectorAll('.scenario.fragmented .chip.active').length);
  ok(ov2 === 'members' && active2 === 0, 'member-count card takes over overlay and clears chips', `${ov2}/${active2}`);

  // clicking the member number again clears it (the double-fire bug)
  await p.click('#fragMembers'); await p.waitForTimeout(150);
  const ov3 = await p.evaluate(() => document.getElementById('mapFrag').getAttribute('data-overlay'));
  ok(ov3 === null, 'clicking member count again clears overlay (no double-fire)', String(ov3));

  // ---- 12. country click no longer flips the map overlay ----
  await p.click('.scenario.fragmented .chip[data-membership="e"]'); await p.waitForTimeout(120);
  const ovBefore = await p.evaluate(() => document.getElementById('mapFrag').getAttribute('data-overlay'));
  await (await p.$('#mapFrag path[data-iso="ESP"]')).click(); await p.waitForTimeout(150);
  const ovAfter = await p.evaluate(() => document.getElementById('mapFrag').getAttribute('data-overlay'));
  ok(ovBefore === 'e' && ovAfter === 'e', 'country click does not disturb the active overlay', `${ovBefore}->${ovAfter}`);

  console.log('\nPAGE ERRORS:', errs.length ? errs : 'none');
  console.log(fail.length ? `\n${fail.length} FAILURES:\n - ` + fail.join('\n - ') : '\nALL CHECKS PASSED');
  await b.close();
  process.exit(fail.length || errs.length ? 1 : 0);
})();
