"""
==============================================================================
MOTOR CIENTÍFICO EN HUGGING FACE SPACES - NASA SPACE APPS
Ejecuta directamente los buscadores oficiales de AANasa/backend/marte y backend/luna.
Sin cálculos topológicos sintéticos (TDA).
==============================================================================
"""

import os
import sys
import json
import copy
from pathlib import Path
from dataclasses import replace
from typing import Dict, Any, Tuple
import numpy as np

# Asegurar que la raíz del proyecto esté en sys.path
RAIZ = Path(__file__).resolve().parent
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

# Parche compatibilidad HfFolder
try:
    import huggingface_hub
    if not hasattr(huggingface_hub, "HfFolder"):
        class MockHfFolder:
            path_token = ""
            @classmethod
            def get_token(cls):
                try:
                    return huggingface_hub.get_token()
                except Exception:
                    return None
            @classmethod
            def save_token(cls, token): pass
            @classmethod
            def delete_token(cls): pass
        huggingface_hub.HfFolder = MockHfFolder
except Exception:
    pass

try:
    import spaces
    gpu_decorator = spaces.GPU
except Exception:
    def gpu_decorator(fn):
        return fn

try:
    import gradio as gr
except ImportError:
    gr = None

# Importar los algoritmos científicos oficiales de backend/marte y backend/luna
from backend.marte.buscador import BuscadorMarte, Configuracion as ConfigMarte
from backend.luna.buscador import BuscadorLuna, Configuracion as ConfigLuna
from analogos.metodos import IndiceAnalogos
from analogos.normalizacion import pesos_normalizados

print("[INFO] Inicializando y pre-cargando motores científicos de Marte y Luna...")
_buscador_marte = BuscadorMarte(ConfigMarte()).preparar()
_buscador_luna = BuscadorLuna(ConfigLuna()).preparar()
print("[INFO] Motores científicos oficiales listos y en memoria.")


def resolver_analogos_reales(cuerpo: str, lat: float, lon: float, pesos: Tuple[float, float, float]) -> Dict[str, Any]:
    """
    Ejecuta exactamente el algoritmo científico de BuscadorMarte o BuscadorLuna.
    Sin datos topológicos inventados.
    """
    is_moon = "luna" in cuerpo.lower() or "moon" in cuerpo.lower()
    buscador_base = _buscador_luna if is_moon else _buscador_marte

    pesos_norm = pesos_normalizados(pesos)
    pesos_base_norm = pesos_normalizados(buscador_base.configuracion.pesos)

    # Reutilizar índice si los pesos son equivalentes a los base
    if np.allclose(pesos_norm, pesos_base_norm):
        buscador = buscador_base
    else:
        buscador = copy.copy(buscador_base)
        buscador.configuracion = replace(buscador_base.configuracion, pesos=pesos)
        calibracion = (
            buscador.tablas["tierra"]["elegible"]
            & buscador.particiones["tierra"]["calibracion"]
        )
        buscador.indice = IndiceAnalogos(buscador.normalizador, pesos).fit(
            buscador.tablas["tierra"]["X"][buscador.referencia_ids],
            buscador.tablas["tierra"]["X"][calibracion],
            semilla=buscador.configuracion.semilla
        )

    resultado = buscador.buscar(lat, lon)

    # Añadir alias de compatibilidad para consumo directo por app.js
    candidatos = resultado.get("candidatos", [])
    for idx, c in enumerate(candidatos):
        rank = c.get("rango", idx + 1)
        c["rank"] = rank
        c["rango"] = rank
        c["lat"] = round(float(c.get("latitud", 0.0)), 4)
        c["lng"] = round(float(c.get("longitud", 0.0)), 4)
        c["lon"] = c["lng"]
        dist = float(c.get("distancia", 0.1))
        c["similarity"] = int(round(max(50.0, min(99.0, 100.0 - (dist * 75.0)))))
        c["similitud"] = c["similarity"]
        c["verosimilitud"] = c["similarity"]
        c["ubicacion"] = f"Celda Terrestre #{c.get('id_celda', idx + 1)} ({c['lat']}°, {c['lng']}°)"
        if "normalizadas" in c:
            c["variablesSim"] = [
                int(round(min(99, max(50, 100 - abs(float(v)) * 25))))
                for v in c["normalizadas"]
            ]

    resultado["top10"] = candidatos
    resultado["analogos"] = candidatos
    if candidatos:
        resultado["lat"] = candidatos[0]["lat"]
        resultado["lon"] = candidatos[0]["lon"]
        resultado["lng"] = candidatos[0]["lng"]

    return resultado


@gpu_decorator
def endpoint_procesar_variables(json_input: Any) -> Dict[str, Any]:
    """
    Endpoint principal para Gradio API (/predict y /analizar_variables).
    Lee la consulta desde app.js y delega a BuscadorMarte / BuscadorLuna.
    """
    payload = json_input
    if isinstance(payload, list) and len(payload) > 0:
        payload = payload[0]
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            payload = {}
    if not isinstance(payload, dict):
        payload = {}

    cuerpo_raw = str(payload.get("cuerpo_celeste", "mars")).lower()
    cuerpo = "moon" if ("luna" in cuerpo_raw or "moon" in cuerpo_raw) else "mars"

    coords = payload.get("coordenadas", {}) or {}
    lat_val = coords.get("lat") if coords.get("lat") is not None else coords.get("latitud", 0.0)
    lon_val = coords.get("lon") if coords.get("lon") is not None else (coords.get("lng") if coords.get("lng") is not None else coords.get("longitud", 0.0))
    lat = float(lat_val or 0.0)
    lon = float(lon_val or 0.0)

    vars_in = payload.get("variables", {}) or {}
    w_albedo = float(vars_in.get("albedo", 1.0))
    w_ghi = float(vars_in.get("ghi", vars_in.get("q_abs", 1.0)))
    w_relieve = float(vars_in.get("relieve", vars_in.get("relieve_m", 1.0)))
    pesos = (max(0.01, w_albedo), max(0.01, w_ghi), max(0.01, w_relieve))

    return resolver_analogos_reales(cuerpo, lat, lon, pesos)


# Construcción de la interfaz Gradio
demo = None
if gr is not None:
    with gr.Blocks(title="NASA Space Apps - SpaceH Backend") as demo:
        gr.Markdown("# 🛰️ NASA Space Apps - Buscador Científico de Análogos Terrestres")
        gr.Markdown("Motor científico oficial de Marte y Luna basado en Z-Score, KNN y KMeans.")

        with gr.Row():
            input_box = gr.JSON(label="Payload de Entrada (JSON)")
            btn = gr.Button("🚀 Buscar Análogos", variant="primary")
            output_box = gr.JSON(label="10 Candidatos Terrestres (JSON)")

        btn.click(fn=endpoint_procesar_variables, inputs=[input_box], outputs=[output_box], api_name="predict")
        btn.click(fn=endpoint_procesar_variables, inputs=[input_box], outputs=[output_box], api_name="analizar_variables")

if __name__ == "__main__":
    if demo is not None:
        demo.launch()
