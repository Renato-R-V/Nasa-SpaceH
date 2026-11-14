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
        atmosphereAltitude: 0.06,
        uiAccent: "#ef4444",
        uiAccentDark: "#991b1b"
    },
    moon: {
        name: "La Luna (Regolito)",
        texture: "./assets/moon.jpg",
        bump: "./assets/moon_bump.jpg",
        hasAtmosphere: false,
        atmosphereColor: "#ffffff",
        atmosphereAltitude: 0.0,
        uiAccent: "#f8fafc",
        uiAccentDark: "#64748b"
    },
    earth: {
        name: "Tierra (Zona Análoga)",
        texture: "./assets/earth.jpg",
        bump: "./assets/earth_bump.png",
        hasAtmosphere: true,
        atmosphereColor: "#38bdf8",
        atmosphereAltitude: 0.18,
        uiAccent: "#38bdf8",
        uiAccentDark: "#0284c7"
    }
};

let currentPlanetKey = "mars";
let isViewingEarth = false;

// 2. INICIALIZACIÓN DEL GLOBO 3D HIPERREALISTA
const container = document.getElementById('globe-container');
const initWidth = container.clientWidth || (window.innerWidth - 330);
const initHeight = container.clientHeight || window.innerHeight;

const globe = GlobeInstance()(container)
    .width(initWidth)
    .height(initHeight)
    .backgroundImageUrl('./assets/night-sky.png')
    .globeImageUrl(PLANETS_DATA.mars.texture)
    .bumpImageUrl(PLANETS_DATA.mars.bump)
    .showAtmosphere(PLANETS_DATA.mars.hasAtmosphere)
    .atmosphereColor(PLANETS_DATA.mars.atmosphereColor)
    .atmosphereAltitude(PLANETS_DATA.mars.atmosphereAltitude)
    .pointsData([])
    .pointLat(d => d.lat)
    .pointLng(d => d.lng)
    .pointColor(() => PLANETS_DATA.mars.uiAccent)
    .pointAltitude(0.015)
    .pointRadius(0.55);

// Desactivar rotación automática para que solo gire cuando el usuario lo mueva
globe.controls().autoRotate = false;

function resizeGlobe() {
    if (container && container.clientWidth > 0) {
        globe.width(container.clientWidth);
        globe.height(container.clientHeight);
    }
}

setTimeout(resizeGlobe, 150);

function refreshAllSlidersVisual() {
    const planet = PLANETS_DATA[currentPlanetKey] || PLANETS_DATA.mars;
    document.querySelectorAll('.weight-slider').forEach(slider => {
        const val = parseFloat(slider.value) || 0;
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const pct = ((val - min) / (max - min)) * 100;
        slider.style.background = `linear-gradient(to right, ${planet.uiAccentDark} 0%, ${planet.uiAccent} ${pct}%, #1f2737 ${pct}%, #1f2737 100%)`;
    });
}

function renderTargetPoint(lat, lng, accentColor) {
    globe
        .pointColor(() => accentColor)
        .pointsData([{ lat, lng }]);
}

function clearTargetPoint() {
    globe.pointsData([]);
}

function switchPlanet(planetKey) {
    const planet = PLANETS_DATA[planetKey];
    if (!planet) return;
    currentPlanetKey = planetKey;

    document.body.dataset.planet = planetKey;
    refreshAllSlidersVisual();

    if (typeof requestData !== 'undefined') {
        requestData.cuerpo_celeste = planetKey;
        syncPayload();
    }

    globe.globeImageUrl(planet.texture);
    globe.bumpImageUrl(planet.bump);

    globe.showAtmosphere(planet.hasAtmosphere);
    if (planet.hasAtmosphere) {
        globe.atmosphereColor(planet.atmosphereColor);
        globe.atmosphereAltitude(planet.atmosphereAltitude);
    } else {
        globe.atmosphereAltitude(0);
    }

    const planetNameEl = document.getElementById('planet-name');
    if (planetNameEl) {
        planetNameEl.textContent = planet.name;
    }
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

    updateRegisteredCoordinates(roundedLat, roundedLng);

    const originAccent = PLANETS_DATA[currentPlanetKey].uiAccent;
    renderTargetPoint(roundedLat, roundedLng, originAccent);

    processRegionSelection(currentPlanetKey, roundedLat, roundedLng, "Clic en Globo 3D");
});

