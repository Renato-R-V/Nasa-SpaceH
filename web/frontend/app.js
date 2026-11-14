// Inicializar Globe.gl desde el script global o ESM
const GlobeInstance = window.Globe;

// 1. CONFIGURACIÓN DE CUERPOS CELESTES CON TEXTURAS HD, MAPAS DE RELIEVE (BUMP) Y ATMÓSFERAS
const PLANETS_DATA = {
    mars: {
        name: "Marte (Superficie)",
        texture: "./assets/mars.jpg",
        bump: "./assets/mars.jpg",
        hasAtmosphere: true,
        atmosphereColor: "#e07a5f",
        atmosphereAltitude: 0.06
    },
    moon: {
        name: "La Luna (Regolito)",
        texture: "./assets/moon.jpg",
        bump: "./assets/moon_bump.jpg",
        hasAtmosphere: false,
        atmosphereColor: "#ffffff",
        atmosphereAltitude: 0.0
    },
    earth: {
        name: "Tierra (Zona Análoga)",
        texture: "./assets/earth.jpg",
        bump: "./assets/earth_bump.png",
        hasAtmosphere: true,
        atmosphereColor: "#38bdf8",
        atmosphereAltitude: 0.18
    }
};

let currentPlanetKey = "mars";
let isViewingEarth = false;

// 2. INICIALIZACIÓN DEL GLOBO 3D HIPERREALISTA
const container = document.getElementById('globe-container');
const initWidth = container.clientWidth || (window.innerWidth - 420);
const initHeight = container.clientHeight || window.innerHeight;

const globe = GlobeInstance()(container)
    .width(initWidth)
    .height(initHeight)
    // Fondo espacial con campo estelar profundo de la Vía Láctea
    .backgroundImageUrl('./assets/night-sky.png')
    // Texturas de alta definición y mapas de relieve
    .globeImageUrl(PLANETS_DATA.mars.texture)
    .bumpImageUrl(PLANETS_DATA.mars.bump)
    // Atmósfera dinámica
    .showAtmosphere(PLANETS_DATA.mars.hasAtmosphere)
    .atmosphereColor(PLANETS_DATA.mars.atmosphereColor)
    .atmosphereAltitude(PLANETS_DATA.mars.atmosphereAltitude)
    // Configuración del Radar / Ondas de Escaneo Concéntricas (Rings)
    .ringColor(() => '#38bdf8')
    .ringMaxRadius(7)
    .ringPropagationSpeed(3)
    .ringRepeatPeriod(700)
    // Etiquetas holográficas 3D flotantes
    .labelLat(d => d.lat)
    .labelLng(d => d.lng)
    .labelText(d => d.text)
    .labelSize(1.6)
    .labelDotRadius(0.6)
    .labelColor(() => '#38bdf8')
    .labelResolution(3);

// Rotación orbital cinematográfica inicial
globe.controls().autoRotate = true;
globe.controls().autoRotateSpeed = 0.5;

// Asegurar ajuste perfecto del lienzo al contenedor tras el cálculo de Flexbox
setTimeout(() => {
    if (container.clientWidth > 0) {
        globe.width(container.clientWidth);
        globe.height(container.clientHeight);
    }
}, 150);

// Función para cambiar de planeta y aplicar sus propiedades físicas
function switchPlanet(planetKey) {
    const planet = PLANETS_DATA[planetKey];
    if (!planet) return;
    currentPlanetKey = planetKey;
    if (typeof requestData !== 'undefined') {
        requestData.cuerpo_celeste = planetKey;
        syncPayload();
    }

    // Actualizar textura de superficie y mapa de relieve 3D
    globe.globeImageUrl(planet.texture);
    globe.bumpImageUrl(planet.bump);

    // Actualizar atmósfera con sus valores exactos o desactivarla
    globe.showAtmosphere(planet.hasAtmosphere);
    if (planet.hasAtmosphere) {
        globe.atmosphereColor(planet.atmosphereColor);
        globe.atmosphereAltitude(planet.atmosphereAltitude);
    } else {
        globe.atmosphereAltitude(0);
    }

    document.getElementById('planet-name').textContent = planet.name;
    if (planetKey !== 'earth') {
        document.getElementById('planet-select').value = planetKey;
    }
}

