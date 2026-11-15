"""Pruebas del servicio sin red, con referencias estadísticas y búsqueda reales.

Solo se sustituyen la lectura y preparación de rásteres: las particiones,
normalizaciones, KNN y KMeans se ejercitan con una población reproducible.
"""

import json
import unittest
from dataclasses import FrozenInstanceError
from unittest.mock import patch

import numpy as np
from threadpoolctl import threadpool_limits

from analogos.evaluacion import dividir_bloques
from analogos.metodos import IndiceAnalogos
from backend.luna.buscador import BuscadorLuna, Configuracion


def tablas_sinteticas():
    """La elegibilidad dispersa permite detectar errores al remapear vecinos."""
    latitudes, longitudes = np.meshgrid(
        np.arange(-55, 56, 10), np.arange(-175, 176, 10), indexing="ij"
    )
    tablas = {}
    for numero, planeta in enumerate(("tierra", "luna")):
        rng = np.random.default_rng(101 + numero)
        n = latitudes.size
        # Poblaciones de escalas distintas para comprobar normalización separada.
        X = np.column_stack((
            rng.uniform(.1, .7, n),
            rng.uniform(20, 250, n) * (1 if planeta == "tierra" else .5),
            rng.uniform(50, 3500, n) * (1 if planeta == "tierra" else 1.7),
        ))
        elegible = np.ones(n, dtype=bool)
        if planeta == "tierra":
            elegible[::4] = False
        variables = dict(
            albedo=X[:, 0], q_abs=X[:, 1], relieve_m=X[:, 2],
            ghi=X[:, 1] / (1 - X[:, 0]),
            energia_24h=X[:, 1] * 24 / 1000,
            elevacion=np.arange(n, dtype=float) * 7,
        )
        if planeta == "tierra":
            variables.update(
                vegetacion=np.where(elegible, .1, .8),
                agua=np.where(elegible, .01, .6),
                ciudades=np.where(elegible, .001, .5),
            )
        tablas[planeta] = dict(
            X=X, indices=np.arange(n), latitud=latitudes.ravel().astype(float),
            longitud=longitudes.ravel().astype(float), variables=variables,
            elegible=elegible, n_referencia=n, n_elegibles=int(elegible.sum()),
            forma_mapa=latitudes.shape, features=("albedo", "q_abs", "relieve_m"),
            unidades_features=("1", "W/m²", "m"), resumen_filtros=[],
        )
    return tablas


def ranking_independiente(tablas, configuracion, latitud=-5., longitud=-75.):
    """Distancia calculada sin utilizar Normalizacion ni IndiceAnalogos."""
    particiones = dividir_bloques(
        tablas, semilla=configuracion.semilla, planetas=("tierra", "luna"))
    tierra, luna = tablas["tierra"], tablas["luna"]
    indice = np.flatnonzero(
        (luna["latitud"] == latitud) & (luna["longitud"] == longitud)
    )[0]

    def transformar(planeta, valores):
        calibracion = tablas[planeta]["X"][particiones[planeta]["calibracion"]]
        if configuracion.normalizacion == "zscore":
            return (valores - calibracion.mean(axis=0)) / calibracion.std(axis=0)
        result = np.empty_like(np.atleast_2d(valores))
        for j, referencia in enumerate(calibracion.T):
            referencia = np.sort(referencia)
            columna = np.atleast_2d(valores)[:, j]
            result[:, j] = (
                np.searchsorted(referencia, columna, side="left")
                + np.searchsorted(referencia, columna, side="right")
            ) / (2 * len(referencia))
        return result

    candidatos = np.flatnonzero(tierra["elegible"])
    Z = transformar("tierra", tierra["X"][candidatos])
    z = transformar("luna", luna["X"][indice])
    pesos = np.asarray(configuracion.pesos) / np.sum(configuracion.pesos)
    distancias = np.sqrt(((Z - z) ** 2 * pesos).sum(axis=1))
    orden = np.argsort(distancias, kind="stable")[:10]
    return candidatos[orden], distancias[orden]


