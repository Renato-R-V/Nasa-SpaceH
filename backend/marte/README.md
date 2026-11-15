# Análogos terrestres de una ubicación de Marte

Desde la raíz de HSpace:

```bash
marte/.venv/bin/python -m pip install -r backend/marte/requirements.txt
marte/.venv/bin/python -m backend.marte --latitud -5.4 --longitud 137.8
```

Introduce las coordenadas de Marte en grados, longitud positiva hacia el este.
Se admiten longitudes en −180…180 o 0…360. El programa devuelve las **10
ubicaciones terrestres más parecidas**, ordenadas por distancia, y genera
`backend/marte/resultados/candidatos.csv` e `informe.json`. Una nueva ejecución
actualiza esos dos archivos; usa `--salida otra/carpeta` para conservar consultas.
`--json` escribe también el informe completo en la salida estándar.

El punto solicitado se aproxima al centro regional válido más cercano, con un
máximo de 3° de separación angular. El informe incluye ambas coordenadas, la
separación en km y las variables utilizadas. Si no hay cobertura suficiente, se
devuelve un error. No se inventan valores para regiones sin datos.

## Proceso

Reutiliza las funciones de `analogos/` que emplea
[AnalogosEnTierraDeMarte.ipynb](../../AnalogosEnTierraDeMarte.ipynb):

1. Carga los dos cubos y sus coberturas, verificando hashes, bandas, geometría,
   unidades y NoData.
2. Armoniza cada planeta por separado a celdas sinusoidales de 120 × 120 km,
   con su propio radio y medias ponderadas por cobertura.
3. Calcula las variables derivadas: `q_abs = (1 − albedo) × GHI` en W/m²,
   energía equivalente de 24 horas `q_abs × 24 / 1000` en kWh/m² y relieve
   regional como desviación típica de elevaciones medias en un radio de 300 km.
4. Construye las referencias físicas y las divide en bloques espaciales de
   10°, con semilla 42. Ajusta una normalización por planeta usando únicamente
   su calibración. Las características son **albedo, q_abs y relieve**;
   la energía de 24 horas se conserva como contexto porque repite q_abs.
5. Filtra candidatos terrestres por vegetación ≤ 0,20, agua ≤ 0,05 y ciudades
   ≤ 0,02, con coberturas mínimas de 0,90 y de vegetación de 0,75. Las
   referencias de normalización se mantienen independientes de estos filtros.
6. Ajusta KNN y KMeans. KMeans selecciona 3, 5 u 8 grupos por silhouette en
   calibración terrestre. La distancia es euclídea con pesos normalizados;
   pesos iguales por defecto.
7. Devuelve diez vecinos. Audita el prefiltro por clusters frente a KNN exacto
   en cada consulta; si pierde vecinos más cercanos, usa KNN y declara
   `fallback: true`. El informe incluye el recall del prefiltro y el cluster
   de cada candidato.

La configuración predeterminada es **zscore + KNN**, como el experimento anual
del segundo notebook. También están disponibles percentiles empíricos y clusters:

```bash
marte/.venv/bin/python -m backend.marte \
  --latitud -5.4 --longitud 137.8 \
  --normalizacion percentiles --motor clusters --centroides 2 \
  --pesos 1 1 1 --salida backend/marte/resultados/percentiles
```

`--help` muestra los filtros configurables. La auditoría con KNN prioriza la
exactitud de los diez vecinos; el modo clusters no supone una mejora de tiempo.

## Nuevo mapa de GHI

Se usa directamente la publicación anual de `Renato-R-V/hspace-datasets`,
revisión fija `1553312bc7c21520e8026483d6d40fd7af0efbe7`, que incorpora la
entrega de `nuevoGUI/Carpeta_Manuel`:

- Marte: MACDA v2.0, climatología anual MY25–MY34.
- Tierra: NASA POWER 2001–2025, agregado a 5°.

Los cubos de consulta están a 1°, pero la información GHI conserva su resolución
efectiva de **5°**. La armonización regional no aporta detalle radiativo nuevo.
El notebook original conserva su revisión histórica; el nuevo GHI corresponde
a [AnalogosEnTierraDeMarte2.ipynb](../../AnalogosEnTierraDeMarte2.ipynb).

Por defecto se necesita acceso a Hugging Face: se leen aproximadamente **1,3 MB**
en memoria en cada ejecución, sin descargar mosaicos grandes ni crear TIFF.
Una instancia Python permite preparar una vez y realizar múltiples consultas.

Para trabajar sin conexión, `--datos-locales /ruta/snapshot` admite las copias
exactas de estos cinco archivos de la revisión indicada, conservando sus rutas:

```text
tierra/catalogo.json
tierra/tierra_1grado.tif
tierra/coberturas_tierra_1grado.tif
marte/prototipo_alineado/marte_1grado.tif
marte/prototipo_alineado/cobertura_minerales_1grado.tif
```

Un snapshot incompleto o con hashes diferentes produce un error. No basta con
los TIFF GHI monobanda: la búsqueda requiere también DEM, albedo, filtros y
coberturas.

## Uso desde otro programa

```python
from backend.marte import BuscadorMarte, Configuracion

buscador = BuscadorMarte(Configuracion(normalizacion="zscore", motor="knn"))
buscador.preparar()  # carga y ajuste una sola vez
resultado = buscador.buscar(latitud=-5.4, longitud=137.8)
otros = buscador.buscar(latitud=18.4, longitud=77.5)
print(resultado["candidatos"])  # diez registros serializables como JSON
```

`Configuracion` permite también ajustar pesos, filtros, tamaño de celda (mínimo
120 km), radio del relieve y semilla. JSON conserva el contexto, las
contribuciones a la distancia, los valores normalizados, la evaluación de
clusters y la procedencia completa. El CSV contiene el ranking y sus variables.

## Comprobación y alcance

```bash
marte/.venv/bin/python -m unittest discover -s backend/marte/tests -v
```

Las pruebas no requieren red. Comprueban las distancias mediante un cálculo
independiente, ambas normalizaciones, pesos, coordenadas, selección de candidatos,
serialización y fallback del prefiltro. La consulta real de ejemplo se ha
contrastado con `analogos/resultados_ghi_anual/candidatos_ambos_5grados.csv`:
coinciden las diez coordenadas y su orden, con diferencias de distancia menores
que 1e-8 por la publicación Float32.

El resultado expresa similitud regional **relativa a cada planeta**. La
distancia no es una probabilidad de analogía geológica. El albedo conserva las
definiciones de cada producto y `q_abs` es un proxy; el relieve no representa
pendiente ni rugosidad local. Los candidatos son centros de celdas regionales.

Los resultados combinados conservan **CC BY-SA 4.0** y las atribuciones de las
fuentes. Véanse [analogos/fuentes.md](../../analogos/fuentes.md) y
[ghi_anual/README.md](../../ghi_anual/README.md).