// 3. SELECTOR DE PLANETA EN EL PANEL LATERAL
const planetSelect = document.getElementById('planet-select');
planetSelect.addEventListener('change', (e) => {
    switchPlanet(e.target.value);
});

// 4. DETECCIÓN DE CLICS SOBRE LA SUPERFICIE DEL PLANETA
globe.onGlobeClick(({ lat, lng }) => {
    if (isViewingEarth) return;

    const roundedLat = parseFloat(lat.toFixed(2));
    const roundedLng = parseFloat(lng.toFixed(2));

    document.getElementById('lat-input').value = roundedLat;
    document.getElementById('lon-input').value = roundedLng;

    // Actualizar coordenadas registradas en la variable JSON
    updateRegisteredCoordinates(roundedLat, roundedLng);

    // Disparar radar de escaneo visual instantáneo en el punto clicado
    globe.ringsData([{ lat: roundedLat, lng: roundedLng }]);

    processRegionSelection(currentPlanetKey, roundedLat, roundedLng, "Clic en Globo 3D");
});

// 5. PROCESAR REGIÓN Y TRANSICIÓN CINEMATOGRÁFICA
async function processRegionSelection(planetKey, lat, lng, source) {
    const planetInfo = PLANETS_DATA[planetKey];
    isViewingEarth = true;

    // Registrar las coordenadas definitivas en requestData antes de llamar a la API
    updateRegisteredCoordinates(lat, lng);

    // Detener rotación libre y hacer zoom cinematográfico al objetivo
    globe.controls().autoRotate = false;
    globe.pointOfView({ lat, lng, altitude: 1.3 }, 900);

    // Actualizar estados visuales de la interfaz
    document.getElementById('planet-selector-section').style.display = 'none';
    document.getElementById('back-to-origin-btn').style.display = 'block';

    const targetPlanet = 'earth';
    const targetInfo = PLANETS_DATA.earth;
    document.getElementById('current-view-label').innerHTML = `Módulo: <strong style="color: #4ade80;">Análogo Terrestre Computado</strong>`;

    // Mostrar estado de carga mientras se consulta la API
    setApiStatus('loading', `
        <p style="color:#facc15;">⏳ Enviando datos al servidor de análisis...</p>
        <p style="font-size:0.8rem; color:#94a3b8; margin-top:4px;">
            Cuerpo: <strong style="color:#f8fafc">${planetInfo.name}</strong> |
            LAT: ${lat}° LON: ${lng}°
        </p>
    `);

    // Llamada a la API de Hugging Face (no bloqueante para la animación)
    callHuggingFaceAPI({ ...requestData }).then(apiResult => {
        console.log('[API] Respuesta recibida:', apiResult);

        const targetLat = parseFloat((lat * 0.5).toFixed(2));
        const targetLng = parseFloat((lng * 0.8).toFixed(2));

        setApiStatus('success', `
            <p><strong>Cuerpo de Origen (${planetInfo.name}):</strong></p>
            <p>LAT: ${lat}° | LON: ${lng}°</p>
            <p style="color: #4ade80; margin: 6px 0;"><strong>➜ Análogo Terrestre:</strong></p>
            <p>LAT: ${targetLat}° | LON: ${targetLng}°</p>
            <p style="margin-top:6px;"><strong>Respuesta API:</strong></p>
            <pre style="font-size:0.72rem; color:#a5f3fc; white-space:pre-wrap; word-break:break-word; max-height:90px; overflow-y:auto;">${JSON.stringify(apiResult, null, 2)}</pre>
        `);
    }).catch(err => {
        console.error('[API] Error en llamada:', err);
        setApiStatus('error', `
            <p style="color:#f87171;">⚠️ No se pudo conectar con la API.</p>
            <p style="font-size:0.78rem; color:#94a3b8; margin-top:4px;">${err.message}</p>
            <p style="color:#38bdf8; margin-top:6px; font-size:0.78rem;">
                LAT: ${lat}° | LON: ${lng}° — datos guardados en <code>window.requestData</code>
            </p>
        `);
    });

    // Transición cinematográfica al análogo terrestre (en paralelo a la llamada API)
    setTimeout(() => {
        switchPlanet(targetPlanet);

        const targetLat = parseFloat((lat * 0.5).toFixed(2));
        const targetLng = parseFloat((lng * 0.8).toFixed(2));

        globe.ringColor(() => '#4ade80');
        globe.ringsData([{ lat: targetLat, lng: targetLng }]);

        globe.labelsData([{
            lat: targetLat,
            lng: targetLng,
            text: `ANÁLOGO [${targetLat}°, ${targetLng}°]`
        }]);

        globe.pointOfView({ lat: targetLat, lng: targetLng, altitude: 1.5 }, 1400);
    }, 1100);
}

