(function(){

  const geo = window.EUROPE_GEOJSON;
  const data = window.EU2050_DATA;

  // ---------- Projection setup ----------
  // Simple equirectangular-ish projection tuned to fit our viewBox (760x620)
  // Europe roughly spans lon -25..50, lat 34..71
  const LON_MIN = -25, LON_MAX = 50;
  const LAT_MIN = 33, LAT_MAX = 71;
  const W = 760, H = 620;

  function project([lon, lat]){
    const x = (lon - LON_MIN) / (LON_MAX - LON_MIN) * W;
    // simple latitude compression for a nicer aspect ratio
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
    if(score === undefined) return '#23262f';
    // dependency gradient: dark brown (low integration / high dependency) -> red (core, but still fragmented)
    const stops = [
      {s:0.2, c:[51,38,36]},   // dark brown — low integration
      {s:0.35, c:[107,58,42]}, // mid brown
      {s:0.45, c:[156,64,45]}, // brown-red
      {s:0.6, c:[196,69,58]}   // red — core, still fragmented
    ];
    return interpolateColor(score, stops);
  }

  function fedColor(score, isNew){
    if(score === undefined) return '#23262f';
    if(isNew) return '#a78bfa'; // bright lavender for new accessions
    const stops = [
      {s:0.4, c:[35,30,46]},
      {s:0.6, c:[60,40,90]},
      {s:0.8, c:[94,58,140]},
      {s:0.95, c:[139,92,210]}
    ];
    return interpolateColor(score, stops);
  }
  function interpolateColor(value, stops){
    if(value <= stops[0].s) return rgb(stops[0].c);
    if(value >= stops[stops.length-1].s) return rgb(stops[stops.length-1].c);
    for(let i=0; i<stops.length-1; i++){
      const a = stops[i], b = stops[i+1];
      if(value >= a.s && value <= b.s){
        const t = (value - a.s) / (b.s - a.s);
        const c = a.c.map((ch, idx) => Math.round(ch + (b.c[idx]-ch)*t));
        return rgb(c);
      }
    }
    return rgb(stops[stops.length-1].c);
  }

  function rgb(c){ return `rgb(${c[0]},${c[1]},${c[2]})`; }

  // ---------- Year interpolation ----------
  // For non-2050 years, blend country score from a "2026 baseline" (assumed
  // close to current real-world status) toward the 2050 scenario score.
  function blendScore(country, scenario, year){
    const target = scenario === 'frag' ? country.fragScore : country.fedScore;
    if(target === undefined) return undefined;
    // baseline assumption: most countries start near a neutral-ish 0.5,
    // candidate/new-accession countries start lower
    let baseline;
    if(country.fedNew){
      baseline = scenario === 'fed' ? 0.15 : (country.fragScore !== undefined ? country.fragScore * 0.8 : 0.2);
    } else {
      baseline = scenario === 'fed' ? 0.55 : target; // frag scores assumed roughly stable already
    }
    const t = (year - 2026) / (2050 - 2026);
    return baseline + (target - baseline) * t;
  }

  // ---------- Build SVG for one map ----------
  function buildMap(svgEl, scenario, tooltipEl, detailEl, year){
    svgEl.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';

    // background
    const bg = document.createElementNS(ns,'rect');
    bg.setAttribute('x',0); bg.setAttribute('y',0);
    bg.setAttribute('width',W); bg.setAttribute('height',H);
    bg.setAttribute('fill','#0d1118');
    svgEl.appendChild(bg);

    geo.features.forEach(f => {
      const iso = f.properties.ISO3;
      const country = data.countries[iso];
      const path = document.createElementNS(ns,'path');
      path.setAttribute('d', geometryToPath(f.geometry));
      path.setAttribute('class','country');

      let fill = '#1a1e29'; // default for unmodeled
      if(country){
        const score = blendScore(country, scenario, year);
        fill = scenario === 'frag'
          ? fragColor(score, country.eu)
          : fedColor(score, false); // new accessions appear gradually
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
  function updateStats(year){
    // Linear-ish interpolation of headline stats for flavor; 2050 = scenario stats.
    const t = (year - 2026) / (2050 - 2026);

    const fragPopStart = 448, fragPopEnd = 418; // millions
    const fedPopStart = 448, fedPopEnd = 503;
    const fragMembersStart = 27, fragMembersEnd = 29;
    const fedMembersStart = 27, fedMembersEnd = 33;
    const fragTechStart = 11, fragTechEnd = 9;
    const fedTechStart = 11, fedTechEnd = 22;

    document.getElementById('fragPop').textContent = Math.round(fragPopStart + (fragPopEnd-fragPopStart)*t) + 'M';
    document.getElementById('fedPop').textContent = Math.round(fedPopStart + (fedPopEnd-fedPopStart)*t) + 'M';
    document.getElementById('fragMembers').textContent = Math.round(fragMembersStart + (fragMembersEnd-fragMembersStart)*t);
    document.getElementById('fedMembers').textContent = Math.round(fedMembersStart + (fedMembersEnd-fedMembersStart)*t);
    document.getElementById('fragTech').textContent = Math.round(fragTechStart + (fragTechEnd-fragTechStart)*t) + '%';
    document.getElementById('fedTech').textContent = Math.round(fedTechStart + (fedTechEnd-fedTechStart)*t) + '%';
  }

  // ---------- News feed ----------
  function buildFeed(){
    const list = document.getElementById('feedList');
    list.innerHTML = '';
    data.feed.forEach(item => {
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

  buildFeed();
  render(2050);

})();
