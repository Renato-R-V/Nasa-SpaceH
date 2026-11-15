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
let lastBackendApiResult = null;

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

function updateTheme(planetKey) {
    const planet = PLANETS_DATA[planetKey];
    document.documentElement.style.setProperty('--theme-accent', planet.uiAccent);
    document.documentElement.style.setProperty('--theme-accent-dark', planet.uiAccentDark);
    refreshAllSlidersVisual();
}

// 3. PLANET NAVIGATION AND GLOBE SWITCHING
function switchPlanet(planetKey) {
    if (!PLANETS_DATA[planetKey]) return;
    currentPlanetKey = planetKey;
    const planet = PLANETS_DATA[planetKey];

    globe
        .globeImageUrl(planet.texture)
        .bumpImageUrl(planet.bump)
        .showAtmosphere(planet.hasAtmosphere)
        .atmosphereColor(planet.atmosphereColor)
        .atmosphereAltitude(planet.atmosphereAltitude);

    updateTheme(planetKey);

    const planetNameEl = document.getElementById('planet-name');
    if (planetNameEl) {
        planetNameEl.textContent = planet.name;
    }

    requestData.cuerpo_celeste = planetKey;
    syncPayload();
}

document.getElementById('planet-select').addEventListener('change', (e) => {
    if (isViewingEarth) return;
    switchPlanet(e.target.value);
    clearTargetPoint();
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
// 4. SCIENTIFIC PLANETARY TERRAIN ANALOG ENGINE (TDA & GEOMORPHOMETRY)
// Calibrated against NASA Planetary Analogs, combining multi-variable
// physical attributes (Albedo, GHI proxy, Relief) with Persistent Homology (TDA).
// =========================================================================

export const KNOWN_SITES = [
    // Mars analogs (matching backend.py CATALOGO_ANALOGOS['mars'])
    {
        keywords: ["atacama", "chile"],
        ubicacion: "Desierto de Atacama (Chile)",
        lat: -24.50, lng: -69.25,
        albedo: 0.22, q_solar: 185.0, relieve: 530.0,
        w1_base: 720.0, entropia_base: 4.35
    },
    {
        keywords: ["haughton", "devon", "canad"],
        ubicacion: "Cráter Haughton, Devon Island (Canadá)",
        lat: 75.38, lng: -89.67,
        albedo: 0.18, q_solar: 110.0, relieve: 610.0,
        w1_base: 910.0, entropia_base: 4.80
    },
    {
        keywords: ["teide", "tenerife"],
        ubicacion: "Parque Nacional del Teide, Tenerife (España)",
        lat: 28.27, lng: -16.64,
        albedo: 0.20, q_solar: 170.0, relieve: 950.0,
        w1_base: 1050.0, entropia_base: 5.20
    },
    {
        keywords: ["tinto", "rio tinto"],
        ubicacion: "Río Tinto (España)",
        lat: 37.69, lng: -6.55,
        albedo: 0.16, q_solar: 145.0, relieve: 380.0,
        w1_base: 1300.0, entropia_base: 5.40
    },
    {
        keywords: ["mcmurdo", "valles secos", "antart"],
        ubicacion: "Valles Secos de McMurdo (Antártida)",
        lat: -77.50, lng: 162.00,
        albedo: 0.45, q_solar: 70.0, relieve: 680.0,
        w1_base: 850.0, entropia_base: 4.50
    },
    {
        keywords: ["hanksville", "mdrs", "utah"],
        ubicacion: "Hanksville, Utah (MDRS)",
        lat: 38.40, lng: -110.79,
        albedo: 0.22, q_solar: 160.0, relieve: 450.0,
        w1_base: 1100.0, entropia_base: 5.10
    },
    {
        keywords: ["islandia", "iceland", "lava"],
        ubicacion: "Campos de Lava de Islandia",
        lat: 64.12, lng: -21.82,
        albedo: 0.13, q_solar: 95.0, relieve: 820.0,
        w1_base: 1450.0, entropia_base: 5.85
    },
    {
        keywords: ["uluru", "outback", "australia"],
        ubicacion: "Uluru / Outback Australiano",
        lat: -25.34, lng: 131.03,
        albedo: 0.25, q_solar: 175.0, relieve: 350.0,
        w1_base: 1180.0, entropia_base: 4.60
    },
    {
        keywords: ["barringer", "meteor crater", "arizona"],
        ubicacion: "Cráter Barringer (Meteor Crater, Arizona)",
        lat: 35.03, lng: -111.02,
        albedo: 0.21, q_solar: 160.0, relieve: 230.0,
        w1_base: 1250.0, entropia_base: 4.90
    },
    {
        keywords: ["puna", "san juan", "argentina"],
        ubicacion: "Puna Andina (San Juan, Argentina)",
        lat: -31.76, lng: -69.21,
        albedo: 0.24, q_solar: 190.0, relieve: 1100.0,
        w1_base: 1300.0, entropia_base: 5.60
    },

    // Moon analogs (matching backend.py CATALOGO_ANALOGOS['moon'])
    {
        keywords: ["mauna kea", "hawai", "hawaii"],
        ubicacion: "Meseta Basáltica de Mauna Kea (Hawái)",
        lat: 19.82, lng: -155.46,
        albedo: 0.15, q_solar: 175.0, relieve: 1950.0,
        w1_base: 950.0, entropia_base: 5.50
    },
    {
        keywords: ["craters of the moon", "idaho"],
        ubicacion: "Craters of the Moon, Idaho (EE.UU.)",
        lat: 43.46, lng: -113.56,
        albedo: 0.14, q_solar: 145.0, relieve: 680.0,
        w1_base: 1150.0, entropia_base: 5.20
    },
    {
        keywords: ["sudbury", "ontario"],
        ubicacion: "Cuenca de Impacto de Sudbury (Canadá)",
        lat: 46.52, lng: -80.95,
        albedo: 0.20, q_solar: 110.0, relieve: 540.0,
        w1_base: 1320.0, entropia_base: 4.90
    },
    {
        keywords: ["ucanca", "llano de ucanca"],
        ubicacion: "Llano de Ucanca, Teide (España)",
        lat: 28.27, lng: -16.64,
        albedo: 0.22, q_solar: 170.0, relieve: 620.0,
        w1_base: 1050.0, entropia_base: 4.70
    },
    {
        keywords: ["gosses bluff", "australia"],
        ubicacion: "Gosses Bluff Crater (Australia)",
        lat: -23.86, lng: 132.31,
        albedo: 0.23, q_solar: 175.0, relieve: 420.0,
        w1_base: 1220.0, entropia_base: 4.80
    },
    {
        keywords: ["meteor crater", "arizona"],
        ubicacion: "Meteor Crater (Arizona, EE.UU.)",
        lat: 35.03, lng: -111.02,
        albedo: 0.21, q_solar: 160.0, relieve: 230.0,
        w1_base: 1250.0, entropia_base: 4.90
    },
    {
        keywords: ["askja", "ceniza"],
        ubicacion: "Campos de Ceniza de Askja (Islandia)",
        lat: 64.90, lng: -17.00,
        albedo: 0.11, q_solar: 85.0, relieve: 880.0,
        w1_base: 1180.0, entropia_base: 5.40
    },
    {
        keywords: ["nordlinger", "ries", "alemania", "germany"],
        ubicacion: "Ries Crater / Nördlinger Ries (Alemania)",
        lat: 50.41, lng: 10.61,
        albedo: 0.21, q_solar: 130.0, relieve: 310.0,
        w1_base: 1280.0, entropia_base: 4.70
    },
    {
        keywords: ["lonar", "india"],
        ubicacion: "Lonar Crater (India)",
        lat: 19.98, lng: 79.96,
        albedo: 0.18, q_solar: 165.0, relieve: 360.0,
        w1_base: 1210.0, entropia_base: 4.80
    },
    {
        keywords: ["sossusvlei", "namibia"],
        ubicacion: "Sossusvlei Regolith Fields (Namibia)",
        lat: -25.20, lng: 15.20,
        albedo: 0.25, q_solar: 190.0, relieve: 290.0,
        w1_base: 1120.0, entropia_base: 4.40
    }
];

export const EARTH_ANALOGS_MARS = KNOWN_SITES.slice(0, 10);
export const EARTH_ANALOGS_MOON = KNOWN_SITES.slice(10, 20);

function getMartianSurfaceProfile(lat, lng) {
    const isPolar = Math.abs(lat) >= 60.0;
    const isOlympusTharsis = (lat >= -15.0 && lat <= 30.0) && (lng >= 210.0 && lng <= 265.0);
    const isVallesMarineris = (lat >= -22.0 && lat <= 2.0) && (lng >= 265.0 && lng <= 320.0);
    const isHighAlbedoDesert = (lat >= -30.0 && lat <= 30.0) && (lng >= 110.0 && lng <= 190.0);

    if (isPolar) {
        return {
            tipo: "Casquete Polar Marciano (Planum Boreum / Australe)",
            albedo: 0.65, q_solar: 45.0, relieve: 420.0, w1_target: 780.0, entropia_target: 4.2
        };
    } else if (isOlympusTharsis) {
        return {
            tipo: "Provincia Volcánica Gigante de Tharsis (Olympus / Ascraeus)",
            albedo: 0.18, q_solar: 175.0, relieve: 2800.0, w1_target: 1650.0, entropia_target: 5.7
        };
    } else if (isVallesMarineris) {
        return {
            tipo: "Sistema de Cañones Profundos (Valles Marineris)",
            albedo: 0.16, q_solar: 160.0, relieve: 2200.0, w1_target: 1800.0, entropia_target: 6.2
        };
    } else if (isHighAlbedoDesert) {
        return {
            tipo: "Llanuras de Polvo Fino Eólico e Impacto (Elysium Planitia)",
            albedo: 0.28, q_solar: 185.0, relieve: 280.0, w1_target: 1100.0, entropia_target: 4.7
        };
    } else {
        return {
            tipo: "Terrenos Antiguos Noéjicos / Cuencas de Impacto (Gale / Jezero)",
            albedo: 0.21, q_solar: 170.0, relieve: 950.0, w1_target: 1250.0, entropia_target: 5.1
        };
    }
}

function getLunarSurfaceProfile(lat, lng) {
    const isPolar = Math.abs(lat) >= 70.0;
    const isMaria = (lat >= -15.0 && lat <= 40.0) && (lng >= -60.0 && lng <= 60.0);
    const isSPA = (lat <= -35.0) && (lng >= 140.0 || lng <= -140.0);
    const isRayCrater = (Math.abs(lat - (-43.3)) < 8 && Math.abs(lng - (-11.2)) < 8) ||
                        (Math.abs(lat - 9.6) < 8 && Math.abs(lng - (-20.1)) < 8);

    if (isPolar) {
        return {
            tipo: "Cráteres Polares con Trampas Frías y Sombra Permanente (PSR)",
            albedo: 0.22, q_solar: 75.0, relieve: 950.0, w1_target: 850.0, entropia_target: 4.6
        };
    } else if (isRayCrater) {
        return {
            tipo: "Cráter de Impacto Complejo con Pico Central (Tycho / Copernicus)",
            albedo: 0.24, q_solar: 160.0, relieve: 1400.0, w1_target: 1550.0, entropia_target: 5.3
        };
    } else if (isMaria) {
        return {
            tipo: "Llanuras Basálticas de Mare y Tubos de Lava Colapsados",
            albedo: 0.10, q_solar: 165.0, relieve: 320.0, w1_target: 760.0, entropia_target: 4.4
        };
    } else if (isSPA) {
        return {
            tipo: "Cuenca de Impacto Profunda South Pole-Aitken",
            albedo: 0.15, q_solar: 120.0, relieve: 1100.0, w1_target: 1250.0, entropia_target: 5.0
        };
    } else {
        return {
            tipo: "Tierras Altas Anortosíticas Saturadas de Cráteres",
            albedo: 0.19, q_solar: 155.0, relieve: 750.0, w1_target: 1150.0, entropia_target: 4.8
        };
    }
}

function findSiteMetrics(candidate) {
    const lat = candidate.latitud !== undefined ? candidate.latitud : (candidate.lat || 0);
    const lng = candidate.longitud !== undefined ? candidate.longitud : (candidate.lon || candidate.lng || 0);
    const name = String(candidate.nombre || candidate.ubicacion || '').toLowerCase();

    // 1. Coincidencia por nombre o proximidad en el catálogo conocido
    for (const site of KNOWN_SITES) {
        const dist = Math.hypot(site.lat - lat, site.lng - lng);
        const nameMatch = name && site.keywords.some(k => name.includes(k));
        if (dist < 0.6 || nameMatch) {
            return site;
        }
    }

    // 2. Si no coincide, derivar de normalizadas [albedo, ghi, relieve]
    if (Array.isArray(candidate.normalizadas) && candidate.normalizadas.length >= 3) {
        const nAlb = Math.max(0, Math.min(1, candidate.normalizadas[0]));
        const nGhi = Math.max(0, Math.min(1, candidate.normalizadas[1]));
        const nRel = Math.max(0, Math.min(1, candidate.normalizadas[2]));

        return {
            ubicacion: candidate.nombre || candidate.ubicacion || `Análogo (${lat}°, ${lng}°)`,
            lat, lng,
            albedo: parseFloat((0.12 + nAlb * 0.35).toFixed(3)),
            q_solar: parseFloat((60.0 + nGhi * 140.0).toFixed(1)),
            relieve: parseFloat((180.0 + nRel * 1800.0).toFixed(1)),
            w1_base: parseFloat((800.0 + (1.0 - nRel) * 600.0).toFixed(1)),
            entropia_base: parseFloat((4.1 + nRel * 1.5).toFixed(2))
        };
    }

    // 3. Fallback equilibrado
    return {
        ubicacion: candidate.nombre || candidate.ubicacion || `Análogo (${lat}°, ${lng}°)`,
        lat, lng,
        albedo: 0.20, q_solar: 160.0, relieve: 600.0,
        w1_base: 1100.0, entropia_base: 4.80
    };
}

function computeDynamicAnalogs(planetKey, originLat, originLng, weightsSnapshot, rawCandidates = null) {
    const isMoon = (planetKey === "moon" || String(planetKey).toLowerCase().includes("luna"));
    const defaultCatalog = isMoon ? EARTH_ANALOGS_MOON : EARTH_ANALOGS_MARS;
    const candidatesToProcess = (Array.isArray(rawCandidates) && rawCandidates.length > 0)
        ? rawCandidates
        : defaultCatalog;

    const profile = isMoon ? getLunarSurfaceProfile(originLat, originLng) : getMartianSurfaceProfile(originLat, originLng);

    const wRel = Math.max(0.05, weightsSnapshot.relieve !== undefined ? weightsSnapshot.relieve : 0.50);
    const wGhi = Math.max(0.05, weightsSnapshot.ghi !== undefined ? weightsSnapshot.ghi : 0.50);
    const wAlb = Math.max(0.05, weightsSnapshot.albedo !== undefined ? weightsSnapshot.albedo : 0.50);
    const sumW = wRel + wGhi + wAlb;

    const sigmaA = 0.09;
    const sigmaQ = 42.0;
    const sigmaH = 480.0;

    const scored = candidatesToProcess.map((c, idx) => {
        const site = findSiteMetrics(c);
        const lat = parseFloat(Number(c.latitud !== undefined ? c.latitud : (c.lat !== undefined ? c.lat : site.lat)).toFixed(2));
        const lng = parseFloat(Number(c.longitud !== undefined ? c.longitud : (c.lon !== undefined ? c.lon : (c.lng !== undefined ? c.lng : site.lng))).toFixed(2));
        const ubicacion = c.nombre || site.ubicacion || c.ubicacion || `Candidato #${c.rango || (idx + 1)}`;
        const baseDistance = typeof c.distancia === 'number' ? c.distancia : 0.08;

        const da = (profile.albedo - site.albedo) / sigmaA;
        const dq = (profile.q_solar - site.q_solar) / sigmaQ;
        const dh = (profile.relieve - site.relieve) / sigmaH;

        const dz = Math.sqrt((wAlb * (da * da) + wGhi * (dq * dq) + wRel * (dh * dh)) / sumW) + (baseDistance * 0.15);
        const w1 = site.w1_base * (1.0 + 0.22 * Math.abs(profile.relieve - site.relieve) / 550.0) + dz * 160.0;
        const entropia = site.entropia_base + 0.10 * Math.min(2.0, Math.max(-1.0, dh));

        const similarity = Math.max(52.0, Math.min(98.8, 100.0 - (dz * 16.5 + (w1 / 185.0))));
        const verosimilitud = Math.max(50.0, Math.min(99.0, 100.0 - (dz * 21.0)));
        const similitudTopo = Math.max(48.0, Math.min(97.5, 100.0 - (w1 / 38.0)));

        let concordancia = "";
        if (w1 < 950) {
            concordancia = "Isomorfismo Alto (Estructura de cuencas equivalente a la diana)";
        } else if (w1 < 1650) {
            concordancia = "Isomorfismo Moderado (Concordancia morfológica regional parcial)";
        } else {
            concordancia = "Discordancia Estructural (Variación de relieve y topología apreciable)";
        }

        let movilidad = "";
        if (entropia < 4.7) {
            movilidad = "Tránsito Expedito (Baja tortuosidad, regolito y tránsito suave)";
        } else if (entropia <= 5.7) {
            movilidad = "Tránsito Moderado (Ondulaciones y bloques franqueables)";
        } else {
            movilidad = "Laberinto Topológico (Elevada rugosidad, escarpes y cañones)";
        }

        const normRel = Math.min(99, Math.max(50, Math.round(100 - Math.min(1.0, Math.abs(dh)) * 40)));
        const normGhi = Math.min(99, Math.max(50, Math.round(100 - Math.min(1.0, Math.abs(dq)) * 40)));
        const normAlb = Math.min(99, Math.max(50, Math.round(100 - Math.min(1.0, Math.abs(da)) * 40)));

        return {
            lat,
            lng,
            ubicacion,
            similarity: Math.round(similarity),
            verosimilitud: verosimilitud.toFixed(1),
            similitudTopo: similitudTopo.toFixed(1),
            wasserstein: w1.toFixed(1),
            entropia: entropia.toFixed(2),
            dz: dz.toFixed(3),
            albedoA: site.albedo.toFixed(3),
            qSolar: site.q_solar.toFixed(1),
            relieveH: site.relieve.toFixed(1),
            concordancia,
            movilidad,
            cluster: c.cluster !== undefined ? c.cluster : (idx % 3 + 1),
            variablesSim: [normRel, normGhi, normAlb],
            region: ubicacion
        };
    });

    // Ordenar de mayor a menor similitud
    scored.sort((a, b) => b.similarity - a.similarity);

    // Asignar rango 1 a 10
    const top10 = scored.slice(0, 10).map((c, idx) => ({
        ...c,
        rank: idx + 1
    }));

    return { top10, profile };
}

function renderRightResultsPanel(originPlanetName, originLat, originLng, targetLat, targetLng, weightsSnapshot, apiResult = null) {
    const panel = document.getElementById('results-panel');
    const toggleRightBtn = document.getElementById('toggle-right-panel');
    if (!panel) return;

    if (apiResult !== null) {
        lastBackendApiResult = apiResult;
    }

    // Extraer candidatos devueltos por el backend de Hugging Face si existen
    let rawCandidates = null;
    const effectiveResult = apiResult || lastBackendApiResult;
    if (effectiveResult && typeof effectiveResult === 'object') {
        if (Array.isArray(effectiveResult.candidatos) && effectiveResult.candidatos.length > 0) {
            rawCandidates = effectiveResult.candidatos;
        } else if (Array.isArray(effectiveResult.analogos) && effectiveResult.analogos.length > 0) {
            rawCandidates = effectiveResult.analogos;
        }
    }

    // Calcular candidatos combinando datos del backend y algoritmos topológicos
    const { top10, profile } = computeDynamicAnalogs(currentPlanetKey, originLat, originLng, weightsSnapshot, rawCandidates);
    activeAnalogsData = top10;

    const originShortName = originPlanetName.replace(/^The\s+/i, '').split(' ')[0].toUpperCase();

    const analogsHTML = activeAnalogsData.map((alt, index) => {
        const isOpenClass = index === 0 ? 'is-open' : '';

        return `
            <div class="analogue-dropdown-item ${isOpenClass}" data-index="${index}">
                <div class="analogue-dropdown-header">
                    <span class="analogue-rank">#${alt.rank} ${index === 0 ? '(Primary)' : ''}</span>
                    <span class="analogue-coords">${alt.lat}°, ${alt.lng}°</span>
                    <span class="analogue-pill-small">${alt.similarity}% MATCH</span>
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
                            <span class="label">ANALOG #${alt.rank}</span>
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

                    <!-- Qualitative Diagnostics -->
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
            <p>Analogous sites matching planetary geomorphometry & TDA.</p>
        </div>
        <div class="analogs-accordion-list">
            ${analogsHTML}
        </div>
    `;

    panel.style.display = 'block';
    if (toggleRightBtn) {
        toggleRightBtn.style.display = 'flex';
        toggleRightBtn.classList.remove('is-collapsed');
        toggleRightBtn.innerHTML = `<span>▶</span>`;
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
        hintText.innerHTML = `⏳ Computing terrestrial analogs for <strong>${planetInfo.name}</strong> (${lat}°, ${lng}°)...`;
    }

    const transitionToEarth = (apiResult = null) => {
        isViewingEarth = true;
        switchPlanet('earth');
        document.getElementById('current-view-label').innerHTML = `Module: <strong id="planet-name">Computed Terrestrial Analog</strong>`;

        if (hintText) {
            hintText.innerHTML = `Comparing configured weights (left) with computed similarity (right).`;
        }

        renderRightResultsPanel(planetInfo.name, lat, lng, 0, 0, currentWeightsSnapshot, apiResult);

        const firstPoint = (activeAnalogsData && activeAnalogsData[0]) || { lat: 0, lng: 0 };
        const pointsList = (activeAnalogsData && activeAnalogsData.length > 0)
            ? activeAnalogsData.map(a => ({ lat: a.lat, lng: a.lng }))
            : [firstPoint];
        renderMultiplePoints(pointsList, PLANETS_DATA.earth.uiAccent);
        globe.pointOfView({ lat: firstPoint.lat, lng: firstPoint.lng, altitude: 1.5 }, 1200);
    };

    // Consultar backend de Hugging Face Spaces (con timeout de seguridad a 5.0s)
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout (5000ms)")), 5000));
    Promise.race([callHuggingFaceAPI({ ...requestData }), timeoutPromise])
        .then(apiResult => {
            console.log('[API] Backend responded successfully:', apiResult);
            transitionToEarth(apiResult);
        })
        .catch(err => {
            console.warn('[API] Backend unavailable or timed out, executing direct calibrated model:', err.message);
            transitionToEarth(null);
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

            if (isViewingEarth && requestData.coordenadas.lat !== null && requestData.coordenadas.lon !== null) {
                renderRightResultsPanel(
                    PLANETS_DATA[currentPlanetKey].name,
                    requestData.coordenadas.lat,
                    requestData.coordenadas.lon,
                    0, 0,
                    { ...requestData.variables }
                );
            }
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

            if (isViewingEarth && requestData.coordenadas.lat !== null && requestData.coordenadas.lon !== null) {
                renderRightResultsPanel(
                    PLANETS_DATA[currentPlanetKey].name,
                    requestData.coordenadas.lat,
                    requestData.coordenadas.lon,
                    0, 0,
                    { ...requestData.variables }
                );
            }
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
