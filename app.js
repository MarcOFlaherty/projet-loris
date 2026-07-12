/* ==========================================================================
   Observatoire des Établissements Scolaires Fermés - JavaScript Controller
   ========================================================================== */

// Global state
const state = {
    // Filtres géographiques cascadants (région → département → commune)
    geo: {
        region:  { code: '', name: '' }, // code_region (numérique, ex "84")
        dept:    { code: '', name: '' }, // code_departement au format API (3 car., ex "007")
        commune: { code: '', name: '' }  // code_commune INSEE (5 car., ex "07216")
    },
    query: '',            // search bar query
    yearFilter: '',       // select year filter
    nature: '',           // select school type filter
    page: 1,
    limit: 10,
    totalCount: 0
};

// API Base
const API_BASE = "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-etablissements-fermes/records";

// Chart.js instances
let chartEvolutionInstance = null;
let chartNatureInstance = null;
let chartSectorInstance = null;

// Helper to pad department code to 3 characters for the API
function getApiDeptCode(code) {
    if (!code) return '';
    code = code.trim();
    if (code.length === 2) {
        return '0' + code; // e.g. "07" -> "007", "72" -> "072", "2A" -> "02A"
    }
    return code; // e.g. "974" -> "974"
}

// Build the global ODSQL 'where' filter string
function buildWhereClause() {
    let clauses = [];

    // Filtres géographiques (cumulatifs : région, département, commune)
    if (state.geo.region.code) {
        clauses.push(`code_region="${state.geo.region.code}"`);
    }
    if (state.geo.dept.code) {
        clauses.push(`code_departement="${state.geo.dept.code}"`);
    }
    if (state.geo.commune.code) {
        clauses.push(`code_commune="${state.geo.commune.code}"`);
    }

    // Year filter
    if (state.yearFilter) {
        switch (state.yearFilter) {
            case 'recent':
                clauses.push('year(date_fermeture) >= 2020');
                break;
            case '2010s':
                clauses.push('year(date_fermeture) >= 2010 and year(date_fermeture) <= 2019');
                break;
            case '2000s':
                clauses.push('year(date_fermeture) >= 2000 and year(date_fermeture) <= 2009');
                break;
            case '1990s':
                clauses.push('year(date_fermeture) >= 1990 and year(date_fermeture) <= 1999');
                break;
            case 'old':
                clauses.push('year(date_fermeture) < 1990');
                break;
        }
    }

    // Nature filter
    if (state.nature) {
        clauses.push(`nature_uai_libe="${state.nature}"`);
    }

    // Search query
    if (state.query) {
        let q = state.query.trim().replace(/"/g, '\\"');
        if (q.length > 0) {
            clauses.push(`(appellation_officielle like "${q}" or libelle_commune like "${q}" or numero_uai like "${q}" or code_postal_uai like "${q}" or localite_acheminement_uai like "${q}")`);
        }
    }

    return clauses.length > 0 ? clauses.join(' and ') : '';
}

// Show/Hide page loader
function showLoader(show) {
    const loader = document.getElementById('app-loader');
    if (show) {
        loader.classList.remove('hidden');
    } else {
        loader.classList.add('hidden');
    }
}

// Initialize Charts with dark mode styling and premium look
function initCharts() {
    // Shared chart options for dark mode
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 11;

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: {
                    color: '#f8fafc',
                    font: { family: "'Outfit', sans-serif", weight: 500 }
                }
            }
        }
    };

    // 1. Evolution Line Chart
    const ctxEvolution = document.getElementById('chart-evolution').getContext('2d');
    chartEvolutionInstance = new Chart(ctxEvolution, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Nombre de fermetures',
                data: [],
                borderColor: '#6366f1', // Indigo
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#8b5cf6',
                pointHoverRadius: 6
            }]
        },
        options: {
            ...chartOptions,
            plugins: {
                ...chartOptions.plugins,
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#64748b' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#64748b' },
                    beginAtZero: true
                }
            }
        }
    });

    // 2. Nature Horizontal Bar Chart
    const ctxNature = document.getElementById('chart-nature').getContext('2d');
    chartNatureInstance = new Chart(ctxNature, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Fermetures',
                data: [],
                backgroundColor: 'rgba(236, 72, 153, 0.75)', // Hot Pink
                borderColor: '#ec4899',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            ...chartOptions,
            indexAxis: 'y',
            plugins: {
                ...chartOptions.plugins,
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#64748b' },
                    beginAtZero: true
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });

    // 3. Sector/Degree structure Donut Chart
    const ctxSector = document.getElementById('chart-sector').getContext('2d');
    chartSectorInstance = new Chart(ctxSector, {
        type: 'doughnut',
        data: {
            labels: ['Maternelles', 'Élémentaires', 'Second Degré / Autres'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: [
                    '#ec4899', // Pink
                    '#6366f1', // Indigo
                    '#06b6d4'  // Cyan
                ],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            ...chartOptions,
            plugins: {
                ...chartOptions.plugins,
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 12, padding: 15 }
                }
            },
            cutout: '65%'
        }
    });
}

