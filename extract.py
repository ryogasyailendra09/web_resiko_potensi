import json
import os
import urllib.request
import urllib.parse
import urllib.error
import xml.etree.ElementTree as ET
import zipfile
from xml.dom import minidom

# ==============================================================================
# Prioritas sumber batas wilayah:
#   1. Shapefile BIG lokal  : data/ADMINISTRASIDESA_AR_25K.shp
#   2. Arsip RBI 25K lokal  : data/Bogor.zip  (dibaca langsung tanpa ekstrak)
#   3. OpenStreetMap Overpass API (tanpa library tambahan)
# Sumber 1 dan 2 butuh: pip install geopandas pyogrio
# ==============================================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
SHP_BIG_PATH = os.path.join(DATA_DIR, "ADMINISTRASIDESA_AR_25K.shp")  # Ubah path jika file BIG tersedia
BOGOR_ZIP_PATH = os.path.join(DATA_DIR, "Bogor.zip")  # RBI 25K Kab. Bogor (lokal, besar, tidak di-commit)


# ------------------------------------------------------------------ BIG / RBI
def _baca_gdb_dari_zip(semua):
    """Bogor.zip berisi File Geodatabase (.gdb), bukan shapefile: cari layer batas desa di dalamnya."""
    import geopandas as gpd

    zip_posix = BOGOR_ZIP_PATH.replace("\\", "/")
    daftar_gdb = sorted({n.split(".gdb/")[0] + ".gdb" for n in semua if ".gdb/" in n})
    if not daftar_gdb:
        print("Bogor.zip tidak berisi shapefile administrasi maupun .gdb.")
        print("Isi arsip (60 entri pertama):", semua[:60])
        return None

    for gdb in daftar_gdb:
        sumber = f"/vsizip/{zip_posix}/{gdb}"
        try:
            try:
                import pyogrio
                layers = [str(r[0]) for r in pyogrio.list_layers(sumber)]
            except ImportError:
                import fiona
                layers = list(fiona.listlayers(sumber))
        except Exception as error:
            print(f"Gagal membaca {gdb}: {error}")
            continue
        print(f"Layer di {gdb}: {layers}")
        kandidat = [
            l for l in layers
            if any(k in l.lower() for k in ("desa", "deskel", "kelurahan"))
            and any(k in l.lower() for k in ("admin", "batas", "taswil"))
        ]
        kandidat.sort(key=lambda l: ("_ar" not in l.lower(), len(l)))
        for layer in kandidat:
            print(f"Membaca layer {layer} dari {gdb} ...")
            gdf = gpd.read_file(sumber, layer=layer)
            if any(c in gdf.columns for c in ("WADMKD", "NAMOBJ", "DESA")):
                return gdf
            print(f"Layer {layer} tidak punya kolom nama desa. Kolom: {list(gdf.columns)}")
    print("Layer batas desa tidak ditemukan. Salin daftar layer di atas ke chat agar filter bisa disesuaikan.")
    return None


def baca_gdf_desa():
    """Mengembalikan GeoDataFrame batas desa dari shapefile BIG atau Bogor.zip; None bila tidak tersedia."""
    try:
        import geopandas as gpd
    except ImportError:
        print("geopandas belum terpasang (pip install geopandas pyogrio); sumber BIG dilewati.")
        return None

    if os.path.exists(SHP_BIG_PATH):
        print("Membaca shapefile BIG lokal...")
        return gpd.read_file(SHP_BIG_PATH)

    if os.path.exists(BOGOR_ZIP_PATH):
        with zipfile.ZipFile(BOGOR_ZIP_PATH) as z:
            semua = z.namelist()
        kandidat = [
            n for n in semua
            if n.lower().endswith(".shp")
            and "administrasi" in n.lower()
            and "_ar" in n.lower()
            and ("desa" in n.lower() or "deskel" in n.lower())
        ]
        if not kandidat:
            return _baca_gdb_dari_zip(semua)
        import pandas as pd
        zip_posix = BOGOR_ZIP_PATH.replace("\\", "/")
        frames = []
        for inner in sorted(kandidat):
            print(f"Membaca {inner} dari Bogor.zip ...")
            frames.append(gpd.read_file(f"/vsizip/{zip_posix}/{inner}"))
        return frames[0] if len(frames) == 1 else gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs=frames[0].crs)

    return None


def _gabung(geoseries):
    if hasattr(geoseries, "union_all"):
        return geoseries.union_all()
    return geoseries.unary_union


