// ==================== YARDIMCI FONKSİYONLAR ==================== //

// Sayı formatlama
function fmt(n) {
    return typeof n === 'number' ? n.toLocaleString('tr-TR') : '0';
}

// Para birimi formatlama
function fmtCur(n) {
    return typeof n === 'number' ? n.toLocaleString('tr-TR', { minimumFractionDigits: 0 }) + '₺' : '0';
}

// Excel tarihini yıla çevirme
function toYear(d) {
    if (typeof d === 'number' && d > 25569) {
        return new Date(Math.round((d - 25569) * 86400 * 1000)).getFullYear();
    }
    if (d instanceof Date && !isNaN(d)) return d.getFullYear();
    const dt = new Date(d);
    return !isNaN(dt) ? dt.getFullYear() : null;
}

// İlçe adı çıkarma
function distName(p) {
    let n = p.display_name || p.name || p.AD || p.ilce;
    return n ? n.toString().split(',')[0].trim() : null;
}

// Dizi gruplama
function groupBy(arr, key) {
    return arr.reduce((a, i) => {
        (a[i[key]] = a[i[key]] || []).push(i);
        return a;
    }, {});
}

// Harita renk hesaplama
function getColor(v, min, max) {
    if (typeof v !== 'number' || v === 0) return '#f0f4f8';
    if (max <= min) return '#3182ce';
    const ratio = (v - min) / (max - min);
    if (ratio > 0.66) return '#1a5490';
    if (ratio > 0.33) return '#4299e1';
    return '#a0c4e8';
}

export { fmt, fmtCur, toYear, distName, groupBy, getColor };