// Fetch dashboard KPIs and charts aggregation data
async function fetchDashboardStats(where) {
    try {
        // 1. Get Sums for Degree Breakdown and KPIs
        let sumsUrl = `${API_BASE}?select=sum(ecole_maternelle)%20as%20mats,sum(ecole_elementaire)%20as%20elems,count(numero_uai)%20as%20total&limit=1`;
        if (where) sumsUrl += `&where=${encodeURIComponent(where)}`;
        
        const sumsRes = await fetch(sumsUrl);
        const sumsData = await sumsRes.json();
        
        let total = 0, matCount = 0, elemCount = 0;
        if (sumsData.results && sumsData.results.length > 0) {
            const res = sumsData.results[0];
            total = res.total || 0;
            matCount = res.mats || 0;
            elemCount = res.elems || 0;
        }
        
        let primaryCount = matCount + elemCount;
        let secondaryCount = total - primaryCount;

        // Update KPIs on UI
        document.getElementById('kpi-total').textContent = total.toLocaleString('fr-FR');
        document.getElementById('kpi-primary').textContent = primaryCount.toLocaleString('fr-FR');
        document.getElementById('kpi-secondary').textContent = secondaryCount.toLocaleString('fr-FR');

        // Update Donut Chart
        chartSectorInstance.data.datasets[0].data = [matCount, elemCount, secondaryCount];
        chartSectorInstance.update();

        // 2. Fetch Time Evolution data
        let evolUrl = `${API_BASE}?group_by=year(date_fermeture)&select=year(date_fermeture)%20as%20annee,count(numero_uai)%20as%20total&order_by=year(date_fermeture)%20asc&limit=100`;
        if (where) evolUrl += `&where=${encodeURIComponent(where)}`;
        
        const evolRes = await fetch(evolUrl);
        const evolData = await evolRes.json();
        
        const years = [];
        const yearCounts = [];
        if (evolData.results) {
            evolData.results.forEach(item => {
                const yearVal = item['year(date_fermeture)'];
                if (yearVal) {
                    years.push(yearVal);
                    yearCounts.push(item.total || 0);
                }
            });
        }
        
        chartEvolutionInstance.data.labels = years;
        chartEvolutionInstance.data.datasets[0].data = yearCounts;
        chartEvolutionInstance.update();

        // 3. Fetch Nature types distribution data
        let natureUrl = `${API_BASE}?group_by=nature_uai_libe&select=nature_uai_libe,count(numero_uai)%20as%20total&order_by=total%20desc&limit=6`;
        if (where) natureUrl += `&where=${encodeURIComponent(where)}`;
        
        const natureRes = await fetch(natureUrl);
        const natureData = await natureRes.json();
        
        const natures = [];
        const natureCounts = [];
        if (natureData.results) {
            natureData.results.forEach(item => {
                if (item.nature_uai_libe) {
                    // Shorten labels for nicer display
                    let shortLabel = item.nature_uai_libe
                        .replace("ECOLE DE NIVEAU ELEMENTAIRE SPECIALISEE", "ÉLÉMENTAIRE SPÉ.")
                        .replace("ECOLE DE NIVEAU ELEMENTAIRE", "ÉLÉMENTAIRE")
                        .replace("SECTION ENSEIGNT GEN. ET PROF. ADAPTE", "SEGPA")
                        .replace("LYCEE D ENSEIGNEMENT GENERAL", "LYCÉE GÉNÉRAL")
                        .replace("LYCEE D ENSEIGNEMENT TECHNOLOGIQUE", "LYCÉE TECH.");
                    natures.push(shortLabel);
                    natureCounts.push(item.total || 0);
                }
            });
        }
        
        chartNatureInstance.data.labels = natures;
        chartNatureInstance.data.datasets[0].data = natureCounts;
        chartNatureInstance.update();

        // 4. Update Geo rankings summary list
        await fetchGeoRankings(where);

    } catch (e) {
        console.error("Erreur lors de la récupération des statistiques:", e);
    }
}