def ambil_poligon_dari_gdf(gdf):
    from shapely.geometry import mapping

    kolom_desa = next((c for c in ["WADMKD", "NAMOBJ", "DESA"] if c in gdf.columns), None)
    kolom_kec = next((c for c in ["WADMKC", "KECAMATAN"] if c in gdf.columns), None)
    if not kolom_desa:
        raise ValueError(f"Kolom nama desa tidak ditemukan. Kolom tersedia: {list(gdf.columns)}")

    norm = lambda s: s.astype(str).str.strip().str.lower()
    gdf = gdf.to_crs(epsg=4326)
    mask_desa = norm(gdf[kolom_desa]) == "sadeng"
    mask_kec = (norm(gdf[kolom_kec]) == "leuwisadeng") if kolom_kec else None
    if mask_kec is not None:
        mask_desa = mask_desa & mask_kec

    desa = gdf[mask_desa]
    if desa.empty:
        raise ValueError(f"Poligon Desa Sadeng tidak ditemukan. Kolom dipakai: {kolom_desa}/{kolom_kec}")

    dasar = {"kabupaten": "Bogor", "sumber": "BIG RBI 25K"}
    fitur = [{
        "type": "Feature",
        "properties": {**dasar, "id": "boundary_desa_sadeng", "nama": "Batas Wilayah Administratif Sadeng",
                       "kecamatan": "Leuwisadeng", "kode_wilayah": "32.01.39.2007"},
        "geometry": mapping(_gabung(desa.geometry)),
    }]
    if mask_kec is not None and mask_kec.any():  # kecamatan = gabungan semua desa di Leuwisadeng
        fitur.append({
            "type": "Feature",
            "properties": {**dasar, "id": "boundary_kecamatan_leuwisadeng",
                           "nama": "Batas Wilayah Administratif Leuwisadeng", "kecamatan": "Leuwisadeng"},
            "geometry": mapping(_gabung(gdf[mask_kec].geometry)),
        })
    return fitur


def ambil_poligon_dari_big(shp_path):  # dipertahankan untuk kompatibilitas
    import geopandas as gpd
    return ambil_poligon_dari_gdf(gpd.read_file(shp_path))


# ------------------------------------------------------------------ Overpass
def ambil_poligon_dari_osm(nama_wilayah="Sadeng", feature_id="boundary_desa_sadeng", admin_level=None,
                           bbox="-6.62,106.53,-6.50,106.66"):  # urutan bbox: S,W,N,E
    filtr = f'["admin_level"="{admin_level}"]' if admin_level else ""
    query = (
        f'[out:json][timeout:60];'
        f'relation["boundary"="administrative"]["name"="{nama_wilayah}"]{filtr}({bbox});'
        f'out geom;'
    )
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.private.coffee/api/interpreter",
    ]
    osm = None
    errors = []
    for url in endpoints:
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "KKN-Sadeng-Mapper/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                osm = json.loads(resp.read().decode("utf-8"))
            break
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            errors.append(f"{url}: {error}")
    if osm is None:
        raise RuntimeError("Semua endpoint Overpass gagal: " + " | ".join(errors))

    # Susun segmen way luar (outer) menjadi ring koordinat tertutup
    rings = []
    for el in osm.get("elements", []):
        if el.get("type") != "relation":
            continue
        segments = [
            [[pt["lon"], pt["lat"]] for pt in m["geometry"]]
            for m in el.get("members", [])
            if m.get("type") == "way" and m.get("role") == "outer" and "geometry" in m
        ]
        while segments:
            ring = segments.pop(0)
            merged = True
            while merged and ring[0] != ring[-1]:
                merged = False
                for i, seg in enumerate(segments):
                    if seg[0] == ring[-1]:
                        ring.extend(seg[1:])
                        segments.pop(i)
                        merged = True
                        break
                    elif seg[-1] == ring[-1]:
                        ring.extend(reversed(seg[:-1]))
                        segments.pop(i)
                        merged = True
                        break
            if ring[0] != ring[-1]:
                ring.append(ring[0])
            rings.append(ring)

    if not rings:
        raise RuntimeError(f"Relasi batas {nama_wilayah} tidak ditemukan di Overpass API.")

    geom = (
        {"type": "Polygon", "coordinates": [rings[0]]}
        if len(rings) == 1
        else {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}
    )
    return [{
        "type": "Feature",
        "properties": {
            "id": feature_id,
            "nama": f"Batas Wilayah Administratif {nama_wilayah}",
            "kecamatan": "Leuwisadeng",
            "kabupaten": "Bogor",
            "kode_wilayah": "32.01.39.2007",
            "sumber": "OpenStreetMap Administrative Boundary",
        },
        "geometry": geom,
    }]


