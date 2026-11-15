"""Carga verificada Tierra–Luna, sin descargar los mosaicos originales grandes.

Se leen seis resúmenes de una revisión fija de Hugging Face o de un snapshot
local exacto. El GHI lunar es un modelo de 2025 y sus coberturas representan
disponibilidad numérica; no cobertura de observaciones instrumentales.
"""

import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio as rio
from rasterio.io import MemoryFile

from analogos import datos as compartidos


REVISION_ANUAL = "1553312bc7c21520e8026483d6d40fd7af0efbe7"
RADIO_LUNAR_M = 1_737_400.
CLAVES_LUNA = ("elevacion", "ghi", "albedo")
BANDAS_LUNA = ("Elevación LOLA", "GHI modelado anual 2025", "Albedo bolométrico normal")
ARCHIVOS = {
    "tierra": ("tierra/tierra_1grado.tif", "tierra/coberturas_tierra_1grado.tif"),
    "luna": ("luna/luna_1grado.tif", "luna/coberturas_luna_1grado.tif"),
}
# Recibos de publicación lunar y de la actualización anual terrestre. Los
# archivos lunares permanecen iguales en la revisión posterior fijada arriba.
_MANIFIESTO = {
    "tierra/catalogo.json": (
        31_360, "4d6c1632b74fb0bdbd352ea5ce8cb92895851e55adc0942709b90883d33b7046"),
    "tierra/tierra_1grado.tif": (
        292_378, "da3d0fcf3810670dfbce9c3287dc027bcf0c018110d99e07bad5df7a73e738fe"),
    "tierra/coberturas_tierra_1grado.tif": (
        27_761, "ba5ea3ce777e710583db3bf59755bcf830690f78d36a9064cf6e0912cc5fca47"),
    "luna/catalogo.json": (
        12_116, "2fc699a0874fe8accbd27780913d081039851daf0bcef9aa22ed28e3bb0ddfc3"),
    "luna/luna_1grado.tif": (
        593_162, "ddda42064d6c81897ec48c88350b45d98f52a0a1a2d7ff773c182c3ce8955ce6"),
    "luna/coberturas_luna_1grado.tif": (
        6_596, "7f1eaea8fc8b0b4d0f48cf3bfff14d1b1ebf73fb181fe154a146a0e9152d0f10"),
}


def _leer_local(carpeta, ruta):
    path = carpeta / ruta
    size, expected = _MANIFIESTO[ruta]
    if not path.is_file():
        raise FileNotFoundError(f"El snapshot Tierra–Luna está incompleto; falta {path}")
    if path.stat().st_size != size:
        raise ValueError(f"{path}: tamaño distinto al de la publicación fijada")
    with path.open("rb") as stream:
        raw = stream.read(size + 1)
    actual = hashlib.sha256(raw).hexdigest()
    if len(raw) != size or actual != expected:
        raise ValueError(f"{path}: SHA256 distinto al de la publicación fijada")
    return raw, {
        "archivo": ruta, "ruta_local": str(path.resolve()), "bytes": len(raw),
        "sha256": actual, "revision": REVISION_ANUAL,
        "origen": "snapshot_local", "hash_publicacion_verificado": True,
    }


def _leer_raster_lunar(raw, cobertura=False):
    nombres = tuple("Cobertura " + nombre for nombre in BANDAS_LUNA) if cobertura else BANDAS_LUNA
    with MemoryFile(raw) as memory, memory.open() as source:
        if (source.shape != compartidos.FORMA or source.count != 3
                or source.transform != compartidos.TRANSFORMACION
                or source.descriptions != nombres
                or source.nodata is None or not np.isnan(source.nodata)
                or any(dtype != "float32" for dtype in source.dtypes)):
            raise ValueError("Luna: bandas, geometría o NoData del resumen inesperados")
        esperado = rio.crs.CRS.from_string(f"+proj=longlat +R={RADIO_LUNAR_M} +no_defs")
        if source.crs is None or source.crs.to_dict() != esperado.to_dict():
            raise ValueError("Luna: el CRS debe representar la esfera lunar de radio 1737400 m")
        tags = source.tags()
        if tags.get("planet") != "Moon" or tags.get("reference_radius_m") != "1737400":
            raise ValueError("Luna: falta la identificación del cuerpo y su radio")
        band_tags = [source.tags(i) for i in range(1, 4)]
        unidades = ("1", "1", "1") if cobertura else ("m", "W/m^2", "1")
        if tuple(t.get("units") for t in band_tags) != unidades:
            raise ValueError("Luna: unidades inesperadas")
        arrays = source.read(masked=True).astype("float64").filled(np.nan)
        if np.isinf(arrays).any():
            raise ValueError("Luna: hay infinitos no enmascarados")
        geometria = {
            "forma": list(source.shape), "crs": source.crs.to_wkt(),
            "geotransformacion": list(source.transform.to_gdal()),
            "resolucion_grados": 1, "limites": list(source.bounds),
        }
    return arrays, geometria, band_tags, nombres