// Fetch and display dynamic geographic rankings list (sidebar list)
async function fetchGeoRankings(where) {
    const listElement = document.getElementById('geo-rankings-list');
    const titleElement = document.getElementById('geo-summary-title');
    listElement.innerHTML = '<li class="ranking-placeholder">Chargement...</li>';

    try {
        let url = '';
        let targetLevel = '';

        if (state.geo.dept.code) {
            // Un département est filtré : communes les plus touchées
            titleElement.innerHTML = '<i class="fa-solid fa-list-ol"></i> Communes les plus touchées';
            url = `${API_BASE}?group_by=libelle_commune,code_commune&select=libelle_commune,code_commune,count(numero_uai)%20as%20total&order_by=total%20desc&limit=10`;
            targetLevel = 'commune';
        } else if (state.geo.region.code) {
            // Une région est filtrée : départements les plus touchés
            titleElement.innerHTML = '<i class="fa-solid fa-list-ol"></i> Départements les plus touchés';
            url = `${API_BASE}?group_by=libelle_departement,code_departement&select=libelle_departement,code_departement,count(numero_uai)%20as%20total&order_by=total%20desc&limit=10`;
            targetLevel = 'department';
        } else {
            // Aucun filtre : top départements de France
            titleElement.innerHTML = '<i class="fa-solid fa-list-ol"></i> Top Départements Touchés';
            url = `${API_BASE}?group_by=libelle_departement,code_departement&select=libelle_departement,code_departement,count(numero_uai)%20as%20total&order_by=total%20desc&limit=10`;
            targetLevel = 'department';
        }

        if (where) url += `&where=${encodeURIComponent(where)}`;

        const res = await fetch(url);
        const data = await res.json();

        listElement.innerHTML = '';
        if (data.results && data.results.length > 0) {
            data.results.forEach((item, index) => {
                const li = document.createElement('li');
                let name = '';
                let code = '';
                let total = item.total || 0;

                if (targetLevel === 'commune') {
                    name = item.libelle_commune;
                    code = item.code_commune;
                } else {
                    name = item.libelle_departement;
                    code = item.code_departement;
                }

                if (!name) return;

                li.innerHTML = `
                    <div class="rank-details">
                        <span class="rank-number">${index + 1}</span>
                        <span class="rank-name">${name} <small class="text-muted">(${code})</small></span>
                    </div>
                    <span class="rank-badge">${total} fermetures</span>
                `;

                // Clic sur un élément du classement → applique le filtre correspondant
                if (targetLevel === 'department') {
                    li.addEventListener('click', () => {
                        // code API "007" → code carte "07"
                        let cleanCode = code;
                        if (code.length === 3 && code.startsWith('0')) {
                            cleanCode = code.substring(1);
                        }
                        selectDepartmentFromMap(cleanCode, name);
                    });
                } else if (targetLevel === 'commune') {
                    li.addEventListener('click', () => {
                        selectCommune(code, name);
                    });
                }
                
                listElement.appendChild(li);
            });
        } else {
            listElement.innerHTML = '<li class="ranking-placeholder">Aucune donnée géographique</li>';
        }

    } catch (e) {
        console.error("Erreur rankings géographiques:", e);
        listElement.innerHTML = '<li class="ranking-placeholder text-rose">Erreur de chargement</li>';
    }
}

