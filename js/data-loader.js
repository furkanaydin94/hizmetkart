// ==================== VERİ YÜKLEYİCİ ==================== //

// Veri depoları
let bggVeriler = [];
let kumulatifVeriler = [];
let aylikVeriler = [];
let merkezler = [];
let aciklamalar = {};
let istanbulGeoJSON = null;

// Excel dosyasından veri yükleme
async function loadExcelData() {
    const res = await fetch('hizmet-verileri/veri.xlsx');
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });

    // Hizmetler sayfası
    const hizSheet = wb.Sheets['Hizmetler'];
    if (hizSheet) {
        const rows = XLSX.utils.sheet_to_json(hizSheet, { cellDates: true });
        const data = rows.map(r => ({
            mudurluk: (r['Müdürlük'] || '').toString().trim(),
            hizmet: (r['Hizmet Başlığı'] || '').toString().trim(),
            tur: (r['Tür'] || '').toString().trim(),
            lokasyon: (r['Lokasyon'] || '').toString().trim(),
            veriAraligi: (r['Veri Aralığı'] || '').toString().trim().toLocaleUpperCase('tr-TR'),
            deger: parseFloat(r['Değer']) || 0,
            sonTarih: r['Son Tarih']
        })).filter(r => r.mudurluk && r.hizmet);

        bggVeriler = data.filter(r => r.veriAraligi === 'BGG');
        kumulatifVeriler = data.filter(r => r.veriAraligi === 'KÜMÜLATİF');
        aylikVeriler = data.filter(r => r.veriAraligi === 'AYLIK');
        console.log('Veri:', bggVeriler.length, 'BGG,', kumulatifVeriler.length, 'Kümülatif,', aylikVeriler.length, 'Aylık');
    }

    // Açıklamalar sayfası
    const ackSheet = wb.Sheets['Açıklamalar'];
    if (ackSheet) {
        const rows = XLSX.utils.sheet_to_json(ackSheet);
        rows.forEach(r => {
            const key = r['Hizmet Başlığı'] || r['Hizmet'];
            const val = r['Açıklama'];
            if (key && val) aciklamalar[key.toString().trim()] = val.toString().trim();
        });
    }

    // Merkezler sayfası
    const merSheet = wb.Sheets['Merkezler'];
    if (merSheet) {
        const rows = XLSX.utils.sheet_to_json(merSheet);
        merkezler = rows.map(r => {
            const koordinatStr = (r['KOORDİNATLAR'] || '').toString();
            const parts = koordinatStr.split(',').map(s => parseFloat(s.trim()));
            return {
                mudurluk: (r['Müdürlük'] || '').toString().trim(),
                ilce: (r['İlçe'] || '').toString().trim(),
                tur: (r['Birim Türü'] || r['Tür'] || '').toString().trim(),
                ad: (r['Birim Adı'] || r['Merkez Adı'] || '').toString().trim(),
                lat: isNaN(parts[0]) ? null : parts[0],
                lon: isNaN(parts[1]) ? null : parts[1]
            };
        }).filter(m => m.mudurluk && m.ad);
        console.log('Merkezler:', merkezler.length, 'toplam,', merkezler.filter(m => m.lat).length, 'koordinatlı');
    }

    return { bggVeriler, kumulatifVeriler, aylikVeriler, merkezler, aciklamalar };
}

// İlçe sınırları yükleme
async function loadGeoJSON() {
    try {
        const geoRes = await fetch('data/istanbul.geojson');
        istanbulGeoJSON = await geoRes.json();
        return istanbulGeoJSON;
    } catch (e) {
        console.error('GeoJSON hatası:', e);
        return null;
    }
}

export {
    loadExcelData,
    loadGeoJSON,
    bggVeriler,
    kumulatifVeriler,
    aylikVeriler,
    merkezler,
    aciklamalar,
    istanbulGeoJSON
};
