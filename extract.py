import json
import os
import urllib.request
import urllib.parse
import urllib.error
import xml.etree.ElementTree as ET
from xml.dom import minidom

# ==============================================================================
# OPSI A: Ekstrak dari Shapefile resmi BIG (ADMINISTRASIDESA_AR_25K.shp)
#         Butuh: pip install geopandas
# OPSI B: Tarik langsung dari OpenStreetMap Overpass API (tanpa library tambahan)
# ==============================================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
SHP_BIG_PATH = os.path.join(DATA_DIR, "ADMINISTRASIDESA_AR_25K.shp")  # Ubah path jika file BIG tersedia


def ambil_poligon_dari_big(shp_path):
    import geopandas as gpd

    gdf = gpd.read_file(shp_path)
    # Filter nama desa 'Sadeng' dan kecamatan 'Leuwisadeng' (tidak peka huruf besar/kecil)
    kolom_desa = next((c for c in ["NAMOBJ", "WADMKD", "DESA"] if c in gdf.columns), None)
    kolom_kec = next((c for c in ["WADMKC", "KECAMATAN"] if c in gdf.columns), None)

    mask = gdf[kolom_desa].str.strip().str.lower() == "sadeng"
    if kolom_kec:
        mask &= gdf[kolom_kec].str.strip().str.lower() == "leuwisadeng"

    hasil = gdf[mask].to_crs(epsg=4326)
    if hasil.empty:
        raise ValueError("Poligon Desa Sadeng tidak ditemukan di Shapefile.")
    return json.loads(hasil.to_json())["features"]


def ambil_poligon_dari_osm(nama_wilayah="Sadeng", nama_area="Leuwisadeng", feature_id="boundary_desa_sadeng"):
    query = """
    [out:json][timeout:60];
    area["name"="{area}"]["boundary"="administrative"]->.area;
    relation(area.area)["boundary"="administrative"]["name"="{nama}"];
    out geom;
    """.format(area=nama_area, nama=nama_wilayah)
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
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
            errors.append(f"{url}: {error}")
    if osm is None:
        raise RuntimeError("Semua endpoint Overpass gagal: " + " | ".join(errors))

    # Susun segmen way luar (outer) menjadi ring koordinat tertutup
    rings = []
    for el in osm.get("elements", []):
        if el.get("type") == "relation":
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
        else {"type": "MultiPolygon", "coordinates": [[[r] for r in rings]]}
    )
    return [
        {
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
        }
    ]


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
                ET.SubElement(lr, "coordinates").text = " ".join(
                    f"{pt[0]},{pt[1]},0" for pt in poly_coords[0]
                )

    xml_bytes = minidom.parseString(ET.tostring(kml, encoding="utf-8")).toprettyxml(
        indent="  ", encoding="utf-8"
    )
    with open(kml_output, "wb") as f:
        f.write(xml_bytes)


if __name__ == "__main__":
    titik_path = os.path.join(DATA_DIR, "desa_sadeng_leuwisadeng.geojson")
    output_geojson = os.path.join(DATA_DIR, "desa_sadeng_lengkap_poligon.geojson")
    output_kml = os.path.join(DATA_DIR, "desa_sadeng_lengkap_poligon.kml")

    if os.path.exists(SHP_BIG_PATH):
        print("Membaca poligon resmi dari Shapefile BIG...")
        fitur_poligon = ambil_poligon_dari_big(SHP_BIG_PATH)
    else:
        print("Shapefile BIG tidak ditemukan lokal; menarik batas dari endpoint Overpass...")
        try:
            fitur_poligon = ambil_poligon_dari_osm()
            try:
                fitur_poligon.extend(ambil_poligon_dari_osm("Leuwisadeng", "Bogor", "boundary_kecamatan_leuwisadeng"))
            except RuntimeError as error:
                print(f"Peringatan boundary kecamatan: {error}")
        except RuntimeError as error:
            print(f"Peringatan: {error}")
            print("Mempertahankan polygon lama jika tersedia; tidak membuat poligon perkiraan.")
            fitur_poligon = []
            if os.path.exists(output_geojson):
                try:
                    with open(output_geojson, "r", encoding="utf-8") as f:
                        fitur_poligon = [feature for feature in json.load(f).get("features", []) if feature.get("geometry", {}).get("type") in ("Polygon", "MultiPolygon")]
                    print(f"Mempertahankan {len(fitur_poligon)} polygon dari output sebelumnya.")
                except (OSError, json.JSONDecodeError) as read_error:
                    print(f"Peringatan membaca output lama: {read_error}")

    # Gabungkan dengan titik fasilitas dari desa_sadeng_leuwisadeng.geojson jika ada
    fitur_gabungan = list(fitur_poligon)
    if os.path.exists(titik_path):
        with open(titik_path, "r", encoding="utf-8") as f:
            fitur_titik = json.load(f).get("features", [])
        fitur_gabungan.extend(fitur_titik)

    geojson_lengkap = {"type": "FeatureCollection", "features": fitur_gabungan}
    with open(output_geojson, "w", encoding="utf-8") as f:
        json.dump(geojson_lengkap, f, ensure_ascii=False, indent=2)

    ekspor_ke_kml(fitur_gabungan, output_kml)
    print(f"Selesai: {output_geojson} & {output_kml}")