// Fetch and display individual school list (table + pagination)
async function fetchSchoolsTable(where) {
    const tbody = document.getElementById('schools-table-body');
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    const pagInfo = document.getElementById('pagination-info');
    
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Chargement des établissements...</td></tr>';
    
    try {
        const offset = (state.page - 1) * state.limit;
        let url = `${API_BASE}?limit=${state.limit}&offset=${offset}&order_by=date_fermeture%20desc`;
        
        if (where) url += `&where=${encodeURIComponent(where)}`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        tbody.innerHTML = '';
        state.totalCount = data.total_count || 0;
        
        if (data.results && data.results.length > 0) {
            data.results.forEach(school => {
                const tr = document.createElement('tr');
                
                const name = school.appellation_officielle || school.denomination_principale || "Établissement Sans Nom";
                const commune = school.libelle_commune || "-";
                const codePostal = school.code_postal_uai || "-";
                const nature = school.nature_uai_libe || "-";
                const sector = school.secteur_public_prive_libe || "-";
                const openYear = school.date_ouverture ? school.date_ouverture.substring(0, 4) : "?";
                const closeYear = school.date_fermeture ? school.date_fermeture.substring(0, 4) : "?";
                
                // Coordinates check
                const hasGeo = school.latitude && school.longitude;
                let mapBtn = '';
                if (hasGeo) {
                    mapBtn = `
                        <button class="btn-icon btn-zoom-school" 
                                data-lat="${school.latitude}" 
                                data-lon="${school.longitude}" 
                                data-name="${name.replace(/"/g, '&quot;')}"
                                data-uai="${school.numero_uai}"
                                data-ouverture="${openYear}"
                                data-fermeture="${closeYear}"
                                data-info="${commune} (${codePostal})"
                                title="Zoomer sur cet établissement">
                            <i class="fa-solid fa-crosshairs"></i>
                        </button>
                    `;
                } else {
                    mapBtn = '<span class="text-muted" title="Non géolocalisé">-</span>';
                }
                
                tr.innerHTML = `
                    <td><code>${school.numero_uai}</code></td>
                    <td title="${name}"><strong>${name}</strong></td>
                    <td>${commune} <small class="text-muted">(${codePostal})</small></td>
                    <td><small>${nature}</small></td>
                    <td>${openYear} - <span class="text-rose">${closeYear}</span></td>
                    <td>${sector}</td>
                    <td class="actions-col">${mapBtn}</td>
                `;
                tbody.appendChild(tr);
            });
            
            // Add zoom listeners to buttons
            document.querySelectorAll('.btn-zoom-school').forEach(btn => {
                btn.addEventListener('click', function() {
                    const lat = parseFloat(this.getAttribute('data-lat'));
                    const lon = parseFloat(this.getAttribute('data-lon'));
                    const name = this.getAttribute('data-name');
                    const uai = this.getAttribute('data-uai');
                    const openYear = this.getAttribute('data-ouverture');
                    const closeYear = this.getAttribute('data-fermeture');
                    const info = this.getAttribute('data-info');
                    
                    // Zoom map frame
                    zoomToCoordinates(lat, lon, name, uai, openYear, closeYear, info);
                });
            });

            // Update Pagination state
            const start = offset + 1;
            const end = Math.min(offset + state.limit, state.totalCount);
            pagInfo.textContent = `Affichage de ${start} à ${end} sur ${state.totalCount.toLocaleString('fr-FR')} établissements`;
            
            prevBtn.disabled = state.page === 1;
            nextBtn.disabled = end >= state.totalCount;
            
        } else {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Aucun établissement trouvé avec ces filtres.</td></tr>';
            pagInfo.textContent = "Affichage de 0 à 0 sur 0 établissements";
            prevBtn.disabled = true;
            nextBtn.disabled = true;
        }
        
    } catch (e) {
        console.error("Erreur lors de la récupération du tableau d'écoles:", e);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-rose">Erreur lors de la récupération des données.</td></tr>';
    }
}

