// --- DATABASE SETUP ---
const db = new Dexie("UrbanStudioDB");
db.version(1).stores({ layers: "++id, title", presentations: "++id, title" });

// --- MAPLIBRE INITIALIZATION ---
const map = new maplibregl.Map({
    container: 'mapContainer',
    style: 'https://tiles.openfreemap.org/styles/bright', // Better 3D base support
    center: [78.476, 17.366], // Jambagh
    zoom: 15.5,
    pitch: 0,
    canvasContextAttributes: { antialias: true }
});

window.addEventListener('load', () => { 
    setTimeout(() => document.getElementById('splash-screen').classList.add('fade-out'), 2000); 
    loadFromDB(); 
    initCharts();
});

// Tab Navigation
function move(index) {
    document.getElementById('slider').style.transform = `translateX(-${index * 33.333}%)`;
    document.querySelectorAll('.nav-links button').forEach((b,i) => b.classList.toggle('active', i===index));
    setTimeout(() => map.resize(), 800);
}

// 2D/3D Toggle
function setMapPitch(deg) { 
    map.easeTo({
        pitch: deg,
        duration: 1000
    });
}

// --- GIS LOGIC ---
async function loadFromDB() {
    const layers = await db.layers.toArray();
    const presentations = await db.presentations.toArray();
    renderUI(layers, presentations);
}

async function saveLayer() {
    const kFile = document.getElementById('kmlFile').files[0];
    const pFile = document.getElementById('layerPhoto').files[0];
    const t = document.getElementById('titleInput').value;
    const d = document.getElementById('descInput').value;
    if(!kFile || !t) return alert("KML and Title Required");

    const kmlText = await kFile.text();
    let photo = "";
    if(pFile) photo = await new Promise(r => { 
        const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.readAsDataURL(pFile); 
    });

    await db.layers.add({ title: t, desc: d, kmlData: kmlText, photo: photo });
    loadFromDB();
}

async function toggleLayer(layer) {
    const layerId = `layer-${layer.id}`;
    const extrusionId = `extrusion-${layer.id}`;

    if (map.getLayer(layerId)) {
        // Cleanup existing layers
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getLayer(extrusionId)) map.removeLayer(extrusionId);
        map.removeSource(layerId);
        document.getElementById(`btn-${layer.id}`).classList.remove('active');
    } else {
        const parser = new DOMParser();
        const kml = parser.parseFromString(layer.kmlData, "text/xml");
        const geojson = toGeoJSON.kml(kml);

        map.addSource(layerId, { type: 'geojson', data: geojson });

        // Check if KML contains Polygons for 3D extrusion
        const isBuildingLayer = geojson.features.some(f => 
            f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
        );

        if (isBuildingLayer) {
            map.addLayer({
                id: extrusionId,
                type: 'fill-extrusion',
                source: layerId,
                paint: {
                    'fill-extrusion-color': '#4f46e5',
                    'fill-extrusion-height': 30, // Default 3D height
                    'fill-extrusion-base': 0,
                    'fill-extrusion-opacity': 0.8
                }
            });
        }

        // Always add line layer for sharp outlines
        map.addLayer({
            id: layerId,
            type: 'line',
            source: layerId,
            paint: { 'line-color': '#4f46e5', 'line-width': 2 }
        });

        document.getElementById(`btn-${layer.id}`).classList.add('active');
        
        // Navigation focus
        if(geojson.features.length > 0) {
            const coord = geojson.features[0].geometry.coordinates[0];
            map.flyTo({ 
                center: Array.isArray(coord[0]) ? coord[0] : coord, 
                zoom: 17,
                pitch: 45 
            });
        }
    }
}

// --- UI RENDERING ---
function renderUI(layers, presentations) {
    const layerList = document.getElementById('layerList');
    const manageLayers = document.getElementById('manage-layer-list');
    layerList.innerHTML = ''; manageLayers.innerHTML = '';

    layers.forEach(l => {
        const btn = document.createElement('div');
        btn.className = 'layer-btn';
        btn.id = `btn-${l.id}`;
        btn.innerText = l.title;
        btn.onclick = () => toggleLayer(l);
        layerList.appendChild(btn);

        manageLayers.innerHTML += `<div style="padding:10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between;">
            ${l.title} <button onclick="deleteLayer(${l.id})" style="color:red; background:none; border:none; cursor:pointer;">✕</button>
        </div>`;
    });
}

async function deleteLayer(id) { await db.layers.delete(id); loadFromDB(); }

// --- CHARTS ---
function initCharts() {
    const ctx1 = document.getElementById('landUseChart').getContext('2d');
    new Chart(ctx1, {
        type: 'doughnut',
        data: { labels: ['Comm', 'Res', 'Open'], datasets: [{ data: [45, 35, 20], backgroundColor: ['#4f46e5', '#94a3b8', '#e2e8f0'] }] },
        options: { maintainAspectRatio: false }
    });
    // Other charts (roadWidth, aqi, risk) would follow this template...
}