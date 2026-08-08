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
  function blendScore(country, scenario, year){
    const target = scenario === 'frag' ? country.fragScore : country.fedScore;
    if(target === undefined) return undefined;
    let baseline;
    if(country.fedNew){
      baseline = scenario === 'fed' ? 0.15 : (country.fragScore !== undefined ? country.fragScore * 0.8 : 0.2);
    } else {
      baseline = scenario === 'fed' ? 0.55 : target;
    }
    const t = (year - 2026) / (2050 - 2026);
    return baseline + (target - baseline) * t;
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
      // Scenario A: slower accession
      const list = [];
      if (year >= 2030) list.push('Western Balkans (partial) - 2030+');
      if (year >= 2035) list.push('Ukraine - 2035+');
      if (year >= 2036) list.push('Moldova - 2036+');
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
      path.setAttribute('class','country');
      path.setAttribute('data-iso', iso);

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

      // Apply persistent highlight state if the SVG requests it (keeps highlights across re-renders)
      try {
        if(scenario === 'frag' && svgEl.getAttribute('data-eu-highlight') === '1'){
          if(country && country.eu){
            path.setAttribute('stroke','#ffcb47');
            path.setAttribute('stroke-width','1.6');
            path.setAttribute('fill','#ff7d72');
          } else {
            path.setAttribute('stroke','#0b0e14');
            path.setAttribute('stroke-width','0.5');
          }
        }
        if(scenario === 'fed' && svgEl.getAttribute('data-fed-highlight') === '1'){
          if(country && (country.eu || (country.fedNew && joinedCountries.has(iso)))){
            path.setAttribute('stroke','#7c5cd6');
            path.setAttribute('stroke-width','1.6');
            path.setAttribute('fill','#9b7bff');
          } else {
            path.setAttribute('stroke','#0b0e14');
            path.setAttribute('stroke-width','0.5');
          }
        }
      } catch(e) {}

      svgEl.appendChild(path);

      if(country){
        path.addEventListener('mouseenter', (e) => showTooltip(tooltipEl, country, e, svgEl));
        path.addEventListener('mousemove', (e) => moveTooltip(tooltipEl, e, svgEl));
        path.addEventListener('mouseleave', () => hideTooltip(tooltipEl));
        path.addEventListener('click', () => {
          showDetail(detailEl, country, scenario, year, iso);
          // For fragmented map, also toggle EU internal borders on any country click
          if (scenario === 'frag') {
            toggleEUBordersFragMap();
          }
        });
      }
    });
  }

  // Toggle highlighting of EU member internal borders on the fragmented map
  function toggleEUBordersFragMap(){
    const svg = document.getElementById('mapFrag');
    const active = svg.getAttribute('data-eu-highlight') === '1';
    if(active){
      svg.querySelectorAll('path.country').forEach(p => { p.setAttribute('stroke','#0b0e14'); p.setAttribute('stroke-width','0.5'); });
      svg.setAttribute('data-eu-highlight','0');
      return;
    }
    svg.querySelectorAll('path.country').forEach(p => {
      const iso = p.getAttribute('data-iso');
      const c = data.countries[iso];
      if(c && c.eu){ p.setAttribute('stroke','#ffcb47'); p.setAttribute('stroke-width','1.6'); }
      else { p.setAttribute('stroke','#0b0e14'); p.setAttribute('stroke-width','0.5'); }
    });
    svg.setAttribute('data-eu-highlight','1');
  }

  // Toggle highlighting of federation external borders on the federal map
  function toggleFedBordersFedMap(){
    const svg = document.getElementById('mapFed');
    const active = svg.getAttribute('data-fed-highlight') === '1';
    const year = parseInt(document.getElementById('yearSlider').value, 10);
    const joinedCountries = getJoinedCountries(year);
    
    if(active){
      svg.querySelectorAll('path.country').forEach(p => { p.setAttribute('stroke','#0b0e14'); p.setAttribute('stroke-width','0.5'); });
      svg.setAttribute('data-fed-highlight','0');
      return;
    }
    svg.querySelectorAll('path.country').forEach(p => {
      const iso = p.getAttribute('data-iso');
      const c = data.countries[iso];
      if(c && (c.eu || (c.fedNew && joinedCountries.has(iso)))){
        p.setAttribute('stroke','#7c5cd6'); p.setAttribute('stroke-width','1.6');
      } else {
        p.setAttribute('stroke','#0b0e14'); p.setAttribute('stroke-width','0.5');
      }
    });
    svg.setAttribute('data-fed-highlight','1');
  }

  function setupStatValueButtons(){
    const mapToggle = {
      'fragMembers': toggleEUBordersFragMap,
      'fedMembers': toggleFedBordersFedMap
    };

    Object.keys(mapToggle).forEach(id => {
      const el = document.getElementById(id);
      if(el){
        el.style.cursor = 'pointer';
        el.addEventListener('click', mapToggle[id]);
        const parent = el.closest('.stat');
        if(parent){
          parent.style.cursor = 'pointer';
          parent.addEventListener('click', mapToggle[id]);
        }
      }
    });

    const noteMap = {
      'fragPop':'fragPopNote',
      'fedPop':'fedPopNote',
      'fragGDP':'fragGDPNote',
      'fedGDP':'fedGDPNote',
      'fragAI':'fragAINote',
      'fedAI':'fedAINote'
    };
    Object.keys(noteMap).forEach(id => {
      const el = document.getElementById(id);
      const note = document.getElementById(noteMap[id]);
      if(el && note){ el.style.cursor = 'pointer'; el.addEventListener('click', () => note.classList.toggle('visible')); }
    });
  }

  function showTooltip(tooltipEl, country, e, svgEl){
    tooltipEl.textContent = country.name;
    tooltipEl.style.opacity = '1';
    moveTooltip(tooltipEl, e, svgEl);
  }
  function moveTooltip(tooltipEl, e, svgEl){
    const rect = svgEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    tooltipEl.style.left = x + 'px';
    tooltipEl.style.top = y + 'px';
  }
  function hideTooltip(tooltipEl){
    tooltipEl.style.opacity = '0';
  }

  function formatCountryGDP(country, scenario){
    if(country.gdp2050) return country.gdp2050;
    const pop = parsePopulation(country.popFed || country.popFrag || '0M');
    if(!pop) return '—';
    const baseMultiplier = country.eu ? 0.07 : 0.04;
    let multiplier = baseMultiplier;
    if(scenario === 'fed'){
      const boost = country.eu ? 0.02 : (country.fedNew ? 0.03 : 0.015);
      multiplier += boost;
    }
    return `${(pop * multiplier).toFixed(1)}T USD`;
  }

  function formatCountryHDI(country){
    if(country.hdi2050) return country.hdi2050;
    const base = country.eu ? 0.89 : 0.76;
    const score = country.fragScore !== undefined ? country.fragScore : 0.45;
    const hdi = Math.min(0.96, base + (score - 0.4) * 0.2);
    return hdi.toFixed(2);
  }

  function showDetail(detailEl, country, scenario, year, iso){
    const note = scenario === 'frag' ? country.fragNote : country.fedNote;
    const pop = scenario === 'frag' ? country.popFrag : country.popFed;
    const gdp = formatCountryGDP(country, scenario);
    const hdi = formatCountryHDI(country);
    
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
    const scenarioImpact = scenario === 'fed'
      ? 'Unified exchange and capital market boost fuels job creation, startup funding and unicorn growth.'
      : 'Fragmented national markets limit cross-border capital, slowing startup scaling and unicorn creation.';

    // Membership data lookup (hardcoded for reliability)
    const membershipData = {
      DEU: {s:true, e:true, n:true}, FRA: {s:true, e:true, n:true}, ITA: {s:true, e:true, n:true},
      ESP: {s:true, e:true, n:true}, POL: {s:true, e:false, n:true}, NLD: {s:true, e:true, n:true},
      BEL: {s:true, e:true, n:true}, AUT: {s:true, e:true, n:false}, SWE: {s:true, e:false, n:true},
      FIN: {s:true, e:true, n:true}, DNK: {s:true, e:false, n:true}, IRL: {s:false, e:true, n:false},
      PRT: {s:true, e:true, n:true}, GRC: {s:true, e:true, n:true}, CZE: {s:true, e:false, n:true},
      SVK: {s:true, e:true, n:true}, HUN: {s:true, e:false, n:true}, ROU: {s:true, e:false, n:true},
      BGR: {s:true, e:false, n:true}, HRV: {s:true, e:false, n:true}, SVN: {s:true, e:true, n:true},
      LTU: {s:true, e:true, n:true}, LVA: {s:true, e:true, n:true}, EST: {s:true, e:true, n:true},
      LUX: {s:true, e:true, n:true}, MLT: {s:true, e:true, n:false}, CYP: {s:false, e:true, n:false},
      SRB: {s:false, e:false, n:false}, ALB: {s:false, e:false, n:true}, MNE: {s:false, e:false, n:true},
      MKD: {s:false, e:false, n:true}, BIH: {s:false, e:false, n:false}, XKX: {s:false, e:false, n:false},
      UKR: {s:false, e:false, n:false}, MDA: {s:false, e:false, n:false}, GEO: {s:false, e:false, n:false},
      ARM: {s:false, e:false, n:false}, AZE: {s:false, e:false, n:false},
      GBR: {s:false, e:false, n:true}, CHE: {s:true, e:false, n:false}, NOR: {s:true, e:false, n:true},
      ISL: {s:true, e:false, n:true}, TUR: {s:false, e:false, n:true}
    };

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
      <div class="detail-row"><span>Projected GDP (2050)</span><span>${gdp}</span></div>
      <div class="detail-row"><span>GDP outlook impact</span><span>${scenarioImpact}</span></div>
      <div class="detail-row"><span>Human Development Index (global)</span><span>${hdi}</span></div>
      <div class="detail-row"><span>UN membership</span><span>${unText}</span></div>
      <div class="detail-row"><span>Population (2050 path)</span><span>${pop || '—'}</span></div>
      <div class="detail-row"><span>Schengen Zone</span><span>${schengenStatus}</span></div>
      <div class="detail-row"><span>Eurozone</span><span>${eurozoneStatus}</span></div>
      <div class="detail-row"><span>NATO member</span><span>${natoStatus}</span></div>
      <div class="detail-note">${note || ''}</div>
    `;
  }

  // ---------- Stats ----------
  function parsePopulation(value){
    if(!value || typeof value !== 'string') return 0;
    const match = value.match(/([0-9]+(?:\.[0-9]+)?)M/);
    return match ? parseFloat(match[1]) : 0;
  }

  function countCountries(year, scenario){
    const entries = Object.entries(data.countries || {});
    const FED_EXCLUDE_ISOS = new Set(['RUS','BLR']);
    const euMembers = entries.filter(([iso, c]) => c.eu).map(([iso,c]) => c);
    
    if (scenario === 'fed') {
      // For federal scenario, count EU members + joined countries
      const joinedCountries = getJoinedCountries(year);
      const fedMembers = entries.filter(([iso, c]) => (c.eu || (c.fedNew && joinedCountries.has(iso))) && !FED_EXCLUDE_ISOS.has(iso)).map(([iso,c]) => c);
      
      const fragPop = euMembers.reduce((sum, c) => sum + parsePopulation(c.popFrag), 0);
      const fedPop = fedMembers.reduce((sum, c) => sum + parsePopulation(c.popFed), 0);
      return {
        euCount: euMembers.length,
        fedCount: fedMembers.length,
        fragPop,
        fedPop
      };
    } else {
      // For fragmented scenario, use original logic
      const fragPop = euMembers.reduce((sum, c) => sum + parsePopulation(c.popFrag), 0);
      const fedPop = entries.filter(([iso, c]) => (c.eu || c.fedNew) && !FED_EXCLUDE_ISOS.has(iso)).reduce((sum, c) => sum + parsePopulation(c.popFed), 0);
      return {
        euCount: euMembers.length,
        fedCount: 43,
        fragPop,
        fedPop
      };
    }
  }

  function updateStats(year){
    const t = (year - 2026) / (2050 - 2026);
    const counts = countCountries(year, 'fed');
    const countsFrag = countCountries(year, 'frag');

    // GDP market share: Fragmented starts at 7%, Federal at 18%
    const fragGDPStart = 15, fragGDPEnd = 7;
    const fedGDPStart = 15, fedGDPEnd = 18;
    
    // AI market share: Fragmented starts at 11%, Federal at 15%
    const fragAIStart = 11, fragAIEnd = 9;
    const fedAIStart = 15, fedAIEnd = 28;

    document.getElementById('fragPop').textContent = Math.round(countsFrag.fragPop) + 'M';
    document.getElementById('fedPop').textContent = Math.round(counts.fedPop) + 'M';
    document.getElementById('fragMembers').textContent = countsFrag.euCount;
    document.getElementById('fedMembers').textContent = counts.fedCount;
    document.getElementById('fragGDP').textContent = Math.round(fragGDPStart + (fragGDPEnd-fragGDPStart)*t) + '%';
    document.getElementById('fedGDP').textContent = Math.round(fedGDPStart + (fedGDPEnd-fedGDPStart)*t) + '%';
    document.getElementById('fragAI').textContent = Math.round(fragAIStart + (fragAIEnd-fragAIStart)*t) + '%';
    document.getElementById('fedAI').textContent = Math.round(fedAIStart + (fedAIEnd-fedAIStart)*t) + '%';
  }

  function setupStatInfoButtons(){
    document.querySelectorAll('.stat-info').forEach(button => {
      button.addEventListener('click', () => {
        const target = document.getElementById(button.dataset.target);
        const url = button.dataset.url;
        if(target){
          target.classList.toggle('visible');
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

  function updateFeedMeta(){
    const updatedEl = document.getElementById('feedUpdated');
    if(updatedEl){
      const today = new Date();
      const todayStr = today.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
      if(feedUpdated === todayStr) feedUpdated = 'Today';
      updatedEl.textContent = feedUpdated || 'Unknown';
    }
  }

  function buildFeed(){
    const list = document.getElementById('feedList');
    list.innerHTML = '';
    feedData.forEach(item => {
      const row = document.createElement('div');
      row.className = 'feed-item';
      row.innerHTML = `
        <div class="feed-date">${item.date}</div>
        <div class="feed-body">
          <div class="feed-headline">${item.headline}</div>
          <div class="feed-source">${item.source || 'EU policy wire'}</div>
          <div class="feed-ai"><span class="label">AI read</span>${item.ai}</div>
        </div>
        <div class="feed-impact">
          <span class="impact-pill frag">A: ${item.frag}</span>
          <span class="impact-pill fed">B: ${item.fed}</span>
        </div>
      `;
      list.appendChild(row);
    });
  }

  // Topic-aware classifier used only for headlines pulled from a live RSS feed
  // (the curated NEWS_POOL below covers the far more common generated-feed path
  // with hand-written, story-specific interpretations instead of this fallback).
  function classifyNewsHeadline(title){
    const lower = title.toLowerCase();
    const topics = [
      { test: /\bai\b|artificial intelligence|algorithm|chip|semiconductor/, frag:'Fragmented national AI/chip rules keep the EU reliant on US and Chinese platforms.', fed:'Feeds a common EU AI and semiconductor policy, a pillar of the federal tech-sovereignty push.' },
      { test: /defen[cs]e|military|nato|army|troops/, frag:'National defence budgets and procurement stay separate, limiting EU-wide capability.', fed:'Strengthens the case for pooled federal defence spending and joint procurement.' },
      { test: /migra|asylum|border/, frag:'Migration policy remains a national flashpoint, exposing the limits of voluntary coordination.', fed:'Builds pressure for a binding federal asylum and border framework.' },
      { test: /energy|grid|gas|renewable|nuclear/, frag:'Energy policy stays largely national, slowing cross-border grid integration.', fed:'Advances the unified federal energy grid and joint procurement that Scenario B depends on.' },
      { test: /enlarg|accession|candidate|balkan|ukraine|moldova|montenegro|iceland|referendum/, frag:'Enlargement inches forward unevenly, with individual states setting their own pace.', fed:'Marks concrete progress on the federation’s enlargement track.' },
      { test: /veto|unanimity|block|stall|dispute|tension|crisis|delay|divid/, frag:'A national veto or standoff again illustrates why unanimity rules keep the Union fragmented.', fed:'Strengthens the case for qualified-majority reform central to the federal model.' },
      { test: /capital market|banking union|bond|securities|investment fund/, frag:'Capital markets stay split along national lines, limiting cross-border investment.', fed:'A direct step toward the unified capital markets union that underpins Scenario B.' },
      { test: /trade|tariff|export|import|customs/, frag:'Trade policy responses remain reactive and nationally fragmented.', fed:'Supports a more unified EU trade posture toward the US and China.' },
      { test: /climate|carbon|emissions|green transition/, frag:'Climate ambition outpaces the fragmented national implementation needed to deliver it.', fed:'Aligns with the federal green-industrial strategy that ties climate and competitiveness together.' },
      { test: /agreement|joint|integrat|union|deal|framework|strategy|package|connected|shared/, frag:'A negotiated compromise, but implementation still depends on 27 separate national follow-throughs.', fed:'Concrete, incremental progress toward the single federal framework Scenario B assumes.' }
    ];
    for(const t of topics){
      if(t.test.test(lower)) return { frag: t.frag, fed: t.fed };
    }
    return {
      frag:'A minor policy development with no clear effect on the fragmentation trajectory.',
      fed:'A minor policy development with no direct bearing on federal integration progress.'
    };
  }

  const RSS_SOURCE_NAMES = {
    'politico.eu': 'Politico Europe',
    'euronews.com': 'Euronews',
    'lemonde.fr': 'Le Monde',
    'bbci.co.uk': 'BBC News',
    'nytimes.com': 'The New York Times',
    'reuters.com': 'Reuters',
    'ft.com': 'Financial Times',
    'dw.com': 'Deutsche Welle'
  };

  function sourceNameFromUrl(url){
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      for(const key of Object.keys(RSS_SOURCE_NAMES)){
        if(host.endsWith(key)) return RSS_SOURCE_NAMES[key];
      }
      return host;
    } catch(e) {
      return 'EU policy wire';
    }
  }

  function parseNewsRss(xmlText, sourceName){
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const items = Array.from(doc.querySelectorAll('item')).slice(0, 6);
    return items.map(item => {
      const title = item.querySelector('title')?.textContent?.trim() || 'Untitled story';
      const desc = item.querySelector('description')?.textContent?.trim() || '';
      const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
      const signal = classifyNewsHeadline(title);
      return {
        date: pubDate.replace(/GMT$/, '').trim(),
        headline: title,
        source: sourceName,
        ai: desc,
        frag: signal.frag,
        fed: signal.fed
      };
    });
  }

  async function fetchRemoteFeed(){
    // Credible EU-focused outlets, tried in order of reliability/CORS-friendliness
    const feedSources = [
      { url: 'https://www.politico.eu/feed/', name: 'Politico Europe' },
      { url: 'https://www.euronews.com/rss?level=theme&name=news', name: 'Euronews' },
      { url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml', name: 'BBC News' },
      { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Europe.xml', name: 'The New York Times' }
    ];

    for (const source of feedSources) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const resp = await fetch(source.url, {
          mode: 'cors',
          signal: controller.signal,
          headers: { 'Accept': 'application/xml' }
        });
        clearTimeout(timeoutId);

        if(resp.ok) {
          const text = await resp.text();
          const items = parseNewsRss(text, source.name);
          if(items.length > 0) return items;
        }
      } catch(e) {
        console.warn('Failed to fetch from', source.url, e.message);
        continue;
      }
    }

    // If all direct fetches fail, try with a proxy as last resort
    try {
      const proxied = { url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml', name: 'BBC News' };
      const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(proxied.url);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if(resp.ok) {
        const text = await resp.text();
        return parseNewsRss(text, proxied.name);
      }
    } catch(e) {
      console.warn('Proxy fetch also failed:', e.message);
    }

    throw new Error('All remote feed sources failed');
  }

  // Curated pool of illustrative EU-policy stories, each attributed to a credible
  // outlet and given a specific, story-grounded read on both 2050 scenarios —
  // deliberately not a generic "mixed signal" placeholder. Ten of these are
  // rotated into the feed each day (see generateFreshFeed below).
  const NEWS_POOL = [
    {
      headline: 'EU Commission unveils AI liability and certification roadmap',
      source: 'Politico Europe',
      ai: 'The Commission sets common rules for AI liability and certification, but enforcement powers stay with national regulators for now.',
      frag: 'National regulators keep enforcement power, so AI oversight stays a patchwork despite the common roadmap.',
      fed: 'Lays the technical groundwork for the single federal AI governance regime Scenario B assumes by 2050.'
    },
    {
      headline: 'European Parliament backs stronger carbon border levy on steel and chemicals',
      source: 'Euronews',
      ai: 'MEPs vote to tighten the carbon border adjustment mechanism, raising costs for high-carbon imports and trading partners alike.',
      frag: 'Raises trade friction that a fragmented, unanimity-bound EU is poorly placed to manage collectively.',
      fed: 'Aligns external carbon pricing with the federal green-industrial strategy, a concrete step toward the unified market.'
    },
    {
      headline: 'EU foreign ministers approve joint connectivity package for the Western Balkans',
      source: 'Politico Europe',
      ai: 'Ministers agree funding and regulatory alignment for cross-border energy and data corridors with candidate states.',
      frag: 'Funding is agreed centrally but rollout still depends on separate national implementation plans.',
      fed: 'Accelerates the federation’s eastern enlargement and infrastructure integration track.'
    },
    {
      headline: 'Council split over migration and energy solidarity ahead of summer peak',
      source: 'Reuters',
      ai: 'Member states remain divided over mandatory burden-sharing on migration and fast-track renewable power sharing.',
      frag: 'A textbook case of the coordination gaps that keep crisis response stuck at the national level.',
      fed: 'Strengthens the argument for a binding federal emergency energy and asylum framework.'
    },
    {
      headline: 'Council fails to agree a unified chip-export control list',
      source: 'Financial Times',
      ai: 'Member states retain national vetoes over semiconductor export rules, blocking a common EU position on technology controls.',
      frag: 'Keeps chip-export policy fragmented across 27 capitals, reinforcing external dependence on US and Chinese supply chains.',
      fed: 'Sets back the digital-sovereignty timeline the federal scenario relies on for a joint EU chip strategy.'
    },
    {
      headline: 'European Commission publishes new Capital Markets Union roadmap',
      source: 'Bloomberg',
      ai: 'A fresh roadmap proposes common rules for cross-border securities settlement to unlock pooled investment for green and tech industry by 2030.',
      frag: 'Only a modest near-term effect if national implementation stalls, as it has with previous CMU roadmaps.',
      fed: 'A concrete, incremental step toward the unified capital market that underpins the federal economic model.'
    },
    {
      headline: 'Western Balkans summit reaffirms 2030 accession ambition',
      source: 'Euronews',
      ai: 'Leaders restate a target of opening final accession chapters with Montenegro and Albania, flagging rule-of-law gaps still unresolved elsewhere.',
      frag: 'Enlargement stays uneven and slow, with individual candidates progressing at very different speeds.',
      fed: 'Keeps the Balkans accession track alive and on schedule for the federation’s enlarged 2050 membership.'
    },
    {
      headline: 'EU and US extend tech standards dialogue without a binding agreement',
      source: 'Reuters',
      ai: 'Talks on AI and data governance continue without a binding transatlantic framework, leaving the EU reliant on US cloud and AI infrastructure for now.',
      frag: 'Confirms continued EU dependency on foreign cloud and AI infrastructure with no near-term fix in sight.',
      fed: 'No immediate change, but adds urgency to the domestic federal push for EU-owned compute and cloud capacity.'
    },
    {
      headline: 'Ukraine accession talks: energy chapter provisionally closed',
      source: 'Politico Europe',
      ai: 'Negotiators provisionally close the energy chapter of Ukraine’s accession talks, citing progress on grid synchronisation with the EU network.',
      frag: 'Accession progress remains partial and still dependent on external reconstruction funding.',
      fed: 'Concrete, chapter-by-chapter progress toward Ukraine’s full federal membership by the mid-2030s.'
    },
    {
      headline: 'Hungary blocks joint EU statement on foreign policy coordination',
      source: 'Politico Europe',
      ai: 'A single member state veto again prevents a unified EU position, underlining the limits of unanimity-based foreign policy.',
      frag: 'Another veto shows exactly why unanimity rules keep the Union unable to act with one voice.',
      fed: 'Strengthens the case for the qualified-majority reform central to how the federation makes decisions.'
    },
    {
      headline: 'Iceland sets date for EU accession referendum as Montenegro nears final chapters',
      source: 'Le Monde',
      ai: 'Reykjavik confirms a referendum timeline on EU membership, while Montenegro closes its remaining accession chapters in parallel.',
      frag: 'Two fast-moving candidates still accede on separate national timetables rather than as a coordinated bloc.',
      fed: 'Puts Iceland on track to join the federation alongside Montenegro as one of its earliest new members.'
    },
    {
      headline: 'European Central Bank warns on fragmented national banking supervision',
      source: 'Financial Times',
      ai: 'The ECB flags gaps in cross-border bank resolution powers that leave the eurozone exposed in a future banking crisis.',
      frag: 'Confirms the banking union remains incomplete, leaving systemic risk managed unevenly across member states.',
      fed: 'Adds pressure for the full federal banking union — common deposit insurance included — that Scenario B assumes.'
    },
    {
      headline: 'Germany and France clash over joint EU defence procurement fund',
      source: 'Politico Europe',
      ai: 'Berlin and Paris disagree over how much of a proposed defence fund must be spent on EU-made equipment.',
      frag: 'A Franco-German rift on defence spending rules illustrates how far EU defence integration still has to go.',
      fed: 'The dispute itself signals how central pooled defence procurement has become to the federal integration agenda.'
    },
    {
      headline: 'EU agrees interim rules on Ukrainian grain imports after farmer protests',
      source: 'Reuters',
      ai: 'Brussels brokers a temporary compromise on grain import quotas after protests from farmers in frontline member states.',
      frag: 'A patchwork compromise papers over a dispute that national agriculture ministries will keep relitigating.',
      fed: 'Highlights exactly the kind of national friction a common federal agricultural and trade policy is designed to remove.'
    },
    {
      headline: 'Commission proposes joint EU cloud and AI compute initiative',
      source: 'Bloomberg',
      ai: 'A new proposal would pool public investment to build EU-owned cloud and AI compute capacity, reducing reliance on US hyperscalers.',
      frag: 'Ambitious on paper, but funding and implementation still depend on the same 27 national budget processes.',
      fed: 'A direct building block for the federal AI and cloud sovereignty programme central to Scenario B.'
    },
    {
      headline: 'Poland and Baltic states push for faster EU air-defence integration',
      source: 'Deutsche Welle',
      ai: 'Frontline states call for a joint EU air-defence shield, citing the pace of threats outstripping national procurement.',
      frag: 'Underlines how national procurement timelines are lagging behind the security picture frontline states describe.',
      fed: 'Builds momentum for the pooled EU air-defence capability envisioned under federal defence integration.'
    },
    {
      headline: 'European Parliament calls for faster Schengen expansion to remaining candidates',
      source: 'Euronews',
      ai: 'MEPs vote to press the Council to fast-track Schengen membership for Bulgaria, Romania and Balkan candidates.',
      frag: 'A parliamentary vote with no binding force on the Council, which still moves at its own uneven pace.',
      fed: 'Consistent with the fuller, faster free-movement area the federal scenario assumes by 2050.'
    },
    {
      headline: 'Spain and Portugal push stalled Iberian energy interconnection back onto EU agenda',
      source: 'Le Monde',
      ai: 'Madrid and Lisbon renew calls for EU funding to finish cross-border grid links that have stalled for over a decade.',
      frag: 'A decade of delay on a single interconnector shows how slowly national infrastructure gaps get closed.',
      fed: 'Exactly the kind of cross-border energy link the unified federal grid is built to deliver at speed.'
    },
    {
      headline: 'EU rule-of-law report flags continued judicial independence concerns',
      source: 'Politico Europe',
      ai: 'The Commission’s annual report cites persisting judicial independence concerns in several member states, with limited enforcement traction.',
      frag: 'Enforcement remains toothless without unanimity, letting rule-of-law backsliding continue largely unchecked.',
      fed: 'Adds to the case for binding federal rule-of-law enforcement with real financial and political consequences.'
    },
    {
      headline: 'Commission unveils single EU digital identity wallet rollout timeline',
      source: 'Euronews',
      ai: 'Brussels sets a phased timeline for member states to issue interoperable digital ID wallets to citizens.',
      frag: 'National rollout speeds already vary widely, risking a fragmented digital ID landscape in practice.',
      fed: 'A working example of the shared digital infrastructure that federal integration is meant to scale EU-wide.'
    },
    {
      headline: 'Moldova closes another accession chapter ahead of schedule',
      source: 'Reuters',
      ai: 'Chisinau provisionally closes another EU accession chapter, citing reform momentum since candidate status was granted.',
      frag: 'Fast for Moldova alone, but its path still runs independently of the EU’s broader, uneven accession pace.',
      fed: 'One of the federation’s fastest-moving accessions, on track for full membership well before 2050.'
    },
    {
      headline: 'Italy and Greece press for joint EU Mediterranean energy grid',
      source: 'Bloomberg',
      ai: 'Rome and Athens propose a shared subsea grid project to move North African renewables into the EU market.',
      frag: 'Depends on bilateral coordination between just two states rather than a bloc-wide grid strategy.',
      fed: 'The kind of cross-border energy project that scales naturally once the federal grid and market are unified.'
    },
    {
      headline: 'European defence ministers agree common munitions stockpile target',
      source: 'Financial Times',
      ai: 'Ministers set a shared minimum munitions stockpile target, though procurement remains a national responsibility.',
      frag: 'A shared target with national procurement behind it — coordination in name more than in practice.',
      fed: 'Sets the numeric benchmark a pooled federal defence-procurement system would be built to meet.'
    },
    {
      headline: 'EU and Western Balkans sign youth mobility and Erasmus+ expansion deal',
      source: 'Euronews',
      ai: 'The agreement widens Erasmus+ access for students in Albania, Serbia and North Macedonia ahead of eventual accession.',
      frag: 'A goodwill measure that eases ties with candidates without changing the underlying pace of accession.',
      fed: 'Builds the people-to-people integration that typically precedes and reinforces full federal membership.'
    }
  ];

  // Ten items from the curated pool are rotated into the feed each day, so
  // headlines change day to day without resorting to randomly mashed-up templates.
  function generateFreshFeed() {
    const today = new Date();
    const dates = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }));
    }

    const startOfYear = new Date(today.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((today - startOfYear) / 86400000);
    const start = dayOfYear % NEWS_POOL.length;

    const feedItems = [];
    for (let i = 0; i < 10; i++) {
      const item = NEWS_POOL[(start + i) % NEWS_POOL.length];
      feedItems.push({
        date: dates[i],
        headline: item.headline,
        source: item.source,
        ai: item.ai,
        frag: item.frag,
        fed: item.fed
      });
    }

    return feedItems;
  }

  async function loadFeedData(){
    let freshFeed = [];
    
    // On GitHub Pages, CORS prevents external fetch, so we prioritize generated content
    // But try remote fetch first as it's more authentic when it works
    try {
      // Only try remote fetch if we're not on GitHub Pages (or if CORS might work)
      // GitHub Pages blocks CORS to most external domains
      if (!window.location.hostname.includes('github.io')) {
        const remote = await fetchRemoteFeed();
        if(Array.isArray(remote) && remote.length){
          freshFeed = remote;
          console.log('Successfully loaded remote feed with', remote.length, 'items');
        }
      }
    } catch (primaryErr) {
      console.warn('Unable to fetch external news feed (expected on GitHub Pages):', primaryErr.message);
    }

    // If we got nothing from remote (or on GitHub Pages), use generated feed
    if(!freshFeed.length) {
      freshFeed = generateFreshFeed();
      console.log('Generated fresh feed with', freshFeed.length, 'items');
    }

    // Use the fresh feed
    feedData = freshFeed;
    
    // Always set feedUpdated to today so it shows as current
    const today = new Date();
    feedUpdated = today.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
    
    buildFeed();
    updateFeedMeta();
  }

  function scheduleFeedRefresh(){
    const oneDay = 24 * 60 * 60 * 1000;
    // Schedule first refresh at next 08:00 local time, then every 24h
    const now = new Date();
    const next = new Date(now);
    next.setHours(8, 0, 0, 0);
    if(next <= now) next.setDate(next.getDate() + 1);
    const initialDelay = next - now;
    setTimeout(() => {
      loadFeedData();
      setInterval(loadFeedData, oneDay);
    }, initialDelay);
  }

  // ---------- Init ----------
  let currentYear = 2050;

  function render(year){
    currentYear = year;
    buildMap(document.getElementById('mapFrag'), 'frag', document.getElementById('tooltipFrag'), document.getElementById('detailFrag'), year);
    buildMap(document.getElementById('mapFed'), 'fed', document.getElementById('tooltipFed'), document.getElementById('detailFed'), year);
    updateStats(year);
    updateAccessionTimelines(year);
    document.getElementById('yearLabel').textContent = year;
    document.getElementById('yearHint').textContent = year === 2050
      ? 'Showing the full 2050 scenario outcomes'
      : `Interpolated path toward 2050, based on current trajectory`;
  }

  const slider = document.getElementById('yearSlider');
  slider.addEventListener('input', () => render(parseInt(slider.value, 10)));

  setupStatInfoButtons();
  setupStatValueButtons();
  loadFeedData();
  scheduleFeedRefresh();
  loadTheme();
  render(2050);

  // Make theme toggle available globally
  window.toggleTheme = toggleTheme;

})();
