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
      const isFedMember = country && (country.eu || country.fedNew) && !FED_EXCLUDE_ISOS.has(iso);

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
      svgEl.appendChild(path);

      if(country){
        path.addEventListener('mouseenter', (e) => showTooltip(tooltipEl, country, e, svgEl));
        path.addEventListener('mousemove', (e) => moveTooltip(tooltipEl, e, svgEl));
        path.addEventListener('mouseleave', () => hideTooltip(tooltipEl));
        path.addEventListener('click', () => showDetail(detailEl, country, scenario, year));
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
    if(active){
      svg.querySelectorAll('path.country').forEach(p => { p.setAttribute('stroke','#0b0e14'); p.setAttribute('stroke-width','0.5'); });
      svg.setAttribute('data-fed-highlight','0');
      return;
    }
    svg.querySelectorAll('path.country').forEach(p => {
      const iso = p.getAttribute('data-iso');
      const c = data.countries[iso];
      if(c && (c.eu || c.fedNew)){
        // federation members: subtle purple outline
        p.setAttribute('stroke','#7c5cd6'); p.setAttribute('stroke-width','1.6');
      } else {
        // non-members: dim border
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
      if(el){ el.style.cursor = 'pointer'; el.addEventListener('click', mapToggle[id]); }
    });

    const noteMap = {
      'fragPop':'fragPopNote',
      'fedPop':'fedPopNote',
      'fragTech':'fragTechNote',
      'fedTech':'fedTechNote'
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

  function showDetail(detailEl, country, scenario, year){
    const note = scenario === 'frag' ? country.fragNote : country.fedNote;
    const pop = scenario === 'frag' ? country.popFrag : country.popFed;
    const score = blendScore(country, scenario, year);
    const pct = score !== undefined ? Math.round(score * 100) + '%' : '—';
    const label = scenario === 'frag' ? 'Sovereignty &amp; integration index' : 'Federal integration index';
    const statusLine = country.fedNew
      ? (scenario === 'fed'
          ? (year >= 2034 ? 'Federal member state (new accession)' : 'Pre-accession, integrating')
          : 'EU candidate / accession in progress')
      : (country.eu ? 'EU member state' : 'Non-EU country');

    detailEl.innerHTML = `
      <div class="detail-country">${country.name} — ${year}</div>
      <div class="detail-row"><span>Status</span><span>${statusLine}</span></div>
      <div class="detail-row"><span>${label}</span><span>${pct}</span></div>
      <div class="detail-row"><span>Population (2050 path)</span><span>${pop || '—'}</span></div>
      <div class="detail-note">${note || ''}</div>
    `;
  }

  // ---------- Stats ----------
  function parsePopulation(value){
    if(!value || typeof value !== 'string') return 0;
    const match = value.match(/([0-9]+(?:\.[0-9]+)?)M/);
    return match ? parseFloat(match[1]) : 0;
  }

  function countCountries(){
    const entries = Object.entries(data.countries || {});
    const FED_EXCLUDE_ISOS = new Set(['RUS','BLR']);
    const euMembers = entries.filter(([iso, c]) => c.eu).map(([iso,c]) => c);
    const fedMembers = entries.filter(([iso, c]) => (c.eu || c.fedNew) && !FED_EXCLUDE_ISOS.has(iso)).map(([iso,c]) => c);
    const fragPop = euMembers.reduce((sum, c) => sum + parsePopulation(c.popFrag), 0);
    const fedPop = fedMembers.reduce((sum, c) => sum + parsePopulation(c.popFed), 0);
    return {
      euCount: euMembers.length,
      fedCount: 42,
      fragPop,
      fedPop
    };
  }

  function updateStats(year){
    const t = (year - 2026) / (2050 - 2026);
    const counts = countCountries();

    const fragTechStart = 11, fragTechEnd = 9;
    const fedTechStart = 11, fedTechEnd = 22;

    document.getElementById('fragPop').textContent = Math.round(counts.fragPop) + 'M';
    document.getElementById('fedPop').textContent = Math.round(counts.fedPop) + 'M';
    document.getElementById('fragMembers').textContent = counts.euCount;
    document.getElementById('fedMembers').textContent = counts.fedCount;
    document.getElementById('fragTech').textContent = Math.round(fragTechStart + (fragTechEnd-fragTechStart)*t) + '%';
    document.getElementById('fedTech').textContent = Math.round(fedTechStart + (fedTechEnd-fedTechStart)*t) + '%';
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

  function classifyNewsHeadline(title){
    const lower = title.toLowerCase();
    if(/veto|block|stall|stalls|split|dispute|tension|crisis|slow|delay|uncertain|uneven|fragment/.test(lower)){
      return {
        frag:'Reinforces fragmentation',
        fed:'Delays federal progress'
      };
    }
    if(/agreement|joint|integrat|union|accession|deal|package|package|connected|shared|framework|strategy/.test(lower)){
      return {
        frag:'Highlights the limits of national coordination',
        fed:'Positive — supports federal integration'
      };
    }
    return {
      frag:'Mixed signal for fragmentation',
      fed:'Mixed signal for federation'
    };
  }

  function parseNewsRss(xmlText){
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const items = Array.from(doc.querySelectorAll('item')).slice(0, 6);
    return items.map(item => {
      const title = item.querySelector('title')?.textContent?.trim() || 'Untitled story';
      const desc = item.querySelector('description')?.textContent?.trim() || '';
      const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
      const signal = classifyNewsHeadline(title);
      return {
        date: pubDate.replace(/GMT$/,'').trim(),
        headline: title,
        ai: desc,
        frag: signal.frag,
        fed: signal.fed
      };
    });
  }

  async function fetchRemoteFeed(){
    const rssUrl = 'https://www.euronews.com/rss?level=theme&name=news';
    const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(rssUrl);
    const resp = await fetch(proxyUrl);
    if(!resp.ok) throw new Error('Remote feed request failed');
    const text = await resp.text();
    return parseNewsRss(text);
  }

  async function loadFeedData(){
    try {
      const remote = await fetchRemoteFeed();
      if(Array.isArray(remote) && remote.length){
        feedData = remote;
        const today = new Date();
        feedUpdated = today.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
      }
    } catch (primaryErr) {
      console.warn('Unable to fetch external news feed, falling back to local data.', primaryErr);
      try {
        const resp = await fetch('feed.json?t=' + Date.now());
        if(resp.ok){
          const json = await resp.json();
          if(Array.isArray(json.feed)) feedData = json.feed;
          if(json.feedUpdated) feedUpdated = json.feedUpdated;
        }
      } catch (fallbackErr) {
        console.warn('Unable to load local feed.json, using embedded feed data.', fallbackErr);
      }
    }
    buildFeed();
    updateFeedMeta();
  }

  function scheduleFeedRefresh(){
    const oneDay = 24 * 60 * 60 * 1000;
    // Schedule first refresh at next 08:00 local time, then every 24h
    const now = new Date();
    const next = new Date(now);
    next.setHours(8,0,0,0);
    if(next <= now) next.setDate(next.getDate() + 1);
    const initialDelay = next - now;
    setTimeout(() => {
      loadFeedData();
      setInterval(loadFeedData, oneDay);
    }, initialDelay);
  }

  // ---------- Init ----------
  function render(year){
    buildMap(document.getElementById('mapFrag'), 'frag', document.getElementById('tooltipFrag'), document.getElementById('detailFrag'), year);
    buildMap(document.getElementById('mapFed'), 'fed', document.getElementById('tooltipFed'), document.getElementById('detailFed'), year);
    updateStats(year);
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
  render(2050);

})();
