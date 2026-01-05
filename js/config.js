// ==================== YAPILANDIRMA ==================== //

// Renk paleti
const palette = ['#3182ce', '#38a169', '#d69e2e', '#e53e3e', '#805ad5', '#00b5d8', '#ed8936', '#dd6b20'];

// Ay isimleri
const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// Sayfa yapılandırması
const MAX_ROWS_PER_PAGE = 22;

// Harita yapılandırması
const MAP_CONFIG = {
    center: [41.20, 29.0],
    zoom: 9.2,
    borderWeight: 0.8,
    borderColor: '#fff',
    fillOpacity: 0.85
};

// Renk yapılandırması
const COLORS = {
    noData: '#f0f4f8',
    high: '#1a5490',
    medium: '#4299e1',
    low: '#a0c4e8'
};

export { palette, months, MAX_ROWS_PER_PAGE, MAP_CONFIG, COLORS };
