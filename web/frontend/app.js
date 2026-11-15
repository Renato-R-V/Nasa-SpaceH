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
// 4. SCIENTIFIC PLANETARY TERRAIN ANALOG ENGINE (TDA & GEOMORPHOMETRY)
// Dynamic evaluation of Martian and Lunar terrain based on clicked coordinates,
// planetary provinces, insolation, and multi-variable user weighting.
// =========================================================================

export const EARTH_ANALOGS_MARS = [
    {
        ubicacion: "Desierto de Atacama (Chile)",
        nombre: "Desierto de Atacama (Chile)",
        lat: -24.50, lng: -69.25,
        albedo: 0.21, q_solar: 180.0, relieve: 530.0,
        w1_base: 720.0, entropia_base: 4.35,
        ambiente: "Hiperaridez eólica extrema con depósitos de percloratos"
    },
    {
        ubicacion: "Cráter Haughton, Devon Island (Canadá)",
        nombre: "Cráter Haughton, Devon Island (Canadá)",
        lat: 75.38, lng: -89.67,
        albedo: 0.18, q_solar: 110.0, relieve: 610.0,
        w1_base: 910.0, entropia_base: 4.80,
        ambiente: "Estructura de impacto paleoclimática en permafrost ártico"
    },
    {
        ubicacion: "Parque Nacional del Teide, Tenerife (España)",
        nombre: "Parque Nacional del Teide, Tenerife (España)",
        lat: 28.27, lng: -16.64,
        albedo: 0.20, q_solar: 170.0, relieve: 950.0,
        w1_base: 1050.0, entropia_base: 5.20,
        ambiente: "Campos de lavas basálticas, obsidiana y conos de escoria"
    },
    {
        ubicacion: "Valles Secos de McMurdo (Antártida)",
        nombre: "Valles Secos de McMurdo (Antártida)",
        lat: -77.50, lng: 162.00,
        albedo: 0.45, q_solar: 70.0, relieve: 680.0,
        w1_base: 850.0, entropia_base: 4.50,
        ambiente: "Criodesierto polar hiperárido y cuencas glaciares secas"
    },
    {
        ubicacion: "Río Tinto (España)",
        nombre: "Río Tinto (España)",
        lat: 37.69, lng: -6.55,
        albedo: 0.16, q_solar: 145.0, relieve: 380.0,
        w1_base: 1300.0, entropia_base: 5.40,
        ambiente: "Meteorización química por sulfatos férricos y acidez extrema"
    },
    {
        ubicacion: "Hanksville / San Rafael Swell (Utah, MDRS)",
        nombre: "Hanksville / San Rafael Swell (Utah, MDRS)",
        lat: 38.40, lng: -110.79,
        albedo: 0.22, q_solar: 160.0, relieve: 450.0,
        w1_base: 1100.0, entropia_base: 5.10,
        ambiente: "Estratos sedimentarios de areniscas jurásicas y cañones"
    },
    {
        ubicacion: "Campos de Lava de Islandia",
        nombre: "Campos de Lava de Islandia",
        lat: 64.12, lng: -21.82,
        albedo: 0.13, q_solar: 95.0, relieve: 820.0,
        w1_base: 1450.0, entropia_base: 5.85,
        ambiente: "Flujos basálticos holocenos rugosos y tefra volcánica"
    },
    {
        ubicacion: "Depresión de Danakil / Dallol (Etiopía)",
        nombre: "Depresión de Danakil / Dallol (Etiopía)",
        lat: 14.24, lng: 40.30,
        albedo: 0.24, q_solar: 195.0, relieve: 1650.0,
        w1_base: 1600.0, entropia_base: 6.10,
        ambiente: "Fosa tectónica profunda, hidrotermalismo y costras salinas"
    },
    {
        ubicacion: "Salar de Uyuni (Bolivia)",
        nombre: "Salar de Uyuni (Bolivia)",
        lat: -20.13, lng: -67.48,
        albedo: 0.65, q_solar: 190.0, relieve: 150.0,
        w1_base: 780.0, entropia_base: 3.90,
        ambiente: "Cuenca evaporítica ultra-plana reflectante de gran altitud"
    },
    {
        ubicacion: "Cráter Barringer (Meteor Crater, Arizona)",
        nombre: "Cráter Barringer (Meteor Crater, Arizona)",
        lat: 35.03, lng: -111.02,
        albedo: 0.21, q_solar: 160.0, relieve: 230.0,
        w1_base: 1250.0, entropia_base: 4.90,
        ambiente: "Estructura de impacto meteórico simple con borde de eyecta"
    },
    {
        ubicacion: "Uluru / Outback Australiano",
        nombre: "Uluru / Outback Australiano",
        lat: -25.34, lng: 131.03,
        albedo: 0.25, q_solar: 175.0, relieve: 350.0,
        w1_base: 1180.0, entropia_base: 4.60,
        ambiente: "Inselbergs de arenisca y llanuras de regolito rojo férrico"
    },
    {
        ubicacion: "Mauna Kea / Mauna Loa (Hawái)",
        nombre: "Mauna Kea / Mauna Loa (Hawái)",
        lat: 19.82, lng: -155.46,
        albedo: 0.15, q_solar: 175.0, relieve: 1950.0,
        w1_base: 950.0, entropia_base: 5.50,
        ambiente: "Escudo volcánico basáltico colosal con lavas pahoehoe y aa"
    },
    {
        ubicacion: "Desierto de Mojave / Death Valley (EE.UU.)",
        nombre: "Desierto de Mojave / Death Valley (EE.UU.)",
        lat: 36.53, lng: -116.93,
        albedo: 0.23, q_solar: 185.0, relieve: 750.0,
        w1_base: 1350.0, entropia_base: 5.30,
        ambiente: "Cuencas tectónicas hiperáridas y abanicos aluviales"
    },
    {
        ubicacion: "Archipiélago de Svalbard (Noruega)",
        nombre: "Archipiélago de Svalbard (Noruega)",
        lat: 78.22, lng: 15.65,
        albedo: 0.42, q_solar: 60.0, relieve: 550.0,
        w1_base: 820.0, entropia_base: 4.40,
        ambiente: "Morrenas polares y suelos poligonales de permafrost activo"
    },
    {
        ubicacion: "Qaidam Basin (Tíbet)",
        nombre: "Qaidam Basin (Tíbet)",
        lat: 37.15, lng: 94.25,
        albedo: 0.26, q_solar: 170.0, relieve: 600.0,
        w1_base: 1200.0, entropia_base: 4.70,
        ambiente: "Campos de yardangs eólicos y paleolagos hipersalinos"
    },
    {
        ubicacion: "Cañón del Colorado (EE.UU.)",
        nombre: "Cañón del Colorado (EE.UU.)",
        lat: 36.10, lng: -112.11,
        albedo: 0.18, q_solar: 165.0, relieve: 1800.0,
        w1_base: 1750.0, entropia_base: 6.20,
        ambiente: "Incisión estratigráfica colosal con gargantas y escarpes"
    },
    {
        ubicacion: "Dunas de Sossusvlei (Namibia)",
        nombre: "Dunas de Sossusvlei (Namibia)",
        lat: -24.73, lng: 15.29,
        albedo: 0.23, q_solar: 185.0, relieve: 280.0,
        w1_base: 1150.0, entropia_base: 4.45,
        ambiente: "Mar de arena eólico con mega-dunas ricas en óxidos de hierro"
    },
    {
        ubicacion: "Puna Andina (San Juan, Argentina)",
        nombre: "Puna Andina (San Juan, Argentina)",
        lat: -31.76, lng: -69.21,
        albedo: 0.24, q_solar: 190.0, relieve: 1100.0,
        w1_base: 1300.0, entropia_base: 5.60,
        ambiente: "Meseta volcánica árida de gran altitud y radiación UV extrema"
    },
    {
        ubicacion: "Pilbara Craton (Australia)",
        nombre: "Pilbara Craton (Australia)",
        lat: -21.28, lng: 119.74,
        albedo: 0.20, q_solar: 170.0, relieve: 420.0,
        w1_base: 1250.0, entropia_base: 4.80,
        ambiente: "Terrenos arcaicos noéjicos primigenios ricos en hematita"
    },
    {
        ubicacion: "Bardenas Reales (Navarra, España)",
        nombre: "Bardenas Reales (Navarra, España)",
        lat: 42.19, lng: -1.53,
        albedo: 0.21, q_solar: 140.0, relieve: 310.0,
        w1_base: 1400.0, entropia_base: 5.15,
        ambiente: "Badlands arcillosos y cerros testigo modelados por erosión"
    }
];

