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

## Pengolahan data

`server.js` membaca file sumber Markdown pada `data/` setiap kali endpoint `/api/dashboard` dipanggil. Dataset dashboard dinormalisasi menjadi objek profil, statistik, musim, risiko, potensi, program, jejak KKN, dan sumber. Angka dan temuan ditampilkan dengan konteks asalnya; data ini adalah baseline riset, bukan pengganti verifikasi lapangan.

## Struktur

- `server.js`: server HTTP, API `/api/dashboard`, dan pembacaan sumber Markdown.
- `public/index.html`: struktur halaman dashboard.
- `public/styles.css`: visual system responsif.
- `public/app.js`: render data dan filter sumber.
- `data/`: dokumen riset sumber.