// =========================================================================
// 6. VARIABLE GLOBAL EN CÓDIGO: VARIABLES Y COORDENADAS PARA LA API
// =========================================================================

// URL base del Space en Hugging Face
const HF_API_BASE_URL = "https://odiseo24-nasa-pruebas.hf.space";

// -------------------------------------------------------------------------
// Función principal para llamar a la API de Hugging Face (Gradio 4 + fallback)
// Envía requestData completo (coordenadas + variables + cuerpo celeste)
// -------------------------------------------------------------------------
async function callHuggingFaceAPI(payload) {
    const baseUrl = HF_API_BASE_URL.replace(/\/$/, '');

    // Intentar protocolo Gradio 4: POST /call/predict → GET /call/predict/{event_id}
    try {
        const gradioPost = await fetch(`${baseUrl}/call/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: [payload] })
        });

        if (gradioPost.ok) {
            const { event_id } = await gradioPost.json();

            // Leer el resultado del evento (Server-Sent Events)
            const gradioGet = await fetch(`${baseUrl}/call/predict/${event_id}`);
            const streamText = await gradioGet.text();

            const dataLine = streamText.split('\n').find(l => l.startsWith('data: '));
            if (dataLine) {
                const rawPayload = JSON.parse(dataLine.replace('data: ', ''));
                return Array.isArray(rawPayload) ? rawPayload[0] : rawPayload;
            }
            return { raw: streamText };
        }
    } catch (err) {
        console.warn('[API] Gradio 4 /call/predict falló, intentando /api/predict...', err.message);
    }

    // Fallback: API estándar /api/predict
    const directPost = await fetch(`${baseUrl}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [payload] })
    });

    if (!directPost.ok) {
        throw new Error(`HTTP ${directPost.status}: ${directPost.statusText}`);
    }

    const result = await directPost.json();
    return Array.isArray(result?.data) ? result.data[0] : result;
}

// Muestra el estado de la llamada API en el panel de telemetría
function setApiStatus(status, detail = '') {
    const card = document.getElementById('cluster-info');
    if (!card) return;

    const statuses = {
        loading:  { label: 'CONSULTANDO API',        color: '#facc15', id: '#PROCESSING' },
        success:  { label: 'ANÁLISIS COMPLETADO',     color: '#4ade80', id: '#TARGET_LOCKED' },
        error:    { label: 'ERROR EN LLAMADA API',    color: '#f87171', id: '#API_ERROR' },
        idle:     { label: 'ESTADO DE ANÁLISIS',      color: '#38bdf8', id: '#3D_READY' }
    };

    const s = statuses[status] || statuses.idle;
    card.innerHTML = `
        <div class="card-header">
            <span>${s.label}</span>
            <span class="code" style="color: ${s.color};">${s.id}</span>
        </div>
        <div class="card-body" style="margin-top: 8px;">
            ${detail}
        </div>
    `;
}

