const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const root = __dirname;
const port = process.env.PORT || 3000;
const sourcePath = path.join(root, 'data', 'rangkuman_data_riset_kkn_desa_sadeng_kec_leuwisadeng.md');
const spatialPath = path.join(root, 'data', 'desa_sadeng_lengkap_poligon.geojson');
const surveySpatialPath = path.join(root, 'data', 'peta_kebencanaan_evakuasi_desa_sadeng_final.geojson');
const nearbySpatialPath = path.join(root, 'data', 'poi_fasilitas_wisata_sadeng_leuwisadeng.geojson');
const photosDir = path.join(root, 'data', 'photos') + path.sep;
// Hanya folder ini yang boleh diakses publik (data/Bogor.zip, .xlsx, .env, server.js TIDAK ikut).
const staticDirs = [path.join(root, 'public') + path.sep, photosDir];
const previewCache = new Map();
const previewHosts = new Set(['cnnindonesia.com', 'liputan6.com', 'detik.com', 'ppid.bogorkab.go.id', 'beritasatu.com']);

const dashboard = {
  village: 'Desa Sadeng',
  subtitle: 'Kecamatan Leuwisadeng, Kabupaten Bogor',
  updated: 'Baseline riset KKN',
  stats: [
    { value: '12.076', label: 'jiwa penduduk', note: 'agregat terbaru Portal Pemkab Bogor', icon: 'people' },
    { value: '542,38', label: 'hektare wilayah', note: 'agregat terbaru Portal Pemkab Bogor', icon: 'land' },
    { value: '80 ton', label: 'ekspor manggis / tahun', note: 'kapasitas Gapoktan Bina Warga Tani', icon: 'fruit' },
    { value: '1.001', label: 'jiwa terdampak banjir', note: 'kejadian Kali Cinanggung, April 2023', icon: 'alert' }
  ],
  profile: {
    altitude: '200–228 mdpl', slope: '15°–30°', area: '542,38 Ha', dusun: '3', rw: '6', rt: '30',
    education: [
      { label: 'Tamat SD/sederajat', value: 3701, color: '#f0a35b' },
      { label: 'Tamat SMU/sederajat', value: 1357, color: '#e77755' },
      { label: 'Tamat SLTP/sederajat', value: 1350, color: '#5aa8a0' }
    ]
  },
  rw: [
    { name: 'RW 001', area: 'Kp. Sadeng', population: 2593, families: 705, homes: 355 },
    { name: 'RW 002', area: 'Kp. Sadeng', population: 2700, families: 690, homes: 560 },
    { name: 'RW 003', area: 'Kp. Paku', population: 1461, families: 393, homes: 297 },
    { name: 'RW 004', area: 'Kp. Paku', population: 2188, families: 565, homes: 405 },
    { name: 'RW 005', area: 'Kp. Cikadu', population: 1290, families: 328, homes: 247 },
    { name: 'RW 006', area: 'Kp. Gunung Seureuh', population: 559, families: 109, homes: 90 }
  ],
  facilities: [
    { category: 'Pendidikan', count: '21 satuan', detail: 'PAUD, MD, TPQ, SD/MI, MTs, dan MA' },
    { category: 'Kesehatan', count: '10 Posyandu', detail: 'Ditambah 1 balai pengobatan dan 1 bidan desa' },
    { category: 'Pertanian', count: '2 kelompok', detail: 'Gapoktan manggis dan kelompok tani pala' },
    { category: 'Wisata', count: '1 kawasan', detail: 'Seureuh Hejo di Kp. Gunung Seureuh' }
  ],
  nearby: [
    { kind: 'Pasar', name: 'Pasar Rakyat Leuwisadeng', detail: 'Terpetakan dengan Plus Code terverifikasi; berada di koridor wilayah Sadeng.' },
    { kind: 'Kesehatan', name: 'Puskesmas Sadeng Pasar', detail: 'Rujukan kesehatan yang disebut dalam profil desa; titik koordinat belum tersedia.' },
    { kind: 'Kesehatan', name: 'Puskesmas Leuwisadeng', detail: 'Rujukan tingkat kecamatan; titik koordinat belum tersedia.' },
    { kind: 'Wisata', name: 'Seureuh Hejo', detail: 'Wisata alam dan camping ground di Kp. Gunung Seureuh; bukan curug.' },
    { kind: 'Curug', name: 'Curug Rubina & Curug Wangun Jaya', detail: 'Dua curug terpetakan di sekitar kecamatan; keduanya berada di luar batas administratif Desa Sadeng.' }
  ],
  seasons: [
    { key: 'hujan', name: 'Musim hujan', period: 'Akhir–awal tahun', tone: 'red', trigger: 'Hujan lebat berdurasi lama, alur sungai menyempit, dan lereng berbukit.', effects: ['Banjir bandang di Kp. Paku dan Kp. Cikadu', 'Longsor pada kontur berbukit', 'Panen terganggu dan risiko penyakit berbasis air'], metric: 'Risiko tinggi', icon: 'rain' },
    { key: 'kemarau', name: 'Musim kemarau', period: 'Juli–Agustus', tone: 'gold', trigger: 'Curah hujan dan kelembapan turun, radiasi matahari meningkat.', effects: ['Krisis air bersih dan distribusi tangki BPBD', 'Stres air pada hortikultura dan sawah tadah hujan', 'Debit mata air permukaan menurun'], metric: 'Waspada', icon: 'sun' }
  ],
  risks: [
    { title: 'Banjir bandang', area: 'Kali Cinanggung · Kp. Paku & Cikadu', level: 'Tinggi', score: 92, color: 'red', detail: '1.001 jiwa mengungsi dan 8 rumah rusak berat pada April 2023.' },
    { title: 'Krisis air bersih', area: 'Wilayah perbukitan dan kawasan Sadeng Kolot', level: 'Tinggi', score: 78, color: 'gold', detail: 'Sumber air warga menyusut saat periode kemarau panjang.' },
    { title: 'Tanah longsor', area: 'Lereng dengan kemiringan 15°–30°', level: 'Waspada', score: 68, color: 'orange', detail: 'Hujan ekstrem dini hari atau malam meningkatkan kewaspadaan jalur transportasi.' },
    { title: 'Literasi & pendidikan', area: 'SDN 02 Sadeng dan akses pendidikan', level: 'Perlu aksi', score: 61, color: 'teal', detail: 'Indeks literasi sekolah masih merah dan proporsi pendidikan tinggi rendah.' }
  ],
  potentials: [
    { number: '01', title: 'Kampung manggis', tag: 'Ekonomi', detail: 'Manggis, durian, dan pala menjadi basis penguatan produk turunan, GAP, pembukuan, PIRT, serta pemasaran.', icon: 'fruit' },
    { number: '02', title: 'Seureuh Hejo', tag: 'Ekowisata', detail: 'Kampung Gunung Seureuh memiliki wisata alam dan camping ground yang dapat diintegrasikan dengan UMKM lokal.', icon: 'leaf' },
    { number: '03', title: 'Modal sosial kuat', tag: 'Kelembagaan', detail: 'Sekolah, pesantren, 10 titik Posyandu, kelompok tani, dan komunitas menjadi pintu kolaborasi lintas generasi.', icon: 'community' }
  ],
  programs: [
    { title: 'Siaga Kali Cinanggung', type: 'Mitigasi', detail: 'Peta jalur evakuasi, sistem peringatan warga, simulasi sederhana, dan pemetaan titik rentan.', color: 'red' },
    { title: 'Sadeng Panen Air', type: 'Ketahanan air', detail: 'Prototipe panen air hujan, literasi sanitasi, dan pencatatan sumber air di dusun prioritas.', color: 'teal' },
    { title: 'Manggis Naik Kelas', type: 'Ekonomi warga', detail: 'Identitas produk, katalog digital, pembukuan Gapoktan, dan eksplorasi olahan kulit/buah.', color: 'gold' },
    { title: 'Literasi Berantai', type: 'Pendidikan', detail: 'Pendampingan berkelanjutan berbasis children leader agar program sekolah tidak berhenti setelah KKN.', color: 'orange' }
  ],
  kkn: [
    { year: '2026', title: 'KKN 190 SAVENTRA · UIN Jakarta', detail: 'Literasi digital untuk 50 siswa SDN 02 Sadeng; keamanan akun, cyberbullying, dan peer learning.' },
    { year: '2023', title: 'KKN kolaborasi · UIKA Bogor', detail: 'Publikasi digital UMKM, bimbingan belajar, dan pengajaran mengaji di beberapa titik desa.' },
    { year: '—', title: 'Pengabdian peningkatan HLS', detail: 'Sosialisasi PAUD, wajib belajar 12 tahun, taman baca, dan bimbingan belajar.' }
  ],
  sources: [
    { group: 'Pemerintahan & statistik', name: 'Portal BESTIE Kabupaten Bogor', url: 'https://bestie.bogorkab.go.id/profilwilayah.php?cKec=39&cKel=355&cdx=82cec96096d4281b7c95cd7e74623496' },
    { group: 'Pemerintahan & statistik', name: 'BPS · Kecamatan Leuwisadeng Dalam Angka', url: 'https://bogorkab.bps.go.id/id/publication/2017/09/20/2e409a48a0bd2d6ef43791cb/kecamatan-leuwisadeng-dalam-angka-2017.html' },
    { group: 'Iklim & cuaca', name: 'BMKG · Prakiraan Kecamatan Leuwisadeng', url: 'https://www.bmkg.go.id/cuaca/prakiraan-cuaca/32.01.39' },
    { group: 'Kebencanaan', name: 'CNN Indonesia · Banjir Bandang Desa Sadeng', url: 'https://www.cnnindonesia.com/nasional/20230428142404-20-943094/seribu-warga-terdampak-banjir-bandang-di-leuwisadeng-bogor' },
    { group: 'Potensi ekonomi', name: 'BogorOne · Ekspor Manggis Desa Sadeng', url: 'https://bogorone.co.id/gapoktan-bina-warga-tani-ekspor-80-ton-manggis-pertahun/' },
    { group: 'Potensi wisata', name: 'Traveloka Explore · Seureuh Hejo', url: 'https://www.traveloka.com/id-id/explore/activities/wisata-seureuh-hejo-di-bogor-ta/1001232' },
    { group: 'Jejak KKN', name: 'LP2M UIN Jakarta · KKN SAVENTRA', url: 'https://lp2m.uinjkt.ac.id/id/bukan-sekadar-bermain-di-dunia-maya-kkn-190-saventra-uin-jakarta-ajak-siswa-sdn-02-sadeng-kenali-risiko-dan-bahaya-serta-belajar-aman-dan-berdaya-di-dunia-digital' }
  ]
};

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.geojson': 'application/geo+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml'
};
const JSON_TYPE = 'application/json; charset=utf-8';

