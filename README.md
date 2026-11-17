# Sadeng Insight

Dashboard Node.js untuk menampilkan hasil olahan riset risiko, potensi, dan rekomendasi program KKN di Desa Sadeng, Kecamatan Leuwisadeng, Kabupaten Bogor. Terdiri dari halaman dashboard (`/`) dan peta interaktif penuh (`/public/map.html`).

## Menjalankan

Prasyarat: Node.js 18 atau lebih baru (diuji di Node 22).

```bash
npm install
npm start
```

Buka `http://localhost:3000`. Mode pengembangan dengan reload otomatis:

```bash
npm run dev
```

Peta eksplorasi: `http://localhost:3000/public/map.html`.

### Jika muncul `EADDRINUSE` (port 3000 sudah dipakai)

Artinya ada proses Node lama yang masih hidup, sehingga perubahan kode tidak terpakai. Matikan, lalu start ulang (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
npm start
```

## Verifikasi setelah menyalakan

Jalankan di terminal **baru** (server tetap menyala di terminal lain). Contoh di bawah untuk Windows PowerShell; di PowerShell gunakan `curl.exe`, bukan `curl` (alias `curl` memanggil `Invoke-WebRequest` dan akan meminta `Uri:`).

**1. API dan data spasial**

```powershell
node -e "fetch('http://localhost:3000/api/dashboard').then(r=>r.json()).then(d=>console.log({titik:d.spatial.points.length,desa:!!d.spatial.boundary,kecamatan:!!d.spatial.districtBoundary,rute:d.spatial.routes.length}))"
```

`desa: true` wajib. `kecamatan: true` berarti batas Leuwisadeng sudah berhasil diekstrak (lihat bagian *Batas wilayah*).

**2. Keamanan: file internal tidak boleh bisa diunduh (semua harus `404`)**

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/server.js
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/.env
curl.exe -s -o NUL -w "%{http_code}`n" --path-as-is http://localhost:3000/data/../server.js
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/data/Bogor.zip
```

**3. Halaman publik harus tetap `200`**

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/public/map.html
```

**4. Uji manual di `http://localhost:3000/public/map.html`**

- Tombol **☷ Lapisan** di kiri atas membuka/menutup panel, dan tombol tetap terlihat saat panel terbuka.
- Garis biru titik-titik (Kecamatan) berbeda dari garis oranye putus-putus (Desa).
- Klik marker Kantor Desa: cluster terbuka (spiderfy) dan tiga titik yang bertumpuk bisa dipilih satu per satu.

Di Linux/macOS, ganti `curl.exe` dengan `curl`, `NUL` dengan `/dev/null`, dan `` `n `` dengan `\n`.

## Pengolahan data

`server.js` membaca file sumber Markdown dan GeoJSON di `data/` setiap kali `/api/dashboard` dipanggil. File yang hilang atau rusak dilewati dengan peringatan di konsol, server tidak crash. Dataset dinormalisasi menjadi objek profil, statistik, musim, risiko, potensi, program, jejak KKN, data per RW, fasilitas, dan titik spasial.

- **Dashboard** (hero map): menampilkan titik dasar (pemerintahan dan pendidikan) beserta batas desa.
- **Peta penuh**: menampilkan semua layer (risiko bencana, pengungsian, pasar, wisata, jalur evakuasi, dan lainnya).

### Server hanya melayani folder publik

Hanya `/public` dan `/data/photos` yang bisa diakses lewat web. `server.js`, `.env`, `data/*.xlsx`, `data/Bogor.zip`, dan file lain di root tidak ikut disajikan.

## Batas wilayah (Desa dan Kecamatan)

```bash
pip install geopandas pyogrio
python extract.py
```

`extract.py` mencoba sumber berikut berurutan:

1. Shapefile BIG lokal `data/ADMINISTRASIDESA_AR_25K.shp`.
2. Arsip RBI 25K `data/Bogor.zip`. Isinya File Geodatabase (`.gdb`); script mendeteksi layer batas desa sendiri dan mencetak daftar layer yang ada.
3. OpenStreetMap lewat beberapa endpoint Overpass.

Jika semua gagal, polygon lama dipertahankan. Script tidak pernah membuat poligon perkiraan. Batas Kecamatan Leuwisadeng ditampilkan sebagai garis biru terpisah dari batas Desa Sadeng (oranye); bila polygon kecamatan belum tersedia, toggle-nya disembunyikan.

Jika layer di `Bogor.zip` tidak terdeteksi, salin baris `Layer di ...gdb: [...]` dari output script untuk menyesuaikan filter.

`data/Bogor.zip` berukuran besar dan sengaja diabaikan Git (lihat `.gitignore`); file ini hanya perlu ada di komputer lokal.

## Foto lokasi

Urutan sumber, dari yang paling disarankan:

1. **Foto survei sendiri.** Taruh di `data/photos/` dengan nama persis seperti kolom di Excel, lalu jalankan `python update_gis_dari_survei.py`. Hindari wajah atau identitas warga tanpa izin; foto mentah taruh di `data/photos/raw/` (tidak ikut Git).
2. **Thumbnail berita (`og:image`)** untuk titik yang punya `foto_referensi_url`. Hanya ditampilkan lewat tautan, tidak diunduh.
3. **Wikimedia Commons** (lisensi terbuka), lewat `fetch_photos_commons.py`:

```bash
python fetch_photos_commons.py                       # mode laporan: hanya mencari, tidak mengunduh
python fetch_photos_commons.py --download            # unduh kandidat teratas ke data/photos/commons/
python fetch_photos_commons.py --download --ids POI_05_CURUG_RUBINA_SIBANTENG
```

Laporan ada di `data/photos/commons_report.json`, kredit (penulis, lisensi, sumber) di `data/photos/commons_credits.json`. Periksa relevansi tiap kandidat sebelum `--download`, karena pencarian berbasis kata kunci bisa menghasilkan foto lokasi lain. Tampilan atribusi di popup peta belum tersambung ke `server.js` dan `map.js`.

Scraping Google Images tidak dipakai (melanggar ketentuan layanan dan hak cipta).

## Data yang ditunda

- **Layer sumber air** disembunyikan sampai workbook memiliki koordinat GPS titik mata air, sumur, atau tandon.
- **Puskesmas Sadeng Pasar, Puskesmas Leuwisadeng, dan Seureuh Hejo** sudah tercatat secara tekstual tetapi belum punya koordinat desimal yang aman untuk dijadikan pin.
- **Pasar Rakyat Leuwisadeng, Curug Rubina, dan Curug Wangun Jaya** sudah dipetakan. Curug Rubina (Desa Sibanteng) dan Curug Wangun Jaya (Desa Wangun Jaya) berada di sekitar, bukan di dalam batas administratif Desa Sadeng; label wilayah di popup tetap ditampilkan agar tidak menyesatkan.
- Jangan gunakan peta ini sebagai navigasi presisi sebelum survei atau sumber geospasial resmi dilengkapi.

## Keamanan dan data sensitif

- Workbook `data/dataset_kkn_desa_sadeng.xlsx` dan `data/form_survei_dan_database_gis_sadeng-v2.xlsx` adalah sumber kerja lokal yang diabaikan Git.
- `.gitignore` mengabaikan `.env`, kunci, folder `private/`, spreadsheet/CSV, arsip, data spasial mentah (`.gdb`, `.shp`, dan lainnya), serta `data/photos/raw/` dan `data/tracks/` (GPS lapangan).
- `.gitignore` tidak menghapus file yang sudah pernah ter-commit. Periksa dengan `git ls-files` dan lepas dengan `git rm --cached <file>`. Jika `.env` atau kunci API pernah ter-commit, ganti kuncinya.

Angka dan temuan merupakan baseline riset, bukan pengganti verifikasi lapangan.

## Struktur

- `server.js`: server HTTP, API `/api/dashboard`, pratinjau berita `/api/article-preview`, dan file statis terbatas.
- `extract.py`: ekstraksi batas Desa/Kecamatan (BIG, `Bogor.zip`, Overpass) dan ekspor KML.
- `update_gis_dari_survei.py`: membangun GeoJSON final dari workbook survei.
- `fetch_photos_commons.py`: pencarian dan unduh foto berlisensi terbuka.
- `public/index.html`, `public/app.js`: dashboard.
- `public/map.html`, `public/map.js`: peta interaktif penuh.
- `public/*.css`: `styles.css` (dasar), `glass.css` (tema), `data.css`, `dashboard.css`, `map*.css` (peta).
- `data/`: dokumen riset dan geospasial.
- `.gitignore`: perlindungan konfigurasi, kunci, workbook, dan data mentah.