class TestConfiguracion(unittest.TestCase):
    def test_configuracion_inmutable_y_modos_admitidos(self):
        configuracion = Configuracion()
        self.assertEqual(configuracion.normalizacion, "zscore")
        self.assertEqual(configuracion.motor, "knn")
        with self.assertRaises(FrozenInstanceError):
            configuracion.motor = "clusters"
        Configuracion(normalizacion="percentiles", motor="clusters", n_centroides=2)

    def test_rechaza_parametros_incoherentes_antes_de_cargar(self):
        casos = [
            {"normalizacion": "minmax"}, {"motor": "inexistente"},
            {"n_centroides": 0}, {"n_centroides": -1},
            {"n_centroides": 1.5}, {"n_centroides": True},
            {"semilla": -1}, {"semilla": 2**32}, {"semilla": True},
            {"pesos": (1, 1)}, {"pesos": (1, 0, 1)},
            {"pesos": (1, -1, 1)}, {"pesos": (1, np.nan, 1)},
            {"pesos": (1e308, 1e308, 1e308)},
            {"celda_m": 119_999}, {"celda_m": np.inf},
            {"radio_relieve_m": 0}, {"radio_relieve_m": np.nan},
            {"max_vegetacion": -.1}, {"max_agua": 1.1},
            {"max_ciudades": np.nan}, {"min_cobertura": 1.1},
            {"min_cobertura_vegetacion": -.1},
        ]
        for parametros in casos:
            with self.subTest(parametros=parametros), self.assertRaises(ValueError):
                Configuracion(**parametros)


