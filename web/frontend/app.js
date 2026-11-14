// 1. Inicializar el mapa 2D centrado en coordenadas planas
const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 4,
    zoomControl: false
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

map.setView([0, 0], 1);

// Variable para almacenar el marcador activo actual en el mapa
let currentMarker = null;

// 2. Función centralizada para procesar una región (compartida por Clic y Formulario)
function selectRegion(lat, lon, source = "mapa") {
    // Limpiar marcador anterior si existe
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }

    // Crear y añadir un nuevo marcador en la posición seleccionada
    currentMarker = L.marker([lat, lon]).addTo(map)
        .bindPopup(`<b>Región Seleccionada</b><br>Lat: ${lat}, Lon: ${lon}`)
        .openPopup();

    // Centrar suavemente el mapa en las coordenadas
    map.setView([lat, lon], map.getZoom());

    // Actualizar la tarjeta de información del clúster en el panel lateral
    const clusterInfoCard = document.getElementById('cluster-info');
    clusterInfoCard.innerHTML = `
        <h3>Región Detectada (${source})</h3>
        <p><strong>Coordenadas:</strong> Lat ${lat}°, Lon ${lon}°</p>
        <p><strong>Clúster ID:</strong> <code>cluster_mars_gamma</code></p>
        <p><strong>Elevación estimada:</strong> -1,200 m</p>
        <p><strong>Índice Mineral:</strong> 0.78 (Alto)</p>
        <p style="color: #38bdf8; margin-top: 8px; font-size: 0.8rem;">➜ Conectando con zona homóloga...</p>
    `;

    console.log(`Región procesada vía ${source} -> Lat: ${lat}, Lon: ${lon}`);
}

// 3. Evento: Clic directo en el mapa
map.on('click', (e) => {
    const lat = parseFloat(e.latlng.lat.toFixed(2));
    const lon = parseFloat(e.latlng.lng.toFixed(2));
    
    // Rellenar también los inputs del formulario para mantener sincronía
    document.getElementById('lat-input').value = lat;
    document.getElementById('lon-input').value = lon;

    selectRegion(lat, lon, "Clic en Mapa");
});

// 4. Evento: Envío del formulario de coordenadas manuales
const coordForm = document.getElementById('coord-form');
coordForm.addEventListener('submit', (e) => {
    e.preventDefault(); // Evitar recarga de página

    const lat = parseFloat(document.getElementById('lat-input').value);
    const lon = parseFloat(document.getElementById('lon-input').value);

    if (!isNaN(lat) && !isNaN(lon)) {
        selectRegion(lat, lon, "Entrada Manual");
    } else {
        alert("Por favor, introduce valores numéricos válidos para latitud y longitud.");
    }
});

console.log("Aplicación 2D interactiva inicializada con panel lateral completo y entrada manual.");