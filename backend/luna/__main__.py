"""Ejecutar desde HSpace: python -m backend.luna --latitud 0.67 --longitud 23.47."""

import argparse
import json
from pathlib import Path
import sys

from backend.marte.__main__ import guardar_resultado

from .buscador import BuscadorLuna, Configuracion, validar_coordenadas


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Armoniza Tierra y Luna, deriva variables y busca 10 análogos terrestres.")
    parser.add_argument("--latitud", type=float, required=True, help="Latitud lunar, −90…90 grados")
    parser.add_argument("--longitud", type=float, required=True, help="Longitud este; admite 0…360 o −180…180")
    parser.add_argument("--normalizacion", choices=("zscore", "percentiles"), default="zscore")
    parser.add_argument("--motor", choices=("knn", "clusters"), default="knn")
    parser.add_argument("--centroides", type=int, default=1, help="Mínimo de grupos en el prefiltro KMeans")
    parser.add_argument("--pesos", type=float, nargs=3, default=(1., 1., 1.),
                        metavar=("ALBEDO", "Q_ABS", "RELIEVE"))
    for nombre, valor in Configuracion().filtros.items():
        parser.add_argument("--" + nombre.replace("_", "-"), type=float, default=valor)
    parser.add_argument("--datos-locales", type=Path, help="Snapshot Tierra–Luna verificado para trabajar sin red")
    parser.add_argument("--salida", type=Path, default=Path(__file__).resolve().parent / "resultados",
                        help="Carpeta para informe.json y candidatos.csv (se actualizan en cada ejecución)")
    parser.add_argument("--json", action="store_true", help="Escribe el informe JSON completo en stdout")
    args = parser.parse_args(argv)
    try:
        validar_coordenadas(args.latitud, args.longitud)
        cfg = Configuracion(
            normalizacion=args.normalizacion, motor=args.motor,
            n_centroides=args.centroides, pesos=tuple(args.pesos),
            **{nombre: getattr(args, nombre) for nombre in Configuracion().filtros})
    except ValueError as exc:
        parser.error(str(exc))
    try:
        resultado = BuscadorLuna(cfg, carpeta_datos=args.datos_locales).buscar(args.latitud, args.longitud)
        informe, ranking = guardar_resultado(resultado, args.salida)
    except Exception as exc:
        print(f"Error ({type(exc).__name__}): {exc}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(resultado, ensure_ascii=False, indent=2, allow_nan=False))
    else:
        consulta, busqueda = resultado["consulta"], resultado["busqueda"]
        print(f"Consulta Luna: {args.latitud:.4f}, {args.longitud:.4f}")
        print(f"Centro utilizado: {consulta['latitud']:.4f}, {consulta['longitud']:.4f} "
              f"(a {consulta['separacion_km']:.1f} km)")
        print(f"Normalización: {busqueda['normalizacion']} · motor: {busqueda['motor_aplicado']} "
              f"· recall clusters: {busqueda['recall_clusters']:.0%}")
        if busqueda["fallback"]:
            print("El prefiltro por clusters omitía vecinos más cercanos; se utiliza KNN exacto.")
        print("\nRango   Latitud    Longitud   Distancia   Cluster")
        for fila in resultado["candidatos"]:
            print(f"{fila['rango']:>5}  {fila['latitud']:>9.4f}  {fila['longitud']:>10.4f}  "
                  f"{fila['distancia']:>10.6f}  {fila['cluster']:>8}")
        print(f"\nJSON: {informe}\nCSV: {ranking}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
