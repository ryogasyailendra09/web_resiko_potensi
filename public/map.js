const mapElement = document.getElementById('full-map');
const detailPanel = document.getElementById('detail-panel');
const layerState = { boundary: true, education: true, government: true, disaster: true, route: false };
const markerLayers = { education: [], government: [], disaster: [] };
let boundaryLayer;
let map;
let routeLayer;
let routeRequestId = 0;
const ipbDramaga = [106.7247, -6.5586];

function resetDetail() {
  detailPanel.classList.remove('is-open');
  detailPanel.classList.add('is-collapsed');
  document.querySelector('.map-shell').classList.add('detail-collapsed');
  detailPanel.innerHTML = '<button class="detail-close" id="detail-close" aria-label="Tutup detail">×</button><div class="detail-empty"><span class="detail-orb">+</span><p class="eyebrow">PILIH SATU TITIK</p><h2>Informasi lokasi<br>akan muncul di sini.</h2><p>Klik marker pada peta untuk melihat nama, kategori, sumber, dan foto lokasi.</p></div>';
}

const categoryFor = (point) => {
  const category = (point.category || '').toLowerCase();
  if (category.includes('pendidikan')) return 'education';
  if (category.includes('pemerintahan') || category.includes('koordinasi')) return 'government';
  return 'government';
};

const iconFor = (kind) => {
  const symbol = kind === 'education' ? '✦' : kind === 'disaster' ? '!' : '◆';
  return L.divIcon({ className: `map-marker ${kind}`, html: `<span>${symbol}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
};

function renderDetail(point, kind) {
  const photo = point.photo ? `<img class="detail-photo" src="${point.photo}" alt="${point.name}" loading="lazy">` : '<div class="detail-photo photo-empty"><span>▧</span><small>Foto lokasi belum tersedia</small></div>';
  const source = /^https?:\/\//i.test(point.source || '') ? `<a class="detail-source" href="${point.source}" target="_blank" rel="noreferrer">Buka sumber verifikasi ↗</a>` : `<p class="detail-verification">Verifikasi: ${point.source || 'Belum dicantumkan'}</p>`;
  detailPanel.classList.add('is-open');
  detailPanel.classList.remove('is-collapsed');
  document.querySelector('.map-shell').classList.remove('detail-collapsed');
  detailPanel.innerHTML = `<button class="detail-close" id="detail-close" aria-label="Tutup detail">×</button>${photo}<div class="detail-content"><span class="detail-tag ${kind}">${kind === 'education' ? 'Pendidikan' : kind === 'disaster' ? 'Risiko bencana' : 'Pemerintahan'}</span><h2>${point.name}</h2><p>${point.description || point.category || 'Informasi lokasi terverifikasi.'}</p><dl><div><dt>Kategori</dt><dd>${point.category || '—'}</dd></div><div><dt>Koordinat</dt><dd>${point.coordinates[1].toFixed(6)}, ${point.coordinates[0].toFixed(6)}</dd></div></dl>${source}</div>`;
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
    routeLayer.remove();
    routeLayer = L.featureGroup().addTo(map);
    L.geoJSON({ type: 'Feature', geometry: route.geometry }, { style: { color: '#07100f', weight: 10, opacity: .85 } }).addTo(routeLayer);
    L.geoJSON({ type: 'Feature', geometry: route.geometry }, { style: { color: '#8bd7ff', weight: 5, opacity: 1 } }).addTo(routeLayer);
    addRoutePins(routeLayer, destination);
    map.fitBounds(routeLayer.getBounds(), { padding: [55, 55] });
    routeCard.innerHTML = `<b>IPB Dramaga → Desa Sadeng</b><strong>${(route.distance / 1000).toFixed(1)} km</strong><small>Estimasi ${Math.round(route.duration / 60)} menit · rute jalan</small>`;
  } catch (error) {
    window.clearTimeout(timeoutId);
    if (requestId !== routeRequestId || !layerState.route) return;
    const straightLine = haversineKm(ipbDramaga, destination);
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
    if (layerState[kind]) marker.addTo(map);
    else marker.remove();
  });
  if (boundaryLayer) {
    if (layerState.boundary) boundaryLayer.addTo(map);
    else boundaryLayer.remove();
  }
}

async function start() {
  const response = await fetch('/api/dashboard');
  const data = await response.json();
  const [longitude, latitude] = data.spatial.points[0].coordinates;
  map = L.map(mapElement, { zoomControl: false, scrollWheelZoom: true, touchZoom: true, dragging: true, doubleClickZoom: true, wheelPxPerZoomLevel: 90 }).setView([latitude, longitude], 13);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
  window.sadengMap = map;
  const bounds = [];
  if (data.spatial.boundary) {
    boundaryLayer = L.geoJSON(data.spatial.boundary, { style: { color: '#ff8966', weight: 2, fillColor: '#ff8966', fillOpacity: .12, dashArray: '7 6' } }).addTo(map);
    bounds.push([boundaryLayer.getBounds().getSouth(), boundaryLayer.getBounds().getWest()], [boundaryLayer.getBounds().getNorth(), boundaryLayer.getBounds().getEast()]);
  }
  data.spatial.points.forEach((point) => {
    const kind = categoryFor(point);
    const marker = L.marker([point.coordinates[1], point.coordinates[0]], { icon: iconFor(kind) });
    marker.on('click', () => renderDetail(point, kind));
    markerLayers[kind].push(marker);
    marker.addTo(map);
    bounds.push([point.coordinates[1], point.coordinates[0]]);
  });
  map.fitBounds(bounds, { padding: [40, 40] });
  document.getElementById('location-count').textContent = data.spatial.points.length;
  document.getElementById('map-status').textContent = `${data.spatial.points.length} titik · batas administratif aktif`;
  document.querySelectorAll('[data-layer]:not([data-layer="route"])').forEach((input) => input.addEventListener('change', (event) => { layerState[event.target.dataset.layer] = event.target.checked; setLayerVisibility(event.target.dataset.layer); }));
  document.querySelector('[data-layer="route"]').addEventListener('change', (event) => {
    layerState.route = event.target.checked;
    if (event.target.checked) showRoute([longitude, latitude]);
    else hideRoute();
  });
}

detailPanel.addEventListener('click', (event) => {
  if (event.target.closest('#detail-close')) resetDetail();
});
start().catch((error) => { document.getElementById('map-status').textContent = 'Data peta gagal dimuat'; console.error(error); });
