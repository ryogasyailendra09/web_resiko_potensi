const iconMap = { people: '◉', land: '⌂', fruit: '✦', alert: '!', rain: '∿', sun: '○', leaf: '⌁', community: '◎' };

async function loadDashboard() {
  const response = await fetch('/api/dashboard');
  if (!response.ok) throw new Error('Data dashboard tidak dapat dimuat');
  return response.json();
}

function enableMapGate() {
  const mapPanel = document.querySelector('.hero-map');
  const mapLink = document.querySelector('.map-open');
  const hint = document.querySelector('.map-open-hint');
  if (!mapPanel || !mapLink) return;
  const say = (text) => {
    if (!hint) return;
    hint.textContent = text;
    window.setTimeout(() => { hint.textContent = ''; }, 2200);
  };
  const openMap = () => { window.location.href = mapLink.href; };
  mapLink.addEventListener('click', (event) => {
    // Layar sentuh tidak punya double click yang nyaman: satu tap langsung membuka peta.
    if (window.matchMedia('(pointer: coarse)').matches) return;
    event.preventDefault();
    say('Double click sekali lagi untuk masuk ke peta interaktif');
  });
  mapLink.addEventListener('dblclick', (event) => { event.preventDefault(); openMap(); });
  mapPanel.addEventListener('click', (event) => {
    if (!event.target.closest('.map-open, .leaflet-marker-icon, .leaflet-control, .map-legend')) say('Double click peta untuk membuka ruang eksplorasi');
  });
  mapPanel.addEventListener('dblclick', (event) => {
    if (!event.target.closest('.map-open, .leaflet-marker-icon, .leaflet-control, .map-legend')) openMap();
  });
}

const el = (id) => document.getElementById(id);

function render(data) {
  el('stats').innerHTML = data.stats.map((item) => `<article class="stat-card"><div class="stat-icon">${iconMap[item.icon] || '•'}</div><strong class="stat-value">${item.value}</strong><span class="stat-label">${item.label}</span><span class="stat-note">${item.note}</span></article>`).join('');
  el('seasons').innerHTML = data.seasons.map((item) => `<article class="season-card ${item.tone}"><div class="season-title"><h3>${iconMap[item.icon]} ${item.name}</h3><span>${item.period}</span></div><p class="season-trigger">${item.trigger}</p><ul>${item.effects.map((effect) => `<li>${effect}</li>`).join('')}</ul></article>`).join('');
  el('risks').innerHTML = data.risks.map((item) => `<article class="risk-item"><div><h3>${item.title}</h3><p>${item.detail}</p><small>${item.area} · ${item.level}</small><div class="risk-bar"><div class="risk-fill" style="--score:${item.score}%;--tone:var(--${item.color})"></div></div></div><div class="risk-score">${item.score}<small>/ 100</small></div></article>`).join('');
  el('potentials').innerHTML = data.potentials.map((item) => `<article class="potential-card"><span class="potential-number">${item.number}</span><span class="tag">${item.tag}</span><h3>${iconMap[item.icon]} ${item.title}</h3><p>${item.detail}</p></article>`).join('');
  el('programs').innerHTML = data.programs.map((item, index) => `<article class="program-item"><span class="program-index">0${index + 1}</span><div><h3>${item.title}</h3><span class="program-type">${item.type}</span></div><p>${item.detail}</p></article>`).join('');
  el('kkn').innerHTML = data.kkn.map((item) => `<article class="timeline-item"><span class="timeline-year">${item.year}</span><h3>${item.title}</h3><p>${item.detail}</p></article>`).join('');
  el('rw-table').innerHTML = `<div class="rw-table-head"><span>Wilayah</span><span>Penduduk</span><span>KK</span><span>Rumah</span></div>${data.rw.map((item) => `<div class="rw-row"><span><b>${item.name}</b><small>${item.area}</small></span><strong>${item.population.toLocaleString('id-ID')}</strong><span>${item.families.toLocaleString('id-ID')}</span><span>${item.homes.toLocaleString('id-ID')}</span></div>`).join('')}`;
  const maxPopulation = Math.max(...data.rw.map((item) => item.population));
  el('rw-bars').innerHTML = data.rw.map((item) => `<div class="rw-bar-row"><span>${item.name.replace('RW ', '')}</span><div class="rw-bar-track"><i style="width:${Math.round(item.population / maxPopulation * 100)}%"></i></div><strong>${item.population.toLocaleString('id-ID')}</strong></div>`).join('');
  el('facilities').innerHTML = data.facilities.map((item) => `<article class="facility-card"><span>${item.category}</span><strong>${item.count}</strong><p>${item.detail}</p></article>`).join('');
  initMap(data.spatial);
  el('source-file').textContent = data.source.file;
  el('source-count').textContent = `${data.sources.length} sumber terindeks · ${data.source.characters.toLocaleString('id-ID')} karakter`;
  renderSources(data.sources);
  el('source-filter').addEventListener('input', (event) => { const query = event.target.value.toLowerCase(); renderSources(data.sources.filter((source) => `${source.group} ${source.name}`.toLowerCase().includes(query))); });
}

function initMap(spatialAll) {
  // Peta hero hanya menampilkan titik dasar (fasilitas/pemerintahan); layer lain ada di peta eksplorasi.
  const spatial = { ...spatialAll, points: (spatialAll?.points || []).filter((point) => point.layer === 'fasilitas') };
  if (!window.L || !spatial.points.length) return;
  const [longitude, latitude] = spatial.points[0].coordinates;
  const map = L.map('sadeng-map', { zoomControl: false, scrollWheelZoom: true, touchZoom: true, dragging: true, doubleClickZoom: true, wheelPxPerZoomLevel: 90 }).setView([latitude, longitude], 13);
  window.sadengMap = map;
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
  const bounds = [];
  if (spatial.boundary) {
    const boundary = L.geoJSON(spatial.boundary, { style: { color: '#ff8966', weight: 2, fillColor: '#ff8966', fillOpacity: .12, dashArray: '7 6' } }).addTo(map);
    const b = boundary.getBounds();
    bounds.push([b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]);
  }
  spatial.points.forEach((point) => {
    const [pointLongitude, pointLatitude] = point.coordinates;
    bounds.push([pointLatitude, pointLongitude]);
    const category = (point.category || '').toLowerCase();
    const symbol = category.includes('pendidikan') ? 'education' : category.includes('pemerintahan') ? 'government' : 'coordination';
    const marker = L.marker([pointLatitude, pointLongitude], { icon: L.divIcon({ className: `map-marker ${symbol}`, html: `<span>${symbol === 'education' ? '✦' : symbol === 'government' ? '◆' : '●'}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) });
    marker.bindPopup(`<strong>${point.name}</strong><br><small>${point.category}</small><br><small>${point.address || ''}</small>`).addTo(map);
  });
  el('map-point-count').textContent = spatial.points.length;
  if (bounds.length) map.fitBounds(bounds, { padding: [28, 28] });
}

function renderSources(sources) { el('sources').innerHTML = sources.map((source) => `<div class="source-item"><span>${source.group}</span><a href="${source.url}" target="_blank" rel="noreferrer">${source.name} <b class="source-arrow">↗</b></a></div>`).join('') || '<p class="body-copy">Sumber tidak ditemukan.</p>'; }

enableMapGate();
loadDashboard().then(render).catch((error) => { document.querySelector('main').innerHTML = `<section class="section-wrap" style="padding:100px 0"><h1>Data belum siap</h1><p>${error.message}</p></section>`; });