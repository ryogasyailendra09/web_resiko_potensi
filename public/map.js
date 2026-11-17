const mapElement = document.getElementById('full-map');
const detailPanel = document.getElementById('detail-panel');
const layerState = { boundary: true, districtBoundary: true, education: true, government: true, disaster: true, shelter: true, water: true, market: true, health: true, tourism: true, evacuation: true, route: false };
const markerLayers = { education: [], government: [], disaster: [], shelter: [], water: [], market: [], health: [], tourism: [] };
let boundaryLayer;
let districtBoundaryLayer;
let evacuationLayer;
let markerCluster;
let map;
let routeLayer;
let routeRequestId = 0;
const ipbDramaga = [106.7247, -6.5586];

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function resetDetail() {
  detailPanel.classList.remove('is-open');
  detailPanel.classList.add('is-collapsed');
  document.querySelector('.map-shell').classList.add('detail-collapsed');
  detailPanel.innerHTML = '<button class="detail-close" id="detail-close" aria-label="Tutup detail">×</button><div class="detail-empty"><span class="detail-orb">+</span><p class="eyebrow">PILIH SATU TITIK</p><h2>Informasi lokasi<br>akan muncul di sini.</h2><p>Klik marker pada peta untuk melihat nama, kategori, sumber, dan foto lokasi.</p></div>';
}

const categoryFor = (point) => {
  if (point.layer === 'titik_rawan_bencana') return 'disaster';
  if (point.layer === 'titik_pengungsian') return 'shelter';
  if (point.layer === 'titik_sumber_air_kekeringan') return 'water';
  if (['market', 'health', 'tourism'].includes(point.layer)) return point.layer;
  const category = (point.category || '').toLowerCase();
  if (category.includes('pendidikan')) return 'education';
  if (category.includes('pemerintahan') || category.includes('koordinasi')) return 'government';
  return 'government';
};