// Zoom map iframe to precise school coordinates
function zoomToCoordinates(lat, lon, name, uai, openYear, closeYear, info) {
    const iframe = document.getElementById('map-frame');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
            type: 'ZOOM_TO_COORDINATES',
            lat: lat,
            lon: lon,
            name: name,
            uai: uai,
            ouverture: openYear,
            fermeture: closeYear,
            info: info
        }, '*');
        
        // Scroll map frame into view smoothly on mobile devices
        if (window.innerWidth < 1024) {
            iframe.scrollIntoView({ behavior: 'smooth' });
        }
    }
}

// Reset map in iframe
function resetMap() {
    const iframe = document.getElementById('map-frame');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'RESET_MAP' }, '*');
    }
}

// Main trigger to reload the entire dashboard
async function updateDashboard(statsOnly = false) {
    showLoader(true);
    const where = buildWhereClause();
    
    // 1. Load KPI cards and Charts
    await fetchDashboardStats(where);
    
    // 2. Load Table (if not restricted to stats)
    if (!statsOnly) {
        await fetchSchoolsTable(where);
    }
    
    // Badge de filtre actif (niveau géographique le plus fin sélectionné)
    const badge = document.getElementById('active-filter-container');
    const badgeName = document.getElementById('active-filter-name');
    const searchSubtitle = document.getElementById('search-subtitle');

    let activeGeoLabel = '';
    if (state.geo.commune.code) {
        activeGeoLabel = `Commune : ${state.geo.commune.name}`;
    } else if (state.geo.dept.code) {
        activeGeoLabel = `Dépt. : ${state.geo.dept.name}`;
    } else if (state.geo.region.code) {
        activeGeoLabel = `Région : ${state.geo.region.name}`;
    }

    if (activeGeoLabel) {
        badgeName.textContent = activeGeoLabel;
        badge.style.display = 'flex';
        searchSubtitle.innerHTML = `Affichage des résultats pour : <strong>${activeGeoLabel}</strong>`;
    } else {
        badge.style.display = 'none';
        searchSubtitle.textContent = "Recherche dans la France entière";
    }
    
    showLoader(false);
}

/* ---------------------------------------------------------------------------
   Filtres géographiques cascadants : Région → Département → Commune
   --------------------------------------------------------------------------- */

// Remplit un <select> avec des options {value, label, name}
function populateSelect(selectEl, items, placeholder) {
    selectEl.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = placeholder;
    selectEl.appendChild(ph);
    items.forEach(it => {
        const opt = document.createElement('option');
        opt.value = it.value;
        opt.textContent = it.label;
        if (it.name) opt.dataset.name = it.name;
        selectEl.appendChild(opt);
    });
}

// Charge la liste des régions (au démarrage)
async function loadRegions() {
    const selectEl = document.getElementById('filter-region');
    try {
        const url = `${API_BASE}?select=code_region,libelle_region,count(numero_uai)%20as%20total&group_by=code_region,libelle_region&order_by=libelle_region%20asc&limit=100`;
        const data = await (await fetch(url)).json();
        const items = (data.results || [])
            .filter(r => r.code_region != null && r.libelle_region)
            .map(r => ({ value: String(r.code_region), name: r.libelle_region, label: `${r.libelle_region} (${r.total})` }));
        populateSelect(selectEl, items, 'Toutes les régions');
    } catch (e) {
        console.error('Erreur chargement régions:', e);
    }
}

