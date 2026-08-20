(function(){

  const geo = window.EUROPE_GEOJSON;
  const data = window.EU2050_DATA;

  // ---------- Projection setup ----------
  const LON_MIN = -25, LON_MAX = 50;
  const LAT_MIN = 33, LAT_MAX = 71;
  const W = 760, H = 620;

  function project([lon, lat]){
    const x = (lon - LON_MIN) / (LON_MAX - LON_MIN) * W;
    const y = H - (lat - LAT_MIN) / (LAT_MAX - LAT_MIN) * H;
    return [x, y];
  }

  function ringToPath(ring){
    return ring.map((pt, i) => {
      const [x,y] = project(pt);
      return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ') + ' Z';
  }

  function geometryToPath(geometry){
    let d = '';
    if(geometry.type === 'Polygon'){
      geometry.coordinates.forEach(ring => d += ringToPath(ring) + ' ');
    } else if(geometry.type === 'MultiPolygon'){
      geometry.coordinates.forEach(poly => poly.forEach(ring => d += ringToPath(ring) + ' '));
    }
    return d.trim();
  }

  // ---------- Color scales ----------
  function fragColor(score, isEU){
    if(isEU) return '#c4453a';   // current EU members — solid red
    return '#5a3a36';             // non-EU neighbours — faded/muted
  }

  function fedColor(score, isNew){
    return '#7c5cd6';              // federation members — single unified purple
  }

  // ---------- Theme switching ----------
  function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'night' : 'light';
    html.setAttribute('data-theme', newTheme);
    
    // Update button text and icon
    const themeText = document.getElementById('themeText');
    const themeIcon = document.getElementById('themeIcon');
    
    if (newTheme === 'light') {
      themeText.textContent = 'Night';
      themeIcon.textContent = '☾'; // Moon icon
    } else {
      themeText.textContent = 'Light';
      themeIcon.textContent = '☀'; // Sun icon
    }
    
    // Save preference to localStorage
    localStorage.setItem('theme', newTheme);
    
    // Update maps and UI
    render(currentYear);
  }

  // Load saved theme
  function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'night';
    if (savedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      document.getElementById('themeText').textContent = 'Night';
      document.getElementById('themeIcon').textContent = '☾';
    } else {
      document.getElementById('themeText').textContent = 'Light';
      document.getElementById('themeIcon').textContent = '☀';
    }
  }

  // ---------- Year interpolation ----------
  // Both scenarios start from the SAME 2026 baseline — fragScore, i.e. today's
  // status quo — and only diverge going forward, matching what the stat notes
  // promise. Scenario A then erodes slightly as dependence deepens; Scenario B
  // climbs toward fedScore. The previous version made frag's baseline equal its
  // own target, which froze the score flat across all 25 years, and gave fed a
  // hardcoded 0.55 baseline that disagreed with frag at 2026.
  function blendScore(country, scenario, year){
    const base = country.fragScore;
    if(base === undefined) return undefined;
    const target = scenario === 'frag'
      ? base * 0.9                                   // slow erosion under fragmentation
      : (country.fedScore !== undefined ? country.fedScore : base);
    const t = Math.max(0, Math.min(1, (year - 2026) / (2050 - 2026)));
    return base + (target - base) * t;
  }

  // ---------- Accession timeline data ----------
  // Define when countries join in Scenario B
  const accessionTimeline = {
    // Western Balkans
    'SRB': 2030, // Serbia
    'MNE': 2028, // Montenegro
    'ALB': 2030, // Albania
    'MKD': 2032, // North Macedonia
    'BIH': 2034, // Bosnia and Herzegovina
    'XKX': 2036, // Kosovo
    // Eastern Europe
    'UKR': 2035, // Ukraine
    'MDA': 2030, // Moldova
    'GEO': 2036, // Georgia
    'ARM': 2038, // Armenia
    'AZE': 2040, // Azerbaijan
    // EEA/EFTA countries
    'NOR': 2038, // Norway
    'ISL': 2028, // Iceland (accession referendum expected imminently, joining alongside Montenegro)
    'CHE': 2042, // Switzerland
    // Others
    'GBR': 2040, // United Kingdom (rejoining)
    'TUR': 2045  // Turkey
  };

  // Schengen/Eurozone/NATO membership lookup for Scenario A (hardcoded for
  // reliability). Scenario B collapses all three into a single isMember
  // boolean once a country joins the federation, so this table only matters
  // for the fragmented map.
  const membershipData = {
    DEU: {s:true, e:true, n:true}, FRA: {s:true, e:true, n:true}, ITA: {s:true, e:true, n:true},
    ESP: {s:true, e:true, n:true}, POL: {s:true, e:false, n:true}, NLD: {s:true, e:true, n:true},
    BEL: {s:true, e:true, n:true}, AUT: {s:true, e:true, n:false}, SWE: {s:true, e:false, n:true},
    FIN: {s:true, e:true, n:true}, DNK: {s:true, e:false, n:true}, IRL: {s:false, e:true, n:false},
    PRT: {s:true, e:true, n:true}, GRC: {s:true, e:true, n:true}, CZE: {s:true, e:false, n:true},
    SVK: {s:true, e:true, n:true}, HUN: {s:true, e:false, n:true}, ROU: {s:true, e:false, n:true},
    // Croatia adopted the euro in 2023; Bulgaria on 1 Jan 2026 (21st member).
    BGR: {s:true, e:true, n:true}, HRV: {s:true, e:true, n:true}, SVN: {s:true, e:true, n:true},
    LTU: {s:true, e:true, n:true}, LVA: {s:true, e:true, n:true}, EST: {s:true, e:true, n:true},
    LUX: {s:true, e:true, n:true}, MLT: {s:true, e:true, n:false}, CYP: {s:false, e:true, n:false},
    SRB: {s:false, e:false, n:false}, ALB: {s:false, e:false, n:true}, MNE: {s:false, e:false, n:true},
    MKD: {s:false, e:false, n:true}, BIH: {s:false, e:false, n:false}, XKX: {s:false, e:false, n:false},
    UKR: {s:false, e:false, n:false}, MDA: {s:false, e:false, n:false}, GEO: {s:false, e:false, n:false},
    ARM: {s:false, e:false, n:false}, AZE: {s:false, e:false, n:false},
    GBR: {s:false, e:false, n:true}, CHE: {s:true, e:false, n:false}, NOR: {s:true, e:false, n:true},
    ISL: {s:true, e:false, n:true}, TUR: {s:false, e:false, n:true}
  };

  // Get countries that have joined by a given year in Scenario B
  function getJoinedCountries(year) {
    const joined = new Set();
    // All current EU members are always in
    Object.entries(data.countries || {}).forEach(([iso, c]) => {
      if (c.eu) joined.add(iso);
    });
    
    // Add countries that join by this year
    Object.entries(accessionTimeline).forEach(([iso, joinYear]) => {
      if (joinYear <= year) joined.add(iso);
    });
    
    return joined;
  }

  // Get accession list for display
  function getAccessionList(year, scenario) {
    if (scenario === 'frag') {
      // Scenario A: candidates advance but no accession ever completes — that
      // is the fragmentation thesis, and it is why the member-state tile
      // correctly stays at 27 for all 25 years. Every milestone here lands
      // later than the same country's actual accession in Scenario B, so
      // "slower" is true rather than just asserted.
      const list = [];
      if (year >= 2032) list.push('Montenegro — final chapters open, entry date unset');
      if (year >= 2036) list.push('Western Balkans — partial alignment, no entry date');
      if (year >= 2040) list.push('Ukraine — talks stalled on reconstruction financing');
      if (year >= 2044) list.push('Moldova — candidate status held, entry deferred indefinitely');
      return list;
    } else {
      // Scenario B: full accession timeline, grouped by year so a year that
      // multiple countries join in (e.g. Iceland + Montenegro) is listed once
      const sortedAccessions = Object.entries(accessionTimeline)
        .filter(([iso, joinYear]) => joinYear <= year)
        .sort((a, b) => a[1] - b[1]);

      const grouped = [];
      sortedAccessions.forEach(([iso, joinYear]) => {
        const country = data.countries[iso];
        if (!country) return;
        const last = grouped[grouped.length - 1];
        if (last && last.year === joinYear) {
          last.names.push(country.name);
        } else {
          grouped.push({ year: joinYear, names: [country.name] });
        }
      });

      return grouped;
    }
  }

  // Update accession timelines
  function updateAccessionTimelines(year) {
    const fragList = document.getElementById('fragAccessionList');
    const fedList = document.getElementById('fedAccessionList');
    const fedYearDisplay = document.getElementById('fedYearDisplay');
    
    if (fragList) {
      const fragAccessions = getAccessionList(year, 'frag');
      fragList.innerHTML = fragAccessions.length > 0 
        ? fragAccessions.map(item => `<li>${item}</li>`).join('')
        : '<li>No new accessions yet</li>';
    }
    
    if (fedList) {
      const fedAccessions = getAccessionList(year, 'fed');
      fedList.innerHTML = fedAccessions.length > 0
        ? fedAccessions.map(g => `<li><span class="year-marker">${g.year}</span>: ${g.names.join(', ')}</li>`).join('')
        : '<li>Starting with EU-27</li>';
    }
    
    if (fedYearDisplay) {
      fedYearDisplay.textContent = year;
    }
    // Scenario A's title used to be hardcoded "2050" while its numbers moved.
    const fragYearDisplay = document.getElementById('fragYearDisplay');
    if (fragYearDisplay) {
      fragYearDisplay.textContent = year;
    }
  }

  // Regenerates the "How the federation population is calculated" note with
  // an exact, year-aware breakdown: every accession country that has
  // actually joined by this year (same accessionTimeline/joinYear <= year
  // filter as getAccessionList()), each with its precise interpolated
  // population — instead of the old rounded, grouped-by-region prose.
  function updateFedPopBreakdown(year){
    const noteEl = document.getElementById('fedPopNote');
    if(!noteEl) return;

    const euCore = Object.values(data.countries)
      .filter(c => c.eu)
      .reduce((sum, c) => sum + interpolatePopulation(c, 'fed', year), 0);

    const joined = Object.entries(accessionTimeline)
      .filter(([iso, joinYear]) => joinYear <= year)
      .sort((a, b) => a[1] - b[1])
      .map(([iso, joinYear]) => {
        const c = data.countries[iso];
        return c ? { year: joinYear, name: c.name, pop: interpolatePopulation(c, 'fed', year) } : null;
      })
      .filter(Boolean);

    const accessionTotal = joined.reduce((sum, j) => sum + j.pop, 0);
    const total = euCore + accessionTotal;
    const accessionCountryCount = Object.keys(accessionTimeline).length;

    const rows = joined.length
      ? joined.map(j => `<li><span class="year-marker">${j.year}</span> — ${j.name}: ${j.pop.toFixed(1)}M</li>`).join('')
      : '<li>No accession countries have joined yet at this year.</li>';

    noteEl.innerHTML = `
      <div><b>How the federation population is calculated — method and sources</b></div>
      <div style="margin-top:6px;">EU-27 core: ${euCore.toFixed(0)}M in ${year} (Eurostat baseline, interpolated to this year). ${joined.length} of the federation's ${accessionCountryCount} accession countries have joined as of ${year}, adding ${accessionTotal.toFixed(1)}M — combined total: ${total.toFixed(1)}M.</div>
      <ol style="margin-top:6px; margin-bottom:6px; padding-left:18px;">${rows}</ol>
      <div style="margin-top:6px;">Primary sources: <a href="https://ec.europa.eu/eurostat/web/population-demography-migration-projections">Eurostat population and projections</a>; <a href="https://population.un.org/wpp/">UN World Population Prospects (WPP)</a>.</div>
    `;
  }

  // ---------- Build SVG for one map ----------
  function buildMap(svgEl, scenario, tooltipEl, detailEl, year){
    svgEl.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';

    const bg = document.createElementNS(ns,'rect');
    bg.setAttribute('x',0); bg.setAttribute('y',0);
    bg.setAttribute('width',W); bg.setAttribute('height',H);
    bg.setAttribute('fill','#0d1118');
    svgEl.appendChild(bg);

    // countries that must never be coloured as federation members
    const FED_EXCLUDE_ISOS = new Set(['RUS','BLR']);

    // Get joined countries for this year (Scenario B only)
    const joinedCountries = scenario === 'fed' ? getJoinedCountries(year) : new Set();

    geo.features.forEach(f => {
      const iso = f.properties.ISO3;
      const country = data.countries[iso];
      const path = document.createElementNS(ns,'path');
      path.setAttribute('d', geometryToPath(f.geometry));
      path.setAttribute('class','country' + ((selectedIso.frag === iso || selectedIso.fed === iso) ? ' selected' : ''));
      path.setAttribute('data-iso', iso);
      // Keyboard + screen-reader access: SVG paths are not focusable or
      // announced by default, so a mouse was previously the only way to reach
      // any country on either map.
      if(country){
        path.setAttribute('tabindex', '0');
        path.setAttribute('role', 'button');
        path.setAttribute('aria-label', country.name);
      } else {
        path.setAttribute('aria-hidden', 'true');
      }

      // default non-member fill (matches legend non-EU swatch)
      let fill = '#23262f';

      // determine whether this ISO should be treated as a federation member
      const isFedMember = country && (country.eu || (country.fedNew && joinedCountries.has(iso))) && !FED_EXCLUDE_ISOS.has(iso);

      if(country){
        const score = blendScore(country, scenario, year);
        if(scenario === 'frag'){
          fill = fragColor(score, country.eu);
        } else {
          fill = isFedMember ? '#7c5cd6' : '#23262f';
        }
      } else {
        // no explicit country data: keep non-member styling (do not auto-colour unknown features purple)
        fill = '#23262f';
      }
      path.setAttribute('fill', fill);
      path.setAttribute('stroke','#0b0e14');
      path.setAttribute('stroke-width','0.5');
      path.setAttribute('stroke-linejoin','round');

      // Re-apply whichever single overlay this map has active, so highlights
      // survive the slider-driven rebuild. One attribute, one rule — the old
      // version stacked three independent attributes that overwrote each
      // other's strokes depending on which ran last.
      applyOverlayToPath(path, svgEl.getAttribute('data-overlay'), scenario, iso, country, year);

      svgEl.appendChild(path);

      if(country){
        path.addEventListener('mouseenter', (e) => showTooltip(tooltipEl, country, e, svgEl, scenario, year));
        path.addEventListener('mousemove', (e) => moveTooltip(tooltipEl, e, svgEl));
        path.addEventListener('mouseleave', () => hideTooltip(tooltipEl));
        path.addEventListener('click', () => toggleCountrySelection(scenario, iso, detailEl));
        // Focus/blur mirror hover so keyboard users get the same tooltip.
        path.addEventListener('focus', (e) => showTooltip(tooltipEl, country, e, svgEl, scenario, year));
        path.addEventListener('blur', () => hideTooltip(tooltipEl));
        path.addEventListener('keydown', (e) => {
          if(e.key === 'Enter' || e.key === ' '){
            e.preventDefault();
            toggleCountrySelection(scenario, iso, detailEl);
          }
        });
      }
    });
  }

  // ---------- Map overlays ----------
  // Exactly ONE overlay can be active per map, stored in a single
  // `data-overlay` attribute on the <svg>: null | 'members' | 's' | 'e' | 'n'.
  // Previously three separate attributes (eu-highlight / fed-highlight /
  // membership-highlight) each rewrote the same path strokes, so whichever
  // ran last silently won and the visible highlight could disagree with which
  // control looked active.

  // Is this country "in" the given overlay, in this scenario, at this year?
  function inOverlay(kind, scenario, iso, country, year){
    if(!country) return false;
    if(kind === 'members'){
      return scenario === 'frag'
        ? !!country.eu
        : !!(country.eu || (country.fedNew && getJoinedCountries(year).has(iso)));
    }
    const m = membershipData[iso];
    const baseline = !!(m && m[kind]);
    if(scenario === 'frag') return baseline;
    // Scenario B: acceding to the federation means joining Schengen, the
    // euro and the common defence framework together — the same rule
    // showDetail() applies to its Schengen/Eurozone/NATO rows. So the three
    // blocs visibly expand with the federation and converge by 2050.
    const isFedMember = !!(country.eu || (country.fedNew && getJoinedCountries(year).has(iso)));
    return isFedMember || baseline;
  }

  function applyOverlayToPath(path, kind, scenario, iso, country, year){
    if(kind && inOverlay(kind, scenario, iso, country, year)){
      path.setAttribute('stroke', scenario === 'fed' ? '#9b7bff' : '#ffcb47');
      path.setAttribute('stroke-width', '1.6');
    } else {
      path.setAttribute('stroke', '#0b0e14');
      path.setAttribute('stroke-width', '0.5');
    }
  }

  // Toggle an overlay on one map. Re-selecting the active one clears it.
  function setOverlay(scenario, kind){
    const svg = document.getElementById(scenario === 'frag' ? 'mapFrag' : 'mapFed');
    if(!svg) return;
    const next = svg.getAttribute('data-overlay') === kind ? null : kind;
    const year = parseInt(document.getElementById('yearSlider').value, 10);

    svg.querySelectorAll('path.country').forEach(p => {
      const iso = p.getAttribute('data-iso');
      applyOverlayToPath(p, next, scenario, iso, data.countries[iso], year);
    });

    if(next) svg.setAttribute('data-overlay', next);
    else svg.removeAttribute('data-overlay');

    syncOverlayControls(scenario, next);
  }

  // Reflect the active overlay on that scenario's own chips only — the chip
  // sets are duplicated per column, so an unscoped query would cross-talk.
  function syncOverlayControls(scenario, kind){
    const section = document.querySelector(scenario === 'frag' ? '.scenario.fragmented' : '.scenario.federal');
    if(!section) return;
    section.querySelectorAll('.chip[data-membership]').forEach(btn => {
      const on = btn.dataset.membership === kind;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function setupMembershipToggles(){
    document.querySelectorAll('.chip[data-membership]').forEach(btn => {
      const section = btn.closest('.scenario');
      const scenario = section && section.classList.contains('federal') ? 'fed' : 'frag';
      btn.addEventListener('click', () => setOverlay(scenario, btn.dataset.membership));
    });
  }

  // Opens exactly one .stat-note at a time — any other open note closes
  // first, so tapping a new info button/stat value never leaves two notes
  // stacked open at once. Shared by setupStatInfoButtons() and the
  // stat-value click handlers below.
  function openStatNote(noteEl){
    if(!noteEl) return;
    const alreadyOpen = noteEl.classList.contains('visible');
    document.querySelectorAll('.stat-note.visible').forEach(n => {
      if(n !== noteEl) n.classList.remove('visible');
    });
    noteEl.classList.toggle('visible', !alreadyOpen);
    document.querySelectorAll('[aria-controls]').forEach(btn => {
      const target = document.getElementById(btn.getAttribute('aria-controls'));
      if(target) btn.setAttribute('aria-expanded', target.classList.contains('visible') ? 'true' : 'false');
    });
  }

  function setupStatValueButtons(){
    const mapToggle = {
      'fragMembers': () => setOverlay('frag', 'members'),
      'fedMembers': () => setOverlay('fed', 'members')
    };

    // Bind to the card only, never to the value as well: the value sits inside
    // the card, so binding both made a click on the number fire the handler
    // twice — toggling on then straight back off, i.e. doing nothing.
    Object.keys(mapToggle).forEach(id => {
      const el = document.getElementById(id);
      if(!el) return;
      const card = el.closest('.stat') || el;
      card.style.cursor = 'pointer';
      card.addEventListener('click', mapToggle[id]);
      // Clickable divs are invisible to keyboard and screen-reader users
      // without an explicit role, a tab stop and key handling.
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.addEventListener('keydown', (e) => {
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); mapToggle[id](); }
      });
    });

    const noteMap = {
      'fragPop':'fragPopNote',
      'fedPop':'fedPopNote',
      'fragGDP':'fragGDPNote',
      'fedGDP':'fedGDPNote',
      'fragAI':'fragAINote',
      'fedAI':'fedAINote',
      'fragHDI':'fragHDINote',
      'fedHDI':'fedHDINote',
      'fragCO2':'fragCO2Note',
      'fedCO2':'fedCO2Note'
    };
    Object.keys(noteMap).forEach(id => {
      const el = document.getElementById(id);
      const note = document.getElementById(noteMap[id]);
      if(el && note){
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => openStatNote(note));
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-controls', noteMap[id]);
        el.addEventListener('keydown', (e) => {
          if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openStatNote(note); }
        });
      }
    });
  }

  // Name only — the sovereignty/integration score is no longer surfaced here.
  // blendScore() still drives the map's fill colour, which the caption explains.
  function showTooltip(tooltipEl, country, e, svgEl, scenario, year){
    tooltipEl.textContent = country.name;
    tooltipEl.style.opacity = '1';
    moveTooltip(tooltipEl, e, svgEl);
  }
  function moveTooltip(tooltipEl, e, svgEl){
    const rect = svgEl.getBoundingClientRect();
    // Focus events carry no pointer coordinates, so fall back to the centre of
    // the focused country — otherwise keyboard users get a tooltip at NaN,NaN.
    let clientX = e.clientX, clientY = e.clientY;
    if(clientX === undefined || clientY === undefined){
      const target = e.target && e.target.getBoundingClientRect
        ? e.target.getBoundingClientRect() : null;
      if(!target) return;
      clientX = target.left + target.width / 2;
      clientY = target.top + target.height / 2;
    }
    tooltipEl.style.left = (clientX - rect.left) + 'px';
    tooltipEl.style.top = (clientY - rect.top) + 'px';
  }
  function hideTooltip(tooltipEl){
    tooltipEl.style.opacity = '0';
  }

  // ---------- Population interpolation ----------
  // pop2026 is the current, real population; popFrag/popFed are 2050
  // endpoints under each scenario. Every year in between is a straight-line
  // interpolation, so the slider always shows a real trajectory rather than
  // a fixed "2050" figure regardless of which year is selected.
  function parsePopulation(value){
    if(!value || typeof value !== 'string') return 0;
    const match = value.match(/([0-9]+(?:\.[0-9]+)?)M/);
    return match ? parseFloat(match[1]) : 0;
  }

  function interpolatePopulation(country, scenario, year){
    const t = Math.max(0, Math.min(1, (year - 2026) / (2050 - 2026)));
    const start = parsePopulation(country.pop2026 || country.popFrag || country.popFed);
    const endValue = scenario === 'frag' ? country.popFrag : country.popFed;
    const end = parsePopulation(endValue || country.pop2026);
    return start + (end - start) * t;
  }

  // GDP-per-capita multipliers (trillions USD per million people), calibrated
  // so the 27 EU members sum to ~$21T at 2026 — the same figure the GDP stat
  // notes cite. The old 0.07 implied $31.5T, 50% above the cited baseline.
  const GDP_MULT_EU = 0.0467;
  const GDP_MULT_NONEU = 0.0267;   // keeps the original 0.04/0.07 ratio

  function formatCountryGDP(country, scenario, year){
    const t = Math.max(0, Math.min(1, (year - 2026) / (2050 - 2026)));
    const pop = interpolatePopulation(country, scenario, year);
    if(!pop) return '—';
    let multiplier = country.eu ? GDP_MULT_EU : GDP_MULT_NONEU;
    if(scenario === 'fed'){
      // Scaled by t so both scenarios agree at 2026 and only diverge going
      // forward — the federal boost used to apply flat, so Germany read 5.9T
      // on one map and 7.6T on the other in a year where every headline tile
      // is identical.
      const boost = country.eu ? 0.0133 : (country.fedNew ? 0.0200 : 0.0100);
      multiplier += boost * t;
    }
    return `${(pop * multiplier).toFixed(1)}T USD`;
  }

  // Per-country HDI, scenario- and year-aware. 2026 is a shared baseline; under
  // fragmentation it barely moves, while federal cohesion funding lifts the
  // lowest-scoring new members hardest (convergence). The HDI stat tiles are
  // computed as the median over each scenario's member set from THIS function,
  // so the headline number and the country cards can never disagree.
  function countryHDI(country, scenario, year){
    const t = Math.max(0, Math.min(1, (year - 2026) / (2050 - 2026)));
    const base = country.eu ? 0.89 : 0.76;
    const score = country.fragScore !== undefined ? country.fragScore : 0.45;
    const hdi2026 = Math.min(0.96, base + (score - 0.4) * 0.2);
    const target = scenario === 'fed'
      ? hdi2026 + (0.96 - hdi2026) * 0.75   // convergence lifts laggards most
      : hdi2026 + 0.010;                    // near-stagnation
    return hdi2026 + (target - hdi2026) * t;
  }

  function formatCountryHDI(country, scenario, year){
    // 2dp to match the tiles — this is model output, not a measured index.
    return countryHDI(country, scenario, year).toFixed(2);
  }

  function median(nums){
    if(!nums.length) return 0;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  // Country-specific GDP/startup-ecosystem narratives, each grounded in a real
  // company's actual capital-markets story: where fragmented EU markets pushed it
  // toward a foreign listing or foreign owner, versus what a genuine single market
  // would change. Modelled on Spotify (Sweden), which listed on the NYSE rather
  // than any EU exchange.
  const COUNTRY_ECONOMY = {
    DEU: { frag: 'Fragmented capital rules mean fintechs like N26 still lean on US and Asian investors for growth capital, often eyeing Nasdaq over Frankfurt.', fed: 'A unified capital market lets German fintechs like N26 raise growth capital and list on a pan-European exchange instead of Nasdaq, keeping the value — and the jobs — at home.' },
    FRA: { frag: 'Without a single EU capital market, AI leader Mistral still competes for funding against Silicon Valley megafunds far larger than anything French or EU investors can match alone.', fed: 'A pooled EU capital market gives AI leader Mistral access to funding rounds on par with Silicon Valley, keeping Europe’s AI champion listed and headquartered on the continent.' },
    ITA: { frag: 'Fragmented markets leave Milan-based Bending Spoons raising most of its growth capital from US private equity rather than European investors.', fed: 'A single EU capital market lets Bending Spoons scale and eventually list on a pan-European exchange, rather than selling further stakes to US private equity.' },
    ESP: { frag: 'Barcelona’s Wallbox, a global EV-charging leader, had to list on the New York Stock Exchange to raise the capital fragmented EU markets couldn’t offer.', fed: 'A unified capital market lets EV-charging leader Wallbox list on a pan-European exchange instead of the NYSE, keeping a homegrown champion listed in Europe.' },
    POL: { frag: 'Polish parcel-locker leader InPost had to list on Euronext Amsterdam rather than Warsaw to reach the deeper pool of capital a fragmented Polish market alone couldn’t offer.', fed: 'A genuine single market lets a champion like InPost list and raise capital anywhere in the federation without Polish ownership and expertise drifting elsewhere.' },
    NLD: { frag: 'Even Adyen, one of Europe’s payments giants, competes for scale against far larger US processors while EU capital stays split across 27 separate markets.', fed: 'Adyen’s Amsterdam listing shows what a unified EU capital market can do — a model the federation extends EU-wide instead of remaining a Dutch exception.' },
    BEL: { frag: 'Brussels-based Collibra still relies mostly on US venture capital and keeps a New York headquarters address to satisfy investors fragmented EU markets can’t provide.', fed: 'A unified capital market lets Collibra raise growth capital in Europe and consolidate around its Brussels roots instead of a New York address.' },
    AUT: { frag: 'Vienna’s Bitpanda still draws most of its growth funding from outside the EU, since fragmented markets can’t match a single pan-European raise.', fed: 'A single EU capital market gives Bitpanda access to funding rounds sized for pan-European scale, anchored in Vienna instead of scattered foreign investors.' },
    SWE: { frag: 'Sweden’s own Spotify had to list on the New York Stock Exchange because no single EU market could match the depth of US capital markets.', fed: 'A unified EU capital market lets a champion like Spotify list on a pan-European exchange instead of Wall Street, keeping value creation inside the federation.' },
    FIN: { frag: 'Helsinki’s delivery champion Wolt ended up being bought by America’s DoorDash, since fragmented EU capital markets couldn’t fund it to stay independent and scale on its own.', fed: 'A single EU capital market could have funded Wolt to scale independently across the federation instead of being absorbed into America’s DoorDash.' },
    DNK: { frag: 'Denmark’s Trustpilot chose to list in London rather than an EU exchange, another homegrown tech champion whose capital and governance now sit outside the bloc.', fed: 'A deep, unified EU capital market gives a champion like Trustpilot a compelling reason to list inside the federation instead of London.' },
    IRL: { frag: 'Stripe, founded by the Irish Collison brothers, is largely funded by Silicon Valley investors and expected to list in the US rather than on any EU exchange.', fed: 'A unified EU capital market could give Irish-founded Stripe a real alternative to a US listing, keeping one of the world’s most valuable startups anchored in the federation.' },
    PRT: { frag: 'Lisbon-founded Talkdesk relocated its headquarters to San Francisco to access the capital fragmented Portuguese and EU markets couldn’t supply.', fed: 'A single EU capital market gives a champion like Talkdesk a reason to keep its headquarters in Lisbon instead of relocating to San Francisco.' },
    GRC: { frag: 'Athens-based Viva Wallet had to sell a major stake to JPMorgan for the capital fragmented Greek and EU markets couldn’t provide on their own.', fed: 'A unified EU capital market lets a champion like Viva Wallet raise growth capital from European investors instead of ceding control to a US banking giant.' },
    CZE: { frag: 'Prague’s Rohlik Group has had to court capital from global funds far beyond Czechia, since no single EU market can fund pan-European grocery-tech scale.', fed: 'A unified EU capital market lets a champion like Rohlik Group raise the scale of capital it needs from within the federation instead of a scattered international investor base.' },
    SVK: { frag: 'Slovakia’s small, fragmented capital market leaves promising ventures like robotics firm Photoneo dependent on foreign investors to scale beyond a niche.', fed: 'A unified EU capital market gives Slovak ventures like Photoneo access to the scale of funding needed to grow into pan-European players.' },
    HUN: { frag: 'Budapest-founded Prezi built its user base worldwide but leaned on US venture capital for growth, since fragmented EU markets couldn’t match the scale on offer.', fed: 'A unified EU capital market gives a champion like Prezi a real EU-based path to scale funding instead of relying primarily on US investors.' },
    ROU: { frag: 'Romania’s own UiPath, a global leader in robotic process automation, chose to list on the New York Stock Exchange rather than any EU market.', fed: 'A unified EU capital market gives a champion like UiPath a genuine alternative to a Wall Street listing, keeping Romanian-born value creation inside the federation.' },
    BGR: { frag: 'Sofia’s Payhawk has had to raise most of its growth capital from UK and US investors, since fragmented EU markets can’t match a single big round.', fed: 'A unified EU capital market lets a champion like Payhawk raise pan-European growth capital instead of relying mainly on UK and US investors.' },
    HRV: { frag: 'Croatia’s EV pioneer Rimac has depended on non-EU capital and strategic stakes from carmakers like Hyundai to fund its ambitions, since domestic and EU markets alone can’t match the scale.', fed: 'A unified EU capital market lets a champion like Rimac raise growth capital from within the federation instead of ceding large strategic stakes to outside carmakers.' },
    SVN: { frag: 'Slovenia’s Talking Tom creator Outfit7 was ultimately sold to a Chinese conglomerate, since fragmented EU capital markets couldn’t offer a comparable exit at home.', fed: 'A unified EU capital market gives a champion like Outfit7 the option of a European exit or listing instead of being sold abroad.' },
    LTU: { frag: 'Vilnius-based Vinted and Nord Security have both had to raise growth capital mostly from outside the Baltics, since no single EU market matches their scale of ambition.', fed: 'A unified EU capital market lets champions like Vinted and Nord Security raise pan-European capital and stay anchored in Vilnius instead of chasing funding abroad.' },
    LVA: { frag: 'Riga’s Printful maintains a parallel US headquarters to satisfy investors, since fragmented EU markets can’t offer the scale of capital it needs alone.', fed: 'A unified EU capital market gives a champion like Printful a reason to consolidate around its Riga roots instead of a parallel US base.' },
    EST: { frag: 'Estonian-founded Wise chose to list on the London Stock Exchange, outside the EU altogether, since no single EU market could offer comparable depth.', fed: 'A unified EU capital market gives an Estonian champion like Wise a real EU-based alternative to a London listing.' },
    LUX: { frag: 'Luxembourg’s fund industry already thrives on cross-border EU capital, but fragmented rules elsewhere in the bloc still cap how large a single pan-European raise can get.', fed: 'A genuine single capital market supercharges Luxembourg’s role as the EU’s fund-domicile hub, letting pan-European raises flow through it at a scale fragmented markets never could.' },
    MLT: { frag: 'Malta’s gaming and fintech firms rely heavily on capital and licensing arrangements outside the bloc, since the island’s market alone is far too small to fund them.', fed: 'A unified EU capital market lets Malta’s gaming and fintech firms raise growth capital from across the federation instead of relying on arrangements outside the bloc.' },
    CYP: { frag: 'Cyprus-based trading platform eToro has pursued a Nasdaq listing rather than any EU exchange, since fragmented markets can’t match the scale on offer.', fed: 'A unified EU capital market gives a champion like eToro a genuine EU-based alternative to a Nasdaq listing.' },
    SRB: { frag: 'Belgrade’s game studio Nordeus sold a majority stake to America’s Take-Two, since Serbia’s market — inside or outside the EU — can’t fund a champion at that scale alone.', fed: 'Joining a unified EU capital market gives Serbian ventures like Nordeus a path to raise growth capital from within the federation instead of selling control abroad.' },
    ALB: { frag: 'Albania’s small, fragmented capital market leaves its growing software-outsourcing sector dependent on foreign clients and capital just to reach regional scale.', fed: 'Joining a unified EU capital market would let Albanian tech ventures raise growth capital from across the federation instead of relying solely on outsourcing contracts.' },
    MNE: { frag: 'Montenegro’s tiny, fragmented capital market offers little beyond tourism financing, leaving its handful of tech ventures dependent on foreign investors to grow.', fed: 'Federal membership connects Montenegro’s ventures to a capital market deep enough to fund growth beyond tourism.' },
    MKD: { frag: 'North Macedonia’s IT outsourcing firms like Seavus depend heavily on foreign clients and capital, since the domestic market alone can’t fund a homegrown champion.', fed: 'Federal membership gives North Macedonia’s IT sector access to EU-wide capital instead of relying mainly on outsourcing contracts.' },
    BIH: { frag: 'Bosnia and Herzegovina’s fragmented internal governance leaves its small tech sector reliant on foreign capital and diaspora investment to grow at all.', fed: 'Federal mediation of internal governance issues opens EU-wide capital to Bosnian tech ventures for the first time at scale.' },
    XKX: { frag: 'Kosovo’s young IT-outsourcing sector depends on diaspora connections and foreign clients, since recognition gaps keep it locked out of deeper EU capital markets.', fed: 'Federal membership resolves recognition issues and connects Kosovo’s young tech sector to EU-wide capital for the first time.' },
    UKR: { frag: 'Ukrainian-founded Grammarly is headquartered in San Francisco and funded almost entirely by US venture capital, since wartime risk and fragmented markets keep EU capital away.', fed: 'Federal membership and reconstruction funding give a champion like Grammarly a real reason to anchor more of its business in a rebuilt, EU-integrated Ukraine.' },
    MDA: { frag: 'Moldova’s small IT-outsourcing sector depends on foreign clients and capital, since accession delays keep it outside deeper EU capital markets.', fed: 'One of the federation’s fastest accessions connects Moldova’s IT sector to EU-wide capital markets for the first time.' },
    GEO: { frag: 'Georgia’s TBC Bank, one of the region’s most advanced fintech players, chose to list in London rather than any EU market, since geopolitical tension keeps EU capital markets at a distance.', fed: 'Federal membership gives a champion like TBC Bank a genuine EU-based alternative to a London listing.' },
    ARM: { frag: 'Armenian-founded PicsArt is headquartered in the US and backed mostly by American investors, since Armenia’s market alone can’t fund a champion at that scale.', fed: 'Federal membership connects Armenian ventures like PicsArt to EU-wide capital instead of relying almost entirely on US investors.' },
    AZE: { frag: 'Azerbaijan’s energy-dominated economy has little diversified tech capital, leaving its small startup scene dependent on foreign investors far beyond the region.', fed: 'Federal membership connects Azerbaijan’s emerging tech ventures to EU-wide capital beyond its energy-dominated economy.' },
    GBR: { frag: 'Britain’s Deliveroo lists in London either way, but a fragmented EU next door offers it little extra reason to reconsider.', fed: 'Re-accession in 2040 folds the City back into the federal capital market, so UK champions like Deliveroo list into the deepest pool of capital in Europe rather than a detached London market.' },
    CHE: { frag: 'Swiss running-shoe unicorn On listed on the New York Stock Exchange rather than any European market, since Switzerland sits outside the EU’s capital pool either way.', fed: 'Joining the federation would give a Swiss champion like On a deep EU capital market as a real alternative to a Wall Street listing.' },
    NOR: { frag: 'Norway’s Kahoot! listed on the Oslo exchange but was ultimately taken private by a Goldman Sachs-led consortium, since neither Norway nor a fragmented EU offered a deeper alternative.', fed: 'Joining the federation connects a Norwegian champion like Kahoot! to a deep pan-European capital market instead of a small domestic exchange.' },
    ISL: { frag: 'Iceland’s CCP Games, creator of EVE Online, sold a majority stake to South Korea’s Pearl Abyss, since Iceland’s tiny market can’t fund a global gaming champion alone.', fed: 'Joining the federation alongside Montenegro connects Icelandic ventures like CCP Games to a capital market deep enough to fund global ambitions without selling control abroad.' },
    TUR: { frag: 'Turkey’s e-commerce giant Trendyol is majority-owned by China’s Alibaba, since frozen EU accession talks leave its market cut off from deeper EU capital.', fed: 'Accession in 2045 opens the federal capital market to Turkish firms, giving a champion like Trendyol a European alternative to Alibaba’s ownership stake.' }
  };

  // ---------- Country selection ----------
  // One selected country per scenario. Clicking the selected country again
  // clears it, so a tap opens the panel and a second tap closes it.
  const selectedIso = { frag: null, fed: null };

  const DETAIL_PLACEHOLDER =
    '<div class="detail-empty">Click any country on the map above to see its outlook under this scenario. Click it again to close.</div>';

  function toggleCountrySelection(scenario, iso, detailEl){
    const year = parseInt(document.getElementById('yearSlider').value, 10);
    if(selectedIso.frag === iso && selectedIso.fed === iso){
      selectedIso.frag = null;
      selectedIso.fed = null;
      document.getElementById('detailFrag').innerHTML = DETAIL_PLACEHOLDER;
      document.getElementById('detailFed').innerHTML = DETAIL_PLACEHOLDER;
      syncSelectedPaths();
      updateShareURL(year, null, null);
      updateShareContext();
      return;
    }
    selectedIso.frag = iso;
    selectedIso.fed = iso;
    showDetail(document.getElementById('detailFrag'), data.countries[iso], 'frag', year, iso);
    showDetail(document.getElementById('detailFed'), data.countries[iso], 'fed', year, iso);
    syncSelectedPaths();
    pulseCountry(iso);
    updateShareURL(year, scenario, iso);
    updateShareContext();
  }

  function syncSelectedPaths(){
    ['mapFrag','mapFed'].forEach(id => {
      document.querySelectorAll(`#${id} path.country`).forEach(p => {
        const iso = p.getAttribute('data-iso');
        p.classList.toggle('selected', iso === selectedIso.frag || iso === selectedIso.fed);
      });
    });
  }

  function pulseCountry(iso){
    ['mapFrag','mapFed'].forEach(id => {
      const path = document.querySelector(`#${id} path[data-iso="${iso}"]`);
      if(path){
        path.classList.remove('pulse');
        void path.offsetWidth;
        path.classList.add('pulse');
      }
    });
  }

  function highlightCountriesFromFeed(countries){
    if(!countries || !countries.length) return;
    const iso = countries[0];
    if(!data.countries[iso]) return;
    selectedIso.frag = iso;
    selectedIso.fed = iso;
    const year = parseInt(document.getElementById('yearSlider').value, 10);
    showDetail(document.getElementById('detailFrag'), data.countries[iso], 'frag', year, iso);
    showDetail(document.getElementById('detailFed'), data.countries[iso], 'fed', year, iso);
    syncSelectedPaths();
    updateShareContext();
    countries.forEach(c => pulseCountry(c));
    document.querySelector('.layout')?.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  // Re-render whichever country is open so the panel tracks the year slider
  // instead of freezing at the year it was clicked in.
  function refreshDetails(year){
    [['frag', 'detailFrag'], ['fed', 'detailFed']].forEach(([scenario, elId]) => {
      const iso = selectedIso[scenario];
      if(!iso) return;
      const el = document.getElementById(elId);
      const country = data.countries[iso];
      if(el && country) showDetail(el, country, scenario, year, iso);
    });
  }

  function showDetail(detailEl, country, scenario, year, iso){
    const note = scenario === 'frag' ? country.fragNote : country.fedNote;
    const pop = Math.round(interpolatePopulation(country, scenario, year) * 10) / 10 + 'M';
    const gdp = formatCountryGDP(country, scenario, year);
    const hdi = formatCountryHDI(country, scenario, year);
    
    // Determine status based on year and scenario
    let statusLine;
    if (scenario === 'fed') {
      const joinedCountries = getJoinedCountries(year);
      if (country.fedNew && joinedCountries.has(iso)) {
        statusLine = 'Federal member state (joined ' + (accessionTimeline[iso] || year) + ')';
      } else if (country.fedNew) {
        statusLine = 'Pre-accession, integrating';
      } else if (country.eu) {
        statusLine = 'EU member state';
      } else {
        statusLine = 'Non-EU country';
      }
    } else {
      statusLine = country.eu ? 'EU member state' : (country.fedNew ? 'EU candidate / accession in progress' : 'Non-EU country');
    }
    
    const unText = 'United Nations member state';
    const economy = COUNTRY_ECONOMY[iso];
    const scenarioImpact = economy
      ? (scenario === 'fed' ? economy.fed : economy.frag)
      : (scenario === 'fed'
          ? 'A unified capital market would let local startups raise growth funding and list in Europe instead of relying on outside capital.'
          : 'Fragmented national markets push local startups toward outside investors and foreign listings instead of EU exchanges.');

    // Get membership status
    let schengenStatus, eurozoneStatus, natoStatus;
    if (scenario === 'fed') {
      const joinedCountries = getJoinedCountries(year);
      const isMember = country.eu || (country.fedNew && joinedCountries.has(iso));
      schengenStatus = isMember ? 'Yes' : 'No';
      eurozoneStatus = isMember ? 'Yes' : 'No';
      natoStatus = isMember ? 'Yes' : 'No';
    } else {
      // For Fragmented scenario, use hardcoded membership data
      const m = membershipData[iso] || {s:false, e:false, n:false};
      schengenStatus = m.s ? 'Yes' : 'No';
      eurozoneStatus = m.e ? 'Yes' : 'No';
      natoStatus = m.n ? 'Yes' : 'No';
    }

    detailEl.innerHTML = `
      <div class="detail-country">${country.name} — ${year}</div>
      <div class="detail-row"><span>Status</span><span>${statusLine}</span></div>
      <div class="detail-row"><span>Projected GDP (${year})</span><span>${gdp}</span></div>
      <div class="detail-row"><span>GDP outlook impact</span><span>${scenarioImpact}</span></div>
      <div class="detail-row"><span>Human Development Index (global)</span><span>${hdi}</span></div>
      <div class="detail-row"><span>UN membership</span><span>${unText}</span></div>
      <div class="detail-row"><span>Population (${year})</span><span>${pop || '—'}</span></div>
      <div class="detail-row"><span>Schengen Zone</span><span>${schengenStatus}</span></div>
      <div class="detail-row"><span>Eurozone</span><span>${eurozoneStatus}</span></div>
      <div class="detail-row"><span>NATO member</span><span>${natoStatus}</span></div>
      <div class="detail-note">${note || ''}</div>
      <button type="button" class="compare-btn" data-compare-iso="${iso}" data-compare-scenario="${scenario}" aria-expanded="false">
        Compare with the other scenario
      </button>
      <div class="detail-compare" id="compare-${scenario}-${iso}" hidden></div>
    `;

    const btn = detailEl.querySelector('.compare-btn');
    if(btn) btn.addEventListener('click', () => toggleCompare(detailEl, country, scenario, year, iso));
  }

  // Both scenarios' narratives for a country already exist in the data; until
  // now only the one for the map you clicked was ever shown.
  function toggleCompare(detailEl, country, scenario, year, iso){
    const box = detailEl.querySelector('.detail-compare');
    const btn = detailEl.querySelector('.compare-btn');
    if(!box || !btn) return;
    if(!box.hidden){
      box.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = 'Compare with the other scenario';
      return;
    }
    const other = scenario === 'frag' ? 'fed' : 'frag';
    const economy = COUNTRY_ECONOMY[iso];
    const row = (label, a, b) => `
      <div class="compare-row">
        <div class="compare-label">${label}</div>
        <div class="compare-cells">
          <div class="compare-cell frag"><span class="compare-tag">A</span>${a}</div>
          <div class="compare-cell fed"><span class="compare-tag">B</span>${b}</div>
        </div>
      </div>`;
    const val = (sc) => ({
      pop: Math.round(interpolatePopulation(country, sc, year) * 10) / 10 + 'M',
      gdp: formatCountryGDP(country, sc, year),
      hdi: formatCountryHDI(country, sc, year),
      story: economy ? economy[sc] : (country[sc === 'fed' ? 'fedNote' : 'fragNote'] || '—')
    });
    const A = val('frag'), B = val('fed');
    box.innerHTML =
      row(`Population (${year})`, A.pop, B.pop) +
      row(`Projected GDP (${year})`, A.gdp, B.gdp) +
      row('Human Development Index', A.hdi, B.hdi) +
      row('Economic outlook', A.story, B.story);
    box.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    btn.textContent = 'Hide comparison';
  }

  // ---------- Stats ----------
  function countCountries(year){
    const entries = Object.entries(data.countries || {});
    const FED_EXCLUDE_ISOS = new Set(['RUS','BLR']);
    const euMembers = entries.filter(([iso, c]) => c.eu).map(([iso,c]) => c);
    const joinedCountries = getJoinedCountries(year);
    const fedMembers = entries
      .filter(([iso, c]) => (c.eu || (c.fedNew && joinedCountries.has(iso))) && !FED_EXCLUDE_ISOS.has(iso))
      .map(([iso,c]) => c);

    const fragPop = euMembers.reduce((sum, c) => sum + interpolatePopulation(c, 'frag', year), 0);
    const fedPop = fedMembers.reduce((sum, c) => sum + interpolatePopulation(c, 'fed', year), 0);

    return {
      euCount: euMembers.length,
      fedCount: fedMembers.length,
      fragPop,
      fedPop,
      // Medians over each scenario's own member set, from the same
      // countryHDI() the detail cards use — so the tile can never contradict
      // the countries it is a median of.
      fragHDI: median(euMembers.map(c => countryHDI(c, 'frag', year))),
      fedHDI: median(fedMembers.map(c => countryHDI(c, 'fed', year)))
    };
  }

  function updateStats(year){
    const t = Math.max(0, Math.min(1, (year - 2026) / (2050 - 2026)));
    const counts = countCountries(year);

    // GDP market share: 2026 baseline is 18% — the EU-27's actual current
    // share of nominal world GDP (IMF/World Bank, ~$21T of ~$118T world GDP).
    // Scenario A (fragmented): declines to 10% as EU loses competitive power
    // Scenario B (federal): grows to 19% — enlargement mechanically grows the
    // economic base (population 450M->721M) and coordinated reindustrialization
    // (Chips Act, Net-Zero Industry Act) lets the EU's share actually grow
    // rather than just hold steady, still short of the US, not EU dominance
    const fragGDPStart = 18, fragGDPEnd = 10;
    const fedGDPStart = 18, fedGDPEnd = 19;

    // AI market share: 2026 baseline ~10% (EU, fragmented by national regulation)
    // Scenario A (fragmented): falls to 6% as US/China consolidate dominance
    // Scenario B (federal): grows to 22% — unified regulation plus the same
    // reshored semiconductor capacity behind the GDP gains let European AI
    // compete on hardware, not just software, at global scale
    const fragAIStart = 10, fragAIEnd = 6;
    const fedAIStart = 10, fedAIEnd = 22;

    // Median HDI is no longer a hardcoded pair of endpoints — it is computed
    // in countCountries() as the median of countryHDI() over each scenario's
    // actual member set, so the tile and the country cards share one source.

    // CO2 emissions, Mt/year — 2026 baseline ~2,800 Mt (EEA net GHG estimate).
    // Scenario A (fragmented): policy patchwork falls short of the EU's own
    // climate-neutrality law, landing around 1,100 Mt (roughly -60%) by 2050.
    // Scenario B (federal): coordinated Green Deal delivery hits net zero,
    // matching the EU's legally binding 2050 climate-neutrality target.
    const fragCO2Start = 2800, fragCO2End = 1100;
    const fedCO2Start = 2800, fedCO2End = 0;

    // Model output, not measurement: round to a precision the assumptions can
    // actually support. Population to the nearest 5M, HDI to 2dp — showing
    // "721M" and "0.945" implied a confidence this model does not have.
    const round5 = n => Math.round(n / 5) * 5;
    document.getElementById('fragPop').textContent = '~' + round5(counts.fragPop) + 'M';
    document.getElementById('fedPop').textContent = '~' + round5(counts.fedPop) + 'M';
    document.getElementById('fragMembers').textContent = counts.euCount;
    document.getElementById('fedMembers').textContent = counts.fedCount;
    // GDP is shown to one decimal: the federal path only spans 18->19, so
    // whole-number rounding made it sit on 18% for twelve years and then jump
    // once, which reads like a broken control next to the other tiles.
    document.getElementById('fragGDP').textContent = '~' + (fragGDPStart + (fragGDPEnd-fragGDPStart)*t).toFixed(1) + '%';
    document.getElementById('fedGDP').textContent = '~' + (fedGDPStart + (fedGDPEnd-fedGDPStart)*t).toFixed(1) + '%';
    document.getElementById('fragAI').textContent = '~' + Math.round(fragAIStart + (fragAIEnd-fragAIStart)*t) + '%';
    document.getElementById('fedAI').textContent = '~' + Math.round(fedAIStart + (fedAIEnd-fedAIStart)*t) + '%';
    document.getElementById('fragHDI').textContent = counts.fragHDI.toFixed(2);
    document.getElementById('fedHDI').textContent = counts.fedHDI.toFixed(2);
    const fragCO2El = document.getElementById('fragCO2');
    const fedCO2El = document.getElementById('fedCO2');
    const co2 = (v) => (v === 0 ? '0' : '~' + (Math.round(v / 50) * 50).toLocaleString());
    if(fragCO2El) fragCO2El.textContent = co2(fragCO2Start + (fragCO2End-fragCO2Start)*t) + ' Mt';
    if(fedCO2El) fedCO2El.textContent = co2(fedCO2Start + (fedCO2End-fedCO2Start)*t) + ' Mt';
  }

  function setupStatInfoButtons(){
    document.querySelectorAll('.stat-info').forEach(button => {
      button.addEventListener('click', () => {
        const target = document.getElementById(button.dataset.target);
        const url = button.dataset.url;
        if(target){
          openStatNote(target);
        }
        if(url){
          window.open(url, '_blank', 'noopener');
        }
      });
    });
  }

  // ---------- News feed ----------
  let feedData = data.feed || [];
  let feedUpdated = data.feedUpdated || '';
  let feedMomentum = null;
  let activeFeedIndex = -1;

  // News items are sorted most-recent-first, so the first FEED_VISIBLE_COUNT
  // correspond to the last few days; the rest stay collapsed behind "See more".
  const FEED_VISIBLE_COUNT = 3;

  function buildFeed(){
    const list = document.getElementById('feedList');
    list.innerHTML = '';
    list.classList.remove('feed-expanded');
    feedData.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'feed-item' + (i >= FEED_VISIBLE_COUNT ? ' feed-older' : '') + (i === activeFeedIndex ? ' feed-active' : '');
      row.innerHTML = `
        <div class="feed-date">${item.date || ('Signal ' + (i + 1))}</div>
        <div class="feed-body">
          <div class="feed-headline">${item.headline}</div>
          ${item.source ? `<div class="feed-source">${item.url
            ? `<a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.source}</a>`
            : item.source}</div>` : ''}
          <div class="feed-ai"><span class="label">What it would mean</span>${item.ai}</div>
        </div>
        <div class="feed-impact">
          <span class="impact-pill frag">A: ${item.frag}</span>
          <span class="impact-pill fed">B: ${item.fed}</span>
        </div>
      `;
      row.style.cursor = 'pointer';
      // The source credit is a real outbound link; clicking it should open the
      // article, not also fire the row's country-highlight handler.
      row.querySelector('.feed-source a')?.addEventListener('click', e => e.stopPropagation());
      row.addEventListener('click', () => {
        activeFeedIndex = i;
        buildFeed();
        if(item.countries && item.countries.length) highlightCountriesFromFeed(item.countries);
      });
      list.appendChild(row);
    });

    const seeMoreBtn = document.getElementById('feedSeeMore');
    if(seeMoreBtn){
      seeMoreBtn.style.display = feedData.length > FEED_VISIBLE_COUNT ? '' : 'none';
      seeMoreBtn.textContent = 'See more';
      seeMoreBtn.setAttribute('aria-expanded', 'false');
    }
  }

  function computeMomentumFromFeed(items){
    const totals = items.reduce((acc, item) => {
      acc.frag += item.fragWeight !== undefined ? item.fragWeight : 0;
      acc.fed += item.fedWeight !== undefined ? item.fedWeight : 0;
      return acc;
    }, { frag: 0, fed: 0 });
    const total = Math.max(1, Math.abs(totals.frag) + Math.abs(totals.fed));
    return {
      fragTotal: totals.frag,
      fedTotal: totals.fed,
      fragPct: Math.round((Math.max(0, totals.frag) / total) * 100),
      fedPct: Math.round((Math.max(0, totals.fed) / total) * 100)
    };
  }

  function updateMomentum(momentum){
    const computed = momentum || computeMomentumFromFeed(feedData);
    const fragEl = document.getElementById('momentumFrag');
    const fedEl = document.getElementById('momentumFed');
    const fragVal = document.getElementById('momentumFragVal');
    const fedVal = document.getElementById('momentumFedVal');
    const total = Math.max(1, (computed.fragPct || 0) + (computed.fedPct || 0));
    const fragPct = computed.fragPct !== undefined ? computed.fragPct : 50;
    const fedPct = computed.fedPct !== undefined ? computed.fedPct : 50;
    if(fragEl) fragEl.style.width = Math.round((fragPct / total) * 100) + '%';
    if(fedEl) fedEl.style.width = Math.round((fedPct / total) * 100) + '%';
    if(fragVal) fragVal.textContent = (computed.fragTotal >= 0 ? '+' : '') + computed.fragTotal;
    if(fedVal) fedVal.textContent = (computed.fedTotal >= 0 ? '+' : '') + computed.fedTotal;
  }

  function updateFeedMeta(){
    const updatedEl = document.getElementById('feedUpdated');
    const countEl = document.getElementById('feedStoryCount');
    if(updatedEl){
      const today = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
      updatedEl.textContent = feedUpdated === today ? 'Today' : (feedUpdated || 'Unknown');
    }
    if(countEl) countEl.textContent = feedData.length;
  }

  function setupFeedSeeMore(){
    const btn = document.getElementById('feedSeeMore');
    const list = document.getElementById('feedList');
    if(!btn || !list) return;
    btn.addEventListener('click', () => {
      const expanded = list.classList.toggle('feed-expanded');
      btn.textContent = expanded ? 'See less' : 'See more';
      btn.setAttribute('aria-expanded', String(expanded));
    });
  }

  function showShareToast(message){
    let toast = document.getElementById('shareToast');
    if(!toast){
      toast = document.createElement('div');
      toast.id = 'shareToast';
      toast.className = 'share-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
  }

  // The share text names what the reader is actually looking at — the year on
  // the slider and any country they have opened — so a shared link arrives with
  // a reason to click rather than a bare title.
  function buildShareText(){
    const slider = document.getElementById('yearSlider');
    const year = slider ? parseInt(slider.value, 10) : 2050;
    const iso = selectedIso.frag || selectedIso.fed;
    const country = iso && data.countries[iso] ? data.countries[iso] : null;
    if(country){
      return `${country.name} in ${year}: two futures for Europe side by side — a fragmented Union against a federal one. EU2050`;
    }
    if(year === 2050){
      return 'Europe in 2050, two ways: a fragmented Union of 27 against a federation of 43. Compare them side by side — EU2050';
    }
    return `Europe in ${year}: a fragmented Union against a federal one, compared side by side — EU2050`;
  }

  // Keep the share section describing the current view, so the invitation stays
  // specific as the reader moves the slider or opens a country.
  function updateShareContext(){
    const el = document.getElementById('shareContext');
    if(!el) return;
    const slider = document.getElementById('yearSlider');
    const year = slider ? parseInt(slider.value, 10) : 2050;
    const iso = selectedIso.frag || selectedIso.fed;
    const country = iso && data.countries[iso] ? data.countries[iso] : null;
    el.textContent = country
      ? `Your link carries ${year} on the slider with ${country.name} open, so whoever you send it to lands on exactly this comparison.`
      : `Your link carries ${year} on the slider, so whoever you send it to lands on exactly this view. Open a country first and it travels with the link too.`;
  }

  function setupSocialShare(){
    const buttons = document.querySelectorAll('[data-share]');
    if(!buttons.length) return;
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.share;
        const pageUrl = window.location.href;
        const url = encodeURIComponent(pageUrl);
        const shareText = buildShareText();
        const text = encodeURIComponent(shareText);
        if(type === 'x'){
          window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank', 'noopener');
        } else if(type === 'linkedin'){
          window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank', 'noopener');
        } else if(type === 'bluesky'){
          window.open(`https://bsky.app/intent/compose?text=${text}%20${url}`, '_blank', 'noopener');
        } else if(type === 'copy'){
          copyLink(pageUrl, btn);
        } else if(type === 'native'){
          if(navigator.share){
            navigator.share({ title: document.title, text: shareText, url: pageUrl }).catch(() => {});
          } else {
            copyLink(pageUrl, null);
          }
        }
      });
    });
    updateShareContext();
  }

  // clipboard.writeText is unavailable on insecure origins and in some
  // in-app browsers, so fall back to a hidden textarea + execCommand rather
  // than leaving the button silently dead.
  function copyLink(pageUrl, btn){
    const done = () => {
      showShareToast('Link copied — it opens on this exact view');
      if(btn){
        const label = btn.querySelector('span');
        const original = label ? label.textContent : null;
        btn.classList.add('copied');
        if(label) label.textContent = 'Copied';
        clearTimeout(btn._copyTimer);
        btn._copyTimer = setTimeout(() => {
          btn.classList.remove('copied');
          if(label && original) label.textContent = original;
        }, 2000);
      }
    };
    if(navigator.clipboard && window.isSecureContext){
      navigator.clipboard.writeText(pageUrl).then(done).catch(() => legacyCopy(pageUrl, done));
    } else {
      legacyCopy(pageUrl, done);
    }
  }

  function legacyCopy(textToCopy, done){
    const ta = document.createElement('textarea');
    ta.value = textToCopy;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch(e) { ok = false; }
    document.body.removeChild(ta);
    if(ok) done();
    else showShareToast('Copy the address bar to share this view');
  }

  // Topic-aware classifier used only for headlines pulled from a live RSS feed
  // (the curated NEWS_POOL below covers the far more common generated-feed path
  // with hand-written, story-specific interpretations instead of this fallback).
  const NEWS_POOL = [
    {
      headline: 'EU Commission unveils AI liability and certification roadmap',
      ai: 'The Commission sets common rules for AI liability and certification, but enforcement powers stay with national regulators for now.',
      frag: 'National regulators keep enforcement power, so AI oversight stays a patchwork despite the common roadmap.',
      fed: 'Lays the technical groundwork for the single federal AI governance regime Scenario B assumes by 2050.'
    },
    {
      headline: 'European Parliament backs stronger carbon border levy on steel and chemicals',
      ai: 'MEPs vote to tighten the carbon border adjustment mechanism, raising costs for high-carbon imports and trading partners alike.',
      frag: 'Raises trade friction that a fragmented, unanimity-bound EU is poorly placed to manage collectively.',
      fed: 'Aligns external carbon pricing with the federal green-industrial strategy, a concrete step toward the unified market.'
    },
    {
      headline: 'EU foreign ministers approve joint connectivity package for the Western Balkans',
      ai: 'Ministers agree funding and regulatory alignment for cross-border energy and data corridors with candidate states.',
      frag: 'Funding is agreed centrally but rollout still depends on separate national implementation plans.',
      fed: 'Accelerates the federation’s eastern enlargement and infrastructure integration track.'
    },
    {
      headline: 'Council split over migration and energy solidarity ahead of summer peak',
      ai: 'Member states remain divided over mandatory burden-sharing on migration and fast-track renewable power sharing.',
      frag: 'A textbook case of the coordination gaps that keep crisis response stuck at the national level.',
      fed: 'Strengthens the argument for a binding federal emergency energy and asylum framework.'
    },
    {
      headline: 'Council fails to agree a unified chip-export control list',
      ai: 'Member states retain national vetoes over semiconductor export rules, blocking a common EU position on technology controls.',
      frag: 'Keeps chip-export policy fragmented across 27 capitals, reinforcing external dependence on US and Chinese supply chains.',
      fed: 'Sets back the digital-sovereignty timeline the federal scenario relies on for a joint EU chip strategy.'
    },
    {
      headline: 'European Commission publishes new Capital Markets Union roadmap',
      ai: 'A fresh roadmap proposes common rules for cross-border securities settlement to unlock pooled investment for green and tech industry by 2030.',
      frag: 'Only a modest near-term effect if national implementation stalls, as it has with previous CMU roadmaps.',
      fed: 'A concrete, incremental step toward the unified capital market that underpins the federal economic model.'
    },
    {
      headline: 'Western Balkans summit reaffirms 2030 accession ambition',
      ai: 'Leaders restate a target of opening final accession chapters with Montenegro and Albania, flagging rule-of-law gaps still unresolved elsewhere.',
      frag: 'Enlargement stays uneven and slow, with individual candidates progressing at very different speeds.',
      fed: 'Keeps the Balkans accession track alive and on schedule for the federation’s enlarged 2050 membership.'
    },
    {
      headline: 'EU and US extend tech standards dialogue without a binding agreement',
      ai: 'Talks on AI and data governance continue without a binding transatlantic framework, leaving the EU reliant on US cloud and AI infrastructure for now.',
      frag: 'Confirms continued EU dependency on foreign cloud and AI infrastructure with no near-term fix in sight.',
      fed: 'No immediate change, but adds urgency to the domestic federal push for EU-owned compute and cloud capacity.'
    },
    {
      headline: 'Ukraine accession talks: energy chapter provisionally closed',
      ai: 'Negotiators provisionally close the energy chapter of Ukraine’s accession talks, citing progress on grid synchronisation with the EU network.',
      frag: 'Accession progress remains partial and still dependent on external reconstruction funding.',
      fed: 'Concrete, chapter-by-chapter progress toward Ukraine’s full federal membership by the mid-2030s.'
    },
    {
      headline: 'Hungary blocks joint EU statement on foreign policy coordination',
      ai: 'A single member state veto again prevents a unified EU position, underlining the limits of unanimity-based foreign policy.',
      frag: 'Another veto shows exactly why unanimity rules keep the Union unable to act with one voice.',
      fed: 'Strengthens the case for the qualified-majority reform central to how the federation makes decisions.'
    },
    {
      headline: 'Iceland sets date for EU accession referendum as Montenegro nears final chapters',
      ai: 'Reykjavik confirms a referendum timeline on EU membership, while Montenegro closes its remaining accession chapters in parallel.',
      frag: 'Two fast-moving candidates still accede on separate national timetables rather than as a coordinated bloc.',
      fed: 'Puts Iceland on track to join the federation alongside Montenegro as one of its earliest new members.'
    },
    {
      headline: 'European Central Bank warns on fragmented national banking supervision',
      ai: 'The ECB flags gaps in cross-border bank resolution powers that leave the eurozone exposed in a future banking crisis.',
      frag: 'Confirms the banking union remains incomplete, leaving systemic risk managed unevenly across member states.',
      fed: 'Adds pressure for the full federal banking union — common deposit insurance included — that Scenario B assumes.'
    },
    {
      headline: 'Germany and France clash over joint EU defence procurement fund',
      ai: 'Berlin and Paris disagree over how much of a proposed defence fund must be spent on EU-made equipment.',
      frag: 'A Franco-German rift on defence spending rules illustrates how far EU defence integration still has to go.',
      fed: 'The dispute itself signals how central pooled defence procurement has become to the federal integration agenda.'
    },
    {
      headline: 'EU agrees interim rules on Ukrainian grain imports after farmer protests',
      ai: 'Brussels brokers a temporary compromise on grain import quotas after protests from farmers in frontline member states.',
      frag: 'A patchwork compromise papers over a dispute that national agriculture ministries will keep relitigating.',
      fed: 'Highlights exactly the kind of national friction a common federal agricultural and trade policy is designed to remove.'
    },
    {
      headline: 'Commission proposes joint EU cloud and AI compute initiative',
      ai: 'A new proposal would pool public investment to build EU-owned cloud and AI compute capacity, reducing reliance on US hyperscalers.',
      frag: 'Ambitious on paper, but funding and implementation still depend on the same 27 national budget processes.',
      fed: 'A direct building block for the federal AI and cloud sovereignty programme central to Scenario B.'
    },
    {
      headline: 'Poland and Baltic states push for faster EU air-defence integration',
      ai: 'Frontline states call for a joint EU air-defence shield, citing the pace of threats outstripping national procurement.',
      frag: 'Underlines how national procurement timelines are lagging behind the security picture frontline states describe.',
      fed: 'Builds momentum for the pooled EU air-defence capability envisioned under federal defence integration.'
    },
    {
      headline: 'European Parliament calls for faster Schengen expansion to remaining candidates',
      ai: 'MEPs vote to press the Council to fast-track Schengen membership for Bulgaria, Romania and Balkan candidates.',
      frag: 'A parliamentary vote with no binding force on the Council, which still moves at its own uneven pace.',
      fed: 'Consistent with the fuller, faster free-movement area the federal scenario assumes by 2050.'
    },
    {
      headline: 'Spain and Portugal push stalled Iberian energy interconnection back onto EU agenda',
      ai: 'Madrid and Lisbon renew calls for EU funding to finish cross-border grid links that have stalled for over a decade.',
      frag: 'A decade of delay on a single interconnector shows how slowly national infrastructure gaps get closed.',
      fed: 'Exactly the kind of cross-border energy link the unified federal grid is built to deliver at speed.'
    },
    {
      headline: 'EU rule-of-law report flags continued judicial independence concerns',
      ai: 'The Commission’s annual report cites persisting judicial independence concerns in several member states, with limited enforcement traction.',
      frag: 'Enforcement remains toothless without unanimity, letting rule-of-law backsliding continue largely unchecked.',
      fed: 'Adds to the case for binding federal rule-of-law enforcement with real financial and political consequences.'
    },
    {
      headline: 'Commission unveils single EU digital identity wallet rollout timeline',
      ai: 'Brussels sets a phased timeline for member states to issue interoperable digital ID wallets to citizens.',
      frag: 'National rollout speeds already vary widely, risking a fragmented digital ID landscape in practice.',
      fed: 'A working example of the shared digital infrastructure that federal integration is meant to scale EU-wide.'
    },
    {
      headline: 'Moldova closes another accession chapter ahead of schedule',
      ai: 'Chisinau provisionally closes another EU accession chapter, citing reform momentum since candidate status was granted.',
      frag: 'Fast for Moldova alone, but its path still runs independently of the EU’s broader, uneven accession pace.',
      fed: 'One of the federation’s fastest-moving accessions, on track for full membership well before 2050.'
    },
    {
      headline: 'Italy and Greece press for joint EU Mediterranean energy grid',
      ai: 'Rome and Athens propose a shared subsea grid project to move North African renewables into the EU market.',
      frag: 'Depends on bilateral coordination between just two states rather than a bloc-wide grid strategy.',
      fed: 'The kind of cross-border energy project that scales naturally once the federal grid and market are unified.'
    },
    {
      headline: 'European defence ministers agree common munitions stockpile target',
      ai: 'Ministers set a shared minimum munitions stockpile target, though procurement remains a national responsibility.',
      frag: 'A shared target with national procurement behind it — coordination in name more than in practice.',
      fed: 'Sets the numeric benchmark a pooled federal defence-procurement system would be built to meet.'
    },
    {
      headline: 'EU and Western Balkans sign youth mobility and Erasmus+ expansion deal',
      ai: 'The agreement widens Erasmus+ access for students in Albania, Serbia and North Macedonia ahead of eventual accession.',
      frag: 'A goodwill measure that eases ties with candidates without changing the underlying pace of accession.',
      fed: 'Builds the people-to-people integration that typically precedes and reinforces full federal membership.'
    }
  ];

  // Ten items from the curated pool are rotated into the feed each day, so
  // headlines change day to day without resorting to randomly mashed-up templates.
  function generateFreshFeed() {
    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((today - startOfYear) / 86400000);
    const start = dayOfYear % NEWS_POOL.length;

    const feedItems = [];
    for (let i = 0; i < 10; i++) {
      const item = NEWS_POOL[(start + i) % NEWS_POOL.length];
      feedItems.push({
        headline: item.headline,
        ai: item.ai,
        frag: item.frag,
        fed: item.fed
      });
    }

    return feedItems;
  }

  function showEventToast(message){
    const container = document.getElementById('toastContainer');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = 'event-toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  function checkAccessionEvents(prevYear, newYear){
    if(newYear <= prevYear) return;
    Object.entries(accessionTimeline).forEach(([iso, joinYear]) => {
      if(joinYear > prevYear && joinYear <= newYear){
        const country = data.countries[iso];
        if(country){
          showEventToast(`${country.name} joins the federation (${joinYear})`);
          pulseCountry(iso);
        }
      }
    });
  }

  async function loadFeedData(){
    try {
      const resp = await fetch('feed.json?t=' + Date.now());
      if(resp.ok){
        const payload = await resp.json();
        if(Array.isArray(payload.feed) && payload.feed.length){
          feedData = payload.feed;
          feedUpdated = payload.feedUpdated || feedUpdated;
          feedMomentum = payload.momentum || null;
          buildFeed();
          updateFeedMeta();
          updateMomentum(feedMomentum);
          return;
        }
      }
    } catch(e) {
      console.warn('feed.json unavailable, using curated examples:', e.message);
    }
    feedData = generateFreshFeed();
    buildFeed();
    updateFeedMeta();
    updateMomentum();
  }

  function scheduleFeedRefresh(){
    setInterval(loadFeedData, 60 * 60 * 1000);
  }

  // ---------- Init ----------
  let currentYear = 2050;
  let previousYear = 2050;

  // ---------- Shareable / deep-linked state ----------
  // Keeps the URL's query string in sync with the current year and (if any)
  // selected country, so the existing share buttons — which read
  // window.location.href fresh at click time — share the exact view the
  // sender had instead of always the bare homepage. replaceState (not
  // pushState) is used deliberately: a slider drag firing dozens of history
  // entries would break the back button.
  function updateShareURL(year, scenario, iso){
    const params = new URLSearchParams(window.location.search);
    params.set('year', year);
    if(scenario && iso){
      params.set('scenario', scenario);
      params.set('country', iso);
    } else if(scenario === null && iso === null){
      // Explicit deselect — drop the country from the deep link so a shared
      // URL reproduces the cleared panel rather than reopening the old one.
      params.delete('scenario');
      params.delete('country');
    }
    const newUrl = window.location.pathname + '?' + params.toString() + window.location.hash;
    history.replaceState(null, '', newUrl);
  }

  function getInitialStateFromURL(){
    const params = new URLSearchParams(window.location.search);
    let year = parseInt(params.get('year'), 10);
    if(!Number.isFinite(year) || year < 2026 || year > 2050) year = 2050;
    const scenario = params.get('scenario');
    const iso = params.get('country');
    return {
      year,
      scenario: (scenario === 'frag' || scenario === 'fed') ? scenario : null,
      iso: iso || null
    };
  }

  function render(year){
    checkAccessionEvents(currentYear, year);
    previousYear = year;
    currentYear = year;
    buildMap(document.getElementById('mapFrag'), 'frag', document.getElementById('tooltipFrag'), document.getElementById('detailFrag'), year);
    buildMap(document.getElementById('mapFed'), 'fed', document.getElementById('tooltipFed'), document.getElementById('detailFed'), year);
    updateStats(year);
    updateAccessionTimelines(year);
    updateFedPopBreakdown(year);
    refreshDetails(year);
    document.getElementById('yearLabel').textContent = year;
    document.getElementById('yearHint').textContent = year === 2050
      ? 'Showing the full 2050 scenario outcomes'
      : `Interpolated path toward 2050, based on current trajectory`;
    updateShareURL(year);
    updateShareContext();
    document.dispatchEvent(new CustomEvent('eu2050:rendered', { detail: { year } }));
  }

  const slider = document.getElementById('yearSlider');

  // ---------- Autoplay ----------
  let autoplayTimer = null;
  function toggleAutoplay(){
    const btn = document.getElementById('autoplayBtn');
    if(autoplayTimer){
      clearInterval(autoplayTimer);
      autoplayTimer = null;
      btn.textContent = '▶';
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', 'Play years 2026 to 2050');
      return;
    }
    btn.textContent = '⏸';
    btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('aria-label', 'Pause');
    // Already at (or past) the end: restart from 2026 so play always has
    // something to animate, instead of immediately hitting the end and
    // stopping itself on the first tick.
    if(parseInt(slider.value, 10) >= 2050){
      slider.value = 2026;
      render(2026);
    }
    autoplayTimer = setInterval(() => {
      const next = parseInt(slider.value, 10) + 1;
      if(next > 2050){
        toggleAutoplay();
        return;
      }
      slider.value = next;
      render(next);
    }, 350);
  }

  slider.addEventListener('input', () => {
    if(autoplayTimer) toggleAutoplay();
    render(parseInt(slider.value, 10));
  });
  const autoplayBtn = document.getElementById('autoplayBtn');
  if(autoplayBtn) autoplayBtn.addEventListener('click', toggleAutoplay);

  setupStatInfoButtons();
  setupStatValueButtons();
  setupMembershipToggles();
  setupFeedSeeMore();
  setupSocialShare();
  loadFeedData();
  scheduleFeedRefresh();
  loadTheme();

  const initialState = getInitialStateFromURL();
  slider.value = initialState.year;
  render(initialState.year);
  // Restore a deep-linked country selection directly rather than by faking a
  // click — Kosovo has a data record but no geometry, so its path may not
  // exist to click even though the ISO is valid.
  if(initialState.scenario && initialState.iso && data.countries[initialState.iso]){
    const detailEl = document.getElementById(initialState.scenario === 'frag' ? 'detailFrag' : 'detailFed');
    if(detailEl) toggleCountrySelection(initialState.scenario, initialState.iso, detailEl);
  }

  // Make theme toggle available globally
  window.toggleTheme = toggleTheme;

})();
