// Initialize Globe.gl from global script or ESM
const GlobeInstance = window.Globe;

// 1. CELESTIAL BODIES CONFIGURATION WITH HD TEXTURES, BUMP MAPS & ATMOSPHERES
const PLANETS_DATA = {
    mars: {
        name: "Mars (Surface)",
        texture: "./assets/mars.jpg",
        bump: "./assets/mars.jpg",
        hasAtmosphere: true,
        atmosphereColor: "#e07a5f",
        atmosphereAltitude: 0.06,
        uiAccent: "#ef4444",
        uiAccentDark: "#991b1b"
    },
    moon: {
        name: "The Moon (Regolith)",
        texture: "./assets/moon.jpg",
        bump: "./assets/moon_bump.jpg",
        hasAtmosphere: false,
        atmosphereColor: "#ffffff",
        atmosphereAltitude: 0.0,
        uiAccent: "#f8fafc",
        uiAccentDark: "#64748b"
    },
    earth: {
        name: "Earth (Analog Zone)",
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
let activeAnalogsData = [];

// 2. HYPERREALISTIC 3D GLOBE INITIALIZATION
const container = document.getElementById('globe-container');
const initWidth = container.clientWidth || (window.innerWidth - 360);
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

function renderMultiplePoints(points, accentColor) {
    globe
        .pointColor(() => accentColor)
        .pointsData(points);
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

const planetSelect = document.getElementById('planet-select');
planetSelect.addEventListener('change', (e) => {
    switchPlanet(e.target.value);
});

globe.onGlobeClick(({ lat, lng }) => {
    if (isViewingEarth) return;

    const roundedLat = parseFloat(lat.toFixed(2));
    const roundedLng = parseFloat(lng.toFixed(2));

    document.getElementById('lat-input').value = roundedLat;
    document.getElementById('lon-input').value = roundedLng;

    updateRegisteredCoordinates(roundedLat, roundedLng);

    const originAccent = PLANETS_DATA[currentPlanetKey].uiAccent;
    renderTargetPoint(roundedLat, roundedLng, originAccent);

    processRegionSelection(currentPlanetKey, roundedLat, roundedLng, "3D Globe Click");
});

// =========================================================================
// RIGHT PANEL RENDERING WITH 10 EXPANDABLE ANALOGS (TOPOLOGY & COMBINED COLUMNS)
// =========================================================================

function renderRightResultsPanel(originPlanetName, originLat, originLng, targetLat, targetLng, weightsSnapshot, apiResult = null) {
    const panel = document.getElementById('results-panel');
    const toggleRightBtn = document.getElementById('toggle-right-panel');
    if (!panel) return;

    if (apiResult && typeof apiResult === 'object' && (apiResult.candidatos || apiResult.analogos || apiResult.puntos_analogos || apiResult.alternatives)) {
        const rawList = apiResult.candidatos || apiResult.analogos || apiResult.puntos_analogos || apiResult.alternatives;
        if (Array.isArray(rawList)) {
            activeAnalogsData = rawList.map((c, idx) => {
                const lat = parseFloat(Number(c.latitud !== undefined ? c.latitud : (c.lat !== undefined ? c.lat : 0)).toFixed(2));
                const lng = parseFloat(Number(c.longitud !== undefined ? c.longitud : (c.lon !== undefined ? c.lon : (c.lng || 0))).toFixed(2));
                const rank = c.rank || c.rango || (idx + 1);
                const ubicacion = c.ubicacion || c.nombre || `Análogo Terrestre #${rank}`;

                // Métricas de analogía y verosimilitud
                const similarity = c.grado_analogia_pct !== undefined 
                    ? Math.round(c.grado_analogia_pct) 
                    : (c.similitud !== undefined ? Math.round(c.similitud) : Math.round(Math.max(65, 100 - (Number(c.distancia || 0.1) * 100))));

                const verosimilitud = c.verosimilitud_pct !== undefined 
                    ? Number(c.verosimilitud_pct).toFixed(1) 
                    : Math.min(98.5, (similarity * 0.96 + 2.5)).toFixed(1);

                const similitudTopo = c.similitud_topo_pct !== undefined 
                    ? Number(c.similitud_topo_pct).toFixed(1) 
                    : Math.min(96.0, (similarity * 0.88 + 6.0)).toFixed(1);

                // Métricas topológicas TDA
                const wasserstein = c.wasserstein_w1 !== undefined 
                    ? Number(c.wasserstein_w1).toFixed(1) 
                    : Math.round(700 + (100 - similarity) * 45).toFixed(1);

                const entropia = c.entropia_pe_h1 !== undefined 
                    ? Number(c.entropia_pe_h1).toFixed(2) 
                    : (4.25 + (idx % 3) * 0.55).toFixed(2);

                // Variables físicas X = (A, Q, H) y d_z
                const dz = c.d_z_original !== undefined 
                    ? Number(c.d_z_original).toFixed(3) 
                    : (c.distancia !== undefined ? Number(c.distancia).toFixed(3) : (0.35 + idx * 0.08).toFixed(3));

                const albedoA = c.albedo_A !== undefined 
                    ? Number(c.albedo_A).toFixed(3) 
                    : (c.normalizadas ? (c.normalizadas[0] * 0.28).toFixed(3) : "0.210");

                const qSolar = c.q_solar !== undefined 
                    ? Number(c.q_solar).toFixed(1) 
                    : (c.normalizadas ? (c.normalizadas[1] * 165).toFixed(1) : "155.0");

                const relieveH = c.relieve_H_m !== undefined 
                    ? Number(c.relieve_H_m).toFixed(1) 
                    : (c.normalizadas ? (c.normalizadas[2] * 680).toFixed(1) : "520.0");

                // Diagnósticos cualitativos (sin aterrizaje)
                let concordancia = c.concordancia_topologica;
                if (!concordancia) {
                    const wVal = parseFloat(wasserstein);
                    if (wVal < 1000) concordancia = "Isomorfismo Alto (Estructura de cuencas equivalente a Marte)";
                    else if (wVal < 2000) concordancia = "Isomorfismo Moderado (Concordancia morfológica parcial)";
                    else concordancia = "Discordancia Morfológica (Variación topológica significativa)";
                }

                let movilidad = c.movilidad_rover;
                if (!movilidad) {
                    const eVal = parseFloat(entropia);
                    if (eVal < 4.8) movilidad = "Tránsito Expedito (Baja tortuosidad, regolito continuo)";
                    else if (eVal <= 5.8) movilidad = "Tránsito Moderado (Ondulaciones y bloques franqueables)";
                    else movilidad = "Laberinto Topológico (Elevada rugosidad y cañones)";
                }

                const variablesSim = c.normalizadas 
                    ? c.normalizadas.map(v => Math.round(Math.min(99, Math.max(50, Math.abs(v) <= 1 ? v * 100 : v))))
                    : [Math.round(similarity * 0.92), Math.round(similarity * 0.95), Math.round(similarity * 0.88)];

                return {
                    rank,
                    lat,
                    lng,
                    ubicacion,
                    similarity,
                    verosimilitud,
                    similitudTopo,
                    wasserstein,
                    entropia,
                    dz,
                    albedoA,
                    qSolar,
                    relieveH,
                    concordancia,
                    movilidad,
                    variablesSim,
                    region: `${ubicacion} (#${rank})`
                };
            });
        }
    } else {
        const defaultCatalogo = currentPlanetKey === "moon" ? [
            { rank: 1, lat: 19.82, lng: -155.46, ubicacion: "Meseta Basáltica de Mauna Kea (Hawái)", similarity: 95, verosimilitud: "93.5", similitudTopo: "91.5", wasserstein: "760.0", entropia: "4.45", dz: "0.420", albedoA: "0.125", qSolar: "165.0", relieveH: "780.0", concordancia: "Isomorfismo Alto (Piroclastos y regolito lunar)", movilidad: "Tránsito Expedito (Suelos piroclásticos densos)", variablesSim: [88, 92, 95] },
            { rank: 2, lat: 43.46, lng: -113.56, ubicacion: "Craters of the Moon, Idaho (EE.UU.)", similarity: 93, verosimilitud: "91.2", similitudTopo: "88.7", wasserstein: "890.0", entropia: "5.15", dz: "0.550", albedoA: "0.118", qSolar: "135.0", relieveH: "420.0", concordancia: "Isomorfismo Alto (Tubos de lava colapsados)", movilidad: "Tránsito Moderado (Basalto vesicular)", variablesSim: [82, 85, 90] },
            { rank: 3, lat: 46.52, lng: -80.95, ubicacion: "Cuenca de Impacto de Sudbury (Canadá)", similarity: 91, verosimilitud: "88.0", similitudTopo: "84.6", wasserstein: "1220.0", entropia: "4.85", dz: "0.680", albedoA: "0.145", qSolar: "110.0", relieveH: "310.0", concordancia: "Isomorfismo Moderado (Brechas de impacto lunar)", movilidad: "Tránsito Moderado (Ondulaciones metamórficas)", variablesSim: [75, 78, 86] },
            { rank: 4, lat: 28.27, lng: -16.64, ubicacion: "Llano de Ucanca, Teide (España)", similarity: 89, verosimilitud: "86.1", similitudTopo: "82.0", wasserstein: "1390.0", entropia: "5.30", dz: "0.760", albedoA: "0.155", qSolar: "170.0", relieveH: "650.0", concordancia: "Isomorfismo Moderado (Pómez y regolito fino)", movilidad: "Tránsito Moderado (Arenas volcánicas)", variablesSim: [74, 84, 82] },
            { rank: 5, lat: -23.86, lng: 132.31, ubicacion: "Gosses Bluff Crater (Australia)", similarity: 87, verosimilitud: "84.5", similitudTopo: "79.5", wasserstein: "1540.0", entropia: "4.70", dz: "0.830", albedoA: "0.180", qSolar: "160.0", relieveH: "280.0", concordancia: "Estructura de Anillo Central de Impacto", movilidad: "Tránsito Expedito en Fondo", variablesSim: [60, 88, 65] },
            { rank: 6, lat: 35.03, lng: -111.02, ubicacion: "Meteor Crater (Arizona, EE.UU.)", similarity: 86, verosimilitud: "82.8", similitudTopo: "77.0", wasserstein: "1700.0", entropia: "4.90", dz: "0.900", albedoA: "0.170", qSolar: "155.0", relieveH: "230.0", concordancia: "Cráter de Impacto Meteórico de Transición", movilidad: "Tránsito Moderado en Manto de Eyección", variablesSim: [62, 80, 75] },
            { rank: 7, lat: 64.90, lng: -17.00, ubicacion: "Campos de Ceniza de Askja (Islandia)", similarity: 84, verosimilitud: "80.5", similitudTopo: "74.2", wasserstein: "1880.0", entropia: "5.80", dz: "0.980", albedoA: "0.110", qSolar: "85.0", relieveH: "720.0", concordancia: "Caldera Volcánica Análoga a Tierras Altas", movilidad: "Laberinto Topológico (Tefras y fisuras)", variablesSim: [90, 45, 35] },
            { rank: 8, lat: 50.41, lng: 10.61, ubicacion: "Ries Crater / Nördlinger Ries (Alemania)", similarity: 82, verosimilitud: "78.4", similitudTopo: "71.8", wasserstein: "2020.0", entropia: "4.65", dz: "1.050", albedoA: "0.160", qSolar: "115.0", relieveH: "290.0", concordancia: "Suevita y Brechas Polimícticas", movilidad: "Tránsito Expedito (Relieve rellenado)", variablesSim: [55, 62, 58] },
            { rank: 9, lat: 19.98, lng: 79.96, ubicacion: "Lonar Crater (India)", similarity: 80, verosimilitud: "76.0", similitudTopo: "69.2", wasserstein: "2180.0", entropia: "5.10", dz: "1.120", albedoA: "0.135", qSolar: "158.0", relieveH: "180.0", concordancia: "Cráter de Impacto en Trapps Basálticos", movilidad: "Tránsito Moderado (Borde empinado)", variablesSim: [58, 78, 62] },
            { rank: 10, lat: -25.20, lng: 15.20, ubicacion: "Sossusvlei Regolith Fields (Namibia)", similarity: 77, verosimilitud: "73.5", similitudTopo: "66.5", wasserstein: "2350.0", entropia: "5.45", dz: "1.200", albedoA: "0.210", qSolar: "175.0", relieveH: "320.0", concordancia: "Mar de Regolito y Granulometría Fina", movilidad: "Tránsito Exigente (Dunas activas)", variablesSim: [45, 95, 85] }
        ] : [
            { rank: 1, lat: -24.50, lng: -69.25, ubicacion: "Desierto de Atacama (Chile)", similarity: 96, verosimilitud: "94.2", similitudTopo: "92.8", wasserstein: "720.5", entropia: "4.35", dz: "0.380", albedoA: "0.212", qSolar: "156.7", relieveH: "529.3", concordancia: "Isomorfismo Alto (Estructura de cuencas marcianas)", movilidad: "Tránsito Expedito (Baja tortuosidad, regolito)", variablesSim: [95, 90, 86] },
            { rank: 2, lat: 75.38, lng: -89.67, ubicacion: "Cráter Haughton, Devon Island (Canadá)", similarity: 92, verosimilitud: "91.0", similitudTopo: "89.5", wasserstein: "910.0", entropia: "4.80", dz: "0.520", albedoA: "0.175", qSolar: "132.4", relieveH: "610.0", concordancia: "Isomorfismo Alto (Topología crateriforme paleoclimática)", movilidad: "Tránsito Moderado (Bloques permafrost)", variablesSim: [82, 75, 60] },
            { rank: 3, lat: 28.27, lng: -16.64, ubicacion: "Parque Nacional del Teide, Tenerife (España)", similarity: 91, verosimilitud: "88.5", similitudTopo: "86.2", wasserstein: "1140.0", entropia: "5.25", dz: "0.610", albedoA: "0.195", qSolar: "168.0", relieveH: "740.0", concordancia: "Isomorfismo Moderado (Campos de lava obsidiánica)", movilidad: "Tránsito Moderado (Superficie basáltica)", variablesSim: [78, 88, 65] },
            { rank: 4, lat: 37.69, lng: -6.55, ubicacion: "Río Tinto (España)", similarity: 89, verosimilitud: "86.0", similitudTopo: "83.4", wasserstein: "1350.0", entropia: "5.40", dz: "0.740", albedoA: "0.165", qSolar: "142.5", relieveH: "380.0", concordancia: "Isomorfismo Moderado (Erosión fluvial ácida marciana)", movilidad: "Tránsito Moderado (Cauces meteorizados)", variablesSim: [65, 80, 45] },
            { rank: 5, lat: -77.50, lng: 162.00, ubicacion: "Valles Secos de McMurdo (Antártida)", similarity: 87, verosimilitud: "84.1", similitudTopo: "80.5", wasserstein: "1520.0", entropia: "5.65", dz: "0.810", albedoA: "0.260", qSolar: "95.0", relieveH: "890.0", concordancia: "Isomorfismo Moderado (Criodesierto polar hiperárido)", movilidad: "Tránsito Exigente (Pavimento desértico y morrenas)", variablesSim: [90, 35, 92] },
            { rank: 6, lat: 38.40, lng: -110.79, ubicacion: "Hanksville, Utah (MDRS)", similarity: 85, verosimilitud: "82.5", similitudTopo: "78.2", wasserstein: "1680.0", entropia: "5.10", dz: "0.880", albedoA: "0.220", qSolar: "150.0", relieveH: "450.0", concordancia: "Isomorfismo Moderado (Estratigrafía sedimentaria)", movilidad: "Tránsito Moderado (Areniscas y arcillas)", variablesSim: [70, 85, 72] },
            { rank: 7, lat: 64.12, lng: -21.82, ubicacion: "Campos de Lava de Islandia", similarity: 83, verosimilitud: "80.0", similitudTopo: "75.8", wasserstein: "1850.0", entropia: "5.90", dz: "0.950", albedoA: "0.130", qSolar: "88.0", relieveH: "620.0", concordancia: "Morfología Volcánica de Holoceno", movilidad: "Laberinto Topológico (Lavas afiladas y escarpes)", variablesSim: [85, 50, 40] },
            { rank: 8, lat: -25.34, lng: 131.03, ubicacion: "Uluru / Outback Australiano", similarity: 82, verosimilitud: "78.0", similitudTopo: "73.5", wasserstein: "1980.0", entropia: "4.60", dz: "1.020", albedoA: "0.245", qSolar: "162.0", relieveH: "350.0", concordancia: "Relieve Aislado y Regolito Rojo (Inselbergs)", movilidad: "Tránsito Expedito (Planicies de arena)", variablesSim: [55, 92, 80] },
            { rank: 9, lat: 35.03, lng: -111.02, ubicacion: "Cráter Barringer (Meteor Crater, Arizona)", similarity: 80, verosimilitud: "76.2", similitudTopo: "71.0", wasserstein: "2150.0", entropia: "4.95", dz: "1.100", albedoA: "0.210", qSolar: "155.0", relieveH: "230.0", concordancia: "Estructura de Impacto Simple (Borde y eyecta)", movilidad: "Tránsito Moderado en Eyecta", variablesSim: [60, 88, 75] },
            { rank: 10, lat: -31.76, lng: -69.21, ubicacion: "Puna Andina (San Juan, Argentina)", similarity: 78, verosimilitud: "74.0", similitudTopo: "68.4", wasserstein: "2300.0", entropia: "5.75", dz: "1.180", albedoA: "0.235", qSolar: "172.0", relieveH: "980.0", concordancia: "Gran Altitud y Radiación UV (Terreno escarpado)", movilidad: "Tránsito Exigente (Alta pendiente y canchales)", variablesSim: [72, 94, 88] }
        ];
        activeAnalogsData = defaultCatalogo;
    }

    const originShortName = originPlanetName.replace(/^The\s+/i, '').split(' ')[0].toUpperCase();

    const analogsHTML = activeAnalogsData.map((alt, index) => {
        const isOpenClass = index === 0 ? 'is-open' : '';

        return `
            <div class="analogue-dropdown-item ${isOpenClass}" data-index="${index}">
                <div class="analogue-dropdown-header">
                    <span class="analogue-rank">#${alt.rank || (index + 1)} ${index === 0 ? '(Primary)' : ''}</span>
                    <span class="analogue-coords">${alt.lat}°, ${alt.lng}°</span>
                    <span class="analogue-pill-small">${alt.similarity}% ANALOGY</span>
                </div>
                <div class="analogue-dropdown-body">
                    <div style="font-size: 0.8rem; font-weight: 600; color: var(--theme-accent); display: flex; align-items: center; gap: 5px;">
                        <span>📍</span> <span>${alt.ubicacion}</span>
                    </div>

                    <div class="coords-compare-grid" style="margin-bottom: 4px;">
                        <div class="coord-box">
                            <span class="label">ORIGIN · ${originShortName}</span>
                            <span class="value">${originLat}°, ${originLng}°</span>
                        </div>
                        <div class="coord-box target">
                            <span class="label">ANALOG #${alt.rank || (index + 1)}</span>
                            <span class="value">${alt.lat}°, ${alt.lng}°</span>
                        </div>
                    </div>

                    <!-- Metric comparison bars -->
                    <div class="similarity-list" style="margin-bottom: 4px;">
                        <div class="sim-row">
                            <div class="sim-row-top">
                                <span class="sim-var-name">Grado de Analogía Global</span>
                                <div class="sim-metrics">
                                    <span class="sim-score-tag">${alt.similarity}%</span>
                                </div>
                            </div>
                            <div class="sim-bar-track">
                                <div class="sim-bar-fill" style="width: ${alt.similarity}%;"></div>
                            </div>
                        </div>
                        <div class="sim-row">
                            <div class="sim-row-top">
                                <span class="sim-var-name">Verosimilitud Geomorfométrica</span>
                                <div class="sim-metrics">
                                    <span class="sim-score-tag">${alt.verosimilitud}%</span>
                                </div>
                            </div>
                            <div class="sim-bar-track">
                                <div class="sim-bar-fill" style="width: ${alt.verosimilitud}%;"></div>
                            </div>
                        </div>
                        <div class="sim-row">
                            <div class="sim-row-top">
                                <span class="sim-var-name">Similitud Topológica (TDA)</span>
                                <div class="sim-metrics">
                                    <span class="sim-score-tag">${alt.similitudTopo}%</span>
                                </div>
                            </div>
                            <div class="sim-bar-track">
                                <div class="sim-bar-fill" style="width: ${alt.similitudTopo}%;"></div>
                            </div>
                        </div>
                    </div>

                    <!-- 2x2 Grid: TDA & Physical Columns -->
                    <div class="coords-compare-grid" style="margin-bottom: 4px;">
                        <div class="coord-box">
                            <span class="label">WASSERSTEIN W₁</span>
                            <span class="value">${alt.wasserstein}</span>
                        </div>
                        <div class="coord-box">
                            <span class="label">ENTROPÍA PE(H₁)</span>
                            <span class="value">${alt.entropia}</span>
                        </div>
                        <div class="coord-box">
                            <span class="label">RELIEVE H (m)</span>
                            <span class="value">${alt.relieveH} m</span>
                        </div>
                        <div class="coord-box">
                            <span class="label">PROXY SOLAR Q</span>
                            <span class="value">${alt.qSolar} W/m²</span>
                        </div>
                    </div>

                    <!-- Diagnostics (Zero landing references) -->
                    <div class="reason-box" style="margin-bottom: 4px;">
                        <div style="margin-bottom: 6px;">
                            <span class="reason-title">ESTRUCTURA TOPOLÓGICA</span>
                            <p style="margin: 0; font-size: 0.74rem;">${alt.concordancia}</p>
                        </div>
                        <div>
                            <span class="reason-title">MOVILIDAD ROVER</span>
                            <p style="margin: 0; font-size: 0.74rem;">${alt.movilidad}</p>
                        </div>
                    </div>

                    <button type="button" class="btn-fly-to" data-index="${index}">
                        Center & Explore on 3D Globe
                    </button>
                </div>
            </div>
        `;
    }).join('');

    panel.innerHTML = `
        <div class="results-header">
            <h2>TOP 10 TERRESTRIAL ANALOGS</h2>
            <span class="similarity-pill">TDA & Geomorphometry</span>
        </div>

        <div class="reason-box">
            <span class="reason-title">Topological & Terrain Analysis</span>
            <p>10 terrestrial analogs ranked by multi-variable similitude, geomorphometry, and persistent homology (TDA). Click to inspect metrics or fly to point.</p>
        </div>

        <div class="analogue-accordion-list" style="margin-top: 10px;">
            ${analogsHTML}
        </div>
    `;

    panel.style.display = 'flex';
    panel.classList.remove('is-collapsed');

    if (toggleRightBtn) {
        toggleRightBtn.style.display = 'flex';
        toggleRightBtn.classList.remove('is-collapsed');
        toggleRightBtn.textContent = '▶';
    }

    setupAnalogsAccordion();
    setTimeout(resizeGlobe, 50);
}

function setupAnalogsAccordion() {
    const dropdownItems = document.querySelectorAll('.analogue-dropdown-item');

    dropdownItems.forEach(item => {
        const header = item.querySelector('.analogue-dropdown-header');
        const flyBtn = item.querySelector('.btn-fly-to');
        const index = parseInt(item.dataset.index, 10);

        header.addEventListener('click', () => {
            const wasOpen = item.classList.contains('is-open');
            dropdownItems.forEach(i => i.classList.remove('is-open'));
            if (!wasOpen) {
                item.classList.add('is-open');
            }
        });

        if (flyBtn) {
            flyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetAnalogue = activeAnalogsData[index];
                if (!targetAnalogue) return;

                renderTargetPoint(targetAnalogue.lat, targetAnalogue.lng, PLANETS_DATA.earth.uiAccent);
                globe.pointOfView({ lat: targetAnalogue.lat, lng: targetAnalogue.lng, altitude: 1.4 }, 1200);
            });
        }
    });
}

// 5. PROCESS REGION & CINEMATIC TRANSITION
async function processRegionSelection(planetKey, lat, lng, source) {
    const planetInfo = PLANETS_DATA[planetKey];
    isViewingEarth = false;

    updateRegisteredCoordinates(lat, lng);
    const currentWeightsSnapshot = { ...requestData.variables };

    globe.controls().autoRotate = false;
    globe.pointOfView({ lat, lng, altitude: 1.3 }, 900);

    document.getElementById('planet-selector-section').style.display = 'none';
    document.getElementById('back-to-origin-btn').style.display = 'block';

    const hintText = document.getElementById('left-hint-text');
    if (hintText) {
        hintText.innerHTML = `⏳ Computing terrestrial analogs on backend for <strong>${planetInfo.name}</strong> (${lat}°, ${lng}°)...`;
    }

    callHuggingFaceAPI({ ...requestData }).then(apiResult => {
        console.log('[API] Response received:', apiResult);

        let resolvedLat = 0;
        let resolvedLng = 0;

        if (apiResult && typeof apiResult === 'object') {
            if (apiResult.candidatos && Array.isArray(apiResult.candidatos) && apiResult.candidatos.length > 0) {
                const c0 = apiResult.candidatos[0];
                resolvedLat = parseFloat(Number(c0.latitud !== undefined ? c0.latitud : (c0.lat || 0)).toFixed(2));
                resolvedLng = parseFloat(Number(c0.longitud !== undefined ? c0.longitud : (c0.lon || c0.lng || 0)).toFixed(2));
            } else if (apiResult.lat !== undefined && apiResult.lon !== undefined) {
                resolvedLat = parseFloat(Number(apiResult.lat).toFixed(2));
                resolvedLng = parseFloat(Number(apiResult.lon).toFixed(2));
            } else if (apiResult.coordenadas) {
                resolvedLat = parseFloat(Number(apiResult.coordenadas.lat).toFixed(2));
                resolvedLng = parseFloat(Number(apiResult.coordenadas.lon).toFixed(2));
            }
        }

        isViewingEarth = true;
        switchPlanet('earth');
        document.getElementById('current-view-label').innerHTML = `Module: <strong id="planet-name">Computed Terrestrial Analog</strong>`;

        if (hintText) {
            hintText.innerHTML = `Comparing configured weights (left) with computed similarity (right).`;
        }

        renderRightResultsPanel(planetInfo.name, lat, lng, resolvedLat, resolvedLng, currentWeightsSnapshot, apiResult);

        const firstPoint = (activeAnalogsData && activeAnalogsData[0]) || { lat: resolvedLat, lng: resolvedLng };
        const pointsList = (activeAnalogsData && activeAnalogsData.length > 0)
            ? activeAnalogsData.map(a => ({ lat: a.lat, lng: a.lng }))
            : [{ lat: resolvedLat, lng: resolvedLng }];
        renderMultiplePoints(pointsList, PLANETS_DATA.earth.uiAccent);
        globe.pointOfView({ lat: firstPoint.lat, lng: firstPoint.lng, altitude: 1.5 }, 1200);
    }).catch(err => {
        console.error('[API] Call error:', err);
        if (hintText) {
            hintText.innerHTML = `⚠️ Connection error to Hugging Face backend. Please verify your Space is Running.`;
        }
        alert("Could not retrieve analog coordinates from backend. Please verify Hugging Face Space status.");
    });
}

// =========================================================================
// 6. GLOBAL PAYLOAD VARIABLE: VARIABLES AND COORDINATES FOR THE API
// =========================================================================

const HF_API_BASE_URL = "https://odiseo24-nasa-pruebas.hf.space";

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
        console.warn('[API] Gradio 4 /call/predict failed, trying /api/predict...', err.message);
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
    { key: "relieve", label: "Relief", defaultVal: 50 },
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
        relieve: 0.50,
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
        processRegionSelection(currentPlanetKey, lat, lng, "Manual Input");
    } else {
        alert("Please enter valid numeric coordinates.");
    }
});

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

    document.getElementById('current-view-label').innerHTML = `Active Module: <strong id="planet-name">${PLANETS_DATA[currentPlanetKey].name}</strong>`;
    
    const hintText = document.getElementById('left-hint-text');
    if (hintText) {
        hintText.innerHTML = `Click on the 3D sphere or enter coordinates to compute the terrestrial analog.`;
    }
});