function send(response, status, body, type = 'text/plain; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  response.end(body);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { console.warn(`Gagal membaca ${path.basename(file)}: ${error.message}`); return fallback; }
}

function resolveStatic(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const file = path.resolve(root, '.' + (decoded === '/' ? '/public/index.html' : decoded));
  if (!staticDirs.some((dir) => file.startsWith(dir))) return null;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return null;
  return file;
}

// Foto lokal (relatif terhadap root proyek) diubah jadi URL web, hanya bila filenya benar-benar ada di data/photos.
function photoUrl(properties) {
  const value = properties.foto_lokal || properties.foto_url || properties.photo;
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const rel = String(value).replace(/^\/+/, '');
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(photosDir) || !fs.existsSync(abs)) return null;
  return '/' + rel.replace(/\\/g, '/');
}

function buildDashboard() {
  let markdownLength = 0;
  try { markdownLength = fs.readFileSync(sourcePath, 'utf8').length; } catch (error) { console.warn(`Sumber markdown tidak terbaca: ${error.message}`); }
  const baseSpatial = readJson(spatialPath, { features: [], metadata: {} });
  const surveySpatial = readJson(surveySpatialPath, { features: [] });
  const nearbySpatial = readJson(nearbySpatialPath, { features: [] });
  const features = [...(baseSpatial.features || []), ...(surveySpatial.features || []), ...(nearbySpatial.features || [])];

  const points = features.filter((f) => f.geometry?.type === 'Point').map((feature) => {
    const properties = feature.properties || {};
    const layer = properties.layer || 'fasilitas';
    const rawCategory = `${properties.kategori || ''} ${properties.nama || ''}`.toLowerCase();
    const nearbyKind = properties.layer ? null
      : rawCategory.includes('pasar') ? 'market'
      : rawCategory.includes('puskesmas') ? 'health'
      : rawCategory.includes('curug') || rawCategory.includes('wisata') ? 'tourism' : null;
    return {
      id: properties.id,
      layer: nearbyKind || layer,
      name: properties.nama,
      category: properties.kategori || properties.kategori_risiko || properties.layer,
      riskLevel: properties.tingkat_risiko || null,
      address: properties.alamat,
      source: properties.sumber_verifikasi,
      photo: photoUrl(properties),
      photoReference: properties.foto_referensi_url || null,
      description: properties.deskripsi || properties.deskripsi_singkat || properties.catatan_risiko || properties.fungsi || null,
      capacity: properties.kapasitas_maksimal_orang || null,
      photoStatus: properties.status_foto_lokal || null,
      precision: properties.presisi_koordinat || null,
      coordinates: feature.geometry.coordinates
    };
  });

  const boundaries = features.filter((f) => ['Polygon', 'MultiPolygon'].includes(f.geometry?.type));
  const districtBoundary = boundaries.find((f) => f.properties?.id === 'boundary_kecamatan_leuwisadeng') || null;
  const boundary = boundaries.find((f) => f.properties?.id === 'boundary_desa_sadeng') || boundaries.find((f) => f !== districtBoundary) || null;
  const routes = features.filter((f) => f.geometry?.type === 'LineString').map((f) => ({ ...f.properties, geometry: f.geometry }));

  return {
    ...dashboard,
    spatial: { points, routes, boundary, districtBoundary, metadata: baseSpatial.metadata || {} },
    source: { file: path.basename(sourcePath), characters: markdownLength }
  };
}