// Charge les départements (filtrés par région si fournie)
async function loadDepartements(regionCode) {
    const selectEl = document.getElementById('filter-departement');
    try {
        let url = `${API_BASE}?select=code_departement,libelle_departement,count(numero_uai)%20as%20total&group_by=code_departement,libelle_departement&order_by=libelle_departement%20asc&limit=200`;
        if (regionCode) url += `&where=${encodeURIComponent(`code_region="${regionCode}"`)}`;
        const data = await (await fetch(url)).json();
        const items = (data.results || [])
            .filter(d => d.code_departement != null && d.libelle_departement)
            .map(d => ({ value: String(d.code_departement), name: d.libelle_departement, label: `${d.libelle_departement} (${d.total})` }));
        populateSelect(selectEl, items, 'Tous les départements');
    } catch (e) {
        console.error('Erreur chargement départements:', e);
    }
}

// Charge les communes du département fourni
async function loadCommunes(deptCode) {
    const selectEl = document.getElementById('filter-commune');
    if (!deptCode) {
        populateSelect(selectEl, [], "Choisir un département d'abord");
        selectEl.disabled = true;
        return;
    }
    try {
        const where = encodeURIComponent(`code_departement="${deptCode}"`);
        const url = `${API_BASE}?select=code_commune,libelle_commune,count(numero_uai)%20as%20total&group_by=code_commune,libelle_commune&where=${where}&order_by=libelle_commune%20asc&limit=1000`;
        const data = await (await fetch(url)).json();
        const items = (data.results || [])
            .filter(c => c.code_commune != null && c.libelle_commune)
            .map(c => ({ value: String(c.code_commune), name: c.libelle_commune, label: `${c.libelle_commune} (${c.total})` }));
        populateSelect(selectEl, items, 'Toutes les communes');
        selectEl.disabled = false;
    } catch (e) {
        console.error('Erreur chargement communes:', e);
    }
}

// --- Sélection depuis les menus déroulants ---

async function onRegionChange(code, name) {
    state.geo.region = { code, name };
    state.geo.dept = { code: '', name: '' };
    state.geo.commune = { code: '', name: '' };
    state.page = 1;
    await loadDepartements(code);
    await loadCommunes('');           // réinitialise + désactive les communes
    document.getElementById('filter-departement').value = '';
    updateDashboard();
}

async function onDeptChange(code, name) {
    state.geo.dept = { code, name };
    state.geo.commune = { code: '', name: '' };
    state.page = 1;
    await loadCommunes(code);
    document.getElementById('filter-commune').value = '';
    updateDashboard();
}

function selectCommune(code, name) {
    state.geo.commune = { code, name };
    state.page = 1;
    document.getElementById('filter-commune').value = code;
    updateDashboard();
}

// Réinitialise uniquement les filtres géographiques (badge / clic sur la croix)
async function clearGeoFilters() {
    state.geo.region = { code: '', name: '' };
    state.geo.dept = { code: '', name: '' };
    state.geo.commune = { code: '', name: '' };
    state.page = 1;
    document.getElementById('filter-region').value = '';
    document.getElementById('filter-departement').value = '';
    await loadDepartements('');
    await loadCommunes('');
    resetMap();
    updateDashboard();
}

// --- Sélection depuis la carte / le classement ---

// Région cliquée sur la carte (code GeoJSON == code_region)
async function selectRegionFromMap(code, name) {
    document.getElementById('filter-region').value = String(code);
    await onRegionChange(String(code), name);
}

// Département cliqué sur la carte / le classement (code carte 2 car., ex "07")
async function selectDepartmentFromMap(geoCode, name) {
    const apiCode = getApiDeptCode(String(geoCode));

    // Retrouve la région parente pour positionner correctement les menus
    let region = { code: '', name: '' };
    try {
        const where = encodeURIComponent(`code_departement="${apiCode}"`);
        const url = `${API_BASE}?select=code_region,libelle_region&group_by=code_region,libelle_region&where=${where}&limit=1`;
        const data = await (await fetch(url)).json();
        if (data.results && data.results.length > 0 && data.results[0].code_region != null) {
            region = { code: String(data.results[0].code_region), name: data.results[0].libelle_region };
        }
    } catch (e) {
        console.error('Erreur région parente:', e);
    }

    state.geo.region = region;
    state.geo.dept = { code: apiCode, name };
    state.geo.commune = { code: '', name: '' };
    state.page = 1;

    // Synchronise les menus déroulants
    document.getElementById('filter-region').value = region.code;
    await loadDepartements(region.code);
    document.getElementById('filter-departement').value = apiCode;
    await loadCommunes(apiCode);
    document.getElementById('filter-commune').value = '';

    updateDashboard();
}

