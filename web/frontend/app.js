// 1. CONFIGURACIÓN DE PLANETAS E IMÁGENES 2D
// 📍 AQUÍ ES DONDE INSERTAS LAS RUTAS O URLS DE TUS IMÁGENES 2D DE LOS PLANETAS
const PLANETS_DATA = {
    mars: {
        name: "Marte",
        // Reemplaza esta URL con tu imagen local o de servidor para Marte
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/b/b3/Mars_map_%28USGS%29.jpg",
        bounds: [[-90, -180], [90, 180]]
    },
    moon: {
        name: "La Luna",
        // Reemplaza esta URL con tu imagen local o de servidor para la Luna
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/e/e1/FullMoon2010.jpg",
        bounds: [[-90, -180], [90, 180]]
    },
    earth: {
        name: "Tierra (Zona Análoga)",
        // Reemplaza esta URL con tu mapa de la Tierra para mostrar el resultado análogo
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/8/83/Equirectangular_projection_SW.jpg",
        bounds: [[-90, -180], [90, 180]]
    }
};

// Estado actual de la aplicación
let currentOriginKey = "mars"; // 'mars' o 'moon'
let isViewingEarth = false;    // Controla si estamos viendo el planeta origen o el resultado en la Tierra

// 2. Inicializar el mapa 2D
const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 4,
    zoomControl: false
});

L.control.zoom({ position: 'bottomright' }).addTo(map);
map.setView([0, 0], 1);

let currentOverlay = null;
let currentMarker = null;

// Función para cambiar el mapa activo en pantalla
function loadPlanetMap(planetKey) {
    const planet = PLANETS_DATA[planetKey];
    
    // Eliminar la capa de imagen anterior si existe
    if (currentOverlay) {
        map.removeLayer(currentOverlay);
    }
    if (currentMarker) {
        map.removeLayer(currentMarker);
        currentMarker = null;
    }

    // Insertar la nueva imagen 2D del planeta usando Leaflet imageOverlay
    currentOverlay = L.imageOverlay(planet.imageUrl, planet.bounds).addTo(map);
    map.fitBounds(planet.bounds);
    map.setView([0, 0], 1);

    // Actualizar etiqueta del panel
    document.getElementById('planet-name').textContent = planet.name;
}

// Cargar Marte por defecto al iniciar
loadPlanetMap(currentOriginKey);

// 3. Cambiar de planeta desde el selector del panel
const planetSelect = document.getElementById('planet-select');
planetSelect.addEventListener('change', (e) => {
    if (!isViewingEarth) {
        currentOriginKey = e.target.value;
        loadPlanetMap(currentOriginKey);
    }
});

// 4. Función centralizada al hacer clic o introducir coordenadas
function processRegionSelection(lat, lon, source = "mapa") {
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }

    // Marcar punto de origen seleccionado
    currentMarker = L.marker([lat, lon]).addTo(map)
        .bindPopup(`<b>${PLANETS_DATA[currentOriginKey].name}</b><br>Lat: ${lat}, Lon: ${lon}`)
        .openPopup();

    // Simular transición a la Tierra buscando la zona análoga
    setTimeout(() => {
        isViewingEarth = true;
        
        // Ocultar selector de origen y mostrar botón de retorno
        document.getElementById('planet-selector-section').style.display = 'none';
        document.getElementById('back-to-origin-btn').style.display = 'block';

        // Cambiar el mapa 2D al de la Tierra
        loadPlanetMap('earth');

        // Coordenadas simuladas delanálogo en la Tierra (ejemplo fijo por ahora)
        const earthAnalogLat = lat * 0.5; 
        const earthAnalogLon = lon * 0.8;

        // Marcar la zona análoga en la Tierra
        currentMarker = L.marker([earthAnalogLat, earthAnalogLon]).addTo(map)
            .bindPopup(`<b>Zona Análoga en la Tierra</b><br>Lat: ${earthAnalogLat.toFixed(2)}, Lon: ${earthAnalogLon.toFixed(2)}`)
            .openPopup();

        map.setView([earthAnalogLat, earthAnalogLon], 1);

        // Actualizar panel lateral con la información combinada
        document.getElementById('cluster-info').innerHTML = `
            <h3>Resultado del Análisis</h3>
            <p><strong>Origen (${PLANETS_DATA[currentOriginKey].name}):</strong> Lat ${lat}°, Lon ${lon}°</p>
            <p style="color: #38bdf8; margin: 6px 0;"><strong>➜ Coincidencia en la Tierra:</strong></p>
            <p><strong>Lat:</strong> ${earthAnalogLat.toFixed(2)}° | <strong>Lon:</strong> ${earthAnalogLon.toFixed(2)}°</p>
            <p><strong>Similitud Clúster:</strong> 94.5%</p>
        `;
    }, 800); // Pequeño retardo visual para simular el cálculo analógico
}

// 5. Eventos de interacción (Clic en mapa)
map.on('click', (e) => {
    if (isViewingEarth) return; // Bloquear clics si ya estamos viendo el resultado en la tierra
    const lat = parseFloat(e.latlng.lat.toFixed(2));
    const lon = parseFloat(e.latlng.lng.toFixed(2));

    document.getElementById('lat-input').value = lat;
    document.getElementById('lon-input').value = lon;

    processRegionSelection(lat, lon, "Clic en Mapa");
});

// 6. Eventos de interacción (Formulario manual)
document.getElementById('coord-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (isViewingEarth) return;

    const lat = parseFloat(document.getElementById('lat-input').value);
    const lon = parseFloat(document.getElementById('lon-input').value);

    if (!isNaN(lat) && !isNaN(lon)) {
        processRegionSelection(lat, lon, "Entrada Manual");
    } else {
        alert("Introduce valores numéricos válidos.");
    }
});

// 7. Botón para volver al planeta de origen
document.getElementById('back-to-origin-btn').addEventListener('click', () => {
    isViewingEarth = false;
    document.getElementById('planet-selector-section').style.display = 'flex';
    document.getElementById('back-to-origin-btn').style.display = 'none';
    
    loadPlanetMap(currentOriginKey);
    
    document.getElementById('cluster-info').innerHTML = `
        <h3>Información de la Región</h3>
        <p class="placeholder-text">Haz clic en el mapa o introduce coordenadas para buscar su zona análoga en la Tierra.</p>
    `;
});