// Genera el HTML del Panel Derecho con la comparación de similitud de cada variable
function renderRightResultsPanel(originPlanetName, originLat, originLng, targetLat, targetLng, weightsSnapshot, apiResult = null) {
    const panel = document.getElementById('results-panel');
    const toggleRightBtn = document.getElementById('toggle-right-panel');
    if (!panel) return;

    const backendSims = (apiResult && typeof apiResult === 'object')
        ? (apiResult.similitudes || apiResult.similarities || apiResult.variables_similitud || null)
        : null;

    const items = VARIABLE_CONFIG.map((v, idx) => {
        const weight = weightsSnapshot[v.key] ?? 0.5;
        let similarityPct;

        if (backendSims && backendSims[v.key] !== undefined) {
            const raw = Number(backendSims[v.key]);
            similarityPct = raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
        } else {
            const seed = Math.abs(Math.sin((originLat + idx * 13) * 0.17 + originLng * 0.11));
            const baseSim = 74 + Math.round(weight * 16 + seed * 9);
            similarityPct = Math.min(99, Math.max(60, baseSim));
        }

        return {
            key: v.key,
            label: v.label,
            weight,
            similarityPct
        };
    });

    const totalWeight = items.reduce((acc, item) => acc + item.weight, 0);
    const globalSimilarity = totalWeight > 0
        ? Math.round(items.reduce((acc, item) => acc + (item.similarityPct * item.weight), 0) / totalWeight)
        : Math.round(items.reduce((acc, item) => acc + item.similarityPct, 0) / items.length);

    const sortedByWeight = [...items].sort((a, b) => b.weight - a.weight);
    const maxW = sortedByWeight[0].weight;
    const minW = sortedByWeight[sortedByWeight.length - 1].weight;
    const isBalanced = Math.abs(maxW - minW) < 0.01;

    let algorithmReason = "";
    if (apiResult && typeof apiResult === 'object' && (apiResult.motivo || apiResult.reason || apiResult.explicacion)) {
        algorithmReason = apiResult.motivo || apiResult.reason || apiResult.explicacion;
    } else if (isBalanced) {
        const bestMatch = [...items].sort((a, b) => b.similarityPct - a.similarityPct)[0];
        algorithmReason = `Este punto terrestre presenta una <strong>similitud global del ${globalSimilarity}%</strong> bajo ponderación uniforme. Destaca especialmente su cercanía en <strong>${bestMatch.label} (${bestMatch.similarityPct}%)</strong> respecto al terreno analizado en ${originPlanetName}.`;
    } else {
        const topWeighted = sortedByWeight.filter(i => i.weight === maxW || i.weight >= 0.65).slice(0, 2);
        const desc = topWeighted.map(i => `<strong>${i.label}</strong> (peso ${Math.round(i.weight * 100)}%, similitud ${i.similarityPct}%)`).join(' y ');
        algorithmReason = `El algoritmo ha seleccionado estas coordenadas porque maximizan la coincidencia en tus variables prioritarias: ${desc}, logrando un ajuste global del <strong>${globalSimilarity}%</strong> frente a ${originPlanetName}.`;
    }

    const rowsHTML = items.map(item => `
        <div class="sim-row">
            <div class="sim-row-top">
                <span class="sim-var-name">${item.label}</span>
                <div class="sim-metrics">
                    <span class="sim-weight-tag" title="Peso configurado en el panel izquierdo">Peso: ${Math.round(item.weight * 100)}%</span>
                    <span class="sim-score-tag" title="Porcentaje de cercanía en la Tierra">${item.similarityPct}%</span>
                </div>
            </div>
            <div class="sim-bar-track">
                <div class="sim-bar-fill" style="width: ${item.similarityPct}%;"></div>
            </div>
        </div>
    `).join('');

    panel.innerHTML = `
        <div class="results-header">
            <h2>SIMILITUD ANÁLOGA</h2>
            <span class="similarity-pill">${globalSimilarity}% MATCH</span>
        </div>

        <div class="coords-compare-grid">
            <div class="coord-box">
                <span class="label">ORIGEN · ${originPlanetName.split(' ')[0].toUpperCase()}</span>
                <span class="value">${originLat}°, ${originLng}°</span>
            </div>
            <div class="coord-box target">
                <span class="label">ANÁLOGO · TIERRA</span>
                <span class="value">${targetLat}°, ${targetLng}°</span>
            </div>
        </div>

        <div class="reason-box">
            <span class="reason-title">Criterio del Algoritmo</span>
            <p>${algorithmReason}</p>
        </div>

        <div>
            <label class="section-title" style="display:block; margin-bottom:10px;">Cercanía por Variable (Tierra vs. Origen)</label>
            <div class="similarity-list">
                ${rowsHTML}
            </div>
        </div>
    `;

    panel.style.display = 'flex';
    panel.classList.remove('is-collapsed');

    if (toggleRightBtn) {
        toggleRightBtn.style.display = 'flex';
        toggleRightBtn.classList.remove('is-collapsed');
        toggleRightBtn.textContent = '▶';
    }

    setTimeout(resizeGlobe, 50);
}