function handle(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/api/dashboard') return send(response, 200, JSON.stringify(buildDashboard()), JSON_TYPE);
  if (url.pathname === '/api/article-preview') return articlePreview(url.searchParams.get('source'), response);
  const file = resolveStatic(url.pathname);
  if (!file) return send(response, 404, 'Not found');
  send(response, 200, fs.readFileSync(file), mime[path.extname(file).toLowerCase()] || 'application/octet-stream');
}

const server = http.createServer((request, response) => {
  try {
    const result = handle(request, response);
    if (result && typeof result.catch === 'function') result.catch((error) => { console.error(error); if (!response.headersSent) send(response, 500, JSON.stringify({ error: 'Kesalahan server' }), JSON_TYPE); });
  } catch (error) {
    console.error(error);
    if (!response.headersSent) send(response, 500, JSON.stringify({ error: 'Kesalahan server' }), JSON_TYPE);
  }
});

const isAllowedHost = (host) => [...previewHosts].some((h) => host === h || host.endsWith(`.${h}`));

// Ikuti redirect secara manual agar setiap hop divalidasi (cegah SSRF lewat redirect).
async function fetchAllowed(source, signal) {
  let current = source;
  for (let hop = 0; hop <= 3; hop += 1) {
    const target = new URL(current);
    if (!['http:', 'https:'].includes(target.protocol) || !isAllowedHost(target.hostname)) throw new Error('Domain tidak diizinkan');
    const result = await fetch(current, { signal, redirect: 'manual', headers: { 'User-Agent': 'SadengInsight/1.0' } });
    const location = result.headers.get('location');
    if (result.status >= 300 && result.status < 400 && location) { current = new URL(location, current).href; continue; }
    return { result, finalUrl: current };
  }
  throw new Error('Terlalu banyak redirect');
}

