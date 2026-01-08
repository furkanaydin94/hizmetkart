// ==================== RAPOR OTOMASYON SİSTEMİ ==================== //
// Ana Uygulama Dosyası - StPageFlip Entegrasyonu

// ==================== ERROR HANDLING ==================== //
(function () {
    'use strict';

    // Show error to user
    function showError(message, details) {
        const errorDiv = document.getElementById('error-message');
        const loadingMsg = document.getElementById('loading-message');
        if (errorDiv && loadingMsg) {
            loadingMsg.textContent = 'Hata:';
            errorDiv.style.display = 'block';
            errorDiv.innerHTML = `<strong>${message}</strong>${details ? '<br><small>' + details + '</small>' : ''}`;
        }
        console.error('App Error:', message, details);
    }

    // Wrap main execution
    window.initializeApp = function () {
        try {
            mainApp();
        } catch (error) {
            showError('Uygulama başlatma hatası', error.message);
        }
    };
})();

function mainApp() {

    // Veri Depoları
    let bggVeriler = [], kumulatifVeriler = [], aylikVeriler = [], merkezler = [], aciklamalar = {};
    let istanbulGeoJSON = null, mapInstances = {}, mapIdx = 0, pageNum = 0;

    // Filtrelenmiş veri (haritalar için)
    let currentFilteredBgg = [];

    // Flipbook
    let pageFlip = null;
    let currentZoom = 0;

    // URL Parametreleri ve Filtreleme - ÖNCE TANIMLANMALI
    const urlParams = new URLSearchParams(window.location.search);
    const locationFilter = urlParams.get('location');
    const autoPrint = urlParams.get('autoprint');
    const servicesParam = urlParams.get('services');
    const turlerParam = urlParams.get('turler');

    // Parametreleri array'e çevir
    const selectedServices = servicesParam ? servicesParam.split(',') : null;
    const selectedTurler = turlerParam ? turlerParam.split(',') : null;
    const reportMonthParam = urlParams.get('reportMonth'); // Format: 2025-10

    // Mobile Detection - locationFilter kullanıldığı için SONRA
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
    const isLowMemory = isMobile && (locationFilter === 'İstanbul Geneli' || !locationFilter);

    console.log('Mobile:', isMobile, 'Low Memory Mode:', isLowMemory, 'Location:', locationFilter);

    // Rapor tarihi parse et
    let reportYear = null, reportMonth = null;
    if (reportMonthParam) {
        const parts = reportMonthParam.split('-');
        reportYear = parseInt(parts[0]);
        reportMonth = parseInt(parts[1]) - 1; // 0-indexed
        console.log('Rapor tarihi:', reportYear, 'yılı', reportMonth + 1, '. ay');
    }

    console.log('Filtreler:', { locationFilter, selectedServices, selectedTurler, reportMonthParam });

    // Renk Paleti
    const palette = ['#2b6cb0', '#38a169', '#d69e2e', '#e53e3e', '#805ad5', '#00b5d8', '#ed8936', '#38b2ac', '#667eea', '#f56565'];

    // ==================== YARDIMCI FONKSİYONLAR ==================== //

    const fmt = n => typeof n === 'number' ? n.toLocaleString('tr-TR') : '0';
    const fmtCur = n => typeof n === 'number' ? n.toLocaleString('tr-TR', { minimumFractionDigits: 0 }) + '₺' : '0';

    const toYear = d => {
        if (typeof d === 'number' && d > 25569) return new Date(Math.round((d - 25569) * 86400 * 1000)).getFullYear();
        if (d instanceof Date && !isNaN(d)) return d.getFullYear();
        const dt = new Date(d);
        return !isNaN(dt) ? dt.getFullYear() : null;
    };

    const distName = p => {
        let n = p.display_name || p.name || p.AD || p.ilce;
        return n ? n.toString().split(',')[0].trim() : null;
    };

    // Tarih parse yardımcısı
    const toDate = d => {
        if (!d) return null;
        if (d instanceof Date && !isNaN(d)) return d;
        if (typeof d === 'number' && d > 25569 && d < 100000) {
            return new Date(Math.round((d - 25569) * 86400 * 1000));
        }
        if (typeof d === 'string') {
            const trMatch = d.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
            if (trMatch) {
                return new Date(parseInt(trMatch[3]), parseInt(trMatch[2]) - 1, parseInt(trMatch[1]));
            }
            const dt = new Date(d);
            return isNaN(dt) ? null : dt;
        }
        return null;
    };

    // Rapor tarihine göre veri filtrele
    // - Seçilen yıl: Sadece seçilen ayın verisi
    // - Geçmiş yıllar: Sadece Aralık verisi
    const filterByReportMonth = (data) => {
        if (!reportYear || reportMonth === null) return data;

        return data.filter(r => {
            const d = toDate(r.sonTarih);
            if (!d) return false;

            const dataYear = d.getFullYear();
            const dataMonth = d.getMonth();

            // Seçilen yıl: Sadece seçilen ay
            if (dataYear === reportYear) {
                return dataMonth === reportMonth;
            }

            // Geçmiş yıllar: Sadece Aralık
            if (dataYear < reportYear) {
                return dataMonth === 11; // Aralık = 11
            }

            // Gelecek yıl: Dahil etme
            return false;
        });
    };

    // Aylık veriler için SADECE seçilen ay+yıl eşleşmesi
    const filterByExactMonth = (data) => {
        if (!reportYear || reportMonth === null) return data;

        return data.filter(r => {
            const d = toDate(r.sonTarih);
            if (!d) return false;

            const dataYear = d.getFullYear();
            const dataMonth = d.getMonth();

            // Sadece tam eşleşme (aynı yıl VE aynı ay)
            return dataYear === reportYear && dataMonth === reportMonth;
        });
    };

    const getColor = (v, min, max) => {
        if (typeof v !== 'number' || v === 0) return '#f0f4f8';
        if (max <= min) return '#3182ce';
        const ratio = (v - min) / (max - min);
        if (ratio > 0.66) return '#1a5490';
        if (ratio > 0.33) return '#4299e1';
        return '#a0c4e8';
    };

    function groupBy(arr, key) {
        return arr.reduce((a, i) => { (a[i[key]] = a[i[key]] || []).push(i); return a; }, {});
    }

    // ==================== HARİTA FONKSİYONLARI ==================== //

    // Helper: Add small inset map with data visualization
    function addInsetMap(parentEl, mainMapId, localData = null, filteredMerkezler = null) {
        // Create inset container
        const insetDiv = document.createElement('div');
        insetDiv.className = 'map-inset';
        insetDiv.id = mainMapId + '-inset';
        parentEl.appendChild(insetDiv);

        // Create small overview map with wider view
        const insetMap = L.map(insetDiv.id, {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false
        }).setView([41.15, 29.0], 7.3);

        // If we have data, calculate min/max for coloring
        let minVal = 0, maxVal = 0;
        if (localData) {
            const vals = Object.values(localData).filter(v => v > 0);
            minVal = vals.length > 0 ? Math.min(...vals) : 0;
            maxVal = vals.length > 0 ? Math.max(...vals) : 0;
        }

        // Add Istanbul with thin borders and optional coloring
        L.geoJSON(istanbulGeoJSON, {
            style: (f) => {
                if (localData) {
                    // Colored by data (for detail maps)
                    const name = distName(f.properties);
                    const val = localData[name] || 0;
                    return {
                        fillColor: getColor(val, minVal, maxVal),
                        weight: 0.5,
                        color: '#fff',
                        fillOpacity: 0.8
                    };
                } else {
                    // Simple gray (for center maps)
                    return {
                        fillColor: '#e2e8f0',
                        weight: 0.5,
                        color: '#a0aec0',
                        fillOpacity: 0.6
                    };
                }
            }
        }).addTo(insetMap);

        // Add center markers if provided
        if (filteredMerkezler && filteredMerkezler.length > 0) {
            const turler = [...new Set(filteredMerkezler.map(m => m.tur))];
            filteredMerkezler.forEach(m => {
                const turIdx = turler.indexOf(m.tur);
                const color = palette[turIdx % palette.length];
                L.circleMarker([m.lat, m.lon], {
                    radius: 2,
                    fillColor: color,
                    color: '#fff',
                    weight: 0.5,
                    fillOpacity: 0.9
                }).addTo(insetMap);
            });
        }
    }

    function initDetailMap(id, hizmet, tur, mudurluk) {
        const el = document.getElementById(id);
        if (!el || el._leaflet_id || !istanbulGeoJSON) return;

        const map = L.map(id, { zoomControl: false, attributionControl: false }).setView([41.05, 29.0], 9.5);
        mapInstances[id] = map;

        const data = currentFilteredBgg.filter(v => v.mudurluk === mudurluk && v.hizmet === hizmet && v.tur === tur);
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
                return { fillColor: getColor(val, minVal, maxVal), weight: 0.8, color: '#fff', fillOpacity: 0.85 };
            },
            onEachFeature: (f, layer) => {
                const name = distName(f.properties);
                const val = localData[name] || 0;

                // Tooltip (hover)
                layer.bindTooltip(`<b>${name}</b><br>${fmt(val)}`, { sticky: true });

                // Permanent label (ilçe adı)
                const center = layer.getBounds().getCenter();
                L.marker(center, {
                    icon: L.divIcon({
                        className: 'district-label',
                        html: `<span style="font-size: 9px; font-weight: 600; color: #2d3748; text-shadow: 1px 1px 2px white, -1px -1px 2px white, 1px -1px 2px white, -1px 1px 2px white;">${name}</span>`,
                        iconSize: [80, 20]
                    })
                }).addTo(map);
            }
        }).addTo(map);

        // Small inset overview map with same data coloring
        addInsetMap(el, id, localData);

        setTimeout(() => map.invalidateSize(), 100);
    }

    function initMerkezMap(id, mudurluk) {
        const el = document.getElementById(id);
        if (!el || el._leaflet_id || !istanbulGeoJSON) return;

        const map = L.map(id, { zoomControl: false, attributionControl: false }).setView([41.05, 29.0], 9.5);
        mapInstances[id] = map;

        L.geoJSON(istanbulGeoJSON, {
            style: () => ({ fillColor: '#e2e8f0', weight: 1, color: '#a0aec0', fillOpacity: 0.6 }),
            onEachFeature: (f, layer) => {
                const name = distName(f.properties);

                // Permanent label (ilçe adı)
                const center = layer.getBounds().getCenter();
                L.marker(center, {
                    icon: L.divIcon({
                        className: 'district-label',
                        html: `<span style="font-size: 9px; font-weight: 600; color: #4a5568; text-shadow: 1px 1px 2px white, -1px -1px 2px white, 1px -1px 2px white, -1px 1px 2px white;">${name}</span>`,
                        iconSize: [80, 20]
                    })
                }).addTo(map);
            }
        }).addTo(map);

        const filteredMerkezler = mudurluk === 'ALL'
            ? merkezler.filter(m => m.lat && m.lon)
            : merkezler.filter(m => m.mudurluk === mudurluk && m.lat && m.lon);
        const turler = [...new Set(filteredMerkezler.map(m => m.tur))];

        filteredMerkezler.forEach(m => {
            const turIdx = turler.indexOf(m.tur);
            const color = palette[turIdx % palette.length];
            L.circleMarker([m.lat, m.lon], { radius: 7, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9 })
                .bindTooltip(`<b>${m.ad}</b><br>${m.tur}<br>${m.ilce}`).addTo(map);
        });

        // Small inset overview map with center markers
        addInsetMap(el, id, null, filteredMerkezler);

        setTimeout(() => map.invalidateSize(), 100);
    }

    // ==================== RENDER FONKSİYONLARI ==================== //

    function renderSectionPage(title, desc) {
        pageNum++;
        return `
    <div class="page">
        <div class="section-page">
            <div class="section-sidebar">
                <div class="section-title-box"><h1>${title}</h1></div>
            </div>
            <div class="section-main">
                <p>${desc}</p>
            </div>
        </div>
    </div>`;
    }

    function renderOzetSayfasi(data, sutunBasligi) {
        const byMud = groupBy(data, 'mudurluk');
        const bolumAdi = sutunBasligi === 'GENEL' ? '2019\'DAN BU YANA' : 'Aylık Hizmet İstatistikleri';

        const mudurlukler = [];
        for (const [mud, items] of Object.entries(byMud)) {
            const byHizmet = groupBy(items, 'hizmet');
            const hizmetList = [];
            for (const [hiz, hItems] of Object.entries(byHizmet)) {
                const byTur = groupBy(hItems, 'tur');
                const degerParts = [];
                for (const [tur, tItems] of Object.entries(byTur)) {
                    const sum = tItems.reduce((s, v) => s + v.deger, 0);
                    if (sum > 0) {
                        const valStr = tur.toLowerCase().includes('bütçe') ? fmtCur(sum) : fmt(sum);
                        degerParts.push(valStr + ' ' + tur);
                    }
                }
                if (degerParts.length > 0) {
                    hizmetList.push({ hizmet: hiz, deger: degerParts.join(', ') });
                }
            }
            if (hizmetList.length > 0) {
                mudurlukler.push({ mud, hizmetList, rowCount: Math.ceil(hizmetList.length / 2) });
            }
        }

        const MAX_ROWS_PER_PAGE = 22;
        let html = '';
        let currentPageContent = '';
        let currentRowCount = 0;

        const renderMudurluk = (mudData, label) => {
            const mid = Math.ceil(mudData.hizmetList.length / 2);
            const col1 = mudData.hizmetList.slice(0, mid);
            const col2 = mudData.hizmetList.slice(mid);

            // Tek sütun mu iki sütun mu?
            const useSingleColumn = col2.length === 0;

            let h = `<div class="ozet-mudurluk">
            <h2 class="ozet-title">${mudData.mud}</h2>
            <div class="ozet-grid" ${useSingleColumn ? 'style="grid-template-columns: 1fr;"' : ''}>
                <div><div class="ozet-col-header"><span>HİZMET</span><span>${label}</span></div>`;
            col1.forEach(item => {
                h += `<div class="ozet-row"><span class="ozet-hizmet">${item.hizmet}</span><span class="ozet-deger">${item.deger}</span></div>`;
            });
            h += `</div>`;

            // İkinci sütunu sadece içerik varsa ekle
            if (col2.length > 0) {
                h += `<div><div class="ozet-col-header"><span>HİZMET</span><span>${label}</span></div>`;
                col2.forEach(item => {
                    h += `<div class="ozet-row"><span class="ozet-hizmet">${item.hizmet}</span><span class="ozet-deger">${item.deger}</span></div>`;
                });
                h += `</div>`;
            }

            h += `</div></div>`;
            return h;
        };

        const createPage = (content) => {
            pageNum++;
            return `
        <div class="page ozet-page">
            <div class="ozet-header"><h1>${bolumAdi}</h1><img src="logo/logo.png"></div>
            <div class="ozet-body">${content}</div>
            <div class="page-footer"><span class="footer-left">${window.footerText || ''}</span><span class="page-num">${pageNum}</span></div>
        </div>`;
        };

        mudurlukler.forEach((mudData) => {
            if (currentRowCount + mudData.rowCount + 2 > MAX_ROWS_PER_PAGE && currentPageContent) {
                html += createPage(currentPageContent);
                currentPageContent = '';
                currentRowCount = 0;
            }
            currentPageContent += renderMudurluk(mudData, sutunBasligi);
            currentRowCount += mudData.rowCount + 2;
        });

        if (currentPageContent) {
            html += createPage(currentPageContent);
        }

        return html;
    }

    // ==================== ANA RAPOR ==================== //

    function renderReport() {
        let H = '';
        pageNum = 0;
        const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

        // Lokasyon filtreleme uygula
        let filteredBggVeriler = bggVeriler;
        let filteredKumulatifVeriler = kumulatifVeriler;
        let filteredAylikVeriler = aylikVeriler;

        console.log('Başlangıç veri sayısı:', bggVeriler.length);

        if (locationFilter) {
            console.log('Lokasyon filtresi:', locationFilter);
            console.log('İlk 5 veri lokasyonları:', bggVeriler.slice(0, 5).map(v => v.lokasyon));

            if (locationFilter === 'İstanbul Geneli') {
                // İstanbul Geneli: Tüm verilerin toplamlarını göster (değişiklik yok)
                console.log('İstanbul Geneli seçildi - tüm veriler gösterilecek');
            } else {
                // Diğer lokasyonlar: Sadece o lokasyonun kendi verilerini göster
                filteredBggVeriler = bggVeriler.filter(v => v.lokasyon === locationFilter);
                filteredKumulatifVeriler = kumulatifVeriler.filter(v => v.lokasyon === locationFilter);
                filteredAylikVeriler = aylikVeriler.filter(v => v.lokasyon === locationFilter);
                console.log(`${locationFilter} filtresi uygulandı, kalan veri:`, filteredBggVeriler.length);
            }
        }

        // Hizmet filtreleme
        if (selectedServices && selectedServices.length > 0) {
            console.log('Hizmet filtresi:', selectedServices);
            filteredBggVeriler = filteredBggVeriler.filter(v => selectedServices.includes(v.hizmet));
            filteredKumulatifVeriler = filteredKumulatifVeriler.filter(v => selectedServices.includes(v.hizmet));
            filteredAylikVeriler = filteredAylikVeriler.filter(v => selectedServices.includes(v.hizmet));
            console.log('Hizmet filtresinden sonra kalan:', filteredBggVeriler.length);
        }

        // Tür filtreleme
        if (selectedTurler && selectedTurler.length > 0) {
            console.log('Tür filtresi:', selectedTurler);
            filteredBggVeriler = filteredBggVeriler.filter(v => selectedTurler.includes(v.tur));
            filteredKumulatifVeriler = filteredKumulatifVeriler.filter(v => selectedTurler.includes(v.tur));
            filteredAylikVeriler = filteredAylikVeriler.filter(v => selectedTurler.includes(v.tur));
            console.log('Tür filtresinden sonra kalan:', filteredBggVeriler.length);
        }

        console.log('Final filtrelenmiş veri sayısı:', filteredBggVeriler.length);

        // Global değişkeni güncelle (haritalar için)
        currentFilteredBgg = filteredBggVeriler;

        let sonTarih = null;
        const allData = [...filteredBggVeriler, ...filteredAylikVeriler];
        allData.forEach(v => {
            if (v.sonTarih) {
                const d = new Date(v.sonTarih);
                if (!isNaN(d) && (!sonTarih || d > sonTarih)) sonTarih = d;
            }
        });
        const dateStr = sonTarih ? `${months[sonTarih.getMonth()]} ${sonTarih.getFullYear()}` : `${months[new Date().getMonth()]} ${new Date().getFullYear()}`;
        const locationTitle = locationFilter || 'İstanbul Geneli';
        window.footerText = `Dönemsel Hizmet İstatistikleri • ${locationTitle} • ${dateStr}`;

        // KAPAK
        H += `
    <div class="page cover">
        <div class="cover-top"><div class="cover-date">${dateStr}</div></div>
        <div class="cover-center">
            <div class="cover-pretitle">Dönemsel</div>
            <h1 class="cover-title">Hizmet<br>İstatistikleri</h1>
            <div class="cover-subtitle">${locationTitle}</div>
        </div>
        <div class="cover-bottom">
            <div class="cover-logos"><img src="logo/logo.png" style="height:80px;"></div>
        </div>
    </div>`;

        // Ara sayfa başlıkları (hep gösterilecek)
        H += renderSectionPage('2019\'DAN BU YANA', '2019 yılından bu yana vatandaşlarımıza sunduğumuz sosyal hizmetlerin genel özeti.');
        H += renderOzetSayfasi(filteredBggVeriler, 'GENEL');

        if (filteredAylikVeriler.length > 0) {
            H += renderSectionPage('Aylık Hizmet İstatistikleri', 'İçinde bulunduğumuz ayda gerçekleştirdiğimiz hizmetlerin özet istatistikleri.');
            H += renderOzetSayfasi(filteredAylikVeriler, 'BU AY');
        }

        if (merkezler.length > 0 && (!locationFilter || locationFilter === 'İstanbul Geneli')) {
            H += renderSectionPage('Merkezlerimiz', 'İstanbul genelinde faaliyet gösteren tüm hizmet merkezlerimizin konumları.');
            const merkezMapId = `merkez-map-${mapIdx++}`;
            const mudurlukGruplari = {};
            merkezler.forEach(m => {
                const mud = m.mudurluk || 'Diğer';
                if (!mudurlukGruplari[mud]) mudurlukGruplari[mud] = [];
                mudurlukGruplari[mud].push(m);
            });
            const mudurlukListesi = Object.entries(mudurlukGruplari).sort((a, b) => b[1].length - a[1].length);

            const renderMudurlukMerkezler = (mud, list) => {
                const turGruplari = {};
                list.forEach(m => { turGruplari[m.tur || 'Diğer'] = (turGruplari[m.tur || 'Diğer'] || 0) + 1; });
                const turler = [...new Set(merkezler.map(m => m.tur))].filter(Boolean);
                const turHTML = Object.entries(turGruplari).map(([tur, count]) => {
                    const color = palette[turler.indexOf(tur) % palette.length];
                    return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;font-size:7.5pt;color:#4a5568;">
                    <span style="width:8px;height:8px;border-radius:50%;background:${color};"></span>
                    <span>${tur}</span><span style="font-weight:600;color:#153d6f;">${count}</span></div>`;
                }).join('');
                return `<div style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
                <div style="display:flex;justify-content:space-between;"><span style="font-weight:700;color:#153d6f;font-size:9pt;">${mud}</span>
                <span style="font-weight:700;color:#1a5490;font-size:9pt;">${list.length}</span></div>
                <div style="margin-top:5px;padding-left:5px;">${turHTML}</div></div>`;
            };
            pageNum++;
            H += `
        <div class="page detail-page">
            <div class="detail-header"><div class="detail-header-text"><h2>Sosyal Hizmetler Dairesi Başkanlığı</h2><span>Tüm Merkezler</span></div><img src="logo/logo.png"></div>
            <div class="detail-map" id="${merkezMapId}" data-type="merkez" data-mud="ALL"></div>
            <div class="detail-content" style="padding:15px 50px;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;border-bottom:2px solid #1a5490;margin-bottom:10px;">
                    <span style="font-weight:700;color:#153d6f;font-size:11pt;">Toplam Merkez Sayısı</span>
                    <span style="font-weight:800;color:#1a5490;font-size:14pt;">${merkezler.length}</span></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 30px;">
                    <div>${mudurlukListesi.slice(0, Math.ceil(mudurlukListesi.length / 2)).map(([m, l]) => renderMudurlukMerkezler(m, l)).join('')}</div>
                    <div>${mudurlukListesi.slice(Math.ceil(mudurlukListesi.length / 2)).map(([m, l]) => renderMudurlukMerkezler(m, l)).join('')}</div>
                </div>
            </div>
            <div class="page-footer"><span class="footer-left">${window.footerText}</span><span class="page-num">${pageNum}</span></div>
        </div>`;
        }

        // İLÇE BAZLI MERKEZLER (harita yerine adres listesi)
        if (merkezler.length > 0 && locationFilter && locationFilter !== 'İstanbul Geneli') {
            // Debug: İlçe değerlerini kontrol et
            const uniqueIlceler = [...new Set(merkezler.map(m => m.ilce))];
            console.log('LocationFilter:', locationFilter);
            console.log('Merkezlerdeki ilçeler:', uniqueIlceler);
            console.log('Toplam merkez:', merkezler.length);

            // İlçeye ait merkezleri filtrele (büyük/küçük harf duyarsız)
            const ilceMerkezleri = merkezler.filter(m =>
                m.ilce && m.ilce.toLocaleLowerCase('tr-TR') === locationFilter.toLocaleLowerCase('tr-TR')
            );
            console.log('Eşleşen merkez sayısı:', ilceMerkezleri.length);

            if (ilceMerkezleri.length > 0) {
                H += renderSectionPage(`${locationFilter} Merkezleri`, `${locationFilter} ilçesinde faaliyet gösteren hizmet merkezlerimiz.`);

                // Müdürlüğe göre grupla
                const mudurlukGruplari = {};
                ilceMerkezleri.forEach(m => {
                    const mud = m.mudurluk || 'Diğer';
                    if (!mudurlukGruplari[mud]) mudurlukGruplari[mud] = [];
                    mudurlukGruplari[mud].push(m);
                });

                const mudurlukListesi = Object.entries(mudurlukGruplari).sort((a, b) => b[1].length - a[1].length);

                // Her müdürlüğün merkezlerini render et
                const renderMerkezWithAdres = (merkez) => {
                    return `<div style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                    <div style="font-weight:600;color:#153d6f;font-size:8.5pt;">${merkez.ad}</div>
                    ${merkez.tur ? `<div style="font-size:7.5pt;color:#718096;margin-top:2px;">${merkez.tur}</div>` : ''}
                    ${merkez.adres ? `<div style="font-size:7pt;color:#4a5568;margin-top:3px;line-height:1.3;">📍 ${merkez.adres}</div>` : ''}
                </div>`;
                };

                const renderMudurlukGrubu = (mud, merkezListesi) => {
                    return `<div style="margin-bottom:15px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:2px solid #1a5490;">
                        <span style="font-weight:700;color:#1a5490;font-size:9pt;">${mud}</span>
                        <span style="font-weight:700;color:#153d6f;font-size:9pt;">${merkezListesi.length} merkez</span>
                    </div>
                    <div style="padding-left:5px;">
                        ${merkezListesi.map(m => renderMerkezWithAdres(m)).join('')}
                    </div>
                </div>`;
                };

                pageNum++;
                H += `
            <div class="page detail-page">
                <div class="detail-header"><div class="detail-header-text"><h2>${locationFilter}</h2><span>Hizmet Merkezleri</span></div><img src="logo/logo.png"></div>
                <div class="detail-content" style="padding:15px 40px;position:absolute;top:110px;bottom:50px;left:0;right:0;overflow:hidden;">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;border-bottom:2px solid #1a5490;margin-bottom:10px;">
                        <span style="font-weight:700;color:#153d6f;font-size:10pt;">Toplam Merkez Sayısı</span>
                        <span style="font-weight:800;color:#1a5490;font-size:13pt;">${ilceMerkezleri.length}</span>
                    </div>
                    <div style="column-count:2;column-gap:25px;column-fill:auto;height:calc(100% - 50px);overflow:hidden;">
                        ${mudurlukListesi.map(([m, l]) => renderMudurlukGrubu(m, l)).join('')}
                    </div>
                </div>
                <div class="page-footer"><span class="footer-left">${window.footerText}</span><span class="page-num">${pageNum}</span></div>
            </div>`;
            }
        }

        // MÜDÜRLÜK DETAYLARI (kısaltılmış)
        const mudurluklerList = [...new Set(filteredBggVeriler.map(v => v.mudurluk))].filter(Boolean);
        mudurluklerList.forEach(mud => {
            H += renderSectionPage(mud, 'Müdürlük bazında detaylı hizmet verileri ve yıllık istatistikler.');
            const hizmetler = [...new Set(filteredBggVeriler.filter(v => v.mudurluk === mud).map(v => v.hizmet))].filter(Boolean);
            const noMapServices = [], mapServices = [];

            // İstanbul Geneli dışındaki lokasyonlarda harita gösterme
            const showMaps = !locationFilter || locationFilter === 'İstanbul Geneli';

            hizmetler.forEach(hiz => {
                const bgg = filteredBggVeriler.filter(v => v.mudurluk === mud && v.hizmet === hiz);
                if (!bgg.length) return;
                const hasIlce = bgg.some(v => v.lokasyon && v.lokasyon !== 'İstanbul Geneli' && v.lokasyon !== 'Diğer');

                // Eğer harita gösterilmeyecekse veya ilçe verisi yoksa noMapServices'a ekle
                if (!showMaps || !hasIlce || !istanbulGeoJSON) {
                    noMapServices.push(hiz);
                } else {
                    mapServices.push(hiz);
                }
            });

            mapServices.forEach(hiz => {
                const bgg = filteredBggVeriler.filter(v => v.mudurluk === mud && v.hizmet === hiz);
                const kum = filteredKumulatifVeriler.filter(v => v.mudurluk === mud && v.hizmet === hiz);
                const turler = [...new Set(bgg.map(v => v.tur))].filter(Boolean);
                const mapId = `detail-map-${mapIdx++}`;
                const desc = aciklamalar[hiz] || '';
                pageNum++;

                let statsHTML = '', isFirst = true;
                turler.forEach(t => {
                    const sum = bgg.filter(v => v.tur === t).reduce((s, v) => s + v.deger, 0);
                    if (sum > 0) {
                        const val = t.toLowerCase().includes('bütçe') ? fmtCur(sum) : fmt(sum);
                        statsHTML += `<div class="${isFirst ? 'stat-card' : 'stat-card stat-card-secondary'}"><div class="stat-card-label">${t}</div><div class="stat-card-value">${val}</div></div>`;
                        isFirst = false;
                    }
                });

                let tableHTML = '';
                if (kum.length) {
                    const yillik = {};
                    kum.forEach(r => { const y = toYear(r.sonTarih); if (y) { yillik[y] = yillik[y] || { year: y }; yillik[y][r.tur] = (yillik[y][r.tur] || 0) + r.deger; } });
                    const rows = Object.values(yillik).sort((a, b) => a.year - b.year);
                    const usedTurs = turler.filter(t => rows.some(r => r[t] > 0));
                    if (rows.length && usedTurs.length) {
                        tableHTML = `<div class="data-section"><h3>Yıllık Veriler</h3><table class="data-table">
                        <thead><tr><th>YIL</th>${usedTurs.map(t => `<th>${t.toUpperCase()}</th>`).join('')}</tr></thead>
                        <tbody>${rows.map(r => `<tr><td>${r.year}</td>${usedTurs.map(t => `<td>${t.toLowerCase().includes('bütçe') ? fmtCur(r[t] || 0) : fmt(r[t] || 0)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
                    }
                }

                H += `
            <div class="page detail-page">
                <div class="detail-header"><div class="detail-header-text"><h2>${mud}</h2></div><img src="logo/logo.png"></div>
                <div class="detail-map" id="${mapId}" data-h="${hiz}" data-t="${turler[0]}" data-m="${mud}">
                    <div class="map-legend"><div class="map-legend-title">Yoğunluk</div>
                        <div class="map-legend-item"><div class="map-legend-color" style="background:#1a5490"></div>Yüksek</div>
                        <div class="map-legend-item"><div class="map-legend-color" style="background:#4299e1"></div>Orta</div>
                        <div class="map-legend-item"><div class="map-legend-color" style="background:#a0c4e8"></div>Düşük</div>
                        <div class="map-legend-item"><div class="map-legend-color" style="background:#f0f4f8"></div>Veri Yok</div></div></div>
                <div class="detail-content"><h1 class="detail-title">${hiz}</h1>${desc ? `<p class="detail-desc">${desc}</p>` : ''}
                    <div class="detail-grid">${tableHTML || '<div></div>'}<div class="data-section"><h3>Genel İstatistikler</h3>${statsHTML}</div></div></div>
                <div class="page-footer"><span class="footer-left">${window.footerText}</span><span class="page-num">${pageNum}</span></div>
            </div>`;
            });

            for (let i = 0; i < noMapServices.length; i += 2) {
                const pair = noMapServices.slice(i, i + 2);
                pageNum++;
                let halfHTML = '';
                pair.forEach(hiz => {
                    const bgg = filteredBggVeriler.filter(v => v.mudurluk === mud && v.hizmet === hiz);
                    const kum = filteredKumulatifVeriler.filter(v => v.mudurluk === mud && v.hizmet === hiz);
                    const turler = [...new Set(bgg.map(v => v.tur))].filter(Boolean);
                    const desc = aciklamalar[hiz] || '';

                    let statsHTML = '', isFirst = true;
                    turler.forEach(t => {
                        const sum = bgg.filter(v => v.tur === t).reduce((s, v) => s + v.deger, 0);
                        if (sum > 0) {
                            statsHTML += `<div class="${isFirst ? 'stat-card' : 'stat-card stat-card-secondary'}"><div class="stat-card-label">${t}</div><div class="stat-card-value">${t.toLowerCase().includes('bütçe') ? fmtCur(sum) : fmt(sum)}</div></div>`;
                            isFirst = false;
                        }
                    });

                    let tableHTML = '';
                    if (kum.length) {
                        const yillik = {};
                        kum.forEach(r => { const y = toYear(r.sonTarih); if (y) { yillik[y] = yillik[y] || { year: y }; yillik[y][r.tur] = (yillik[y][r.tur] || 0) + r.deger; } });
                        const rows = Object.values(yillik).sort((a, b) => a.year - b.year);
                        const usedTurs = turler.filter(t => rows.some(r => r[t] > 0));
                        if (rows.length && usedTurs.length) {
                            tableHTML = `<div class="data-section"><h3>Yıllık Veriler</h3><table class="data-table">
                            <thead><tr><th>YIL</th>${usedTurs.map(t => `<th>${t.toUpperCase()}</th>`).join('')}</tr></thead>
                            <tbody>${rows.map(r => `<tr><td>${r.year}</td>${usedTurs.map(t => `<td>${t.toLowerCase().includes('bütçe') ? fmtCur(r[t] || 0) : fmt(r[t] || 0)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
                        }
                    }
                    halfHTML += `<div class="half-service"><h1 class="detail-title">${hiz}</h1>${desc ? `<p class="detail-desc">${desc}</p>` : ''}
                    <div class="detail-grid">${tableHTML || '<div></div>'}<div class="data-section"><h3>Genel İstatistikler</h3>${statsHTML}</div></div></div>`;
                });

                H += `
            <div class="page detail-page">
                <div class="detail-header"><div class="detail-header-text"><h2>${mud}</h2></div><img src="logo/logo.png"></div>
                <div class="half-page-container">${halfHTML}</div>
                <div class="page-footer"><span class="footer-left">${window.footerText}</span><span class="page-num">${pageNum}</span></div>
            </div>`;
            }
        });

        return H;
    }

    // ==================== FLIPBOOK (StPageFlip) ==================== //

    function initFlipbook(pagesHTML) {
        const container = document.getElementById('flipbook-container');
        const flipbookEl = document.getElementById('flipbook');

        // Boyutları hesapla - daha büyük alan
        const maxH = container.clientHeight - 15;
        const maxW = container.clientWidth - 30;
        const a4Ratio = 210 / 297;

        let h = Math.min(maxH, 1000);
        let w = h * a4Ratio;

        if (w * 2 > maxW) {
            w = maxW / 2;
            h = w / a4Ratio;
        }

        const pageWidth = Math.floor(w);
        const pageHeight = Math.floor(h);

        // Sayfaları parse et
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = pagesHTML;
        const pages = Array.from(tempDiv.querySelectorAll('.page'));

        // Flipbook sayfalarını oluştur
        pages.forEach((page, idx) => {
            const pageWrapper = document.createElement('div');
            pageWrapper.className = 'flipbook-page';
            pageWrapper.setAttribute('data-density', idx === 0 ? 'hard' : 'soft');

            const inner = document.createElement('div');
            inner.className = 'page-inner';

            // Orijinal sayfa boyutu
            const origW = 794;
            const origH = 1123;
            const scale = Math.min(pageWidth / origW, pageHeight / origH);

            page.style.width = origW + 'px';
            page.style.height = origH + 'px';
            page.style.transform = `scale(${scale})`;
            page.style.transformOrigin = 'top left';

            inner.appendChild(page);
            pageWrapper.appendChild(inner);
            flipbookEl.appendChild(pageWrapper);
        });

        // StPageFlip başlat
        pageFlip = new St.PageFlip(flipbookEl, {
            width: pageWidth,
            height: pageHeight,
            size: 'fixed',
            minWidth: 300,
            maxWidth: 1000,
            minHeight: 400,
            maxHeight: 1200,
            drawShadow: true,
            flippingTime: 800,
            usePortrait: false,
            startZIndex: 0,
            autoSize: false,
            maxShadowOpacity: 0.5,
            showCover: true,
            mobileScrollSupport: true,
            swipeDistance: 30,
            clickEventForward: true,
            useMouseEvents: true,
            showPageCorners: true
        });

        pageFlip.loadFromHTML(document.querySelectorAll('.flipbook-page'));

        // Event listeners
        pageFlip.on('flip', (e) => {
            updatePageIndicator();
            setTimeout(() => refreshVisibleMaps(), 100);
        });

        updatePageIndicator();

        // Tüm haritaları baştan yükle
        setTimeout(() => initAllMaps(), 300);
    }

    function updatePageIndicator() {
        const indicator = document.getElementById('page-indicator');
        if (pageFlip) {
            const current = pageFlip.getCurrentPageIndex() + 1;
            const total = pageFlip.getPageCount();
            indicator.textContent = `${current}/${total}`;
        }
    }

    function initAllMaps() {
        // Tüm flipbook sayfalarını geçici olarak görünür yap
        const allPages = document.querySelectorAll('.flipbook-page');
        const origStyles = [];

        allPages.forEach((page, i) => {
            origStyles[i] = {
                display: page.style.display,
                visibility: page.style.visibility,
                position: page.style.position
            };
            page.style.display = 'block';
            page.style.visibility = 'visible';
            page.style.position = 'absolute';
        });

        // Flipbook'taki haritaları başlat
        const flipbookMaps = document.querySelectorAll('.flipbook-page .detail-map');

        flipbookMaps.forEach(el => {
            if (el._leaflet_id) return;

            if (el.dataset.h) {
                initDetailMap(el.id, el.dataset.h, el.dataset.t, el.dataset.m);
            } else if (el.dataset.type === 'merkez') {
                initMerkezMap(el.id, el.dataset.mud);
            }
        });

        // Orijinal stilleri geri yükle
        setTimeout(() => {
            allPages.forEach((page, i) => {
                page.style.display = origStyles[i].display;
                page.style.visibility = origStyles[i].visibility;
                page.style.position = origStyles[i].position;
            });

            // Görünür haritaların boyutlarını güncelle
            refreshVisibleMaps();
        }, 500);

        // Print container'daki haritaları başlat
        const printMaps = document.querySelectorAll('#print-report .detail-map');

        printMaps.forEach(el => {
            if (el._leaflet_id) return;

            if (el.dataset.h) {
                initDetailMap(el.id, el.dataset.h, el.dataset.t, el.dataset.m);
            } else if (el.dataset.type === 'merkez') {
                initMerkezMap(el.id, el.dataset.mud);
            }
        });

        console.log('Tüm haritalar yüklendi:', flipbookMaps.length, 'flipbook,', printMaps.length, 'print');
    }

    function refreshVisibleMaps() {
        // Görünür haritaların boyutlarını güncelle
        Object.values(mapInstances).forEach(map => {
            if (map && map.invalidateSize) {
                try {
                    map.invalidateSize();
                } catch (e) { }
            }
        });
    }

    // ==================== PDF İNDİRME ==================== //

    async function downloadPDF() {
        const { jsPDF } = window.jspdf;

        const overlay = document.createElement('div');
        overlay.innerHTML = `
        <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10000;">
            <div style="width:60px;height:60px;border:5px solid #333;border-top-color:#3498db;border-radius:50%;animation:spin 1s linear infinite;"></div>
            <p id="pdf-msg" style="color:white;margin-top:25px;font-size:18px;">PDF Oluşturuluyor</p>
            <p id="pdf-progress" style="color:#3498db;margin-top:10px;font-size:28px;font-weight:bold;">0%</p>
        </div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `;
        document.body.appendChild(overlay);

        try {
            const printReport = document.getElementById('print-report');
            printReport.style.cssText = 'position:fixed;left:0;top:0;visibility:visible;z-index:-1;width:794px;overflow:visible;';

            // PDF görüntü düzeltmeleri
            printReport.querySelectorAll('.page, .cover, .section-page').forEach(el => {
                el.style.overflow = 'visible';
            });

            // Kapak başlığını küçült (sığması için)
            printReport.querySelectorAll('.cover-title').forEach(el => {
                el.style.fontSize = '58pt';  // 72pt yerine 58pt
                el.style.letterSpacing = '-1px';
            });

            // Ara kapak başlıklarını düzelt
            printReport.querySelectorAll('.section-title-box h1').forEach(el => {
                el.style.fontSize = '17pt';
            });

            // Section sidebar genişliğini sabitle (85mm = 321px)
            printReport.querySelectorAll('.section-sidebar').forEach(el => {
                el.style.width = '321px';
                el.style.minWidth = '321px';
                el.style.display = 'flex';
                el.style.alignItems = 'center';
                el.style.justifyContent = 'center';
                el.style.height = '100%';
            });

            // Section title box genişliğini artır
            printReport.querySelectorAll('.section-title-box').forEach(el => {
                el.style.width = '280px';
                el.style.minWidth = '280px';
            });

            await new Promise(r => setTimeout(r, 300));

            const pages = Array.from(printReport.querySelectorAll('.page'));
            const total = pages.length;

            if (total === 0) throw new Error('Sayfa bulunamadı!');

            // A4 piksel boyutları (96 DPI)
            const A4_WIDTH = 794;
            const A4_HEIGHT = 1123;

            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

            for (let i = 0; i < total; i++) {
                document.getElementById('pdf-progress').textContent = Math.round(((i + 1) / total) * 100) + '%';

                const page = pages[i];

                // Sabit A4 boyutları uygula
                page.style.width = A4_WIDTH + 'px';
                page.style.height = A4_HEIGHT + 'px';
                page.style.minHeight = A4_HEIGHT + 'px';
                page.style.maxHeight = A4_HEIGHT + 'px';

                // html-to-image ile render
                const canvas = await htmlToImage.toCanvas(page, {
                    backgroundColor: '#ffffff',
                    width: A4_WIDTH,
                    height: A4_HEIGHT,
                    pixelRatio: 2,
                    cacheBust: true
                });

                // Canvas'tan JPEG
                const dataUrl = canvas.toDataURL('image/jpeg', 0.90);

                if (i > 0) pdf.addPage();
                pdf.addImage(dataUrl, 'JPEG', 0, 0, 210, 297);
            }

            printReport.style.cssText = 'position:absolute;left:-9999px;visibility:hidden;';

            const lokasyon = new URLSearchParams(window.location.search).get('lokasyon') || 'Rapor';
            pdf.save(`${lokasyon}_${new Date().toISOString().split('T')[0]}.pdf`);

            overlay.remove();

        } catch (error) {
            console.error('PDF Hatası:', error);
            alert('PDF hatası: ' + error.message);
            document.getElementById('print-report').style.cssText = 'position:absolute;left:-9999px;visibility:hidden;';
            overlay.remove();
        }
    }

    // ==================== KONTROLLER ==================== //

    function setupControls() {
        document.getElementById('btn-prev').addEventListener('click', () => {
            if (pageFlip) pageFlip.flipPrev();
        });

        document.getElementById('btn-next').addEventListener('click', () => {
            if (pageFlip) pageFlip.flipNext();
        });

        document.getElementById('btn-zoom-in').addEventListener('click', () => {
            const container = document.getElementById('flipbook-container');
            if (currentZoom < 1) {
                currentZoom++;
                container.classList.remove('zoomed-out');
                if (currentZoom === 1) container.classList.add('zoomed-in');
            }
        });

        document.getElementById('btn-zoom-out').addEventListener('click', () => {
            const container = document.getElementById('flipbook-container');
            if (currentZoom > -1) {
                currentZoom--;
                container.classList.remove('zoomed-in');
                if (currentZoom === -1) container.classList.add('zoomed-out');
            }
        });

        document.getElementById('btn-fullscreen').addEventListener('click', () => {
            const wrapper = document.getElementById('flipbook-wrapper');
            if (!document.fullscreenElement) {
                wrapper.requestFullscreen().catch(console.error);
            } else {
                document.exitFullscreen();
            }
        });

        document.getElementById('btn-print').addEventListener('click', downloadPDF);

        // Klavye
        document.addEventListener('keydown', (e) => {
            if (!pageFlip) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') pageFlip.flipNext();
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') pageFlip.flipPrev();
        });
    }

    // ==================== VERİ YÜKLEME ==================== //

    async function loadData() {
        try {
            // Önce sessionStorage'dan geçici veri kontrolü (aynı sekme)
            let tempRawData = sessionStorage.getItem('temp_strateji_rawdata');
            // Yoksa localStorage'dan kontrol (sekmeler arası paylaşım)
            if (!tempRawData) {
                tempRawData = localStorage.getItem('temp_hizmet_rawdata');
            }
            // Son olarak gallery.js'den kaydedilen özel veri kontrolü
            const customData = localStorage.getItem('customExcelData');

            if (tempRawData) {
                // Geçici veri varsa onu kullan (index.html modalından)
                console.log('✅ Geçici veri yükleniyor...');
                const parsed = JSON.parse(tempRawData);
                const data = parsed.map(r => ({
                    mudurluk: (r.mudurluk || '').toString().trim(),
                    hizmet: (r.hizmet || '').toString().trim(),
                    tur: (r.tur || '').toString().trim(),
                    lokasyon: (r.lokasyon || 'İstanbul Geneli').toString().trim(),
                    veriAraligi: (r.veriAraligi || 'BGG').toString().trim().toLocaleUpperCase('tr-TR'),
                    deger: parseFloat(r.deger) || 0,
                    sonTarih: r.tarih ? new Date(r.tarih) : null
                })).filter(r => r.mudurluk && r.hizmet);

                let rawBgg = data.filter(r => r.veriAraligi === 'BGG');
                let rawKum = data.filter(r => r.veriAraligi === 'KÜMÜLATİF');
                let rawAylik = data.filter(r => r.veriAraligi === 'AYLIK');

                // Tarih filtreleri uygula
                bggVeriler = filterByReportMonth(rawBgg);
                kumulatifVeriler = filterByReportMonth(rawKum);
                aylikVeriler = filterByExactMonth(rawAylik);

                console.log('Veri (filtreleme öncesi):', rawBgg.length, 'BGG,', rawKum.length, 'Kümülatif,', rawAylik.length, 'Aylık');
                console.log('Veri (filtreleme sonrası):', bggVeriler.length, 'BGG,', kumulatifVeriler.length, 'Kümülatif,', aylikVeriler.length, 'Aylık');

            } else if (customData) {
                const parsed = JSON.parse(customData);
                console.log('✅ Özel Excel verisi yükleniyor (localStorage)...');

                // Hizmetler
                const data = parsed.hizmetler;
                let rawBgg = data.filter(r => r.veriAraligi === 'BGG');
                let rawKum = data.filter(r => r.veriAraligi === 'KÜMÜLATİF');
                let rawAylik = data.filter(r => r.veriAraligi === 'AYLIK');

                // Tarih filtreleri uygula (seçilen yıl=seçilen ay, geçmiş yıllar=Aralık)
                bggVeriler = filterByReportMonth(rawBgg);
                kumulatifVeriler = filterByReportMonth(rawKum);

                // AYLIK: Sadece seçilen ay+yıl eşleşmesi
                aylikVeriler = filterByExactMonth(rawAylik);

                console.log('Veri (filtreleme öncesi):', rawBgg.length, 'BGG,', rawKum.length, 'Kümülatif,', rawAylik.length, 'Aylık');
                console.log('Veri (filtreleme sonrası):', bggVeriler.length, 'BGG,', kumulatifVeriler.length, 'Kümülatif,', aylikVeriler.length, 'Aylık');

                // Açıklamalar
                aciklamalar = parsed.aciklamalar || {};

                // Merkezler
                merkezler = parsed.merkezler || [];
                console.log('Merkezler:', merkezler.length, 'toplam');

            } else {
                // Varsayılan Excel dosyasından yükle
                const res = await fetch('hizmet-verileri/veri.xlsx');
                const buf = await res.arrayBuffer();
                const wb = XLSX.read(buf, { type: 'array', cellDates: true });

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

                    let rawBgg = data.filter(r => r.veriAraligi === 'BGG');
                    let rawKum = data.filter(r => r.veriAraligi === 'KÜMÜLATİF');
                    let rawAylik = data.filter(r => r.veriAraligi === 'AYLIK');

                    // Tarih filtreleri uygula (seçilen yıl=seçilen ay, geçmiş yıllar=Aralık)
                    bggVeriler = filterByReportMonth(rawBgg);
                    kumulatifVeriler = filterByReportMonth(rawKum);

                    // AYLIK: Sadece seçilen ay+yıl eşleşmesi
                    aylikVeriler = filterByExactMonth(rawAylik);

                    console.log('Veri (filtreleme öncesi):', rawBgg.length, 'BGG,', rawKum.length, 'Kümülatif,', rawAylik.length, 'Aylık');
                    console.log('Veri (filtreleme sonrası):', bggVeriler.length, 'BGG,', kumulatifVeriler.length, 'Kümülatif,', aylikVeriler.length, 'Aylık');
                }

                const ackSheet = wb.Sheets['Açıklamalar'];
                if (ackSheet) {
                    const rows = XLSX.utils.sheet_to_json(ackSheet);
                    rows.forEach(r => {
                        const key = r['Hizmet Başlığı'] || r['Hizmet'];
                        const val = r['Açıklama'];
                        if (key && val) aciklamalar[key.toString().trim()] = val.toString().trim();
                    });
                }

                const merSheet = wb.Sheets['Merkezler'];
                if (merSheet) {
                    const rows = XLSX.utils.sheet_to_json(merSheet);
                    merkezler = rows.map(r => {
                        const parts = (r['KOORDİNATLAR'] || '').toString().split(',').map(s => parseFloat(s.trim()));
                        return {
                            mudurluk: (r['Müdürlük'] || '').toString().trim(),
                            ilce: (r['ILCE'] || r['İlçe'] || r['İLÇE'] || r['ilce'] || '').toString().trim(),
                            tur: (r['Birim Türü'] || r['Tür'] || '').toString().trim(),
                            ad: (r['Birim Adı'] || r['Merkez Adı'] || '').toString().trim(),
                            adres: (r['Adres'] || r['ADRES'] || '').toString().trim(),
                            lat: isNaN(parts[0]) ? null : parts[0],
                            lon: isNaN(parts[1]) ? null : parts[1]
                        };
                    }).filter(m => m.mudurluk && m.ad);
                    console.log('Merkezler:', merkezler.length, 'toplam');
                }
            } // else bloğu kapanışı

            // GeoJSON yükle (her iki yol için ortak) - SKIP ON MOBILE LOW MEMORY
            if (!isLowMemory) {
                try {
                    const geoRes = await fetch('data/istanbul.geojson');
                    istanbulGeoJSON = await geoRes.json();
                    console.log('GeoJSON yüklendi');
                } catch (e) {
                    console.error('GeoJSON hatası:', e);
                }
            } else {
                console.log('Low memory mode: GeoJSON atlandı');
            }

            // Raporu oluştur
            const reportHTML = renderReport();

            // Print için ayrı ID'lerle kaydet (harita çakışmasını önle)
            const printHTML = reportHTML.replace(/id="(detail-map-\d+|merkez-map-\d+)"/g, 'id="print-$1"');
            document.getElementById('print-report').innerHTML = printHTML;

            // Flipbook'u başlat
            setupControls();
            initFlipbook(reportHTML);

            // Yükleme ekranını gizle
            document.getElementById('flipbook-loading').classList.add('hidden');

            // Auto-print kontrolü
            if (autoPrint === '1') {
                setTimeout(() => {
                    console.log('Auto-print başlatılıyor...');
                    downloadPDF();
                }, 2000);
            }

        } catch (e) {
            console.error('Hata:', e);
            document.getElementById('flipbook-loading').innerHTML = `< p style = "color:#fc8181" > Hata: ${e.message}</p > `;
        }
    }

    // Başlat
    loadData();
}

// Initialize the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initializeApp);
} else {
    window.initializeApp();
}
