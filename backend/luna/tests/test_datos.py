"""Verificación del contrato Tierra–Luna y de errores científicos sin red."""

from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from rasterio.crs import CRS
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

from backend.luna.datos import (
    BANDAS_LUNA, REVISION_ANUAL, _MANIFIESTO, _fuentes_luna,
    _leer_raster_lunar, _validar_luna, cargar_datos_backend,
)


def raster_lunar(crs="+proj=longlat +R=1737400 +no_defs", cobertura=False, unidad_ghi=None):
    values = np.ones((3, 180, 360), dtype="float32")
    values[0, 0, 0] = np.nan
    with MemoryFile() as memory:
        with memory.open(driver="GTiff", height=180, width=360, count=3,
                         dtype="float32", crs=CRS.from_string(crs),
                         transform=from_origin(-180, 90, 1, 1), nodata=np.nan) as source:
            source.write(values)
            source.update_tags(planet="Moon", reference_radius_m="1737400")
            for i, nombre in enumerate(BANDAS_LUNA, 1):
                source.set_band_description(i, "Cobertura " + nombre if cobertura else nombre)
                units = "1" if cobertura or i == 3 else "m" if i == 1 else "W/m^2"
                source.update_tags(i, units=unidad_ghi if i == 2 and unidad_ghi else units)
        return memory.read()


def catalogo_fuentes():
    return {"productos": {
        "GHI_luna_media_anual_2025.tif": {"tags": {
            "period_start_utc": "2025-01-01T00:00:00Z",
            "period_stop_utc_exclusive": "2026-01-01T00:00:00Z",
            "quantity": "modelled_annual_mean_incoming_solar_irradiance_on_local_spherical_horizontal",
            "source": "NASA/JPL NAIF SPICE DE440; HSpace numerical solar geometry model",
            "units": "W/m^2",
        }},
        "Albedo_luna.tif": {"tags": {
            "quantity": "normal_bolometric_bond_albedo", "source_version": "V1.1",
        }},
        "LOLA_luna_463m.tif": {"tags": {"units": "m"}},
    }}


class CargaDatosLunaTests(unittest.TestCase):
    def test_raster_lunar_conserva_nodata_y_distingue_cobertura(self):
        values, geometry, _, nombres = _leer_raster_lunar(raster_lunar())
        self.assertEqual(values.dtype, np.dtype("float64"))
        self.assertTrue(np.isnan(values[0, 0, 0]))
        self.assertEqual(geometry["resolucion_grados"], 1)
        self.assertEqual(nombres, BANDAS_LUNA)
        _, _, _, nombres = _leer_raster_lunar(raster_lunar(cobertura=True), cobertura=True)
        self.assertEqual(nombres, tuple("Cobertura " + n for n in BANDAS_LUNA))

    def test_rechaza_crs_terrestre_o_marciano_y_energia_en_lugar_de_irradiancia(self):
        for crs in ("EPSG:4326", "+proj=longlat +R=3396190 +no_defs"):
            with self.subTest(crs=crs), self.assertRaisesRegex(ValueError, "esfera lunar"):
                _leer_raster_lunar(raster_lunar(crs=crs))
        with self.assertRaisesRegex(ValueError, "unidades"):
            _leer_raster_lunar(raster_lunar(unidad_ghi="kWh/m²/day"))

    def test_valida_cobertura_numerica_y_rangos_fisicos(self):
        base = {
            "variables": {"elevacion": np.array([0., 500.]), "ghi": np.array([0., 350.]),
                          "albedo": np.array([.1, .2])},
            "coberturas": {k: np.ones(2) for k in ("elevacion", "ghi", "albedo")},
        }
        _validar_luna(base)  # Cero de altura e irradiancia conocidos siguen siendo válidos.
        for grupo, nombre, valor in (("variables", "ghi", -1.), ("variables", "albedo", 1.1),
                                     ("coberturas", "albedo", 0.), ("coberturas", "ghi", np.nan)):
            datos = deepcopy(base)
            datos[grupo][nombre][0] = valor
            with self.subTest(grupo=grupo, nombre=nombre), self.assertRaises(ValueError):
                _validar_luna(datos)

    def test_fuentes_distinguen_ghi_modelado_y_albedo_normal(self):
        fuentes = _fuentes_luna(catalogo_fuentes(), "luna/luna_1grado.tif", "hash")
        self.assertEqual(fuentes["ghi"]["tipo"], "modelo_anual_2025")
        self.assertEqual(fuentes["ghi"]["resolucion_efectiva_grados"], 1)
        self.assertEqual(fuentes["albedo"]["tipo"], "albedo_bolometrico_normal")
        catalogo = catalogo_fuentes()
        catalogo["productos"]["GHI_luna_media_anual_2025.tif"]["tags"]["period_start_utc"] = "2024-01-01T00:00:00Z"
        with self.assertRaisesRegex(ValueError, "GHI 2025"):
            _fuentes_luna(catalogo, "luna/luna_1grado.tif", "hash")

    def test_remoto_fija_revision_y_solo_lee_los_seis_resumenes_tierra_luna(self):
        infos = [SimpleNamespace(path=p, size=size) for p, (size, _) in _MANIFIESTO.items()]

        def ensamblar(leer):
            archivos = [leer(ruta)[1] for ruta in _MANIFIESTO]
            return {"procedencia": {"archivos": archivos}}

        def lectura(ruta, info, revision, descargar, expected):
            self.assertEqual(revision, REVISION_ANUAL)
            self.assertEqual(expected, _MANIFIESTO[ruta][1])
            return b"", {"archivo": ruta, "bytes": info.size}

        with (patch("backend.luna.datos.compartidos.HfApi") as api,
              patch("backend.luna.datos.compartidos._descargador"),
              patch("backend.luna.datos.compartidos._leer_archivo", side_effect=lectura) as leer,
              patch("backend.luna.datos._ensamblar", side_effect=ensamblar)):
            api.return_value.get_paths_info.return_value = infos
            datos = cargar_datos_backend(Path.cwd())
        api.return_value.get_paths_info.assert_called_once_with(
            "Renato-R-V/hspace-datasets", list(_MANIFIESTO), repo_type="dataset", revision=REVISION_ANUAL)
        self.assertEqual(leer.call_count, 6)
        rutas = [a["archivo"] for a in datos["procedencia"]["archivos"]]
        self.assertTrue(all(p.startswith(("tierra/", "luna/")) for p in rutas))
        self.assertEqual(datos["procedencia"]["bytes_descargados"], 963373)

    def test_snapshot_incompleto_falla_sin_fallback_a_red(self):
        with tempfile.TemporaryDirectory() as carpeta:
            with patch("backend.luna.datos.compartidos.HfApi") as api:
                with self.assertRaisesRegex(FileNotFoundError, "catalogo.json"):
                    cargar_datos_backend(Path.cwd(), Path(carpeta))
                api.assert_not_called()

    def test_snapshot_corrupto_de_tamano_correcto_falla_por_hash(self):
        with tempfile.TemporaryDirectory() as carpeta:
            destino = Path(carpeta) / "tierra/catalogo.json"
            destino.parent.mkdir()
            destino.write_bytes(b" " * _MANIFIESTO["tierra/catalogo.json"][0])
            with patch("backend.luna.datos.compartidos.HfApi") as api:
                with self.assertRaisesRegex(ValueError, "SHA256"):
                    cargar_datos_backend(Path.cwd(), Path(carpeta))
                api.assert_not_called()


if __name__ == "__main__":
    unittest.main()
