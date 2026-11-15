"""Carga los resúmenes anuales verificados que utiliza el backend marciano.

Se admiten los cinco archivos pequeños de la publicación fijada, descargados
en memoria desde Hugging Face o presentes en un snapshot local. Nunca se leen
los mosaicos originales globales ni se generan o sobrescriben rásteres.
"""

from pathlib import Path
import hashlib
import json

import numpy as np

from analogos import datos as compartidos


REVISION_ANUAL = "1553312bc7c21520e8026483d6d40fd7af0efbe7"

# Manifiesto de ghi_anual/verificacion_remota.json, fijado a REVISION_ANUAL.
# El catálogo también está fijado: un catálogo modificado no puede autorizar
# otros archivos locales manteniendo la procedencia de esta publicación.
_MANIFIESTO = {
    "tierra/catalogo.json": (
        31_360, "4d6c1632b74fb0bdbd352ea5ce8cb92895851e55adc0942709b90883d33b7046"),
    "tierra/tierra_1grado.tif": (
        292_378, "da3d0fcf3810670dfbce9c3287dc027bcf0c018110d99e07bad5df7a73e738fe"),
    "tierra/coberturas_tierra_1grado.tif": (
        27_761, "ba5ea3ce777e710583db3bf59755bcf830690f78d36a9064cf6e0912cc5fca47"),
    "marte/prototipo_alineado/marte_1grado.tif": (
        770_596, "81ec8a71028bf222b6a7823e3145c23a49e2ffa341dfff2bd8af1dc91b716241"),
    "marte/prototipo_alineado/cobertura_minerales_1grado.tif": (
        163_620, "d94f4b0ed7764e3a20d513109ad63feae6f8a8e1e5075dc58594d027d12175e0"),
}


def _leer_local(carpeta, ruta):
    path = carpeta / ruta
    size, expected = _MANIFIESTO[ruta]
    if not path.is_file():
        raise FileNotFoundError(f"El snapshot local está incompleto; falta {path}")
    if path.stat().st_size != size:
        raise ValueError(f"{path}: tamaño distinto al de la publicación anual fijada")
    # Leer de forma acotada aunque el archivo cambie entre stat y open.
    with path.open("rb") as stream:
        raw = stream.read(size + 1)
    actual = hashlib.sha256(raw).hexdigest()
    if len(raw) != size or actual != expected:
        raise ValueError(f"{path}: SHA256 distinto al de la publicación anual fijada")
    return raw, {
        "archivo": ruta, "ruta_local": str(path.resolve()), "bytes": len(raw),
        "sha256": actual, "revision": REVISION_ANUAL,
        "origen": "snapshot_local", "hash_publicacion_verificado": True,
    }


