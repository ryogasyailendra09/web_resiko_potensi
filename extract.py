import json
import os
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from xml.dom import minidom

# ==============================================================================
# OPSI A: Ekstrak dari Shapefile resmi BIG (ADMINISTRASIDESA_AR_25K.shp)
#         Butuh: pip install geopandas
# OPSI B: Tarik langsung dari OpenStreetMap Overpass API (tanpa library tambahan)
# ==============================================================================
SHP_BIG_PATH = "ADMINISTRASIDESA_AR_25K.shp"  # Ubah path jika file BIG tersedia


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


def ambil_poligon_dari_osm():
    query = """
    [out:json][timeout:60];
    area["name"="Leuwisadeng"]["boundary"="administrative"]->.kec;
    relation(area.kec)["boundary"="administrative"]["name"="Sadeng"];
    out geom;
    """
    url = "https://overpass-api.de/api/interpreter"
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "KKN-Sadeng-Mapper/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        osm = json.loads(resp.read().decode("utf-8"))

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
        raise RuntimeError("Relasi batas Desa Sadeng tidak ditemukan di Overpass API.")

    geom = (
        {"type": "Polygon", "coordinates": [rings[0]]}
        if len(rings) == 1
        else {"type": "MultiPolygon", "coordinates": [[[r] for r in rings]]}
    )
    return [
        {
            "type": "Feature",
            "properties": {
                "id": "boundary_desa_sadeng",
                "nama": "Batas Wilayah Administratif Desa Sadeng",
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
    if os.path.exists(SHP_BIG_PATH):
        print("Membaca poligon resmi dari Shapefile BIG...")
        fitur_poligon = ambil_poligon_dari_big(SHP_BIG_PATH)
    else:
        print("Shapefile BIG tidak ditemukan lokal; menarik batas dari Overpass API OSM...")
        fitur_poligon = ambil_poligon_dari_osm()

    # Gabungkan dengan titik fasilitas dari desa_sadeng_leuwisadeng.geojson jika ada
    fitur_gabungan = list(fitur_poligon)
    if os.path.exists("desa_sadeng_leuwisadeng.geojson"):
        with open("desa_sadeng_leuwisadeng.geojson", "r", encoding="utf-8") as f:
            fitur_titik = json.load(f).get("features", [])
        fitur_gabungan.extend(fitur_titik)

    geojson_lengkap = {"type": "FeatureCollection", "features": fitur_gabungan}
    with open("desa_sadeng_lengkap_poligon.geojson", "w", encoding="utf-8") as f:
        json.dump(geojson_lengkap, f, ensure_ascii=False, indent=2)

    ekspor_ke_kml(fitur_gabungan, "desa_sadeng_lengkap_poligon.kml")
    print("Selesai: desa_sadeng_lengkap_poligon.geojson & desa_sadeng_lengkap_poligon.kml")