"""Consulta marciana → diez análogos terrestres, con el flujo del notebook."""

from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
from threadpoolctl import threadpool_limits

from analogos.armonizacion import armonizar
from analogos.evaluacion import dividir_bloques, recall_con_empates
from analogos.metodos import IndiceAnalogos, celda_marciana
from analogos.normalizacion import Normalizacion, pesos_normalizados
from analogos.salidas import _json_simple, tabla_candidatos
from analogos.variables import agregar_derivadas, construir_tablas

from .datos import cargar_datos_backend


K_VECINOS = 10
RAIZ = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Configuracion:
    """Parámetros del experimento anual; las referencias preceden a los filtros."""

    normalizacion: str = "zscore"
    motor: str = "knn"
    n_centroides: int = 1
    pesos: tuple[float, float, float] = (1., 1., 1.)
    celda_m: float = 120_000
    radio_relieve_m: float = 300_000
    max_vegetacion: float = .20
    max_agua: float = .05
    max_ciudades: float = .02
    min_cobertura: float = .90
    min_cobertura_vegetacion: float = .75
    semilla: int = 42

    def __post_init__(self):
        if self.normalizacion not in ("zscore", "percentiles"):
            raise ValueError("Normalización admitida: zscore o percentiles")
        if self.motor not in ("knn", "clusters"):
            raise ValueError("Motor admitido: knn o clusters")
        if (isinstance(self.n_centroides, bool)
                or not isinstance(self.n_centroides, int) or self.n_centroides < 1):
            raise ValueError("n_centroides debe ser un entero positivo")
        if (isinstance(self.semilla, bool) or not isinstance(self.semilla, int)
                or not 0 <= self.semilla < 2**32):
            raise ValueError("La semilla debe ser un entero entre 0 y 2**32−1")
        with np.errstate(over="ignore", invalid="ignore", divide="ignore"):
            pesos = pesos_normalizados(self.pesos)
        if not np.isfinite(pesos).all() or not np.isclose(pesos.sum(), 1):
            raise ValueError("La suma de los pesos debe ser finita y positiva")
        object.__setattr__(self, "pesos", tuple(float(p) for p in self.pesos))
        if not np.isfinite(self.celda_m) or self.celda_m < 120_000:
            raise ValueError("La celda debe ser de al menos 120000 m")
        if not np.isfinite(self.radio_relieve_m) or self.radio_relieve_m <= 0:
            raise ValueError("El radio de relieve debe ser positivo y finito")
        if any(not np.isfinite(v) or not 0 <= v <= 1 for v in self.filtros.values()):
            raise ValueError("Los filtros de fracciones deben estar entre 0 y 1")

    @property
    def filtros(self):
        return {nombre: getattr(self, nombre) for nombre in (
            "max_vegetacion", "max_agua", "max_ciudades", "min_cobertura",
            "min_cobertura_vegetacion")}


def validar_coordenadas(latitud, longitud):
    """Valida antes de acceder a datos; admite longitudes −180…180 y 0…360."""
    try:
        latitud, longitud = float(latitud), float(longitud)
    except (ValueError, TypeError, OverflowError) as exc:
        raise ValueError("Latitud y longitud deben ser números finitos") from exc
    if not np.isfinite([latitud, longitud]).all() or not -90 <= latitud <= 90:
        raise ValueError("Latitud entre −90 y 90 y longitud finita requeridas")
    return latitud, longitud


