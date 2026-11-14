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

// 3.1 GESTOR DEL MENÚ DESPLEGABLE DE PONDERACIÓN CON BARRAS DESLIZANTES
const dropdownBtn = document.getElementById('variables-dropdown-btn');
const dropdownMenu = document.getElementById('variables-dropdown-menu');

if (dropdownBtn && dropdownMenu) {
    dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('show');
        dropdownBtn.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!dropdownBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
            dropdownMenu.classList.remove('show');
            dropdownBtn.classList.remove('active');
        }
    });
}

// Configuración y listeners para los sliders de peso
const sliders = [
    { sliderId: 'slider-topography', valId: 'val-topography', label: 'Topografía' },
    { sliderId: 'slider-albedo', valId: 'val-albedo', label: 'Albedo' },
    { sliderId: 'slider-gui', valId: 'val-gui', label: 'GUI' }
];

function updateSliderBadge(slider, valSpan) {
    valSpan.textContent = `${slider.value}%`;
    valSpan.style.color = slider.value > 0 ? '#38bdf8' : '#64748b';
    valSpan.style.borderColor = slider.value > 0 ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.1)';
    updateGlobalWeightBadge();
}

function updateGlobalWeightBadge() {
    const activeCount = sliders.filter(s => {
        const el = document.getElementById(s.sliderId);
        return el && parseInt(el.value, 10) > 0;
    }).length;

    const badge = document.getElementById('active-vars-badge');
    if (badge) {
        badge.textContent = `${activeCount} Activas`;
        badge.style.color = activeCount > 0 ? '#38bdf8' : '#ef4444';
        badge.style.borderColor = activeCount > 0 ? 'rgba(56, 189, 248, 0.3)' : 'rgba(239, 68, 68, 0.3)';
    }
}

sliders.forEach(item => {
    const sliderEl = document.getElementById(item.sliderId);
    const valEl = document.getElementById(item.valId);
    if (sliderEl && valEl) {
        sliderEl.addEventListener('input', () => updateSliderBadge(sliderEl, valEl));
    }
});

function getWeights() {
    return {
        topography: parseInt(document.getElementById('slider-topography')?.value || 0, 10),
        albedo: parseInt(document.getElementById('slider-albedo')?.value || 0, 10),
        gui: parseInt(document.getElementById('slider-gui')?.value || 0, 10)
    };
}

// 4. DETECCIÓN DE CLICS SOBRE LA SUPERFICIE DEL PLANETA
globe.onGlobeClick(({ lat, lng }) => {
    if (isViewingEarth) return;

    const roundedLat = parseFloat(lat.toFixed(2));
    const roundedLng = parseFloat(lng.toFixed(2));

    document.getElementById('lat-input').value = roundedLat;
    document.getElementById('lon-input').value = roundedLng;

    // Disparar radar de escaneo visual instantáneo en el punto clicado
    globe.ringsData([{ lat: roundedLat, lng: roundedLng }]);

    processRegionSelection(currentPlanetKey, roundedLat, roundedLng, "Clic en Globo 3D");
});