export const EARTH_ANALOGS_MOON = [
    {
        ubicacion: "Meseta Basáltica de Mauna Kea (Hawái)",
        nombre: "Meseta Basáltica de Mauna Kea (Hawái)",
        lat: 19.82, lng: -155.46,
        albedo: 0.12, q_solar: 165.0, relieve: 780.0,
        w1_base: 760.0, entropia_base: 4.45,
        ambiente: "Piroclastos basálticos y regolito denso análogo a mares lunares"
    },
    {
        ubicacion: "Craters of the Moon (Idaho, EE.UU.)",
        nombre: "Craters of the Moon (Idaho, EE.UU.)",
        lat: 43.46, lng: -113.56,
        albedo: 0.11, q_solar: 135.0, relieve: 420.0,
        w1_base: 890.0, entropia_base: 5.15,
        ambiente: "Tubos de lava basáltica colapsados y campos de 'a'a vesicular"
    },
    {
        ubicacion: "Cuenca de Impacto de Sudbury (Canadá)",
        nombre: "Cuenca de Impacto de Sudbury (Canadá)",
        lat: 46.52, lng: -80.95,
        albedo: 0.14, q_solar: 110.0, relieve: 310.0,
        w1_base: 1220.0, entropia_base: 4.85,
        ambiente: "Complejo de impacto masivo con brechas polimícticas y fundido"
    },
    {
        ubicacion: "Llano de Ucanca, Teide (España)",
        nombre: "Llano de Ucanca, Teide (España)",
        lat: 28.27, lng: -16.64,
        albedo: 0.15, q_solar: 170.0, relieve: 650.0,
        w1_base: 1390.0, entropia_base: 5.30,
        ambiente: "Llanura de pómez y arenas volcánicas sin consolidar"
    },
    {
        ubicacion: "Gosses Bluff Crater (Australia)",
        nombre: "Gosses Bluff Crater (Australia)",
        lat: -23.86, lng: 132.31,
        albedo: 0.18, q_solar: 160.0, relieve: 280.0,
        w1_base: 1540.0, entropia_base: 4.70,
        ambiente: "Astroblema de impacto meteórico con anillo y pico central"
    },
    {
        ubicacion: "Meteor Crater (Arizona, EE.UU.)",
        nombre: "Meteor Crater (Arizona, EE.UU.)",
        lat: 35.03, lng: -111.02,
        albedo: 0.17, q_solar: 155.0, relieve: 230.0,
        w1_base: 1700.0, entropia_base: 4.90,
        ambiente: "Cráter de impacto meteórico simple con eyección continua"
    },
    {
        ubicacion: "Campos de Ceniza de Askja (Islandia)",
        nombre: "Campos de Ceniza de Askja (Islandia)",
        lat: 64.90, lng: -17.00,
        albedo: 0.11, q_solar: 85.0, relieve: 720.0,
        w1_base: 1880.0, entropia_base: 5.80,
        ambiente: "Caldera volcánica con mantos de tefra suelta y fisuras"
    },
    {
        ubicacion: "Ries Crater / Nördlinger Ries (Alemania)",
        nombre: "Ries Crater / Nördlinger Ries (Alemania)",
        lat: 50.41, lng: 10.61,
        albedo: 0.16, q_solar: 115.0, relieve: 290.0,
        w1_base: 2020.0, entropia_base: 4.65,
        ambiente: "Suevita y brechas de impacto ricas en fundidos vidriosos"
    },
    {
        ubicacion: "Lonar Crater (India)",
        nombre: "Lonar Crater (India)",
        lat: 19.98, lng: 79.96,
        albedo: 0.13, q_solar: 158.0, relieve: 180.0,
        w1_base: 2180.0, entropia_base: 5.10,
        ambiente: "Único cráter de impacto terrestre en basaltos volcánicos"
    },
    {
        ubicacion: "Sossusvlei Regolith Fields (Namibia)",
        nombre: "Sossusvlei Regolith Fields (Namibia)",
        lat: -25.20, lng: 15.20,
        albedo: 0.21, q_solar: 175.0, relieve: 320.0,
        w1_base: 2350.0, entropia_base: 5.45,
        ambiente: "Regolito cuarzoso-feldespático de alta fricción interna"
    },
    {
        ubicacion: "Lanzarote / Timanfaya (España)",
        nombre: "Lanzarote / Timanfaya (España)",
        lat: 29.00, lng: -13.73,
        albedo: 0.10, q_solar: 170.0, relieve: 510.0,
        w1_base: 920.0, entropia_base: 5.00,
        ambiente: "Campos de lava basáltica prístinos con tubos subterráneos"
    },
    {
        ubicacion: "Clearwater Lakes (Quebec, Canadá)",
        nombre: "Clearwater Lakes (Quebec, Canadá)",
        lat: 56.10, lng: -74.50,
        albedo: 0.14, q_solar: 90.0, relieve: 350.0,
        w1_base: 1450.0, entropia_base: 4.75,
        ambiente: "Estructura de impacto doble en escudo cristalino precámbrico"
    },
    {
        ubicacion: "Mistastin Lake Crater (Labrador, Canadá)",
        nombre: "Mistastin Lake Crater (Labrador, Canadá)",
        lat: 55.88, lng: -63.30,
        albedo: 0.19, q_solar: 88.0, relieve: 450.0,
        w1_base: 1320.0, entropia_base: 4.80,
        ambiente: "Impacto lunar en anortosita (análogo de tierras altas lunares)"
    },
    {
        ubicacion: "Kaali Crater (Estonia)",
        nombre: "Kaali Crater (Estonia)",
        lat: 58.37, lng: 22.67,
        albedo: 0.16, q_solar: 105.0, relieve: 160.0,
        w1_base: 1750.0, entropia_base: 4.55,
        ambiente: "Cráteres de impacto de meteorito de hierro en dolomitas"
    },
    {
        ubicacion: "Manicouagan Reservoir (Quebec, Canadá)",
        nombre: "Manicouagan Reservoir (Quebec, Canadá)",
        lat: 51.38, lng: -68.70,
        albedo: 0.17, q_solar: 100.0, relieve: 650.0,
        w1_base: 1620.0, entropia_base: 5.25,
        ambiente: "Gran estructura de impacto multianular con fundido anortosítico"
    }
];