class BuscadorMarte:
    """Prepara una vez los mapas e índices y permite consultar muchos puntos.

    La distancia compara posiciones relativas dentro de cada planeta. El
    relieve es regional y la consulta usa un centro QC a un máximo de 3°.
    """

    def __init__(self, configuracion=None, raiz=None, carpeta_datos=None):
        self.configuracion = configuracion or Configuracion()
        self.raiz = Path(raiz).resolve() if raiz is not None else RAIZ
        self.carpeta_datos = Path(carpeta_datos) if carpeta_datos is not None else None
        self._preparado = False

    def preparar(self, datos=None):
        """Carga, armoniza, deriva y ajusta; acepta datos verificados en memoria.

        Sin argumentos es idempotente. Pasar ``datos`` vuelve a preparar todo,
        útil para probar el proceso sin red o integrar otro cargador verificado.
        """
        if self._preparado and datos is None:
            return self
        cfg = self.configuracion
        if datos is None:
            datos = cargar_datos_backend(self.raiz, self.carpeta_datos)
        with threadpool_limits(limits=1):
            mapas = agregar_derivadas(
                armonizar(datos, celda_m=cfg.celda_m), radio_local_m=cfg.radio_relieve_m)
            tablas = construir_tablas(mapas, **cfg.filtros)
            referencias = np.flatnonzero(tablas["tierra"]["elegible"])
            if len(referencias) < K_VECINOS:
                raise ValueError("Hay menos de 10 candidatos terrestres; revisa los filtros")
            if len(tablas["marte"]["X"]) == 0:
                raise ValueError("No hay celdas marcianas con cobertura suficiente")
            particiones = dividir_bloques(tablas, semilla=cfg.semilla)
            for planeta in ("tierra", "marte"):
                if particiones[planeta]["calibracion"].sum() < 2:
                    raise ValueError(f"Faltan referencias de calibración en {planeta}")
            calibracion = tablas["tierra"]["elegible"] & particiones["tierra"]["calibracion"]
            if calibracion.sum() < 4:
                raise ValueError("Faltan candidatos de calibración para KMeans (mínimo 4)")
            normalizador = Normalizacion(cfg.normalizacion).fit(tablas, particiones)
            indice = IndiceAnalogos(normalizador, cfg.pesos).fit(
                tablas["tierra"]["X"][referencias],
                tablas["tierra"]["X"][calibracion], semilla=cfg.semilla)
        self.mapas, self.tablas = mapas, tablas
        self.particiones, self.referencia_ids = particiones, referencias
        self.normalizador, self.indice = normalizador, indice
        self._preparado = True
        return self

    def buscar(self, latitud, longitud):
        """Devuelve exactamente diez candidatos, su contexto y trazabilidad.

        Siempre audita el prefiltro KMeans contra KNN exacto. Si el prefiltro
        omite un vecino más cercano, devuelve KNN y declara el fallback.
        """
        latitud, longitud = validar_coordenadas(latitud, longitud)
        self.preparar()
        cfg = self.configuracion
        consulta = celda_marciana(self.tablas["marte"], latitud, longitud)
        with threadpool_limits(limits=1):
            exactas, ids_knn = self.indice.buscar(consulta["X"], k=K_VECINOS, motor="knn")
            agrupadas, ids_cluster = self.indice.buscar(
                consulta["X"], k=K_VECINOS, motor="clusters", n_centroides=cfg.n_centroides)
            perfil = self.normalizador.transform("marte", consulta["X"]) * self.indice.escala
            cluster_consulta = int(self.indice.kmeans.predict(perfil)[0])
        fiel = np.allclose(agrupadas, exactas, rtol=1e-12, atol=1e-12)
        usar_clusters = cfg.motor == "clusters" and fiel
        motor = "clusters" if usar_clusters else "knn"
        distancias = agrupadas[0] if usar_clusters else exactas[0]
        ids_indice = ids_cluster[0] if usar_clusters else ids_knn[0]
        ids_tabla = self.referencia_ids[ids_indice]
        candidatos = tabla_candidatos(
            self.tablas["tierra"], consulta, ids_tabla, distancias,
            self.normalizador, cfg.pesos)
        for fila, i, j in zip(candidatos, ids_tabla, ids_indice):
            fila.update(
                id_celda=int(self.tablas["tierra"]["indices"][i]),
                cluster=int(self.indice.etiquetas[j]),
                energia_24h_kWh_m2=float(self.tablas["tierra"]["variables"]["energia_24h"][i]),
                normalizadas=self.normalizador.transform("tierra", self.tablas["tierra"]["X"][i])[0])
        consulta.update(
            entrada_longitud_original=longitud,
            id_celda=int(self.tablas["marte"]["indices"][consulta["indice"]]),
            separacion_km=np.deg2rad(consulta["desplazamiento_angular_grados"])
            * self.mapas["marte"]["radio_m"] / 1000,
            variables={k: v[consulta["indice"]] for k, v in self.tablas["marte"]["variables"].items()},
            normalizadas=self.normalizador.transform("marte", consulta["X"])[0],
            fuera_referencia=self.normalizador.fuera_referencia("marte", consulta["X"])[0])
        reporte = {
            "objetivo": "Ubicación de Marte → 10 ubicaciones terrestres más parecidas",
            "k": K_VECINOS,
            "consulta": consulta,
            "candidatos": candidatos,
            "busqueda": {
                "normalizacion": cfg.normalizacion,
                "motor_solicitado": cfg.motor, "motor_aplicado": motor,
                "fallback": cfg.motor != motor, "exacto": True,
                "recall_clusters": recall_con_empates(exactas, agrupadas),
                "clusters_reproducen_top10": bool(fiel),
                "distancia": "Euclídea con pesos normalizados; menor es más parecido",
                "caracteristicas": list(self.tablas["marte"]["features"]),
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
            "armonizacion": {p: self.mapas[p]["geometria"] for p in ("tierra", "marte")},
            "derivadas": self.mapas["marte"]["derivadas"],
            "procedencia": self.mapas["procedencia"],
            "licencia": "CC-BY-SA-4.0",
            "alcance": "Similitud regional relativa por planeta, no probabilidad de analogía geológica. "
            "GHI anual con resolución efectiva de 5°; celdas de 120 km por defecto. "
            "El albedo conserva definiciones distintas según la fuente.",
        }
        return _json_simple(reporte)