const iconFor = (kind) => {
  const symbol = kind === 'education' ? '✦' : kind === 'disaster' ? '!' : kind === 'shelter' ? 'H' : kind === 'water' ? '≈' : kind === 'market' ? 'M' : kind === 'health' ? '+' : kind === 'tourism' ? '★' : '◆';
  return L.divIcon({ className: `map-marker ${kind}`, html: `<span>${symbol}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
};

function renderDetail(point, kind) {
  const name = esc(point.name);
  const photo = point.photo
    ? `<a class="detail-photo-link" href="${esc(point.photo)}" target="_blank" rel="noreferrer"><img class="detail-photo" src="${esc(point.photo)}" alt="${name}" loading="lazy"><span>Klik untuk membuka foto ↗</span></a>`
    : `<div class="detail-photo photo-empty" id="photo-preview"><span>▧</span><small>${point.photoReference ? 'Memuat foto berita...' : 'Foto lokal belum tersedia'}</small>${point.photoReference ? `<a href="${esc(point.photoReference)}" target="_blank" rel="noreferrer">Buka berita ↗</a>` : ''}</div>`;
  const source = /^https?:\/\//i.test(point.source || '')
    ? `<a class="detail-source" href="${esc(point.source)}" target="_blank" rel="noreferrer">Buka sumber verifikasi ↗</a>`
    : `<p class="detail-verification">Verifikasi: ${esc(point.source || 'Belum dicantumkan')}</p>`;
  const extra = [point.riskLevel ? `Risiko: ${point.riskLevel}` : '', point.capacity ? `Kapasitas: ${point.capacity} orang` : '', point.precision ? `Presisi: ${point.precision}` : '', point.photoStatus ? `Foto: ${point.photoStatus}` : ''].filter(Boolean).join(' · ');
  detailPanel.classList.add('is-open');
  detailPanel.classList.remove('is-collapsed');
  document.querySelector('.map-shell').classList.remove('detail-collapsed');
  const labels = { education: 'Pendidikan', disaster: 'Risiko bencana', shelter: 'Pengungsian', water: 'Sumber air', market: 'Pasar', health: 'Kesehatan', tourism: 'Wisata', government: 'Pemerintahan' };
  detailPanel.innerHTML = `<button class="detail-close" id="detail-close" aria-label="Tutup detail">×</button>${photo}<div class="detail-content"><span class="detail-tag ${esc(kind)}">${esc(labels[kind] || 'Tempat sekitar')}</span><h2>${name}</h2><p>${esc(point.description || point.category || 'Informasi lokasi terverifikasi.')}</p>${extra ? `<p class="detail-meta">${esc(extra)}</p>` : ''}<dl><div><dt>Kategori</dt><dd>${esc(point.category || '—')}</dd></div><div><dt>Koordinat</dt><dd>${point.coordinates[1].toFixed(6)}, ${point.coordinates[0].toFixed(6)}</dd></div></dl>${source}</div>`;
  if (!point.photo && point.photoReference) loadArticlePhoto(point.photoReference, point.name);
}

async function loadArticlePhoto(source, name) {
  const preview = document.getElementById('photo-preview');
  if (!preview) return;
  try {
    const response = await fetch(`/api/article-preview?source=${encodeURIComponent(source)}`);
    const data = await response.json();
    if (data.image && document.getElementById('photo-preview') === preview) {
      preview.outerHTML = `<a class="detail-photo-link" href="${esc(source)}" target="_blank" rel="noreferrer"><img class="detail-photo" src="${esc(data.image)}" alt="${esc(name)}" loading="lazy"><span>Foto dari berita · klik untuk membuka sumber ↗</span></a>`;
    } else if (preview.querySelector('small')) {
      preview.querySelector('small').textContent = 'Foto berita tidak dapat dimuat';
    }
  } catch { if (preview.querySelector('small')) preview.querySelector('small').textContent = 'Foto berita tidak dapat dimuat'; }
}

function haversineKm(from, to) {
  const radius = 6371;
  const latDelta = (to[1] - from[1]) * Math.PI / 180;
  const lonDelta = (to[0] - from[0]) * Math.PI / 180;
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(from[1] * Math.PI / 180) * Math.cos(to[1] * Math.PI / 180) * Math.sin(lonDelta / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function showRoute(destination) {
  const requestId = ++routeRequestId;
  if (routeLayer) { routeLayer.remove(); routeLayer = null; }
  const routeCard = document.getElementById('route-card');
  const straightLine = haversineKm(ipbDramaga, destination);
  drawFallbackRoute(destination);
  routeCard.innerHTML = `<b>Rute IPB Dramaga → Desa Sadeng</b><strong>±${(straightLine * 1.25).toFixed(1)} km</strong><small>±${Math.round(straightLine * 1.25 / 25 * 60)} menit · menunggu geometri jalan</small>`;
  routeCard.classList.add('is-visible');
  let timeoutId;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${ipbDramaga[0]},${ipbDramaga[1]};${destination[0]},${destination[1]}?overview=full&geometries=geojson`;
    const routeRequest = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Routing service returned ${response.status}`);
      return response.json();
    });
    const timeout = new Promise((_, reject) => { timeoutId = window.setTimeout(() => reject(new Error('Routing service timeout')), 7000); });
    const result = await Promise.race([routeRequest, timeout]);
    window.clearTimeout(timeoutId);
    if (!result.routes?.length) throw new Error('Rute tidak ditemukan');
    if (requestId !== routeRequestId || !layerState.route) return;
    const route = result.routes[0];
    if (routeLayer) routeLayer.remove();
    routeLayer = L.featureGroup().addTo(map);
    L.geoJSON({ type: 'Feature', geometry: route.geometry }, { style: { color: '#07100f', weight: 10, opacity: .85 } }).addTo(routeLayer);
    L.geoJSON({ type: 'Feature', geometry: route.geometry }, { style: { color: '#8bd7ff', weight: 5, opacity: 1 } }).addTo(routeLayer);
    addRoutePins(routeLayer, destination);
    map.fitBounds(routeLayer.getBounds(), { padding: [55, 55] });
    routeCard.innerHTML = `<b>IPB Dramaga → Desa Sadeng</b><strong>${(route.distance / 1000).toFixed(1)} km</strong><small>Estimasi ${Math.round(route.duration / 60)} menit · rute jalan</small>`;
  } catch (error) {
    window.clearTimeout(timeoutId);
    if (requestId !== routeRequestId || !layerState.route) return;
    if (routeLayer) routeLayer.remove();
    drawFallbackRoute(destination);
    routeCard.innerHTML = `<b>IPB Dramaga → Desa Sadeng</b><strong>±${(straightLine * 1.25).toFixed(1)} km</strong><small>±${Math.round(straightLine * 1.25 / 25 * 60)} menit · estimasi koridor, rute detail tidak tersedia</small>`;
  }
}

function drawFallbackRoute(destination) {
  routeLayer = L.featureGroup().addTo(map);
  addRoutePins(routeLayer, destination);
  map.fitBounds(routeLayer.getBounds(), { padding: [55, 55] });
}

function addRoutePins(layer, destination) {
  const start = L.marker([ipbDramaga[1], ipbDramaga[0]], { icon: routeIcon('start') }).bindPopup('<strong>IPB Dramaga</strong><br><small>Titik awal navigasi</small>');
  const end = L.marker([destination[1], destination[0]], { icon: routeIcon('end') }).bindPopup('<strong>Desa Sadeng</strong><br><small>Kantor Desa · titik tujuan navigasi</small>');
  start.addTo(layer);
  end.addTo(layer);
}

function routeIcon(kind) {
  const symbol = kind === 'start' ? 'A' : 'B';
  return L.divIcon({ className: `map-marker route-${kind}`, html: `<span>${symbol}</span>`, iconSize: [32, 32], iconAnchor: [16, 16] });
}

function hideRoute() {
  routeRequestId += 1;
  if (routeLayer) { routeLayer.remove(); routeLayer = null; }
  const routeCard = document.getElementById('route-card');
  routeCard.classList.remove('is-visible');
  routeCard.innerHTML = '';
}

function setLayerVisibility(kind) {
  if (markerLayers[kind]) markerLayers[kind].forEach((marker) => {
    if (layerState[kind]) markerCluster ? markerCluster.addLayer(marker) : marker.addTo(map);
    else markerCluster ? markerCluster.removeLayer(marker) : marker.remove();
  });
  if (kind === 'boundary' && boundaryLayer) {
    if (layerState.boundary) boundaryLayer.addTo(map);
    else boundaryLayer.remove();
  }
  if (kind === 'districtBoundary' && districtBoundaryLayer) {
    if (layerState.districtBoundary) districtBoundaryLayer.addTo(map);
    else districtBoundaryLayer.remove();
  }
  if (kind === 'evacuation' && evacuationLayer) {
    if (layerState.evacuation) evacuationLayer.addTo(map);
    else evacuationLayer.remove();
  }
}

async function start() {
  const response = await fetch('/api/dashboard');
  if (!response.ok) throw new Error(`API dashboard ${response.status}`);
  const data = await response.json();
  renderNearby(data.nearby || []);

  const layersToggle = document.getElementById('layers-toggle');
  const layersPanel = document.querySelector('.map-sidebar');
  layersToggle.addEventListener('click', () => {
    const open = layersPanel.classList.toggle('is-open');
    layersToggle.setAttribute('aria-expanded', String(open));
    layersToggle.querySelector('span').textContent = open ? 'Tutup lapisan' : 'Lapisan';
  });

  // Layer tanpa titik koordinat disembunyikan sampai workbook memiliki data GPS valid.
  ['water', 'health'].forEach((layer) => {
    if (!data.spatial.points.some((point) => point.layer === layer || (layer === 'water' && point.layer === 'titik_sumber_air_kekeringan'))) {
      document.querySelectorAll(`[data-layer="${layer}"]`).forEach((element) => element.closest('.layer-toggle')?.remove());
      document.querySelectorAll('.map-floating-legend span').forEach((element) => { if (element.textContent.includes(layer === 'water' ? 'Air' : 'Kesehatan')) element.remove(); });
    }
  });
  if (!data.spatial.districtBoundary) {
    document.querySelectorAll('[data-layer="districtBoundary"]').forEach((element) => element.closest('.layer-toggle')?.remove());
    document.querySelectorAll('.map-floating-legend span').forEach((element) => { if (element.textContent.includes('Kecamatan')) element.remove(); });
  }

  const first = data.spatial.points[0]?.coordinates || [106.590328, -6.561262];
  const [longitude, latitude] = first;
  map = L.map(mapElement, { zoomControl: false, scrollWheelZoom: true, touchZoom: true, dragging: true, doubleClickZoom: true, wheelPxPerZoomLevel: 90 }).setView([latitude, longitude], 13);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
  // Tanpa disableClusteringAtZoom agar marker berkoordinat sama bisa di-spiderfy dan dipilih satu per satu.
  markerCluster = window.L.markerClusterGroup ? L.markerClusterGroup({ showCoverageOnHover: false, spiderfyOnMaxZoom: true, maxClusterRadius: 42 }).addTo(map) : null;
  window.sadengMap = map;

  const bounds = [];
  if (data.spatial.boundary) {
    boundaryLayer = L.geoJSON(data.spatial.boundary, { style: { color: '#ff8966', weight: 2, fillColor: '#ff8966', fillOpacity: .12, dashArray: '7 6' } }).addTo(map);
    const b = boundaryLayer.getBounds();
    bounds.push([b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]);
  }
  if (data.spatial.districtBoundary) {
    districtBoundaryLayer = L.geoJSON(data.spatial.districtBoundary, { style: { color: '#8bd7ff', weight: 2.5, fillColor: '#8bd7ff', fillOpacity: .05, dashArray: '3 9' } }).addTo(map);
    const b = districtBoundaryLayer.getBounds();
    bounds.push([b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]);
  }
  if (data.spatial.routes?.length) {
    evacuationLayer = L.featureGroup();
    data.spatial.routes.forEach((route) => {
      L.geoJSON({ type: 'Feature', properties: route, geometry: route.geometry }, { style: { color: '#72d3c4', weight: 4, opacity: .9, dashArray: '9 7' } })
        .bindPopup(`<strong>${esc(route.nama || 'Jalur evakuasi')}</strong><br><small>${esc(route.status_verifikasi_jalur || 'Jalur survei')}</small>`)
        .addTo(evacuationLayer);
    });
    evacuationLayer.addTo(map);
  }
  data.spatial.points.forEach((point) => {
    const kind = categoryFor(point);
    const marker = L.marker([point.coordinates[1], point.coordinates[0]], { icon: iconFor(kind) });
    marker.on('click', () => renderDetail(point, kind));
    markerLayers[kind].push(marker);
    if (markerCluster) markerCluster.addLayer(marker);
    else marker.addTo(map);
    bounds.push([point.coordinates[1], point.coordinates[0]]);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40] });
  document.getElementById('location-count').textContent = data.spatial.points.length;
  document.getElementById('map-status').textContent = `${data.spatial.points.length} titik · batas administratif aktif`;

  document.querySelectorAll('[data-layer]:not([data-layer="route"])').forEach((input) => input.addEventListener('change', (event) => {
    layerState[event.target.dataset.layer] = event.target.checked;
    setLayerVisibility(event.target.dataset.layer);
  }));
  document.querySelector('[data-layer="route"]').addEventListener('change', (event) => {
    layerState.route = event.target.checked;
    if (event.target.checked) showRoute([longitude, latitude]);
    else hideRoute();
  });
}

function renderNearby(items) {
  const sidebar = document.querySelector('.map-sidebar');
  const note = document.createElement('section');
  note.className = 'nearby-note';
  note.innerHTML = `<strong>Yang perlu diketahui</strong>${items.map((item) => `<div><span>${esc(item.kind)}</span><b>${esc(item.name)}</b><small>${esc(item.detail)}</small></div>`).join('')}`;
  sidebar.appendChild(note);
}

detailPanel.addEventListener('click', (event) => {
  if (event.target.closest('#detail-close')) resetDetail();
});
start().catch((error) => { document.getElementById('map-status').textContent = 'Data peta gagal dimuat'; console.error(error); });