// Configuración de las 8 variables del análisis
export const VARIABLE_CONFIG = [
    { key: "pendiente_media", label: "Pendiente media", defaultVal: 50 },
    { key: "pendiente_p90", label: "Pendiente P90", defaultVal: 50 },
    { key: "rugosidad", label: "Rugosidad", defaultVal: 50 },
    { key: "orientacion", label: "Orientación", defaultVal: 50 },
    { key: "relieve", label: "Relieve", defaultVal: 50 },
    { key: "valles_crestas", label: "Valles y crestas", defaultVal: 50 },
    { key: "ghi", label: "GHI", defaultVal: 50 },
    { key: "albedo", label: "Albedo", defaultVal: 50 }
];

// Variable Objeto dentro del código que guarda todas las variables y las coordenadas registradas
export let requestData = {
    cuerpo_celeste: currentPlanetKey,
    coordenadas: {
        lat: null,
        lon: null
    },
    variables: {
        pendiente_media: 0.50,
        pendiente_p90: 0.50,
        rugosidad: 0.50,
        orientacion: 0.50,
        relieve: 0.50,
        valles_crestas: 0.50,
        ghi: 0.50,
        albedo: 0.50
    }
};

// Variable JSON serializada en formato texto lista para llamadas API (fetch, axios, etc.)
export let requestDataJSON = JSON.stringify(requestData, null, 2);

// Exponer en el objeto global window para permitir llamadas directas de la API o desde consola
window.requestData = requestData;
window.requestDataJSON = requestDataJSON;
window.apiPayload = requestData;
window.apiPayloadJSON = requestDataJSON;
window.variableWeights = requestData.variables;

// Sincroniza la variable JSON serializada y las referencias en window
function syncPayload() {
    requestDataJSON = JSON.stringify(requestData, null, 2);
    window.requestData = requestData;
    window.requestDataJSON = requestDataJSON;
    window.apiPayload = requestData;
    window.apiPayloadJSON = requestDataJSON;
    window.variableWeights = requestData.variables;
    window.variableWeightsJSON = JSON.stringify(requestData.variables, null, 2);

    window.dispatchEvent(new CustomEvent('requestDataUpdate', {
        detail: {
            data: requestData,
            json: requestDataJSON
        }
    }));
}

// Función para registrar / actualizar coordenadas desde clics en el globo o inputs
export function updateRegisteredCoordinates(lat, lon) {
    const parsedLat = (lat !== null && lat !== '' && !isNaN(lat)) ? parseFloat(lat) : null;
    const parsedLon = (lon !== null && lon !== '' && !isNaN(lon)) ? parseFloat(lon) : null;
    requestData.coordenadas.lat = parsedLat;
    requestData.coordenadas.lon = parsedLon;
    syncPayload();
}
window.updateRegisteredCoordinates = updateRegisteredCoordinates;