class TestBuscadorLuna(unittest.TestCase):
    def setUp(self):
        self.tablas = tablas_sinteticas()
        self.mapas = {
            "tierra": {"radio_m": 6371007.181, "geometria": {"resolucion_m": 120000}},
            "luna": {"radio_m": 1737400., "geometria": {"resolucion_m": 120000},
                      "derivadas": {"radio_relieve_m": 300000}},
            "procedencia": {"revision": "fixture-sin-red"},
        }

    def preparar(self, configuracion=None):
        buscador = BuscadorLuna(configuracion=configuracion)
        datos = {"procedencia": {"revision": "fixture-sin-red"}}
        with (
            patch("backend.luna.buscador.armonizar", return_value=self.mapas),
            patch("backend.luna.buscador.agregar_derivadas", return_value=self.mapas),
            patch("backend.luna.buscador.construir_tablas", return_value=self.tablas),
            threadpool_limits(limits=1),
        ):
            buscador.preparar(datos=datos)
        return buscador

    def comprobar_ranking(self, resultado, configuracion):
        ids, distancias = ranking_independiente(self.tablas, configuracion)
        ranking = resultado["candidatos"]
        self.assertEqual(len(ranking), 10)
        self.assertEqual([r["rango"] for r in ranking], list(range(1, 11)))
        coordenadas = [(r["latitud"], r["longitud"]) for r in ranking]
        self.assertEqual(len(set(coordenadas)), 10)
        self.assertEqual(coordenadas, [
            (self.tablas["tierra"]["latitud"][i], self.tablas["tierra"]["longitud"][i])
            for i in ids
        ])
        np.testing.assert_allclose([r["distancia"] for r in ranking], distancias,
                                   rtol=1e-12, atol=1e-12)
        for fila, i in zip(ranking, ids):
            self.assertTrue(self.tablas["tierra"]["elegible"][i])
            self.assertEqual(fila["albedo"], self.tablas["tierra"]["X"][i, 0])
            self.assertEqual(fila["q_abs_W_m2"], self.tablas["tierra"]["X"][i, 1])
            self.assertEqual(fila["relieve_m"], self.tablas["tierra"]["X"][i, 2])
            self.assertIn("cluster", fila)
        # También valida que el contrato no filtre arrays o NaN al consumidor.
        json.dumps(resultado, allow_nan=False)

    def test_knn_top10_coincide_con_distancia_y_contexto_independientes(self):
        configuracion = Configuracion()
        resultado = self.preparar(configuracion).buscar(-5., -75.)
        self.comprobar_ranking(resultado, configuracion)
        self.assertEqual(resultado["busqueda"]["normalizacion"], "zscore")
        self.assertEqual(resultado["busqueda"]["motor_aplicado"], "knn")
        self.assertTrue(resultado["busqueda"]["exacto"])
        self.assertFalse(resultado["busqueda"]["fallback"])

    def test_percentiles_y_pesos_se_aplican_con_referencias_por_planeta(self):
        configuracion = Configuracion(normalizacion="percentiles", pesos=(3., 1., 2.))
        resultado = self.preparar(configuracion).buscar(-5., -75.)
        self.comprobar_ranking(resultado, configuracion)
        self.assertEqual(resultado["busqueda"]["normalizacion"], "percentiles")

    def test_longitudes_equivalentes_devuelven_la_misma_celda_y_ranking(self):
        buscador = self.preparar()
        original = buscador.buscar(-5., -75.)
        equivalente = buscador.buscar(-5., 285.)
        self.assertEqual(original["candidatos"], equivalente["candidatos"])
        self.assertEqual(equivalente["consulta"]["latitud"], -5.)
        self.assertEqual(equivalente["consulta"]["longitud"], -75.)

    def test_informe_identifica_luna_y_conserva_radio_lunar(self):
        resultado = self.preparar().buscar(-4., -75.)
        consulta = resultado["consulta"]
        self.assertAlmostEqual(consulta["desplazamiento_angular_grados"], 1., places=10)
        self.assertAlmostEqual(consulta["separacion_km"], np.deg2rad(1.) * 1737400 / 1000,
                               places=10)
        self.assertIn("luna", resultado["referencias"])
        self.assertNotIn("marte", resultado["referencias"])
        self.assertIn("Luna", resultado["objetivo"])
        self.assertNotIn("marte", json.dumps(resultado, ensure_ascii=False).casefold())

    def test_coordenadas_invalidas_se_rechazan_antes_de_preparar(self):
        buscador = BuscadorLuna()
        for latitud, longitud in [(91, 0), (-91, 0), (np.nan, 0),
                                  (0, np.inf), (0, np.nan)]:
            with self.subTest(latitud=latitud, longitud=longitud):
                with patch.object(buscador, "preparar") as preparar:
                    with self.assertRaises(ValueError):
                        buscador.buscar(latitud, longitud)
                    preparar.assert_not_called()

    def test_no_oculta_consultas_sin_celda_lunar_proxima(self):
        with self.assertRaises(ValueError):
            self.preparar().buscar(90., 0.)

    def test_rechaza_poblacion_con_menos_de_diez_candidatos(self):
        self.tablas["tierra"]["elegible"][:] = False
        self.tablas["tierra"]["elegible"][:9] = True
        with self.assertRaises(ValueError):
            self.preparar()

    def test_preparacion_sin_nuevos_datos_reutiliza_el_indice(self):
        buscador = self.preparar()
        with patch("backend.luna.buscador.armonizar") as armonizar:
            buscador.preparar()
            buscador.buscar(-5., -75.)
            armonizar.assert_not_called()

    def test_cluster_inexacto_activa_fallback_y_conserva_el_top10(self):
        configuracion = Configuracion(motor="clusters")
        buscador = self.preparar(configuracion)
        original = IndiceAnalogos.buscar

        def prefiltro_inexacto(indice, X, planeta="luna", k=10,
                              motor="knn", n_centroides=1):
            if motor != "clusters":
                return original(indice, X, planeta=planeta, k=k,
                                motor=motor, n_centroides=n_centroides)
            Z = indice.normalizador.transform(planeta, X) * indice.escala
            todas = np.linalg.norm(Z[:, None, :] - indice.Z[None, :, :], axis=2)
            peores = np.argsort(todas, axis=1)[:, -k:]
            return np.take_along_axis(todas, peores, axis=1), peores

        with patch.object(IndiceAnalogos, "buscar", prefiltro_inexacto):
            resultado = buscador.buscar(-5., -75.)
        self.comprobar_ranking(resultado, configuracion)
        busqueda = resultado["busqueda"]
        self.assertEqual(busqueda["motor_solicitado"], "clusters")
        self.assertEqual(busqueda["motor_aplicado"], "knn")
        self.assertTrue(busqueda["fallback"])
        self.assertTrue(busqueda["exacto"])
        self.assertLess(busqueda["recall_clusters"], 1.)

    def test_cluster_fiel_conserva_el_motor_solicitado(self):
        configuracion = Configuracion(motor="clusters", n_centroides=2)
        buscador = self.preparar(configuracion)
        original = IndiceAnalogos.buscar

        def prefiltro_fiel(indice, X, planeta="luna", k=10,
                           motor="knn", n_centroides=1):
            return original(indice, X, planeta=planeta, k=k, motor="knn",
                            n_centroides=n_centroides)

        with patch.object(IndiceAnalogos, "buscar", prefiltro_fiel):
            resultado = buscador.buscar(-5., -75.)
        self.comprobar_ranking(resultado, configuracion)
        self.assertEqual(resultado["busqueda"]["motor_aplicado"], "clusters")
        self.assertFalse(resultado["busqueda"]["fallback"])
        self.assertTrue(resultado["busqueda"]["exacto"])
        self.assertEqual(resultado["busqueda"]["recall_clusters"], 1.)


if __name__ == "__main__":
    unittest.main()
