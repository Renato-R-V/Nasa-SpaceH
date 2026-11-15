# Análogos terrestres de una ubicación lunar

Desde la raíz de HSpace:

```bash
marte/.venv/bin/python -m pip install -r backend/luna/requirements.txt
marte/.venv/bin/python -m backend.luna --latitud 0.67 --longitud 23.47
```

Introduce latitud y longitud lunares en grados, con longitud positiva hacia el
este. Admite −180…180 o 0…360. Devuelve las **10 ubicaciones terrestres más
parecidas**, ordenadas por distancia, y guarda `resultados/informe.json` y
`resultados/candidatos.csv` dentro de `backend/luna/`. Los archivos se actualizan
en cada ejecución; `--salida otra/carpeta` permite conservar otras consultas.
`--json` escribe también el informe completo en la salida estándar.

El ejemplo usa las coordenadas aproximadas de Apollo 11. La búsqueda regional
utiliza el centro válido más cercano, con un máximo de 3° de separación. El
informe incluye coordenadas solicitadas, centro utilizado y separación en km.
La distancia se calcula con el radio **lunar de 1.737.400 m**.

## Proceso

Usa el mismo procedimiento que `backend/marte`, con referencias independientes
de Tierra y Luna:

1. Lee los cubos de 1° y las coberturas, verificando tamaños, hashes, CRS, bandas,
   unidades y NoData. Cada cuerpo conserva su geometría propia.
2. Armoniza a celdas sinusoidales de **120 × 120 km**, con medias ponderadas por
   cobertura y el radio correspondiente a cada cuerpo.
3. Deriva el proxy `q_abs=(1−albedo)×GHI` en W/m², la energía equivalente de
   24 horas `q_abs×24/1000` en kWh/m² y el relieve regional como desviación
   típica de elevaciones medias en un radio geodésico de **300 km**.
4. Normaliza **albedo, q_abs y relieve** mediante zscore o percentiles empíricos.
   Cada cuerpo usa su propia calibración, con bloques espaciales de 10° y
   semilla 42. Los filtros de candidatos no alteran estas referencias.
5. Filtra Tierra por vegetación ≤ 0,20, agua ≤ 0,05 y ciudades ≤ 0,02,
   con coberturas mínimas de 0,90 y de vegetación de 0,75.
6. Ajusta KNN y KMeans; selecciona 3, 5 u 8 grupos por silhouette de calibración.
   Usa distancia euclídea con pesos normalizados, iguales por defecto.
7. Audita el prefiltro de clusters contra KNN exacto. Si omite vecinos más
   cercanos, devuelve KNN y declara `fallback: true`, conservando los diez
   vecinos más cercanos bajo la distancia elegida.

La configuración predeterminada es **zscore + KNN**. Para percentiles y clusters:

```bash
marte/.venv/bin/python -m backend.luna \
  --latitud 0.67 --longitud 23.47 \
  --normalizacion percentiles --motor clusters --centroides 2 \
  --pesos 1 1 1 --salida backend/luna/resultados/percentiles
```

`--help` muestra los filtros configurables. El modo clusters incluye la
comprobación exacta; no supone una mejora de tiempo.

## Datos de Hugging Face

Se fija la revisión `1553312bc7c21520e8026483d6d40fd7af0efbe7` de
`Renato-R-V/hspace-datasets`. Se leen únicamente **seis archivos, 963.373 bytes**,
en memoria. No se descargan mosaicos grandes ni datos marcianos:

```text
tierra/catalogo.json
tierra/tierra_1grado.tif
tierra/coberturas_tierra_1grado.tif
luna/catalogo.json
luna/luna_1grado.tif
luna/coberturas_luna_1grado.tif
```

La Luna aporta elevación **LOLA**, albedo bolométrico normal **Feng V1.1** y
**GHI modelado de 2025 con efemérides SPICE DE440**, a resolución de consulta
de 1°. Tierra usa NASA POWER climatológico 2001–2025, con GHI de resolución
efectiva de 5°. La normalización no elimina esas diferencias de definición,
periodo y resolución. Los metadatos de origen quedan registrados en el informe.

Por defecto se necesita conexión a Hugging Face en cada ejecución. Para trabajar
sin red, proporciona las copias exactas de los seis archivos anteriores,
manteniendo sus rutas dentro de un snapshot:

```bash
marte/.venv/bin/python -m backend.luna --latitud 0.67 --longitud 23.47 \
  --datos-locales /ruta/snapshot
```

Un snapshot incompleto o alterado produce un error, sin descarga de respaldo.

## Uso desde Python

```python
from backend.luna import BuscadorLuna, Configuracion

buscador = BuscadorLuna(Configuracion(normalizacion="zscore", motor="knn"))
buscador.preparar()  # una carga y un ajuste para varias consultas
resultado = buscador.buscar(latitud=0.67, longitud=23.47)
print(resultado["candidatos"])  # diez registros serializables como JSON
```

Admite la misma `Configuracion` que Marte: pesos, filtros, tamaño de celda
(mínimo 120 km), radio del relieve, normalización, motor y semilla. JSON incluye
contexto, contribuciones a la distancia, valores normalizados, clusters,
referencias y procedencia. El CSV contiene las diez filas y sus variables.

## Validación y alcance

```bash
marte/.venv/bin/python -m unittest discover -s backend/luna/tests -v
marte/.venv/bin/python -m unittest discover -s backend/marte/tests -v
```

Las pruebas no requieren red: contrastan distancias con un cálculo independiente,
radio y CRS lunares, NoData, derivadas, normalización, coordenadas, filtros,
fallback de clusters y carga verificada. Los parámetros añadidos a las funciones
de `analogos/` conservan los valores predeterminados del buscador de Marte.

El resultado representa similitud regional relativa a cada cuerpo; la distancia
no es una probabilidad de analogía geológica. El albedo lunar es un modelo a
incidencia normal y `q_abs` es un proxy, no absorción anual validada. La energía
equivalente de 24 horas no representa un día lunar y no se añade a la distancia
porque repite q_abs. El relieve no mide pendiente ni rugosidad local.

La cobertura lunar expresa disponibilidad numérica: LOLA incluye interpolación
y GHI es un modelo definido, no observaciones instrumentales de irradiancia.
El modelo omite sombras topográficas y no resuelve iluminación de cráteres
polares. Se conservan licencias y atribuciones por componente; el albedo lunar
declara `other-open` en su registro y no se asigna una licencia nueva única al
conjunto. Más información en [luna/README.md](../../luna/README.md).