// Inicialización de la interfaz del panel desplegable de pesos
function initWeightsUI() {
    const variableSelect = document.getElementById('variable-select');
    const balanceBtn = document.getElementById('btn-balance-weights');
    const slidersContainer = document.getElementById('sliders-container');

    // Manejar selección en el menú desplegable de variables
    if (variableSelect) {
        variableSelect.addEventListener('change', (e) => {
            const selectedKey = e.target.value;
            document.querySelectorAll('.slider-item').forEach(item => {
                item.classList.remove('is-highlighted');
            });

            if (selectedKey === 'all') {
                if (slidersContainer) {
                    slidersContainer.scrollTo({ top: 0, behavior: 'smooth' });
                }
            } else {
                const targetItem = document.getElementById(`item-${selectedKey}`);
                if (targetItem) {
                    targetItem.classList.add('is-highlighted');
                    targetItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    setTimeout(() => {
                        targetItem.classList.remove('is-highlighted');
                    }, 2200);
                }
            }
        });
    }

    // Configurar cada barra deslizante interactiva
    const sliders = document.querySelectorAll('.weight-slider');

    function updateSliderVisual(slider) {
        const val = parseFloat(slider.value) || 0;
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const pct = ((val - min) / (max - min)) * 100;
        slider.style.background = `linear-gradient(to right, #0284c7 0%, #38bdf8 ${pct}%, #1e293b ${pct}%, #1e293b 100%)`;
    }

    sliders.forEach(slider => {
        const key = slider.dataset.key;

        const handleInput = () => {
            const rawVal = parseFloat(slider.value);
            const normalized = parseFloat((rawVal / 100).toFixed(2));

            requestData.variables[key] = normalized;

            const badge = document.getElementById(`val-${key}`);
            if (badge) {
                badge.textContent = `${normalized.toFixed(2)} (${Math.round(rawVal)}%)`;
            }

            updateSliderVisual(slider);
            syncPayload();
        };

        slider.addEventListener('input', handleInput);
        slider.addEventListener('change', handleInput);

        updateSliderVisual(slider);
    });

    // Botón para equilibrar todos los pesos al 50%
    if (balanceBtn) {
        balanceBtn.addEventListener('click', () => {
            sliders.forEach(slider => {
                slider.value = 50;
                const key = slider.dataset.key;
                const badge = document.getElementById(`val-${key}`);
                if (badge) {
                    badge.textContent = `0.50 (50%)`;
                }
                requestData.variables[key] = 0.50;
                updateSliderVisual(slider);
            });
            syncPayload();
        });
    }

    // Escuchar cambios en los inputs manuales de coordenadas
    const latInput = document.getElementById('lat-input');
    const lonInput = document.getElementById('lon-input');
    if (latInput) {
        latInput.addEventListener('input', () => {
            updateRegisteredCoordinates(latInput.value, lonInput ? lonInput.value : null);
        });
    }
    if (lonInput) {
        lonInput.addEventListener('input', () => {
            updateRegisteredCoordinates(latInput ? latInput.value : null, lonInput.value);
        });
    }

    syncPayload();
}

// Inicializar interfaz de pesos
initWeightsUI();

// 7. ENTRADA MANUAL DE COORDENADAS
document.getElementById('coord-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (isViewingEarth) return;

    const lat = parseFloat(document.getElementById('lat-input').value);
    const lng = parseFloat(document.getElementById('lon-input').value);

    if (!isNaN(lat) && !isNaN(lng)) {
        updateRegisteredCoordinates(lat, lng);
        globe.ringsData([{ lat, lng }]);
        globe.pointOfView({ lat, lng, altitude: 1.3 }, 900);
        processRegionSelection(currentPlanetKey, lat, lng, "Entrada Manual");
    } else {
        alert("Introduce coordenadas numéricas válidas.");
    }
});

// 8. RETORNO AL PLANETA DE ORIGEN
document.getElementById('back-to-origin-btn').addEventListener('click', () => {
    isViewingEarth = false;
    document.getElementById('planet-selector-section').style.display = 'flex';
    document.getElementById('back-to-origin-btn').style.display = 'none';

    // Limpiar radares y balizas 3D
    globe.ringsData([]);
    globe.labelsData([]);
    globe.ringColor(() => '#38bdf8');

    // Restaurar planeta original y su rotación
    const selectedPlanet = document.getElementById('planet-select').value;
    switchPlanet(selectedPlanet);
    globe.controls().autoRotate = true;
    globe.pointOfView({ lat: 0, lng: 0, altitude: 2.2 }, 1200);

    document.getElementById('current-view-label').innerHTML = `Módulo Activo: <strong id="planet-name">${PLANETS_DATA[currentPlanetKey].name}</strong>`;
    document.getElementById('cluster-info').innerHTML = `
        <div class="card-header">
            <span>ESTADO DE ANÁLISIS</span>
            <span class="code">ID: #GLOBE_READY</span>
        </div>
        <div class="card-body">
            <p class="placeholder-text">Haz clic sobre la esfera 3D o introduce coordenadas para computar el análogo terrestre.</p>
        </div>
    `;
});

// 9. AJUSTE DE TAMAÑO EN CASO DE REDIMENSIONAR LA PANTALLA
window.addEventListener('resize', () => {
    globe.width(container.clientWidth);
    globe.height(container.clientHeight);
});
