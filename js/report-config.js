// ==================== RAPOR KONFİGÜRASYON YÖNETİCİSİ ==================== //

export class ReportConfig {
    constructor() {
        this.config = this.loadFromStorage() || this.getDefaultConfig();
    }

    getDefaultConfig() {
        return {
            // Ara kapak sayfaları
            sectionPages: {
                enabled: true,
                titleFormat: "{mudurluk} - Hizmet Raporu",
                showDescription: true
            },

            // Hizmetler (dinamik olarak doldurulacak)
            services: {},

            // Lokasyonlar (dinamik olarak doldurulacak)
            locations: {
                all: true,
                selected: []
            },

            // Görüntüleme seçenekleri
            displayOptions: {
                showCover: true,
                showFooter: true,
                pageNumbering: true
            }
        };
    }

    // LocalStorage'dan yükle
    loadFromStorage() {
        try {
            const saved = localStorage.getItem('reportConfig');
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            console.error('Config yükleme hatası:', e);
            return null;
        }
    }

    // LocalStorage'a kaydet
    save() {
        try {
            localStorage.setItem('reportConfig', JSON.stringify(this.config));
            return true;
        } catch (e) {
            console.error('Config kaydetme hatası:', e);
            return false;
        }
    }

    // Varsayılana dön
    reset() {
        this.config = this.getDefaultConfig();
        this.save();
    }

    // Hizmet konfigürasyonu ayarla
    setServiceEnabled(serviceName, enabled) {
        if (!this.config.services[serviceName]) {
            this.config.services[serviceName] = {
                enabled: true,
                breakdowns: {
                    byLocation: true,
                    byType: true,
                    cumulative: true,
                    monthly: true
                }
            };
        }
        this.config.services[serviceName].enabled = enabled;
    }

    // Kırılım ayarla
    setServiceBreakdown(serviceName, breakdown, enabled) {
        if (!this.config.services[serviceName]) {
            this.setServiceEnabled(serviceName, true);
        }
        this.config.services[serviceName].breakdowns[breakdown] = enabled;
    }

    // Lokasyon seçimi ayarla
    setLocationEnabled(location, enabled) {
        if (enabled) {
            if (!this.config.locations.selected.includes(location)) {
                this.config.locations.selected.push(location);
            }
        } else {
            this.config.locations.selected = this.config.locations.selected.filter(l => l !== location);
        }

        // Tümünü seç bayrağını güncelle
        this.config.locations.all = this.config.locations.selected.length === 0;
    }

    // Tüm hizmetleri seç/kaldır
    setAllServices(enabled) {
        Object.keys(this.config.services).forEach(serviceName => {
            this.config.services[serviceName].enabled = enabled;
        });
    }

    // Tüm lokasyonları seç/kaldır
    setAllLocations(enabled) {
        if (enabled) {
            this.config.locations.all = true;
            this.config.locations.selected = [];
        } else {
            this.config.locations.all = false;
        }
    }

    // Aktif lokasyonları al
    getActiveLocations(allLocations) {
        if (this.config.locations.all || this.config.locations.selected.length === 0) {
            return allLocations;
        }
        return this.config.locations.selected;
    }

    // Aktif hizmetleri al
    getActiveServices() {
        return Object.keys(this.config.services).filter(
            serviceName => this.config.services[serviceName].enabled
        );
    }

    // Hizmetin kırılımlarını al
    getServiceBreakdowns(serviceName) {
        return this.config.services[serviceName]?.breakdowns || {
            byLocation: true,
            byType: true,
            cumulative: true,
            monthly: true
        };
    }

    // Config'i URL parametresine çevir
    toURLParams() {
        const params = new URLSearchParams();

        // Aktif hizmetleri ekle
        const activeServices = this.getActiveServices();
        if (activeServices.length > 0) {
            params.set('services', activeServices.join(','));
        }

        // Lokasyonları ekle
        if (!this.config.locations.all && this.config.locations.selected.length > 0) {
            params.set('locations', this.config.locations.selected.join(','));
        }

        // Section pages
        if (!this.config.sectionPages.enabled) {
            params.set('noSections', '1');
        }

        return params.toString();
    }

    // URL parametrelerinden config oluştur
    static fromURLParams(urlParams) {
        const config = new ReportConfig();

        const services = urlParams.get('services');
        if (services) {
            const serviceList = services.split(',');
            Object.keys(config.config.services).forEach(serviceName => {
                config.config.services[serviceName].enabled = serviceList.includes(serviceName);
            });
        }

        const locations = urlParams.get('locations');
        if (locations) {
            config.config.locations.all = false;
            config.config.locations.selected = locations.split(',');
        }

        const noSections = urlParams.get('noSections');
        if (noSections === '1') {
            config.config.sectionPages.enabled = false;
        }

        return config;
    }
}

// Export singleton instance
export const reportConfigManager = new ReportConfig();