def _fuentes_luna(catalogo, archivo, sha256):
    productos = catalogo["productos"]
    ghi = productos["GHI_luna_media_anual_2025.tif"]["tags"]
    albedo = productos["Albedo_luna.tif"]["tags"]
    if (ghi.get("period_start_utc") != "2025-01-01T00:00:00Z"
            or ghi.get("period_stop_utc_exclusive") != "2026-01-01T00:00:00Z"
            or ghi.get("quantity") != "modelled_annual_mean_incoming_solar_irradiance_on_local_spherical_horizontal"
            or "SPICE" not in ghi.get("source", "")
            or ghi.get("units") != "W/m^2"
            or albedo.get("quantity") != "normal_bolometric_bond_albedo"
            or albedo.get("source_version") != "V1.1"):
        raise ValueError("Luna: faltan la definición del modelo GHI 2025 o del albedo normal V1.1")
    comunes = {"archivo": archivo, "revision": REVISION_ANUAL, "sha256_cubo": sha256}
    return {
        "ghi": {**comunes, "nombre_banda": BANDAS_LUNA[1], "etiquetas": ghi,
                "tipo": "modelo_anual_2025", "periodo": "2025", "unidad": "W/m²",
                "fuente": ghi["source"], "resolucion_efectiva_grados": 1},
        "albedo": {**comunes, "nombre_banda": BANDAS_LUNA[2], "etiquetas": albedo,
                   "tipo": "albedo_bolometrico_normal", "unidad": "1"},
        "elevacion": {**comunes, "nombre_banda": BANDAS_LUNA[0], "unidad": "m",
                      "etiquetas": productos["LOLA_luna_463m.tif"]["tags"]},
    }


def _validar_luna(planeta):
    for nombre, values in planeta["variables"].items():
        coverage = planeta["coberturas"][nombre]
        good = np.isfinite(values)
        if not good.any() or np.isinf(values).any():
            raise ValueError(f"Luna: {nombre} carece de valores finitos válidos")
        if not np.isfinite(coverage).all() or np.any((coverage < 0) | (coverage > 1)):
            raise ValueError(f"Luna: cobertura {nombre} fuera de 0–1")
        if not np.array_equal(good, coverage > 0):
            raise ValueError(f"Luna: NoData de {nombre} no coincide con su cobertura")
        if nombre == "ghi" and np.any(values[good] < 0):
            raise ValueError("Luna: GHI negativo")
        if nombre == "albedo" and np.any((values[good] < 0) | (values[good] > 1)):
            raise ValueError("Luna: albedo fuera de 0–1")