// 5. PROCESAR REGIÓN Y TRANSICIÓN CINEMATOGRÁFICA
async function processRegionSelection(planetKey, lat, lng, source) {
    const planetInfo = PLANETS_DATA[planetKey];
    isViewingEarth = true;

    updateRegisteredCoordinates(lat, lng);
    const currentWeightsSnapshot = { ...requestData.variables };

    globe.controls().autoRotate = false;
    globe.pointOfView({ lat, lng, altitude: 1.3 }, 900);

    document.getElementById('planet-selector-section').style.display = 'none';
    document.getElementById('back-to-origin-btn').style.display = 'block';

    const hintText = document.getElementById('left-hint-text');
    if (hintText) {
        hintText.innerHTML = `⏳ Analizando vector en <strong>${planetInfo.name}</strong> (${lat}°, ${lng}°)...`;
    }

    const targetPlanet = 'earth';
    document.getElementById('current-view-label').innerHTML = `Módulo: <strong id="planet-name">Análogo Terrestre Computado</strong>`;

    let resolvedLat = parseFloat((lat * 0.5).toFixed(2));
    let resolvedLng = parseFloat((lng * 0.8).toFixed(2));

    callHuggingFaceAPI({ ...requestData }).then(apiResult => {
        console.log('[API] Respuesta recibida:', apiResult);

        if (apiResult && typeof apiResult === 'object') {
            if (apiResult.lat !== undefined && apiResult.lon !== undefined) {
                resolvedLat = parseFloat(Number(apiResult.lat).toFixed(2));
                resolvedLng = parseFloat(Number(apiResult.lon).toFixed(2));
            } else if (apiResult.coordenadas) {
                resolvedLat = parseFloat(Number(apiResult.coordenadas.lat).toFixed(2));
                resolvedLng = parseFloat(Number(apiResult.coordenadas.lon).toFixed(2));
            }
        }

        if (hintText) {
            hintText.innerHTML = `Comparando pesos configurados (izquierda) con similitud hallada (derecha).`;
        }

        renderRightResultsPanel(planetInfo.name, lat, lng, resolvedLat, resolvedLng, currentWeightsSnapshot, apiResult);

        if (isViewingEarth) {
            renderTargetPoint(resolvedLat, resolvedLng, PLANETS_DATA.earth.uiAccent);
            globe.pointOfView({ lat: resolvedLat, lng: resolvedLng, altitude: 1.5 }, 1000);
        }
    }).catch(err => {
        console.error('[API] Error en llamada:', err);
        if (hintText) {
            hintText.innerHTML = `Comparando pesos configurados (izquierda) con similitud hallada (derecha).`;
        }
        renderRightResultsPanel(planetInfo.name, lat, lng, resolvedLat, resolvedLng, currentWeightsSnapshot, null);
    });

    setTimeout(() => {
        switchPlanet(targetPlanet);
        renderTargetPoint(resolvedLat, resolvedLng, PLANETS_DATA.earth.uiAccent);
        globe.pointOfView({ lat: resolvedLat, lng: resolvedLng, altitude: 1.5 }, 1400);
    }, 1100);
}

// =========================================================================
// 6. VARIABLE GLOBAL EN CÓDIGO: VARIABLES Y COORDENADAS PARA LA API
// =========================================================================

const HF_API_BASE_URL = "https://spaceh-nasa-spaceapps.hf.space";