function getMartianSurfaceProfile(lat, lng) {
    const radLat = (lat * Math.PI) / 180.0;
    const q_solar = Math.round(185.0 * Math.max(0.08, Math.cos(radLat)) + 20.0);

    const isPolar = Math.abs(lat) > 62.0;
    const isTharsis = (lat >= -15.0 && lat <= 32.0) && (lng >= -155.0 && lng <= -75.0);
    const isValles = (lat >= -22.0 && lat <= 4.0) && (lng >= -92.0 && lng <= -28.0);
    const isLowlands = (lat > 25.0) && !isPolar && !isTharsis;
    const isHellas = (lat >= -55.0 && lat <= -30.0) && (lng >= 50.0 && lng <= 90.0);
    const isDelta = (Math.abs(lat - (-5.4)) < 6 && Math.abs(lng - 137.8) < 6) ||
                    (Math.abs(lat - 18.4) < 6 && Math.abs(lng - 77.6) < 6);

    if (isPolar) {
        return {
            tipo: "Casquete Polar / Criodesierto Periglacial",
            albedo: 0.48, q_solar, relieve: 450.0, w1_target: 800.0, entropia_target: 4.2
        };
    } else if (isTharsis) {
        return {
            tipo: "Escudo Volcánico Colosal / Meseta Basáltica (Tharsis / Olympus)",
            albedo: 0.26, q_solar, relieve: 1850.0, w1_target: 1050.0, entropia_target: 5.6
        };
    } else if (isValles) {
        return {
            tipo: "Sistema de Cañones y Gargantas Profundas (Valles Marineris)",
            albedo: 0.16, q_solar, relieve: 2100.0, w1_target: 1750.0, entropia_target: 6.2
        };
    } else if (isDelta) {
        return {
            tipo: "Cuenca Lacustre y Abanico Aluvial (Gale / Jezero Crater)",
            albedo: 0.21, q_solar, relieve: 520.0, w1_target: 740.0, entropia_target: 4.4
        };
    } else if (isHellas) {
        return {
            tipo: "Gran Cuenca de Impacto Deprimida (Hellas Planitia)",
            albedo: 0.19, q_solar, relieve: 1200.0, w1_target: 1350.0, entropia_target: 5.1
        };
    } else if (isLowlands) {
        return {
            tipo: "Llanuras Sedimentarias y Volcánicas Bajas (Northern Lowlands)",
            albedo: 0.17, q_solar, relieve: 220.0, w1_target: 1100.0, entropia_target: 4.3
        };
    } else {
        return {
            tipo: "Tierras Altas Noéjicas Densamente Craterizadas",
            albedo: 0.21, q_solar, relieve: 680.0, w1_target: 1180.0, entropia_target: 4.9
        };
    }
}