def _ensamblar(leer):
    result, archivos = {}, []
    for planeta in ("tierra", "luna"):
        raw, provenance = leer(f"{planeta}/catalogo.json")
        catalogo = json.loads(raw)
        if catalogo.get("dataset") != compartidos.REPO:
            raise ValueError(f"El catálogo de {planeta} pertenece a otro dataset")
        archivos.append(provenance)
        matrices = []
        for index, ruta in enumerate(ARCHIVOS[planeta]):
            record = catalogo["productos"][Path(ruta).name]
            if (record["bytes"], record["sha256"]) != _MANIFIESTO[ruta]:
                raise ValueError(f"{ruta}: catálogo distinto al manifiesto publicado")
            raw, provenance = leer(ruta)
            if planeta == "tierra":
                nombres = (compartidos.BANDAS[planeta] if index == 0
                           else compartidos.NOMBRES_COBERTURA[planeta])
                values, geometry, tags, descriptions = compartidos._leer_raster(raw, planeta, nombres)
            else:
                values, geometry, tags, descriptions = _leer_raster_lunar(raw, cobertura=index == 1)
            matrices.append(values)
            provenance.update(geometria=geometry,
                              bandas=[{"nombre": label, "etiquetas": tag}
                                      for label, tag in zip(descriptions, tags)])
            archivos.append(provenance)
            if index == 0:
                main_geometry = geometry
                if planeta == "tierra":
                    if (descriptions[1] != compartidos.BANDAS_GHI_ANUAL["tierra"]
                            or tags[0].get("units") != "m"
                            or tags[5].get("quantity") != "vegetated_surface_fraction"):
                        raise ValueError("Tierra: se requieren el GHI anual y las variables físicas publicadas")
                    fuentes = {"ghi": {
                        "nombre_banda": descriptions[1], "etiquetas": tags[1],
                        "archivo": ruta, "revision": REVISION_ANUAL,
                        "sha256_cubo": provenance["sha256"], "unidad": "W/m²",
                        "periodo": "2001-2025", "resolucion_efectiva_grados": 5,
                        "fuente": tags[1]["source"], "tipo": "anual_5grados",
                    }}
                else:
                    fuentes = _fuentes_luna(catalogo, ruta, provenance["sha256"])
        claves = compartidos.CLAVES["tierra"] if planeta == "tierra" else CLAVES_LUNA
        coberturas = compartidos.COBERTURAS["tierra"] if planeta == "tierra" else CLAVES_LUNA
        result[planeta] = {
            "variables": dict(zip(claves, matrices[0])),
            "coberturas": dict(zip(coberturas, matrices[1])),
            "unidades": {k: "m" if k == "elevacion" else "W/m²" if k == "ghi" else "1" for k in claves},
            "geometria": main_geometry, "latitudes": 89.5 - np.arange(180),
            "longitudes": -179.5 + np.arange(360), "fuentes_variables": fuentes,
        }
        if planeta == "tierra":
            compartidos._validar_valores(result[planeta])
        else:
            _validar_luna(result[planeta])
    result["luna"]["nota_coberturas"] = (
        "Disponibilidad numérica; LOLA incluye interpolación y GHI es un modelo definido, "
        "no cobertura de observaciones instrumentales")
    result["procedencia"] = {
        "dataset": compartidos.REPO, "revision": REVISION_ANUAL, "archivos": archivos,
        "fuentes_variables": {p: result[p]["fuentes_variables"] for p in ("tierra", "luna")},
        "licencias_y_atribuciones": {
            "tierra": "CC-BY-SA-4.0 y atribuciones de los componentes terrestres",
            "luna_albedo": "Feng, Siegler y Hayne (2020), V1.1; Zenodo declara other-open; "
                           "https://doi.org/10.5281/zenodo.3579595",
            "luna_elevacion": "NASA/LRO LOLA Science Team y PDS Geosciences Node",
            "luna_ghi": "Modelo HSpace 2025; efemérides NASA/JPL NAIF SPICE DE440",
        },
        "nota": "Se conservan las licencias por componente; no se asigna una licencia nueva única al conjunto. "
                "GHI lunar modelado de 2025 y terrestre climatológico 2001–2025; albedos de distinta definición.",
        "coberturas_luna": result["luna"]["nota_coberturas"],
    }
    return result


def cargar_datos_backend(raiz: Path, carpeta_datos: Path | None = None) -> dict:
    """Carga solo Tierra y Luna con unidades físicas y NaN como NoData.

    El modo remoto descarga a memoria seis archivos pequeños de una revisión
    fijada; comprueba hashes Git/LFS, SHA256 científicos y tamaños. El modo
    local exige los mismos archivos exactos con sus rutas originales. Ningún
    modo lee los TIFF originales LOLA, GHI o albedo de mayor tamaño.
    """
    if carpeta_datos is None:
        api = compartidos.HfApi()
        paths = list(_MANIFIESTO)
        infos = {info.path: info for info in api.get_paths_info(
            compartidos.REPO, paths, repo_type="dataset", revision=REVISION_ANUAL)}
        if set(infos) != set(paths):
            raise ValueError("La revisión remota no contiene todos los resúmenes Tierra–Luna")
        descargar = compartidos._descargador(Path(raiz).resolve())

        def leer(ruta):
            size, expected = _MANIFIESTO[ruta]
            if infos[ruta].size != size:
                raise ValueError(f"{ruta}: tamaño remoto distinto al publicado")
            return compartidos._leer_archivo(ruta, infos[ruta], REVISION_ANUAL, descargar, expected)

        result = _ensamblar(leer)
        result["procedencia"].update(origen="huggingface_en_memoria", bytes_descargados=sum(
            a["bytes"] for a in result["procedencia"]["archivos"]))
    else:
        carpeta = Path(carpeta_datos).expanduser().resolve()
        result = _ensamblar(lambda ruta: _leer_local(carpeta, ruta))
        result["procedencia"].update(
            origen="snapshot_local", carpeta_datos=str(carpeta), bytes_descargados=0,
            bytes_leidos_locales=sum(a["bytes"] for a in result["procedencia"]["archivos"]))
    return result
