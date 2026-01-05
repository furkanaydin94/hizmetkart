// ==================== GALERİ SAYFASI MANTIK ==================== //

// Veri kaynakları
let allLocations = [];
let allServices = [];
let allMudurlukler = [];
let allTurler = []; // Tüm unique türler
let serviceMudurlukMap = {}; // Hizmet -> Müdürlük mapping
let bggVeriler = [];

// Excel yükleme
let uploadedFiles = [];
let isUsingCustomData = false;

// ==================== EXCEL YÜKLEME ==================== //

// Excel dosyasını parse et
async function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const buf = e.target.result;
                const wb = XLSX.read(buf, { type: 'array', cellDates: true });

                const result = { hizmetler: [], aciklamalar: {}, merkezler: [] };

                // Hizmetler sayfası
                const hizSheet = wb.Sheets['Hizmetler'];
                if (hizSheet) {
                    const rows = XLSX.utils.sheet_to_json(hizSheet, { cellDates: true });
                    result.hizmetler = rows.map(r => ({
                        mudurluk: (r['Müdürlük'] || '').toString().trim(),
                        hizmet: (r['Hizmet Başlığı'] || '').toString().trim(),
                        tur: (r['Tür'] || '').toString().trim(),
                        lokasyon: (r['Lokasyon'] || '').toString().trim(),
                        veriAraligi: (r['Veri Aralığı'] || '').toString().trim().toLocaleUpperCase('tr-TR'),
                        deger: parseFloat(r['Değer']) || 0,
                        sonTarih: r['Son Tarih']
                    })).filter(r => r.mudurluk && r.hizmet);
                }

                // Açıklamalar sayfası
                const ackSheet = wb.Sheets['Açıklamalar'];
                if (ackSheet) {
                    const rows = XLSX.utils.sheet_to_json(ackSheet);
                    rows.forEach(r => {
                        const key = r['Hizmet Başlığı'] || r['Hizmet'];
                        const val = r['Açıklama'];
                        if (key && val) result.aciklamalar[key.toString().trim()] = val.toString().trim();
                    });
                }

                // Merkezler sayfası
                const merSheet = wb.Sheets['Merkezler'];
                if (merSheet) {
                    const rows = XLSX.utils.sheet_to_json(merSheet);
                    result.merkezler = rows.map(r => {
                        const koordinatStr = (r['KOORDİNATLAR'] || '').toString();
                        const parts = koordinatStr.split(',').map(s => parseFloat(s.trim()));
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
                }

                resolve(result);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// Birden fazla Excel'i birleştir
async function mergeAndLoadExcelData() {
    if (uploadedFiles.length === 0) {
        // Varsayılan veriye dön
        isUsingCustomData = false;
        await loadExcelData();
        return;
    }

    const mergedData = { hizmetler: [], aciklamalar: {}, merkezler: [] };

    for (const file of uploadedFiles) {
        try {
            const data = await parseExcelFile(file);
            mergedData.hizmetler = [...mergedData.hizmetler, ...data.hizmetler];
            mergedData.aciklamalar = { ...mergedData.aciklamalar, ...data.aciklamalar };
            mergedData.merkezler = [...mergedData.merkezler, ...data.merkezler];
        } catch (err) {
            console.error('Dosya parse hatası:', file.name, err);
        }
    }

    // Duplicate temizliği (merkezler için)
    const uniqueMerkezler = [];
    const seenMerkezler = new Set();
    mergedData.merkezler.forEach(m => {
        const key = `${m.mudurluk}-${m.ad}`;
        if (!seenMerkezler.has(key)) {
            seenMerkezler.add(key);
            uniqueMerkezler.push(m);
        }
    });
    mergedData.merkezler = uniqueMerkezler;

    // Global verileri güncelle
    bggVeriler = mergedData.hizmetler.filter(r => r.veriAraligi === 'BGG');

    // Lokasyonları çıkar
    const lokasyonSet = new Set();
    mergedData.hizmetler.forEach(r => {
        if (r.lokasyon && r.lokasyon !== 'Diğer') lokasyonSet.add(r.lokasyon);
    });
    allLocations = Array.from(lokasyonSet).sort((a, b) => {
        if (a === 'İstanbul Geneli') return -1;
        if (b === 'İstanbul Geneli') return 1;
        return a.localeCompare(b, 'tr');
    });

    // Müdürlükleri çıkar
    const mudurlukSet = new Set();
    mergedData.hizmetler.forEach(r => {
        if (r.mudurluk) mudurlukSet.add(r.mudurluk);
    });
    allMudurlukler = Array.from(mudurlukSet).sort((a, b) => a.localeCompare(b, 'tr'));

    // Hizmetleri çıkar
    const hizmetMap = {};
    mergedData.hizmetler.forEach(r => {
        if (!hizmetMap[r.hizmet]) hizmetMap[r.hizmet] = r.mudurluk;
    });
    serviceMudurlukMap = hizmetMap;
    allServices = Object.keys(hizmetMap).sort((a, b) => a.localeCompare(b, 'tr'));

    // Türleri çıkar
    const turSet = new Set();
    mergedData.hizmetler.forEach(r => {
        if (r.tur) turSet.add(r.tur);
    });
    allTurler = Array.from(turSet).sort((a, b) => a.localeCompare(b, 'tr'));

    isUsingCustomData = true;

    // sessionStorage'a kaydet - viewer sayfası bu veriyi kullanacak
    sessionStorage.setItem('customExcelData', JSON.stringify({
        hizmetler: mergedData.hizmetler,
        aciklamalar: mergedData.aciklamalar,
        merkezler: mergedData.merkezler,
        timestamp: Date.now()
    }));

    console.log('Birleştirilmiş veriler:', {
        dosyaSayisi: uploadedFiles.length,
        bgg: bggVeriler.length,
        lokasyonlar: allLocations.length,
        hizmetler: allServices.length
    });
}

// Veriden son tarihi al
function getDataDateLabel() {
    let latestDate = null;
    bggVeriler.forEach(r => {
        if (r.sonTarih && r.sonTarih instanceof Date && !isNaN(r.sonTarih)) {
            if (!latestDate || r.sonTarih > latestDate) {
                latestDate = r.sonTarih;
            }
        }
    });

    if (latestDate) {
        const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
            'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        return `${aylar[latestDate.getMonth()]} ${latestDate.getFullYear()}`;
    }
    return null;
}

// Dosya listesini güncelle
function updateFileListUI() {
    const fileList = document.getElementById('file-list');
    const dateLabel = getDataDateLabel();

    // İstatistikler
    const stats = {
        hizmet: allServices.length,
        mudurluk: allMudurlukler.length,
        lokasyon: allLocations.length,
        tur: allTurler.length
    };

    // Dosya seçilmiş ama henüz uygulanmamış
    if (uploadedFiles.length > 0) {
        fileList.innerHTML = `
            <div class="data-status pending">
                <div class="status-header">📁 ${uploadedFiles.length} dosya seçildi</div>
                <div class="file-names">${uploadedFiles.map(f => f.name).join(', ')}</div>
                <button class="btn-process" id="btn-process-data">⚡ Verileri İşle</button>
            </div>
        `;

        // Verileri İşle butonu
        document.getElementById('btn-process-data').addEventListener('click', async () => {
            await mergeAndLoadExcelData();
            serviceConfig = getDefaultConfig();
            renderTurList();
            renderServiceList();
            uploadedFiles = [];
            renderGallery();
            updateFileListUI();
        });
        return;
    }

    // Veri yüklendi - istatistikleri göster
    const statusClass = isUsingCustomData ? 'custom' : 'default';
    const statusIcon = isUsingCustomData ? '✅' : '📊';
    const statusText = isUsingCustomData ? 'Özel Veri Yüklendi' : 'Varsayılan Veri';

    fileList.innerHTML = `
        <div class="data-status ${statusClass}">
            <div class="status-header">${statusIcon} ${statusText}</div>
            ${dateLabel ? `<div class="status-date">📅 ${dateLabel} verisi</div>` : ''}
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-value">${stats.hizmet}</span>
                    <span class="stat-label">Hizmet</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${stats.mudurluk}</span>
                    <span class="stat-label">Müdürlük</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${stats.lokasyon}</span>
                    <span class="stat-label">Lokasyon</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${stats.tur}</span>
                    <span class="stat-label">Tür</span>
                </div>
            </div>
        </div>
    `;
}

// Dosyaları temizle
function clearUploadedFiles() {
    uploadedFiles = [];
    updateFileListUI();
}

async function loadExcelData() {
    try {
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

            // Lokasyonları çıkar
            const lokasyonSet = new Set();
            data.forEach(r => {
                if (r.lokasyon && r.lokasyon !== 'Diğer') {
                    lokasyonSet.add(r.lokasyon);
                }
            });
            allLocations = Array.from(lokasyonSet).sort((a, b) => {
                if (a === 'İstanbul Geneli') return -1;
                if (b === 'İstanbul Geneli') return 1;
                return a.localeCompare(b, 'tr');
            });

            // Müdürlükleri çıkar
            const mudurlukSet = new Set();
            data.forEach(r => {
                if (r.mudurluk) mudurlukSet.add(r.mudurluk);
            });
            allMudurlukler = Array.from(mudurlukSet).sort((a, b) => a.localeCompare(b, 'tr'));

            // Hizmetleri ve müdürlük ilişkisini çıkar
            const hizmetMap = {};
            data.forEach(r => {
                if (!hizmetMap[r.hizmet]) {
                    hizmetMap[r.hizmet] = r.mudurluk;
                }
            });
            serviceMudurlukMap = hizmetMap;
            allServices = Object.keys(hizmetMap).sort((a, b) => a.localeCompare(b, 'tr'));

            // Tüm türleri çıkar (unique)
            const turSet = new Set();
            data.forEach(r => {
                if (r.tur) turSet.add(r.tur);
            });
            allTurler = Array.from(turSet).sort((a, b) => a.localeCompare(b, 'tr'));

            console.log('Veriler yüklendi:', {
                bgg: bggVeriler.length,
                lokasyonlar: allLocations.length,
                mudurlukler: allMudurlukler.length,
                hizmetler: allServices.length,
                turler: allTurler.length
            });
        }

        return true;
    } catch (error) {
        console.error('Veri yükleme hatası:', error);
        return false;
    }
}

// ==================== CONFIG YÖNETİMİ ==================== //

function getDefaultConfig() {
    const config = {
        services: {},
        turler: {}
    };

    // Tüm hizmetler default açık
    allServices.forEach(hizmet => {
        config.services[hizmet] = true;
    });

    // Tüm türler default açık
    allTurler.forEach(tur => {
        config.turler[tur] = true;
    });

    return config;
}

let serviceConfig = {};

function loadConfig() {
    try {
        const saved = localStorage.getItem('serviceConfig');
        if (saved) {
            serviceConfig = JSON.parse(saved);
            // Yeni türler/hizmetler eklenmişse config'e ekle
            allServices.forEach(h => {
                if (!(h in serviceConfig.services)) serviceConfig.services[h] = true;
            });
            allTurler.forEach(t => {
                if (!(t in serviceConfig.turler)) serviceConfig.turler[t] = true;
            });
        } else {
            serviceConfig = getDefaultConfig();
        }
    } catch (e) {
        serviceConfig = getDefaultConfig();
    }
}

function saveConfig() {
    localStorage.setItem('serviceConfig', JSON.stringify(serviceConfig));
}

function resetConfig() {
    serviceConfig = getDefaultConfig();
    saveConfig();
}

// ==================== UI RENDER ==================== //

function renderTurList() {
    const container = document.getElementById('tur-list');

    if (allTurler.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">Tür bulunamadı</div>';
        return;
    }

    let html = '';
    allTurler.forEach((tur, index) => {
        const isChecked = serviceConfig.turler[tur] !== false;

        html += `
            <div class="tur-item">
                <input type="checkbox" 
                       id="tur-check-${index}" 
                       ${isChecked ? 'checked' : ''}
                       onchange="toggleTur('${tur}', this.checked)">
                <label for="tur-check-${index}">${tur}</label>
            </div>
        `;
    });

    container.innerHTML = html;
}

function renderServiceList() {
    const container = document.getElementById('service-list');

    if (allServices.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">Hizmet bulunamadı</div>';
        return;
    }

    // Müdürlüklere göre grupla
    const mudurlukGroups = {};
    allMudurlukler.forEach(mud => {
        mudurlukGroups[mud] = allServices.filter(h => serviceMudurlukMap[h] === mud);
    });

    let html = '';
    allMudurlukler.forEach((mudurluk, mudIndex) => {
        const hizmetler = mudurlukGroups[mudurluk];
        if (hizmetler.length === 0) return;

        html += `
            <div class="mudurluk-group" id="mudurluk-${mudIndex}">
                <div class="mudurluk-header" onclick="toggleMudurlukExpand(${mudIndex})">
                    <span class="mudurluk-name">${mudurluk}</span>
                    <span class="mudurluk-count">${hizmetler.length} hizmet</span>
                    <button class="mudurluk-expand">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </button>
                </div>
                <div class="mudurluk-services">
                    ${hizmetler.map((hizmet, hIndex) => {
            const isChecked = serviceConfig.services[hizmet] !== false;
            return `
                            <div class="service-item-simple">
                                <input type="checkbox" 
                                       id="service-${mudIndex}-${hIndex}" 
                                       ${isChecked ? 'checked' : ''}
                                       onchange="toggleService('${hizmet}', this.checked)">
                                <label for="service-${mudIndex}-${hIndex}">${hizmet}</label>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function renderGallery() {
    const container = document.getElementById('report-gallery');

    // Aktif hizmetler ve türler
    const activeServices = allServices.filter(h => serviceConfig.services[h] !== false);
    const activeTurler = allTurler.filter(t => serviceConfig.turler[t] !== false);

    // Stats güncelle
    const statsEl = document.getElementById('gallery-stats');
    statsEl.textContent = `${allLocations.length} lokasyon, ${activeServices.length} hizmet, ${activeTurler.length} tür`;

    // Kartları oluştur
    let html = '';
    allLocations.forEach(location => {
        // Bu lokasyon için kaç hizmet var?
        const serviceCount = activeServices.filter(hizmet => {
            return bggVeriler.some(v =>
                v.lokasyon === location &&
                v.hizmet === hizmet &&
                activeTurler.includes(v.tur)
            );
        }).length;

        // URL encode ile location parametresi
        const encodedLocation = encodeURIComponent(location);
        const viewUrl = `viewer.html?location=${encodedLocation}`;

        html += `
            <div class="report-card">
                <div>
                    <h3 class="card-title">${location}</h3>
                </div>
                <div class="card-actions">
                    <a href="${viewUrl}" target="_blank" class="btn-view">
                        Görüntüle
                    </a>
                    <a href="${viewUrl}&autoprint=1" target="_blank" class="btn-download">
                        İndir
                    </a>
                </div>
            </div>
        `;
    });

    if (html === '') {
        html = `
            <div class="empty-state">
                <h3>Gösterilecek rapor yok</h3>
                <p>Lütfen en az bir hizmet ve tür seçin</p>
            </div>
        `;
    }

    container.innerHTML = html;
}

// ==================== EVENT HANDLERS ==================== //

window.toggleTur = function (tur, enabled) {
    serviceConfig.turler[tur] = enabled;
    saveConfig();
    renderGallery();
};

window.toggleService = function (hizmet, enabled) {
    serviceConfig.services[hizmet] = enabled;
    saveConfig();
    renderGallery();
};

window.toggleMudurlukExpand = function (index) {
    const group = document.getElementById(`mudurluk-${index}`);
    group.classList.toggle('expanded');
};

window.openReport = function (location) {
    // Escape karakterlerini geri çevir
    const loc = location.replace(/\\'/g, "'").replace(/&quot;/g, '"');

    // Aktif türleri URL'e ekle
    const activeTurler = allTurler.filter(t => serviceConfig.turler[t] !== false);
    const activeServices = allServices.filter(h => serviceConfig.services[h] !== false);

    // URL parametrelerini oluştur
    const params = new URLSearchParams();
    params.set('location', loc);

    if (activeTurler.length < allTurler.length) {
        params.set('turler', activeTurler.join(','));
    }
    if (activeServices.length < allServices.length) {
        params.set('services', activeServices.join(','));
    }

    const url = `/viewer.html?${params.toString()}`;
    console.log('Rapor açılıyor:', url);
    window.open(url, '_blank');
};

window.downloadReportPDF = function (location) {
    // Escape karakterlerini geri çevir
    const loc = location.replace(/\\'/g, "'").replace(/&quot;/g, '"');

    const activeTurler = allTurler.filter(t => serviceConfig.turler[t] !== false);
    const activeServices = allServices.filter(h => serviceConfig.services[h] !== false);

    // URL parametrelerini oluştur
    const params = new URLSearchParams();
    params.set('location', loc);
    params.set('autoprint', '1');

    if (activeTurler.length < allTurler.length) {
        params.set('turler', activeTurler.join(','));
    }
    if (activeServices.length < allServices.length) {
        params.set('services', activeServices.join(','));
    }

    const url = `/viewer.html?${params.toString()}`;
    console.log('PDF indiriliyor:', url);

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
};

// ==================== INIT ==================== //

async function init() {
    const success = await loadExcelData();

    if (!success) {
        alert('Veriler yüklenemedi. Lütfen sayfayı yenileyin.');
        return;
    }

    loadConfig();

    renderTurList();
    renderServiceList();
    renderGallery();
    updateFileListUI(); // İlk yüklemede istatistikleri göster

    // Anchor tag'lar kullanıldığı için event delegation gerekmiyor

    // Tümünü Seç - Türler
    document.getElementById('btn-select-all-turler').addEventListener('click', () => {
        const allChecked = allTurler.every(t => serviceConfig.turler[t] !== false);
        allTurler.forEach(t => {
            serviceConfig.turler[t] = !allChecked;
        });
        saveConfig();
        renderTurList();
        renderGallery();
    });

    // Tümünü Seç - Hizmetler
    document.getElementById('btn-select-all-services').addEventListener('click', () => {
        const allChecked = allServices.every(s => serviceConfig.services[s] !== false);
        allServices.forEach(s => {
            serviceConfig.services[s] = !allChecked;
        });
        saveConfig();
        renderServiceList();
        renderGallery();
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
        if (confirm('Tüm ayarları varsayılana döndürmek istediğinize emin misiniz?')) {
            resetConfig();
            location.reload();
        }
    });

    document.getElementById('btn-apply').addEventListener('click', () => {
        saveConfig();
        renderGallery();
        alert('Ayarlar kaydedildi!');
    });

    // Service search
    document.getElementById('service-search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const groups = document.querySelectorAll('.mudurluk-group');
        groups.forEach(group => {
            const items = group.querySelectorAll('.service-item-simple');
            let hasVisible = false;
            items.forEach(item => {
                const label = item.querySelector('label').textContent.toLowerCase();
                const matches = label.includes(query);
                item.style.display = matches ? '' : 'none';
                if (matches) hasVisible = true;
            });
            // Müdürlük grubunu gizle/göster
            group.style.display = hasVisible || query === '' ? '' : 'none';
        });
    });

    // Settings dropdown toggle
    const btnSettings = document.getElementById('btn-settings');
    const settingsDropdown = document.getElementById('settings-dropdown');

    btnSettings.addEventListener('click', () => {
        settingsDropdown.classList.toggle('active');
        btnSettings.classList.toggle('active');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!btnSettings.contains(e.target) && !settingsDropdown.contains(e.target)) {
            settingsDropdown.classList.remove('active');
            btnSettings.classList.remove('active');
        }
    });

    // Excel Yükleme Event Listeners
    const excelInput = document.getElementById('excel-input');
    const btnUploadExcel = document.getElementById('btn-upload-excel');
    const btnClearFiles = document.getElementById('btn-clear-files');

    btnUploadExcel.addEventListener('click', () => {
        excelInput.click();
    });

    excelInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            uploadedFiles = [...uploadedFiles, ...files];
            updateFileListUI();
            excelInput.value = ''; // Reset input
        }
    });

    btnClearFiles.addEventListener('click', async () => {
        clearUploadedFiles();
        isUsingCustomData = false;
        await loadExcelData();
        currentConfig = getDefaultConfig();
        renderTurList();
        renderServiceList();
        renderGallery();
    });

    // "Uygula" butonu - Excel verilerini de uygula
    const btnApply = document.getElementById('btn-apply');
    btnApply.addEventListener('click', async () => {
        // Eğer yeni dosya yüklendiyse verileri birleştir
        if (uploadedFiles.length > 0) {
            await mergeAndLoadExcelData();
            currentConfig = getDefaultConfig();
            renderTurList();
            renderServiceList();
            uploadedFiles = []; // Dosyaları temizle (veriler yüklendi)
        }
        applyConfig();
        renderGallery();
        updateFileListUI(); // Tarih bilgisini güncelle
        settingsDropdown.classList.remove('active');
        btnSettings.classList.remove('active');
    });

    console.log('Galeri başlatıldı');
}

init();