def _cargar_snapshot(carpeta):
    raw, catalog_info = _leer_local(carpeta, "tierra/catalogo.json")
    catalogo = json.loads(raw)
    if catalogo.get("dataset") != compartidos.REPO:
        raise ValueError("El catálogo local pertenece a otro dataset")
    result = {}
    archivos = [catalog_info]
    for planeta in ("tierra", "marte"):
        matrices = []
        for index, ruta in enumerate(compartidos.ARCHIVOS[planeta]):
            raw, provenance = _leer_local(carpeta, ruta)
            if planeta == "tierra":
                record = catalogo["productos"][Path(ruta).name]
                if record["sha256"] != provenance["sha256"]:
                    raise ValueError(f"{ruta}: SHA256 distinto al catálogo terrestre")
            nombres = (compartidos.BANDAS[planeta] if index == 0
                       else compartidos.NOMBRES_COBERTURA[planeta])
            values, geometry, tags, descriptions = compartidos._leer_raster(
                raw, planeta, nombres)
            matrices.append(values)
            provenance.update(
                geometria=geometry,
                bandas=[{"nombre": label, "etiquetas": tag}
                        for label, tag in zip(descriptions, tags)],
            )
            archivos.append(provenance)
            if index == 0:
                if descriptions[1] != compartidos.BANDAS_GHI_ANUAL[planeta]:
                    raise ValueError(f"{planeta}: se necesita el nuevo GHI anual de 5°")
                if tags[0].get("units") != "m" or tags[1].get("units") not in ("W/m^2", "W/m²"):
                    raise ValueError(f"{planeta}: unidades de elevación o GHI inesperadas")
                if planeta == "tierra" and tags[5].get("quantity") != "vegetated_surface_fraction":
                    raise ValueError("La sexta banda terrestre no es cobertura vegetal física")
                main_geometry = geometry
                ghi_source = {
                    "nombre_banda": descriptions[1], "etiquetas": tags[1],
                    "archivo": ruta, "revision": REVISION_ANUAL,
                    "sha256_cubo": provenance["sha256"], "unidad": "W/m²",
                    "periodo": compartidos.PERIODOS_GHI_ANUAL[planeta],
                    "resolucion_efectiva_grados": 5,
                    "fuente": tags[1]["source"], "tipo": "anual_5grados",
                }
        result[planeta] = {
            "variables": dict(zip(compartidos.CLAVES[planeta], matrices[0])),
            "coberturas": dict(zip(compartidos.COBERTURAS[planeta], matrices[1])),
            "unidades": {key: ("m" if key == "elevacion" else "W/m²" if key == "ghi" else "1")
                         for key in compartidos.CLAVES[planeta]},
            "geometria": main_geometry,
            "latitudes": 89.5 - np.arange(180),
            "longitudes": -179.5 + np.arange(360),
            "fuentes_variables": {"ghi": ghi_source},
        }
        compartidos._validar_valores(result[planeta])
    result["procedencia"] = {
        "dataset": compartidos.REPO, "revision": REVISION_ANUAL,
        "origen": "snapshot_local", "carpeta_datos": str(carpeta),
        "archivos": archivos, "bytes_descargados": 0,
        "bytes_leidos_locales": sum(item["bytes"] for item in archivos),
        "licencia_resultados_combinados": "CC-BY-SA-4.0",
        "nota": "Misma malla angular; CRS, distancia física, época y definiciones radiativas diferentes por planeta",
    }
    return result


def cargar_datos_backend(raiz: Path, carpeta_datos: Path | None = None) -> dict:
    """Devuelve el contrato de ``analogos.datos.cargar_datos`` con GHI anual.

    ``raiz`` es la raíz del repositorio que contiene el lector compartido.
    Sin ``carpeta_datos`` se carga en memoria la revisión ``REVISION_ANUAL``
    desde Hugging Face mediante ese lector, que comprueba tamaño, hashes,
    geometría, unidades, bandas y NoData. No se crea caché de archivos.

    ``carpeta_datos`` permite trabajar sin conexión con un snapshot que mantenga
    las rutas originales de ``tierra/catalogo.json`` y los cuatro TIFF de
    ``analogos.datos.ARCHIVOS``. Se exigen los tamaños y SHA256 publicados y
    se aplican los mismos validadores científicos. Un snapshot incompleto o
    modificado produce un error; no provoca descargas ni usa otros datos.

    Las matrices son Float64 de 180 × 360 con NaN para NoData, en sus unidades
    físicas y CRS planetarios propios. La información de GHI sigue siendo de
    5° aunque se consulte sobre la malla de 1°. Se rechaza GHI histórico en
    cualquiera de los dos planetas.
    """
    if carpeta_datos is None:
        result = compartidos.cargar_datos(Path(raiz).resolve(), revision=REVISION_ANUAL)
    else:
        result = _cargar_snapshot(Path(carpeta_datos).expanduser().resolve())
    for planeta in ("tierra", "marte"):
        fuente = result[planeta]["fuentes_variables"]["ghi"]
        if fuente.get("tipo") != "anual_5grados":
            raise ValueError(f"{planeta}: el backend requiere GHI anual de 5°, no histórico")
        compartidos._validar_ghi_anual(planeta, fuente["etiquetas"])
    return result