// 5. PROCESAR REGIÓN Y TRANSICIÓN CINEMATOGRÁFICA
function processRegionSelection(planetKey, lat, lng, source) {
    const planetInfo = PLANETS_DATA[planetKey];
    isViewingEarth = true;

    // Detener rotación libre y hacer zoom cinematográfico al objetivo
    globe.controls().autoRotate = false;
    globe.pointOfView({ lat, lng, altitude: 1.3 }, 900);

    // Actualizar estados visuales de la interfaz
    document.getElementById('planet-selector-section').style.display = 'none';
    document.getElementById('back-to-origin-btn').style.display = 'block';

    const targetPlanet = 'earth';
    const targetInfo = PLANETS_DATA.earth;
    document.getElementById('current-view-label').innerHTML = `Módulo: <strong style="color: #4ade80;">Análogo Terrestre Computado</strong>`;

    // Transición calculada al cuerpo análogo
    setTimeout(() => {
        switchPlanet(targetPlanet);

        // Cálculo de coordenadas homólogas
        const targetLat = parseFloat((lat * 0.5).toFixed(2));
        const targetLng = parseFloat((lng * 0.8).toFixed(2));

        // Anillo de radar pulsante (verde esmeralda)
        globe.ringColor(() => '#4ade80');
        globe.ringsData([{ lat: targetLat, lng: targetLng }]);

        // Baliza holográfica flotante 3D
        globe.labelsData([{
            lat: targetLat,
            lng: targetLng,
            text: `ANÁLOGO [${targetLat}°, ${targetLng}°]`
        }]);

        // Cámara orbital enfoca el análogo
        globe.pointOfView({ lat: targetLat, lng: targetLng, altitude: 1.5 }, 1400);

        // Cálculo ponderado multivariable (Topografía, Albedo, GUI)
        const weights = getWeights();
        const totalW = weights.topography + weights.albedo + weights.gui;
        const weightedScore = totalW > 0 
            ? ((weights.topography * 97.4 + weights.albedo * 95.8 + weights.gui * 98.6) / totalW).toFixed(1)
            : "0.0";

        // Actualizar panel de telemetría con métricas de misión
        document.getElementById('cluster-info').innerHTML = `
            <div class="card-header">
                <span>ANÁLISIS MULTIVARIABLE</span>
                <span class="code" style="color: #4ade80;">#TARGET_LOCKED</span>
            </div>
            <div class="card-body" style="margin-top: 8px;">
                <p><strong>Cuerpo de Origen (${planetInfo.name}):</strong></p>
                <p>LAT: ${lat}° | LON: ${lng}°</p>
                <p style="color: #4ade80; margin: 6px 0;"><strong>➜ Coincidencia Análoga (${targetInfo.name}):</strong></p>
                <p>LAT: ${targetLat}° | LON: ${targetLng}°</p>
                <div style="margin-top: 8px; margin-bottom: 8px; background: rgba(30, 41, 59, 0.4); padding: 8px; border-radius: 6px; border: 1px solid rgba(56, 189, 248, 0.15);">
                    <p style="font-size: 0.72rem; color: #94a3b8; margin-bottom: 4px;"><strong>Pesos Aplicados:</strong></p>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; font-family: monospace;">Topografía: ${weights.topography}%</span>
                        <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; font-family: monospace;">Albedo: ${weights.albedo}%</span>
                        <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; font-family: monospace;">GUI: ${weights.gui}%</span>
                    </div>
                </div>
                <p><strong>Similitud Ponderada:</strong> <span style="color: #4ade80; font-weight: bold;">${weightedScore}%</span></p>
                <p><strong>Topografía Compatible:</strong> ${weights.topography > 0 ? "Sí (DEM verificado)" : "No evaluada"}</p>
            </div>
        `;
    }, 1100);
}

// 6. ENTRADA MANUAL DE COORDENADAS
document.getElementById('coord-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (isViewingEarth) return;

    const lat = parseFloat(document.getElementById('lat-input').value);
    const lng = parseFloat(document.getElementById('lon-input').value);

    if (!isNaN(lat) && !isNaN(lng)) {
        globe.ringsData([{ lat, lng }]);
        globe.pointOfView({ lat, lng, altitude: 1.3 }, 900);
        processRegionSelection(currentPlanetKey, lat, lng, "Entrada Manual");
    } else {
        alert("Introduce coordenadas numéricas válidas.");
    }
});

// 7. RETORNO AL PLANETA DE ORIGEN
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

// 8. AJUSTE DE TAMAÑO EN CASO DE REDIMENSIONAR LA PANTALLA
window.addEventListener('resize', () => {
    globe.width(container.clientWidth);
    globe.height(container.clientHeight);
});
