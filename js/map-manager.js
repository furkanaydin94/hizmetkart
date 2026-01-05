// ==================== HARİTA YÖNETİCİSİ ==================== //

import { fmt, distName, getColor } from './utils.js';
import { palette, MAP_CONFIG } from './config.js';

// Harita instance'ları
const mapInstances = {};

// Detay haritası başlatma
function initDetailMap(id, hizmet, tur, mudurluk, bggVeriler, istanbulGeoJSON) {
    const el = document.getElementById(id);
    if (!el || el._leaflet_id || !istanbulGeoJSON) return;

    const map = L.map(id, { zoomControl: false, attributionControl: false })
        .setView(MAP_CONFIG.center, MAP_CONFIG.zoom);
    mapInstances[id] = map;

    const data = bggVeriler.filter(v => v.mudurluk === mudurluk && v.hizmet === hizmet && v.tur === tur);
    const ilceData = data.filter(v => v.lokasyon && v.lokasyon !== 'İstanbul Geneli' && v.lokasyon !== 'Diğer');

    const localData = {};
    ilceData.forEach(v => { localData[v.lokasyon.trim()] = (localData[v.lokasyon.trim()] || 0) + v.deger; });

    const vals = Object.values(localData).filter(v => v > 0);
    const minVal = vals.length > 0 ? Math.min(...vals) : 0;
    const maxVal = vals.length > 0 ? Math.max(...vals) : 0;

    L.geoJSON(istanbulGeoJSON, {
        style: f => {
            const name = distName(f.properties);
            const val = localData[name] || 0;
            return {
                fillColor: getColor(val, minVal, maxVal),
                weight: MAP_CONFIG.borderWeight,
                color: MAP_CONFIG.borderColor,
                fillOpacity: MAP_CONFIG.fillOpacity
            };
        },
        onEachFeature: (f, layer) => {
            const name = distName(f.properties);
            const val = localData[name] || 0;
            layer.bindTooltip(`<b>${name}</b><br>${fmt(val)}`, { sticky: true });
        }
    }).addTo(map);

    setTimeout(() => map.invalidateSize(), 100);
}

// Merkez haritası başlatma
function initMerkezMap(id, mudurluk, merkezler, istanbulGeoJSON) {
    const el = document.getElementById(id);
    if (!el || el._leaflet_id || !istanbulGeoJSON) return;

    const map = L.map(id, { zoomControl: false, attributionControl: false })
        .setView(MAP_CONFIG.center, MAP_CONFIG.zoom);
    mapInstances[id] = map;

    L.geoJSON(istanbulGeoJSON, {
        style: { fillColor: '#f0f4f8', weight: MAP_CONFIG.borderWeight, color: '#fff', fillOpacity: 0.6 }
    }).addTo(map);

    const turler = [...new Set(merkezler.map(m => m.tur))].filter(Boolean);
    const filtered = mudurluk === 'ALL' ? merkezler : merkezler.filter(m => m.mudurluk === mudurluk);

    filtered.forEach(m => {
        if (!m.lat || !m.lon) return;
        const turIdx = turler.indexOf(m.tur);
        const color = palette[turIdx % palette.length];
        L.circleMarker([m.lat, m.lon], { radius: 7, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9 })
            .bindTooltip(`<b>${m.ad}</b><br>${m.tur}<br>${m.ilce}`).addTo(map);
    });

    setTimeout(() => map.invalidateSize(), 100);
}

export { initDetailMap, initMerkezMap, mapInstances };