// Réinitialise tous les filtres et le zoom de la carte
async function resetAllFilters() {
    state.geo.region = { code: '', name: '' };
    state.geo.dept = { code: '', name: '' };
    state.geo.commune = { code: '', name: '' };
    state.query = '';
    state.yearFilter = '';
    state.nature = '';
    state.page = 1;

    // Réinitialise les champs du DOM
    document.getElementById('search-query').value = '';
    document.getElementById('filter-year').value = '';
    document.getElementById('filter-nature').value = '';
    document.getElementById('filter-region').value = '';
    document.getElementById('filter-departement').value = '';
    await loadDepartements('');   // recharge tous les départements
    await loadCommunes('');       // réinitialise + désactive les communes

    // Réinitialise le zoom de la carte
    resetMap();

    // Recharge le tableau de bord
    updateDashboard();
}

// Main initialization function
document.addEventListener('DOMContentLoaded', () => {
    // 1. Render charts structure
    initCharts();
    
    // 2. Event listeners for UI controls
    document.getElementById('btn-reset-all').addEventListener('click', resetAllFilters);
    document.getElementById('btn-clear-filter-badge').addEventListener('click', () => {
        clearGeoFilters();
    });
    
    // Text search debouncing/triggers
    let searchTimeout = null;
    document.getElementById('search-query').addEventListener('input', (e) => {
        state.query = e.target.value;
        state.page = 1; // reset page on search
        
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            updateDashboard();
        }, 400); // 400ms debounce
    });
    
    // Filters selects
    document.getElementById('filter-year').addEventListener('change', (e) => {
        state.yearFilter = e.target.value;
        state.page = 1;
        updateDashboard();
    });
    
    document.getElementById('filter-nature').addEventListener('change', (e) => {
        state.nature = e.target.value;
        state.page = 1;
        updateDashboard();
    });

    // Filtres géographiques cascadants
    document.getElementById('filter-region').addEventListener('change', (e) => {
        const opt = e.target.options[e.target.selectedIndex];
        onRegionChange(e.target.value, e.target.value ? (opt.dataset.name || opt.text) : '');
    });
    document.getElementById('filter-departement').addEventListener('change', (e) => {
        const opt = e.target.options[e.target.selectedIndex];
        onDeptChange(e.target.value, e.target.value ? (opt.dataset.name || opt.text) : '');
    });
    document.getElementById('filter-commune').addEventListener('change', (e) => {
        const opt = e.target.options[e.target.selectedIndex];
        selectCommune(e.target.value, e.target.value ? (opt.dataset.name || opt.text) : '');
    });

    // Pagination buttons
    document.getElementById('btn-prev').addEventListener('click', () => {
        if (state.page > 1) {
            state.page--;
            fetchSchoolsTable(buildWhereClause());
        }
    });
    
    document.getElementById('btn-next').addEventListener('click', () => {
        state.page++;
        fetchSchoolsTable(buildWhereClause());
    });

    // 3. Listen for postMessages coming from Folium map (iframe)
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SELECT_AREA') {
            const data = event.data;
            if (data.level === 'region') {
                selectRegionFromMap(data.code, data.name);
            } else if (data.level === 'department') {
                selectDepartmentFromMap(data.code, data.name);
            }
        }
    });

    // 4. Chargement initial : régions + départements + tableau de bord
    loadRegions();
    loadDepartements('');
    updateDashboard();
});