# ------------------------------------------------------------------ KML
def ekspor_ke_kml(features, kml_output):
    kml = ET.Element("kml", xmlns="http://www.opengis.net/kml/2.2")
    doc = ET.SubElement(kml, "Document")
    ET.SubElement(doc, "name").text = "Batas Wilayah & Titik Penting Desa Sadeng (32.01.39.2007)"

    style = ET.SubElement(doc, "Style", id="styleBatasDesa")
    line_style = ET.SubElement(style, "LineStyle")
    ET.SubElement(line_style, "color").text = "ff0000ff"  # Garis merah (AABBGGRR)
    ET.SubElement(line_style, "width").text = "2.5"
    poly_style = ET.SubElement(style, "PolyStyle")
    ET.SubElement(poly_style, "color").text = "260088ff"  # Isian transparan

    for feat in features:
        props = feat.get("properties", {})
        geom = feat.get("geometry", {})
        gtype = geom.get("type")
        pm = ET.SubElement(doc, "Placemark")
        ET.SubElement(pm, "name").text = str(props.get("nama") or props.get("NAMOBJ") or "Desa Sadeng")

        if gtype == "Point":
            pt = ET.SubElement(pm, "Point")
            lon, lat = geom["coordinates"][:2]
            ET.SubElement(pt, "coordinates").text = f"{lon},{lat},0"
        elif gtype in ("Polygon", "MultiPolygon"):
            ET.SubElement(pm, "styleUrl").text = "#styleBatasDesa"
            polygons = [geom["coordinates"]] if gtype == "Polygon" else geom["coordinates"]
            container = pm if len(polygons) == 1 else ET.SubElement(pm, "MultiGeometry")
            for poly_coords in polygons:
                poly_el = ET.SubElement(container, "Polygon")
                outer = ET.SubElement(poly_el, "outerBoundaryIs")
                lr = ET.SubElement(outer, "LinearRing")
                ET.SubElement(lr, "coordinates").text = " ".join(f"{pt[0]},{pt[1]},0" for pt in poly_coords[0])

    xml_bytes = minidom.parseString(ET.tostring(kml, encoding="utf-8")).toprettyxml(indent="  ", encoding="utf-8")
    with open(kml_output, "wb") as f:
        f.write(xml_bytes)


# ------------------------------------------------------------------ main
if __name__ == "__main__":
    titik_path = os.path.join(DATA_DIR, "desa_sadeng_leuwisadeng.geojson")
    output_geojson = os.path.join(DATA_DIR, "desa_sadeng_lengkap_poligon.geojson")
    output_kml = os.path.join(DATA_DIR, "desa_sadeng_lengkap_poligon.kml")

    fitur_poligon = []
    gdf = baca_gdf_desa()
    if gdf is not None:
        try:
            fitur_poligon = ambil_poligon_dari_gdf(gdf)
            print(f"Poligon dari BIG/RBI: {len(fitur_poligon)} fitur.")
        except ValueError as error:
            print(f"Peringatan BIG: {error}")

    if not fitur_poligon:
        print("Sumber BIG tidak tersedia; menarik batas dari endpoint Overpass...")
        try:
            fitur_poligon = ambil_poligon_dari_osm()
            try:
                fitur_poligon.extend(
                    ambil_poligon_dari_osm("Leuwisadeng", "boundary_kecamatan_leuwisadeng", admin_level="6")
                )
            except RuntimeError as error:
                print(f"Peringatan boundary kecamatan: {error}")
        except RuntimeError as error:
            print(f"Peringatan: {error}")
            print("Mempertahankan polygon lama jika tersedia; tidak membuat poligon perkiraan.")
            fitur_poligon = []
            if os.path.exists(output_geojson):
                try:
                    with open(output_geojson, "r", encoding="utf-8") as f:
                        fitur_poligon = [
                            feature for feature in json.load(f).get("features", [])
                            if feature.get("geometry", {}).get("type") in ("Polygon", "MultiPolygon")
                        ]
                    print(f"Mempertahankan {len(fitur_poligon)} polygon dari output sebelumnya.")
                except (OSError, json.JSONDecodeError) as read_error:
                    print(f"Peringatan membaca output lama: {read_error}")

    # Gabungkan dengan titik fasilitas dari desa_sadeng_leuwisadeng.geojson jika ada
    fitur_gabungan = list(fitur_poligon)
    if os.path.exists(titik_path):
        with open(titik_path, "r", encoding="utf-8") as f:
            fitur_gabungan.extend(json.load(f).get("features", []))

    with open(output_geojson, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": fitur_gabungan}, f, ensure_ascii=False, indent=2)

    ekspor_ke_kml(fitur_gabungan, output_kml)
    print(f"Selesai: {output_geojson} & {output_kml}")