async function articlePreview(source, response) {
  let parsed;
  try { parsed = new URL(source); } catch { return send(response, 400, JSON.stringify({ error: 'Sumber berita tidak valid' }), JSON_TYPE); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !isAllowedHost(parsed.hostname)) return send(response, 403, JSON.stringify({ error: 'Domain berita tidak diizinkan' }), JSON_TYPE);
  if (previewCache.has(source)) return send(response, 200, JSON.stringify(previewCache.get(source)), JSON_TYPE);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const { result, finalUrl } = await fetchAllowed(source, controller.signal);
    const html = (await result.text()).slice(0, 300000);
    const imageMatch = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    let image = null;
    if (imageMatch) {
      try { const candidate = new URL(imageMatch[1], finalUrl); if (['http:', 'https:'].includes(candidate.protocol)) image = candidate.href; } catch { /* abaikan */ }
    }
    const preview = { image, title: titleMatch ? titleMatch[1].trim() : parsed.hostname, source };
    if (previewCache.size > 200) previewCache.clear();
    previewCache.set(source, preview);
    send(response, 200, JSON.stringify(preview), JSON_TYPE);
  } catch (error) {
    send(response, 200, JSON.stringify({ image: null, title: parsed.hostname, source, error: 'Pratinjau berita tidak tersedia' }), JSON_TYPE);
  } finally { clearTimeout(timeout); }
}

process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
server.listen(port, () => console.log(`Sadeng Insight berjalan di http://localhost:${port}`));