# Sadeng Insight

Dashboard Node.js untuk menampilkan hasil olahan riset risiko, potensi, dan rekomendasi program KKN di Desa Sadeng, Kecamatan Leuwisadeng.

## Menjalankan

Prasyarat: Node.js 18 atau lebih baru.

```bash
npm install
npm start
```

Buka `http://localhost:3000` di browser. Mode pengembangan dengan reload otomatis:

```bash
npm run dev
```

Peta eksplorasi khusus tersedia di `http://localhost:3000/public/map.html`.

## Pengolahan data

`server.js` membaca file sumber Markdown dan GeoJSON pada `data/` setiap kali endpoint `/api/dashboard` dipanggil. Dataset dashboard dinormalisasi menjadi objek profil, statistik, musim, risiko, potensi, program, jejak KKN, data per RW, fasilitas, dan titik spasial. Peta Leaflet menampilkan lima titik terverifikasi dari GeoJSON.

Untuk memproses arsip spasial mentah setelah menaruhnya di `data/`, jalankan:

```bash
python extract.py
```

Script mencoba shapefile lokal terlebih dahulu, lalu beberapa endpoint Overpass, dan tetap menghasilkan file gabungan dari titik terverifikasi tanpa membuat poligon perkiraan bila layanan jaringan sedang gagal.

Workbook `data/dataset_kkn_desa_sadeng.xlsx` dipakai sebagai sumber kerja lokal dan sengaja masuk `.gitignore` karena dapat memuat detail data lapangan. Ringkasan yang aman untuk dashboard dinormalisasi di `server.js`. File `.env`, kunci, folder private, dan pola dataset sensitif juga diabaikan.

Angka dan temuan tetap merupakan baseline riset, bukan pengganti verifikasi lapangan.

## Data yang Ditunda

Layer sumber air sengaja disembunyikan dari peta sampai workbook memiliki koordinat GPS titik mata air, sumur, atau tandon. Puskesmas Sadeng Pasar, Puskesmas Leuwisadeng, dan Seureuh Hejo sudah tercatat secara tekstual, tetapi belum memiliki koordinat desimal yang aman untuk dijadikan pin.

Data terbaru sudah memetakan Pasar Rakyat Leuwisadeng, Curug Rubina, dan Curug Wangun Jaya. Keduanya berada di sekitar wilayah administratif Sadeng, bukan seluruhnya di dalam Desa Sadeng; label wilayah pada popup tetap ditampilkan agar tidak menyesatkan.

Boundary Kecamatan Leuwisadeng sudah didukung oleh extractor dan akan tampil sebagai garis biru terpisah ketika polygon resmi berhasil diperoleh. Saat ini sumber Overpass sedang tidak stabil, sehingga toggle Kecamatan disembunyikan dan aplikasi mempertahankan polygon Desa Sadeng lama tanpa membuat batas perkiraan.

## Data yang Ditunda

Layer sumber air sengaja disembunyikan dari peta sampai workbook memiliki koordinat GPS titik mata air, sumur, atau tandon. Data sekitar yang sudah diketahui secara tekstual adalah Sadeng Pasar, Puskesmas Sadeng Pasar, Puskesmas Leuwisadeng, dan wisata Seureuh Hejo, tetapi belum memiliki koordinat yang cukup untuk dijadikan pin.

Curug di sekitar Sadeng belum ditambahkan karena belum ditemukan nama, koordinat, dan sumber resmi yang dapat diverifikasi. Jangan gunakan daftar tempat ini sebagai navigasi presisi sebelum survei atau sumber geospasial resmi dilengkapi.

## Struktur

- `server.js`: server HTTP, API `/api/dashboard`, dan pembacaan sumber Markdown.
- `public/index.html`: struktur halaman dashboard.
- `public/styles.css`: visual system responsif.
- `public/glass.css`: tema liquid glass dan dynamic island.
- `public/data.css`: styling peta dan tabel data terbaru.
- `public/app.js`: render data dan filter sumber.
- `data/`: dokumen riset dan geospasial publik.
- `.gitignore`: perlindungan konfigurasi, kunci, dan workbook lokal.