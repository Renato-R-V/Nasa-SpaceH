"""Consulta lunar → diez análogos terrestres con armonización regional."""

from dataclasses import asdict
from pathlib import Path

import numpy as np
from threadpoolctl import threadpool_limits

from analogos.armonizacion import armonizar
from analogos.evaluacion import dividir_bloques, recall_con_empates
from analogos.metodos import IndiceAnalogos, celda_planetaria
from analogos.normalizacion import Normalizacion, pesos_normalizados
from analogos.salidas import _json_simple, tabla_candidatos
from analogos.variables import agregar_derivadas, construir_tablas
from backend.marte.buscador import Configuracion, validar_coordenadas

from .datos import cargar_datos_backend


K_VECINOS = 10
RAIZ = Path(__file__).resolve().parents[2]
PLANETAS = ("tierra", "luna")
RADIOS = {"tierra": 6371007.181, "luna": 1737400.0}


class BuscadorLuna:
    """Prepara una vez los mapas y permite consultar múltiples puntos lunares.

    Reutiliza la configuración de Marte y las operaciones de ``analogos`` con
    referencias estadísticas y geometría propias de Tierra y Luna.
    """

    def __init__(self, configuracion=None, raiz=None, carpeta_datos=None):
        self.configuracion = configuracion or Configuracion()
        self.raiz = Path(raiz).resolve() if raiz is not None else RAIZ
        self.carpeta_datos = Path(carpeta_datos) if carpeta_datos is not None else None
        self._preparado = False

    def preparar(self, datos=None):
        """Carga, armoniza, deriva y ajusta; sin nuevos datos reutiliza el índice."""
        if self._preparado and datos is None:
            return self
        cfg = self.configuracion
        if datos is None:
            datos = cargar_datos_backend(self.raiz, self.carpeta_datos)
        with threadpool_limits(limits=1):
            mapas = agregar_derivadas(
                armonizar(datos, celda_m=cfg.celda_m, radios=RADIOS),
                radio_local_m=cfg.radio_relieve_m, planetas=PLANETAS)
            tablas = construir_tablas(mapas, **cfg.filtros, planetas=PLANETAS)
            referencias = np.flatnonzero(tablas["tierra"]["elegible"])
            if len(referencias) < K_VECINOS:
                raise ValueError("Hay menos de 10 candidatos terrestres; revisa los filtros")
            if len(tablas["luna"]["X"]) == 0:
                raise ValueError("No hay celdas lunares con cobertura suficiente")
            particiones = dividir_bloques(tablas, semilla=cfg.semilla, planetas=PLANETAS)
            for planeta in PLANETAS:
                if particiones[planeta]["calibracion"].sum() < 2:
                    raise ValueError(f"Faltan referencias de calibración en {planeta}")
            calibracion = tablas["tierra"]["elegible"] & particiones["tierra"]["calibracion"]
            if calibracion.sum() < 4:
                raise ValueError("Faltan candidatos de calibración para KMeans (mínimo 4)")
            normalizador = Normalizacion(cfg.normalizacion).fit(tablas, particiones, planetas=PLANETAS)
            indice = IndiceAnalogos(normalizador, cfg.pesos).fit(
                tablas["tierra"]["X"][referencias],
                tablas["tierra"]["X"][calibracion], semilla=cfg.semilla)
        self.mapas, self.tablas = mapas, tablas
        self.particiones, self.referencia_ids = particiones, referencias
        self.normalizador, self.indice = normalizador, indice
        self._preparado = True
        return self

    def buscar(self, latitud, longitud):
        """Devuelve diez vecinos exactos; audita clusters y aplica fallback a KNN."""
        latitud, longitud = validar_coordenadas(latitud, longitud)
        self.preparar()
        cfg = self.configuracion
        consulta = celda_planetaria(self.tablas["luna"], latitud, longitud, nombre="lunar")
        with threadpool_limits(limits=1):
            exactas, ids_knn = self.indice.buscar(consulta["X"], planeta="luna", k=K_VECINOS, motor="knn")
            agrupadas, ids_cluster = self.indice.buscar(
                consulta["X"], planeta="luna", k=K_VECINOS, motor="clusters", n_centroides=cfg.n_centroides)
            perfil = self.normalizador.transform("luna", consulta["X"]) * self.indice.escala
            cluster_consulta = int(self.indice.kmeans.predict(perfil)[0])
        fiel = np.allclose(agrupadas, exactas, rtol=1e-12, atol=1e-12)
        usar_clusters = cfg.motor == "clusters" and fiel
        motor = "clusters" if usar_clusters else "knn"
        distancias = agrupadas[0] if usar_clusters else exactas[0]
        ids_indice = ids_cluster[0] if usar_clusters else ids_knn[0]
        ids_tabla = self.referencia_ids[ids_indice]
        candidatos = tabla_candidatos(
            self.tablas["tierra"], consulta, ids_tabla, distancias,
            self.normalizador, cfg.pesos, planeta_consulta="luna")
        for fila, i, j in zip(candidatos, ids_tabla, ids_indice):
            fila.update(
                id_celda=int(self.tablas["tierra"]["indices"][i]),
                cluster=int(self.indice.etiquetas[j]),
                energia_24h_kWh_m2=float(self.tablas["tierra"]["variables"]["energia_24h"][i]),
                normalizadas=self.normalizador.transform("tierra", self.tablas["tierra"]["X"][i])[0])
        consulta.update(
            entrada_longitud_original=longitud,
            id_celda=int(self.tablas["luna"]["indices"][consulta["indice"]]),
            separacion_km=np.deg2rad(consulta["desplazamiento_angular_grados"])
            * self.mapas["luna"]["radio_m"] / 1000,
            variables={k: v[consulta["indice"]] for k, v in self.tablas["luna"]["variables"].items()},
            normalizadas=self.normalizador.transform("luna", consulta["X"])[0],
            fuera_referencia=self.normalizador.fuera_referencia("luna", consulta["X"])[0])
        reporte = {
            "objetivo": "Ubicación de la Luna → 10 ubicaciones terrestres más parecidas",
            "k": K_VECINOS, "consulta": consulta, "candidatos": candidatos,
            "busqueda": {
                "normalizacion": cfg.normalizacion,
                "motor_solicitado": cfg.motor, "motor_aplicado": motor,
                "fallback": cfg.motor != motor, "exacto": True,
                "recall_clusters": recall_con_empates(exactas, agrupadas),
                "clusters_reproducen_top10": bool(fiel),
                "distancia": "Euclídea con pesos normalizados; menor es más parecido",
                "caracteristicas": list(self.tablas["luna"]["features"]),
                "pesos_normalizados": pesos_normalizados(cfg.pesos),
            },
            "clusters": {
                "metodo": "KMeans; selección por silhouette en calibración terrestre",
                "n_clusters": int(self.indice.kmeans.n_clusters),
                "cluster_consulta": cluster_consulta,
                "n_centroides_solicitados": cfg.n_centroides,
                "evaluacion": self.indice.evaluacion_clusters,
                "tamanos": {str(c): len(ids) for c, ids in self.indice.grupos.items()},
            },
            "configuracion": asdict(cfg),
            "referencias": {p: {
                "qc": t["n_referencia"], "elegibles": t["n_elegibles"],
                "filtros": t["resumen_filtros"],
                "particiones": {k: int(v.sum()) for k, v in self.particiones[p].items()},
            } for p, t in self.tablas.items()},
            "armonizacion": {p: self.mapas[p]["geometria"] for p in PLANETAS},
            "derivadas": self.mapas["luna"]["derivadas"],
            "procedencia": self.mapas["procedencia"],
            "licencias_y_atribuciones": self.mapas["procedencia"].get("licencias_y_atribuciones", {}),
            "alcance": "Similitud regional relativa por cuerpo, no probabilidad de analogía geológica. "
            "GHI lunar modelado de 2025 a 1°; GHI terrestre climatológico 2001–2025 a 5°. "
            "Celdas de 120 km por defecto. El albedo lunar es bolométrico normal: "
            "(1−albedo)×GHI es un proxy, no absorción anual validada. "
            "La cobertura lunar expresa disponibilidad numérica, no observaciones directas. "
            "La energía equivalente de 24 h no representa un día lunar.",
        }
        return _json_simple(reporte)
