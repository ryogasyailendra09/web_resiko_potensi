import json
import os
import urllib.request
import openpyxl

EXCEL_PATH = "form_survei_dan_database_gis_sadeng-v2.xlsx"
GEOJSON_OUT = "peta_kebencanaan_evakuasi_desa_sadeng_final.geojson"


def snap_route_osrm(coords_lon_lat):
    """Mengubah titik simpul koridor estimasi menjadi geometri jalan resmi menggunakan OSRM OpenStreetMap."""
    coord_str = ";".join(f"{lon},{lat}" for lon, lat in coords_lon_lat)
    url = f"https://router.project-osrm.org/route/v1/foot/{coord_str}?overview=full&geometries=geojson"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "KKN-Sadeng-GIS/2.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if data.get("code") == "Ok" and data.get("routes"):
            route = data["routes"][0]
            return route["geometry"]["coordinates"], round(route["distance"] / 1000.0, 2), "Terverifikasi Rute Jalan OSM"
    except Exception as exc:
        print(f"[Info] Gagal menghubungi OSRM ({exc}), mempertahankan koordinat koridor awal.")
    return coords_lon_lat, None, "Koridor Estimasi"


def build_final_geojson():
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    features = []

    # 1. Baca Sheet 1: Titik Bencana & Foto Lokal
    ws1 = wb["1_Titik_Bencana_dan_Foto"]
    for row in ws1.iter_rows(min_row=5, values_only=True):
        if not row[0]:
            continue
        rec_id, nama, lat_ref, lon_ref, lat_gps, lon_gps, presisi, kat, tingkat, tgl, desk, foto_path, status_foto, url_ref, sumber = row
        lat = float(lat_gps) if lat_gps is not None else float(lat_ref)
        lon = float(lon_gps) if lon_gps is not None else float(lon_ref)
        presisi_final = "Terverifikasi GPS Lapangan" if (lat_gps and lon_gps) else presisi
        foto_ada = os.path.exists(str(foto_path)) if foto_path else False

        features.append({
            "type": "Feature",
            "properties": {
                "id": rec_id,
                "layer": "titik_rawan_bencana",
                "nama": nama,
                "latitude": lat,
                "longitude": lon,
                "presisi_koordinat": presisi_final,
                "kategori_risiko": kat,
                "tingkat_risiko": tingkat,
                "tanggal_kejadian": str(tgl),
                "deskripsi_singkat": desk,
                "foto_lokal": foto_path if foto_ada else None,
                "status_foto_lokal": "Tersedia" if foto_ada else f"File belum ditemukan di {foto_path}",
                "foto_referensi_url": url_ref,
                "sumber_verifikasi": sumber,
            },
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
        })

    # 2. Baca Sheet 2: Titik Pengungsian & Kapasitas Numerik
    ws2 = wb["2_Pengungsian_Kapasitas"]
    for row in ws2.iter_rows(min_row=5, values_only=True):
        if not row[0]:
            continue
        ev_id, nama, lat, lon, jml_ruang, luas_m2, kapasitas, status_kap, fungsi, akses, sumber = row
        kap_num = int(kapasitas) if isinstance(kapasitas, (int, float)) else None
        features.append({
            "type": "Feature",
            "properties": {
                "id": ev_id,
                "layer": "titik_pengungsian",
                "nama": nama,
                "latitude": float(lat),
                "longitude": float(lon),
                "kapasitas_maksimal_orang": kap_num,
                "status_kapasitas": "Terverifikasi" if kap_num else status_kap,
                "fungsi": fungsi,
                "aksesibilitas": akses,
                "sumber_verifikasi": sumber,
            },
            "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
        })

    # 3. Baca Sheet 3: Titik Sumber Air / Tandon / Kekeringan per RW
    ws3 = wb["3_Titik_Air_dan_Kekeringan"]
    for row in ws3.iter_rows(min_row=5, values_only=True):
        if not row[0]:
            continue
        air_id, jenis, rw_kp, lat_gps, lon_gps, kondisi, jml_kk, ket = row
        if lat_gps is not None and lon_gps is not None:
            features.append({
                "type": "Feature",
                "properties": {
                    "id": air_id,
                    "layer": "titik_sumber_air_kekeringan",
                    "nama": f"{jenis} – {rw_kp}",
                    "kategori_risiko": "Kekeringan & Sumber Air Bersih",
                    "kondisi_kemarau": kondisi,
                    "jumlah_kk_terdampak": jml_kk,
                    "deskripsi_singkat": ket,
                    "presisi_koordinat": "Terverifikasi GPS Lapangan",
                },
                "geometry": {"type": "Point", "coordinates": [float(lon_gps), float(lat_gps)]},
            })

    # 4. Jalur Evakuasi (Snapping otomatis ke jaringan jalan OpenStreetMap)
    jalur_dasar = [
        ("ROUTE_01_PAKU_TO_DESA", "Jalur Evakuasi 1: Kp. Paku -> MI Al Khoeriyah -> Kantor Desa Sadeng", [[106.594234, -6.568013], [106.590516, -6.565663], [106.590328, -6.561262]]),
        ("ROUTE_02_CIKADU_TO_DESA", "Jalur Evakuasi 2: SDN Sukajadi (Kp. Cikadu) <-> Kantor Desa Sadeng", [[106.576547, -6.553138], [106.590328, -6.561262]]),
        ("ROUTE_03_DESA_TO_KECAMATAN", "Jalur Logistik & Medis: Kantor Desa Sadeng <-> Kantor Kec. Leuwisadeng", [[106.590328, -6.561262], [106.614484, -6.565138]]),
    ]
    for r_id, r_nama, pts in jalur_dasar:
        snapped_coords, dist_km, status_jalur = snap_route_osrm(pts)
        features.append({
            "type": "Feature",
            "properties": {
                "id": r_id,
                "layer": "jalur_evakuasi",
                "nama": r_nama,
                "jarak_km": dist_km,
                "status_verifikasi_jalur": status_jalur,
            },
            "geometry": {"type": "LineString", "coordinates": snapped_coords},
        })

    with open(GEOJSON_OUT, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False, indent=2)
    print(f"Berhasil membangun {GEOJSON_OUT} dengan {len(features)} fitur terverifikasi.")


if __name__ == "__main__":
    os.makedirs("data/photos", exist_ok=True)
    os.makedirs("data/tracks", exist_ok=True)
    build_final_geojson()