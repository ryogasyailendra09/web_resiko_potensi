# Data tambahan untuk peta Desa Sadeng

Laporan Markdown saat ini belum memiliki geometri wilayah. Agar panel peta dapat menampilkan batas Desa Sadeng secara presisi, tambahkan salah satu format berikut:

## Pilihan utama: GeoJSON

Simpan sebagai `desa_sadeng.geojson` dengan satu `Feature` bertipe `Polygon` atau `MultiPolygon`. Properti yang disarankan:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "Desa Sadeng" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[106.0, -6.0], [106.1, -6.0], [106.1, -6.1], [106.0, -6.1], [106.0, -6.0]]]
      }
    }
  ]
}
```

Koordinat GeoJSON wajib memakai urutan `[longitude, latitude]` dalam sistem WGS84/EPSG:4326.

## Pilihan minimum: koordinat pusat

Jika batas administrasi belum tersedia, simpan `desa_sadeng_location.json`:

```json
{
  "name": "Desa Sadeng",
  "latitude": -6.581,
  "longitude": 106.63,
  "zoom": 13
}
```

Koordinat di atas hanya contoh indikatif dari panel saat ini, bukan klaim titik administratif resmi.

## Data tambahan yang akan membuat infografis lebih tajam

- Titik rawan banjir, longsor, dan kekeringan beserta koordinatnya.
- Lokasi sekolah, Posyandu, kelompok tani, sumber air, dan tempat evakuasi.
- Data penduduk per dusun/RW/RT dengan tahun pengukuran.
- Data curah hujan atau kejadian bencana per tahun.
- Data produksi, harga, dan rantai pasok manggis/durian/pala.
- Foto lapangan dengan tanggal dan lokasi.

Data geospasial sebaiknya menyebutkan sumber, tanggal pengambilan, dan tingkat ketelitian agar tidak tercampur dengan estimasi dari laporan sekunder.

## Data untuk peta interaktif

Halaman peta khusus tersedia di `/public/map.html`. Agar layer risiko dan foto dapat tampil, tambahkan properti berikut pada feature GeoJSON:

```json
{
  "id": "risk_banjir_kp_paku_2023",
  "nama": "Titik rawan banjir Kp. Paku",
  "kategori": "Risiko Banjir",
  "deskripsi": "Luapan sungai saat hujan intensitas tinggi.",
  "foto_url": "/data/photos/banjir-kp-paku-2023.jpg",
  "tanggal": "2023-04-24",
  "tingkat_risiko": "Tinggi",
  "sumber_verifikasi": "https://contoh-sumber-resmi.id"
}
```

Kategori yang dikenali peta: `Risiko Banjir`, `Risiko Longsor`, `Pendidikan`, `Pusat Pemerintahan`, `Kesehatan`, `Pertanian`, dan `Wisata`. Foto sebaiknya tidak memuat wajah atau identitas pribadi tanpa izin; gunakan foto lokasi, fasilitas, atau dokumentasi yang sudah dianonimkan.