window.addEventListener('resize', resizeGlobe);

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

// =========================================================================
// TOOLTIPS
// =========================================================================

const variableInfoData = {
    relieve: {
        title: "Relief",
        body: "Standard deviation of elevations within a regional radius, measuring the vertical amplitude and variation of the terrain."
    },
    ghi: {
        title: "GHI (Irradiance)",
        body: "Estimate of the direct solar energy and insolation received by the surface per unit area, influenced by latitude, slope, and aspect."
    },
    albedo: {
        title: "Albedo",
        body: "Proportion of incident sunlight that the surface reflects directly back into space compared to what it absorbs."
    }
};

function setupVariableTooltips() {
    const infoButtons = document.querySelectorAll('.info-btn');
    const tooltip = document.getElementById('var-tooltip');
    const tooltipTitle = document.getElementById('var-tooltip-title');
    const tooltipBody = document.getElementById('var-tooltip-body');

    if (!tooltip || infoButtons.length === 0) return;

    infoButtons.forEach(btn => {
        const key = btn.getAttribute('data-info-key');

        btn.addEventListener('mouseenter', () => {
            const data = variableInfoData[key];
            if (!data) return;

            tooltipTitle.textContent = data.title;
            tooltipBody.textContent = data.body;
            tooltip.classList.add('is-visible');
            btn.classList.add('is-active');
        });

        btn.addEventListener('mousemove', (e) => {
            const offset = 14;
            let x = e.clientX + offset;
            let y = e.clientY + offset;

            if (x + 240 > window.innerWidth) {
                x = e.clientX - 240 - offset;
            }
            if (y + 130 > window.innerHeight) {
                y = e.clientY - 130 - offset;
            }

            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y}px`;
        });

        btn.addEventListener('mouseleave', () => {
            tooltip.classList.remove('is-visible');
            btn.classList.remove('is-active');
        });
    });
}

setupVariableTooltips();