function getLunarSurfaceProfile(lat, lng) {
    const isPolar = Math.abs(lat) > 70.0;
    const isMaria = (lat >= -25.0 && lat <= 45.0) && (lng >= -75.0 && lng <= 55.0);
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

function computeDynamicAnalogs(planetKey, originLat, originLng, weightsSnapshot) {
    const isMoon = (planetKey === "moon" || String(planetKey).toLowerCase().includes("luna"));
    const catalog = isMoon ? EARTH_ANALOGS_MOON : EARTH_ANALOGS_MARS;
    const profile = isMoon ? getLunarSurfaceProfile(originLat, originLng) : getMartianSurfaceProfile(originLat, originLng);

    const wRel = Math.max(0.05, weightsSnapshot.relieve !== undefined ? weightsSnapshot.relieve : 0.50);
    const wGhi = Math.max(0.05, weightsSnapshot.ghi !== undefined ? weightsSnapshot.ghi : 0.50);
    const wAlb = Math.max(0.05, weightsSnapshot.albedo !== undefined ? weightsSnapshot.albedo : 0.50);
    const sumW = wRel + wGhi + wAlb;

    const sigmaA = 0.09;
    const sigmaQ = 42.0;
    const sigmaH = 480.0;

    const scored = catalog.map(cand => {
        const da = (profile.albedo - cand.albedo) / sigmaA;
        const dq = (profile.q_solar - cand.q_solar) / sigmaQ;
        const dh = (profile.relieve - cand.relieve) / sigmaH;

        const dz = Math.sqrt((wAlb * (da * da) + wGhi * (dq * dq) + wRel * (dh * dh)) / sumW);
        const w1 = cand.w1_base * (1.0 + 0.25 * Math.abs(profile.relieve - cand.relieve) / 550.0) + dz * 180.0;
        const entropia = cand.entropia_base + 0.12 * Math.min(2.0, Math.max(-1.0, dh));

        const similarity = Math.max(52.0, Math.min(98.8, 100.0 - (dz * 16.5 + (w1 / 185.0))));
        const verosimilitud = Math.max(50.0, Math.min(99.0, 100.0 - (dz * 21.0)));
        const similitudTopo = Math.max(48.0, Math.min(97.5, 100.0 - (w1 / 38.0)));

        let concordancia = "";
        if (w1 < 950) {
            concordancia = "Isomorfismo Alto (Estructura de cuencas equivalente a la diana)";
        } else if (w1 < 1700) {
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
            lat: cand.lat,
            lng: cand.lng,
            ubicacion: cand.ubicacion,
            similarity: Math.round(similarity),
            verosimilitud: verosimilitud.toFixed(1),
            similitudTopo: similitudTopo.toFixed(1),
            wasserstein: w1.toFixed(1),
            entropia: entropia.toFixed(2),
            dz: dz.toFixed(3),
            albedoA: cand.albedo.toFixed(3),
            qSolar: cand.q_solar.toFixed(1),
            relieveH: cand.relieve.toFixed(1),
            concordancia,
            movilidad,
            variablesSim: [normRel, normGhi, normAlb],
            region: cand.ubicacion
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

    // Calcular candidatos dinámicos según el cuerpo celeste, coordenadas reales y pesos
    const { top10, profile } = computeDynamicAnalogs(currentPlanetKey, originLat, originLng, weightsSnapshot);
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
            <span class="reason-title">Diana: ${originPlanetName} (${originLat}°, ${originLng}°)</span>
            <p><strong>Régimen:</strong> ${profile.tipo}. 10 análogos terrestres clasificados según afinidad geomorfométrica, insolación solar y topología de homología persistente.</p>
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

    // Intentar consultar backend con timeout de 3.5 segundos para no bloquear la experiencia si hay latencia
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3500));
    Promise.race([callHuggingFaceAPI({ ...requestData }), timeoutPromise])
        .then(apiResult => {
            console.log('[API] Backend responded:', apiResult);
            transitionToEarth(apiResult);
        })
        .catch(err => {
            console.log('[API] Using direct planetary geomorphometric calculation:', err.message);
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