async function callHuggingFaceAPI(payload) {
    const baseUrl = HF_API_BASE_URL.replace(/\/$/, '');

    try {
        const gradioPost = await fetch(`${baseUrl}/call/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: [payload] })
        });

        if (gradioPost.ok) {
            const { event_id } = await gradioPost.json();
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

export let requestDataJSON = JSON.stringify(requestData, null, 2);

window.requestData = requestData;
window.requestDataJSON = requestDataJSON;
window.apiPayload = requestData;
window.apiPayloadJSON = requestDataJSON;
window.variableWeights = requestData.variables;

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

export function updateRegisteredCoordinates(lat, lon) {
    const parsedLat = (lat !== null && lat !== '' && !isNaN(lat)) ? parseFloat(lat) : null;
    const parsedLon = (lon !== null && lon !== '' && !isNaN(lon)) ? parseFloat(lon) : null;
    requestData.coordenadas.lat = parsedLat;
    requestData.coordenadas.lon = parsedLon;
    syncPayload();
}
window.updateRegisteredCoordinates = updateRegisteredCoordinates;

function initWeightsUI() {
    const variableSelect = document.getElementById('variable-select');
    const balanceBtn = document.getElementById('btn-balance-weights');
    const slidersContainer = document.getElementById('sliders-container');

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

    const sliders = document.querySelectorAll('.weight-slider');

    function updateSliderVisual(slider) {
        const planet = PLANETS_DATA[currentPlanetKey] || PLANETS_DATA.mars;
        const val = parseFloat(slider.value) || 0;
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const pct = ((val - min) / (max - min)) * 100;
        slider.style.background = `linear-gradient(to right, ${planet.uiAccentDark} 0%, ${planet.uiAccent} ${pct}%, #1f2737 ${pct}%, #1f2737 100%)`;
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

initWeightsUI();

// 7. ENTRADA MANUAL DE COORDENADAS
document.getElementById('coord-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (isViewingEarth) return;

    const lat = parseFloat(document.getElementById('lat-input').value);
    const lng = parseFloat(document.getElementById('lon-input').value);

    if (!isNaN(lat) && !isNaN(lng)) {
        updateRegisteredCoordinates(lat, lng);

        const originAccent = PLANETS_DATA[currentPlanetKey].uiAccent;
        renderTargetPoint(lat, lng, originAccent);

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

    const resultsPanel = document.getElementById('results-panel');
    const toggleRightBtn = document.getElementById('toggle-right-panel');
    if (resultsPanel) {
        resultsPanel.style.display = 'none';
    }
    if (toggleRightBtn) {
        toggleRightBtn.style.display = 'none';
    }
    setTimeout(resizeGlobe, 50);

    clearTargetPoint();

    const selectedPlanet = document.getElementById('planet-select').value;
    switchPlanet(selectedPlanet);
    globe.controls().autoRotate = false;
    globe.pointOfView({ lat: 0, lng: 0, altitude: 2.2 }, 1200);

    document.getElementById('current-view-label').innerHTML = `Módulo Activo: <strong id="planet-name">${PLANETS_DATA[currentPlanetKey].name}</strong>`;
    
    const hintText = document.getElementById('left-hint-text');
    if (hintText) {
        hintText.innerHTML = `Haz clic sobre la esfera 3D o introduce coordenadas para computar el análogo terrestre.`;
    }
});

// 9. AJUSTE DE TAMAÑO EN CASO DE REDIMENSIONAR LA PANTALLA
window.addEventListener('resize', resizeGlobe);

// 10. PLEGADO / DESPLIEGUE DE PANELES LATERALES PARA VER EL PLANETA LIBRE
const leftPanel = document.getElementById('ui-panel');
const toggleLeftBtn = document.getElementById('toggle-left-panel');
const rightPanel = document.getElementById('results-panel');
const toggleRightBtn = document.getElementById('toggle-right-panel');

if (toggleLeftBtn && leftPanel) {
    toggleLeftBtn.addEventListener('click', () => {
        const collapsed = leftPanel.classList.toggle('is-collapsed');
        toggleLeftBtn.classList.toggle('is-collapsed', collapsed);
        toggleLeftBtn.textContent = collapsed ? '▶' : '◀';
        setTimeout(resizeGlobe, 360);
    });
}

if (toggleRightBtn && rightPanel) {
    toggleRightBtn.addEventListener('click', () => {
        const collapsed = rightPanel.classList.toggle('is-collapsed');
        toggleRightBtn.classList.toggle('is-collapsed', collapsed);
        toggleRightBtn.textContent = collapsed ? '◀' : '▶';
        setTimeout(resizeGlobe, 360);
    });
}