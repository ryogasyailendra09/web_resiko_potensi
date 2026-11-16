const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const root = __dirname;
const port = process.env.PORT || 3000;
const sourcePath = path.join(root, 'data', 'rangkuman_data_riset_kkn_desa_sadeng_kec_leuwisadeng.md');
const spatialPath = path.join(root, 'data', 'desa_sadeng_leuwisadeng.geojson');

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

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function send(response, status, body, type = 'text/plain; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  response.end(body);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === '/api/dashboard') {
    const markdown = fs.readFileSync(sourcePath, 'utf8');
    const spatial = JSON.parse(fs.readFileSync(spatialPath, 'utf8'));
    const points = spatial.features.filter((feature) => feature.geometry?.type === 'Point').map((feature) => ({
      id: feature.properties.id,
      name: feature.properties.nama,
      category: feature.properties.kategori,
      address: feature.properties.alamat,
      source: feature.properties.sumber_verifikasi,
      coordinates: feature.geometry.coordinates
    }));
    return send(response, 200, JSON.stringify({ ...dashboard, spatial: { points, metadata: spatial.metadata }, source: { file: path.basename(sourcePath), characters: markdown.length } }), 'application/json; charset=utf-8');
  }
  const requested = url.pathname === '/' ? '/public/index.html' : url.pathname;
  const file = path.normalize(path.join(root, requested));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(response, 404, 'Not found');
  send(response, 200, fs.readFileSync(file), mime[path.extname(file)] || 'application/octet-stream');
});

server.listen(port, () => console.log(`Sadeng Insight berjalan di http://localhost:${port}`));