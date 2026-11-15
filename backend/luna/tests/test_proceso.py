"""Comprueba el proceso compartido con geometría lunar sin acceso a la red."""

import unittest

import numpy as np
from rasterio.crs import CRS
from rasterio.transform import from_origin

from analogos.armonizacion import armonizar
from analogos.evaluacion import dividir_bloques
from analogos.metodos import celda_marciana, celda_planetaria
from analogos.normalizacion import Normalizacion
from analogos.variables import agregar_derivadas, construir_tablas


PLANETAS = ("tierra", "luna")
RADIOS = {"tierra": 6371007.181, "luna": 1737400.}


def datos_sinteticos():
    lat, lon = np.meshgrid(89.5 - np.arange(180), -179.5 + np.arange(360), indexing="ij")
    result = {"procedencia": {"origen": "fixture-sin-red"}}
    for i, nombre in enumerate(PLANETAS):
        elevacion = 800 * np.sin(np.deg2rad(lat)) + 300 * np.cos(np.deg2rad(2 * lon))
        elevacion *= 1 + i
        elevacion[:25] = np.nan
        variables = {
            "elevacion": elevacion,
            "albedo": .1 + .1 * i + .05 * np.cos(np.deg2rad(lat)),
            "ghi": (200 + 50 * i) * np.cos(np.deg2rad(lat)),
        }
        coberturas = {k: np.isfinite(v).astype(float) for k, v in variables.items()}
        if nombre == "tierra":
            for k, valor in (("vegetacion", .1), ("agua", 0.), ("ciudades", 0.)):
                variables[k] = np.full(lat.shape, valor)
                coberturas[k] = np.ones(lat.shape)
            coberturas["clasificacion"] = np.ones(lat.shape)
        crs = CRS.from_epsg(4326) if nombre == "tierra" else CRS.from_string(
            "+proj=longlat +R=1737400 +no_defs")
        result[nombre] = {
            "variables": variables, "coberturas": coberturas,
            "unidades": {k: "m" if k == "elevacion" else "W/m²" if k == "ghi" else "1"
                         for k in variables},
            "geometria": {"forma": [180, 360], "crs": crs.to_wkt(),
                          "geotransformacion": list(from_origin(-180, 90, 1, 1).to_gdal())},
        }
    return result


class ProcesoLunarTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mapas = agregar_derivadas(
            armonizar(datos_sinteticos(), radios=RADIOS), planetas=PLANETAS)
        cls.tablas = construir_tablas(cls.mapas, planetas=PLANETAS)

    def test_armonizacion_usa_radio_lunar_y_conserva_nodata_y_ceros(self):
        self.assertEqual(set(self.mapas), {"tierra", "luna", "procedencia"})
        luna = self.mapas["luna"]
        self.assertEqual(luna["radio_m"], 1737400.)
        self.assertEqual(self.mapas["procedencia"]["armonizacion"]["radios_m"], RADIOS)
        self.assertNotIn("marciano", luna["geometria"]["modelo"])
        crs = CRS.from_wkt(luna["geometria"]["crs"])
        self.assertEqual(crs.to_dict()["R"], 1737400.)
        elevacion = luna["variables"]["elevacion"]
        cobertura = luna["coberturas"]["elevacion"]
        self.assertTrue(np.isnan(elevacion[cobertura == 0]).all())
        self.assertTrue(np.any(luna["inside"] & (cobertura == 0)))
        agua = self.mapas["tierra"]["variables"]["agua"]
        self.assertTrue(np.all(agua[np.isfinite(agua)] == 0))

    def test_derivadas_y_tablas_lunares_aplican_las_mismas_formulas(self):
        for nombre in PLANETAS:
            variables = self.mapas[nombre]["variables"]
            np.testing.assert_allclose(variables["q_abs"], (1 - variables["albedo"]) * variables["ghi"])
            np.testing.assert_allclose(variables["energia_24h"], variables["q_abs"] * .024)
            self.assertGreater(self.tablas[nombre]["n_referencia"], 10)
            self.assertTrue(np.isfinite(self.tablas[nombre]["X"]).all())
        self.assertEqual(self.tablas["luna"]["resumen_filtros"][0]["filtro"], "Referencia lunar QC")
        self.assertTrue(self.tablas["luna"]["elegible"].all())
        self.assertNotIn("vegetacion", self.tablas["luna"]["variables"])

    def test_normalizacion_y_particiones_usan_referencia_lunar_explicita(self):
        particiones = dividir_bloques(self.tablas, planetas=PLANETAS)
        self.assertEqual(set(particiones), set(PLANETAS))
        for nombre in PLANETAS:
            self.assertTrue(np.all(sum(particiones[nombre].values()) == 1))
        for modo in ("zscore", "percentiles"):
            normalizacion = Normalizacion(modo).fit(self.tablas, particiones, planetas=PLANETAS)
            self.assertEqual(set(normalizacion.modelos), set(PLANETAS))
            if modo == "zscore":
                ids = particiones["luna"]["calibracion"]
                Z = normalizacion.transform("luna", self.tablas["luna"]["X"][ids])
                np.testing.assert_allclose(Z.mean(axis=0), 0, atol=1e-12)
            else:
                self.assertTrue(np.all((normalizacion.transform("luna", self.tablas["luna"]["X"]) >= 0)
                                       & (normalizacion.transform("luna", self.tablas["luna"]["X"]) <= 1)))

    def test_consulta_planetaria_normaliza_longitud_y_compatibilidad_marciana(self):
        tabla = {"X": np.array([[.1, 100, 1000], [.2, 200, 2000]]),
                 "latitud": np.array([0., 0.]), "longitud": np.array([179., 0.])}
        consulta = celda_planetaria(tabla, 0, -181, nombre="lunar")
        self.assertEqual(consulta["longitud"], 179.)
        self.assertEqual(consulta["desplazamiento_angular_grados"], 0.)
        marte = celda_marciana(tabla, 0, -181)
        for clave in consulta:
            np.testing.assert_equal(consulta[clave], marte[clave])
        with self.assertRaisesRegex(ValueError, "lunar"):
            celda_planetaria(tabla, 80, 0, nombre="lunar")


if __name__ == "__main__":
    unittest.main()
