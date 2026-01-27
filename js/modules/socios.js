/**
 * INKA CORP - Módulo de Socios
 * Gestión de socios con tarjetas elegantes
 */

// ==========================================
// ESTADO DEL MÓDULO
// ==========================================
let allSocios = [];
let filteredSocios = [];
let currentSocioFilter = 'todos';
let currentPaisFilterSocios = '';
let currentSearchTerm = '';
let currentSociosFilterMode = 'categoria'; // 'categoria' | 'pais'

const ESTADOS_CREDITO_VIGENTE = ['ACTIVO', 'MOROSO', 'PAUSADO'];

// ==========================================
// CACHÉ DE FOTOS DE PERFIL
// ==========================================
const FOTO_CACHE_KEY = 'inkacorp_fotos_cache';
const FOTO_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas

function getFotosCache() {
    try {
        const cached = localStorage.getItem(FOTO_CACHE_KEY);
        if (!cached) return {};
        return JSON.parse(cached);
    } catch (e) {
        return {};
    }
}

function setFotoCache(idsocio, fotoUrl) {
    try {
        const cache = getFotosCache();
        cache[idsocio] = {
            url: fotoUrl,
            timestamp: Date.now()
        };
        localStorage.setItem(FOTO_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.warn('Error cacheando foto:', e);
    }
}

function getCachedFoto(idsocio) {
    const cache = getFotosCache();
    const entry = cache[idsocio];
    if (!entry) return null;

    // Verificar si expiró
    if (Date.now() - entry.timestamp > FOTO_CACHE_DURATION) {
        return null;
    }
    return entry.url;
}

// Mapeo de países a banderas

// Mapeo de países a banderas
const PAIS_CONFIG_SOCIOS = {
    'ECUADOR': { code: 'EC', flag: 'https://flagcdn.com/w20/ec.png' },
    'ESTADOS UNIDOS': { code: 'US', flag: 'https://flagcdn.com/w20/us.png' },
    'USA': { code: 'US', flag: 'https://flagcdn.com/w20/us.png' },
    'PERÚ': { code: 'PE', flag: 'https://flagcdn.com/w20/pe.png' },
    'PERU': { code: 'PE', flag: 'https://flagcdn.com/w20/pe.png' }
};

function normalizePaisSocios(pais) {
    if (!pais) return '';
    const normalized = String(pais)
        .toUpperCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    if (normalized === 'ESTADOS UNIDOS' || normalized === 'UNITED STATES' || normalized === 'UNITED STATES OF AMERICA') {
        return 'USA';
    }
    if (normalized === 'PERU' || normalized === 'PERU\u0301' || normalized === 'PERU\u0301 ') {
        return 'PERU';
    }
    if (normalized === 'USA') return 'USA';
    return normalized;
}

function setSociosFilterMode(mode) {
    currentSociosFilterMode = mode;

    // En este flujo, no deshabilitamos: solo limpiamos la UI del grupo opuesto
    if (mode === 'categoria') {
        document.querySelectorAll('.pais-filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    } else {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    }
}

// ==========================================
// INICIALIZACIÓN
// ==========================================
function initSociosModule() {
    console.log('Inicializando módulo Socios...');

    // Si la vista de Socios aún no está montada, no inicializar.
    // Esto evita errores cuando el archivo se carga globalmente desde index.html.
    const sociosGrid = document.getElementById('socios-grid');
    if (!sociosGrid) {
        console.warn('Vista de Socios no encontrada en el DOM. Se omite initSociosModule().');
        return;
    }

    // Exponer funciones globalmente
    window.filterSocios = filterSocios;
    window.filterSociosByPais = filterSociosByPais;
    window.searchSocios = searchSocios;
    window.refreshSocios = refreshSocios;
    window.showSocioDetails = showSocioDetails;

    setSociosFilterMode('categoria');
    loadSocios();
}

// ==========================================
// CARGAR DATOS (Patrón: Caché Instantáneo + Actualización en Segundo Plano)
// ==========================================
async function loadSocios(forceRefresh = false) {
    try {
        const sociosGrid = document.getElementById('socios-grid');

        // PASO 1: Mostrar datos de caché INMEDIATAMENTE si existen
        if (!forceRefresh && window.hasCacheData && window.hasCacheData('socios')) {
            console.log('⚡ Mostrando socios desde caché (instantáneo)');
            const sociosFromCache = window.getCacheData('socios');

            // Verificar si el caché tiene el nuevo campo 'amortizacion' necesario para la mora
            // Buscamos algún socio que tenga créditos para verificar si tienen la propiedad amortizacion
            const needsRefresh = sociosFromCache.some(s =>
                s.creditos && s.creditos.length > 0 && s.creditos.some(c => c.amortizacion === undefined)
            );

            processSociosData(sociosFromCache);

            // Si el caché es reciente y tiene todos los campos, no recargar
            if (!needsRefresh && window.isCacheValid && window.isCacheValid('socios')) {
                console.log('✓ Caché fresco, no se requiere actualización');
                return;
            }
            if (needsRefresh) {
                console.log('⚠ Caché incompleto (faltan datos de amortización), forzando actualización...');
            }
        } else {
            // Solo mostrar loading si no hay caché o es refresh forzado
            if (sociosGrid) {
                sociosGrid.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i><span>Cargando socios...</span></div>';
            }
        }

        // PASO 2: Actualizar en segundo plano
        console.log('⟳ Actualizando socios en segundo plano...');
        const supabase = window.getSupabaseClient();

        const { data: socios, error } = await supabase
            .from('ic_socios')
            .select(`
                *,
                creditos:ic_creditos (
                    id_credito,
                    estado_credito,
                    capital,
                    amortizacion:ic_creditos_amortizacion (
                        fecha_vencimiento,
                        estado_cuota
                    )
                )
            `)
            .order('nombre', { ascending: true });

        if (error) throw error;

        // Guardar en caché
        if (window.setCacheData) {
            window.setCacheData('socios', socios);
        }

        // Procesar y mostrar datos actualizados
        processSociosData(socios);
        console.log('✓ Socios actualizados');

    } catch (error) {
        console.error('Error cargando socios:', error);
        // Si hay error pero tenemos caché, mantener los datos de caché
        if (!window.hasCacheData || !window.hasCacheData('socios')) {
            showSociosError('Error al cargar socios');
        }
    }
}

// Procesar datos de socios (desde caché o BD)
function processSociosData(socios) {
    const hoy = parseDate(todayISODate());

    allSocios = (socios || []).map(socio => {
        const creditosVigentes = socio.creditos?.filter(c =>
            ESTADOS_CREDITO_VIGENTE.includes((c.estado_credito || '').toUpperCase())
        ) || [];

        const tieneMora = socio.creditos?.some(c => (c.estado_credito || '').toUpperCase() === 'MOROSO') || false;
        const tieneActivo = socio.creditos?.some(c => (c.estado_credito || '').toUpperCase() === 'ACTIVO') || false;
        const tienePausado = socio.creditos?.some(c => (c.estado_credito || '').toUpperCase() === 'PAUSADO') || false;

        const creditoEstado = tieneMora
            ? 'MOROSO'
            : (tieneActivo ? 'ACTIVO' : (tienePausado ? 'PAUSADO' : 'SIN_CREDITO'));

        const tieneCredito = creditoEstado !== 'SIN_CREDITO';

        // Calcular días de mora máximos
        let diasMoraMax = 0;
        if (tieneMora) {
            socio.creditos?.forEach(credito => {
                if (!credito.amortizacion) return;
                credito.amortizacion.forEach(cuota => {
                    if (cuota.estado_cuota === 'VENCIDO') {
                        const fechaVenc = parseDate(cuota.fecha_vencimiento);
                        if (!fechaVenc) return;

                        // Ambos están en UTC-5 (Ecuador) a las 00:00:00
                        const diffTime = hoy.getTime() - fechaVenc.getTime();
                        const dias = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

                        if (dias > diasMoraMax) diasMoraMax = dias;
                    }
                });
            });
        }

        return {
            ...socio,
            tieneCredito,
            tieneMora,
            tienePausado,
            creditoEstado,
            totalCreditos: socio.creditos?.length || 0,
            creditosVigentes: creditosVigentes.length,
            diasMora: diasMoraMax
        };
    });

    filteredSocios = [...allSocios];
    updateSociosStats();
    applyFilters();
}

function showSociosError(message) {
    const container = document.getElementById('socios-grid');
    if (container) {
        container.innerHTML = '<div class="error-state"><i class="fas fa-exclamation-triangle"></i><p>' + message + '</p><button class="btn btn-secondary" onclick="loadSocios()"><i class="fas fa-redo"></i> Reintentar</button></div>';
    }
}

// ==========================================
// ESTADÍSTICAS
// ==========================================
function updateSociosStats() {
    const total = allSocios.length;
    const conCreditos = allSocios.filter(s => s.tieneCredito).length;
    const sinCreditos = allSocios.filter(s => !s.tieneCredito).length;
    const morosos = allSocios.filter(s => s.tieneMora).length;

    const elTotal = document.getElementById('stat-total-socios');
    const elCon = document.getElementById('stat-con-creditos');
    const elSin = document.getElementById('stat-sin-creditos');
    const elMorosos = document.getElementById('stat-morosos');

    if (elTotal) elTotal.textContent = total;
    if (elCon) elCon.textContent = conCreditos;
    if (elSin) elSin.textContent = sinCreditos;
    if (elMorosos) elMorosos.textContent = morosos;
}

// ==========================================
// FILTROS
// ==========================================
function filterSocios(filter) {
    // Activar modo de filtros (naranjas)
    currentSocioFilter = filter;
    currentPaisFilterSocios = '';
    setSociosFilterMode('categoria');

    // Actualizar botones activos
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    // Despintar países/🌎
    document.querySelectorAll('.pais-filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    applyFilters();
}

function filterSociosByPais(pais) {
    const normalized = normalizePaisSocios(pais);

    // Activar modo país (automático)
    currentPaisFilterSocios = normalized;
    currentSocioFilter = 'todos';
    setSociosFilterMode('pais');

    // Actualizar botones activos
    document.querySelectorAll('.pais-filter-btn').forEach(btn => {
        const btnPais = normalizePaisSocios(btn.dataset.pais || '');
        btn.classList.toggle('active', btnPais === normalized);
    });

    // Despintar filtros naranjas
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    applyFilters();
}

function searchSocios(term) {
    currentSearchTerm = term.toLowerCase().trim();
    applyFilters();
}

function applyFilters() {
    filteredSocios = allSocios.filter(socio => {
        // Filtro por estado (solo en modo categoría)
        if (currentSociosFilterMode === 'categoria') {
            if (currentSocioFilter === 'con-credito' && !socio.tieneCredito) return false;
            if (currentSocioFilter === 'sin-credito' && socio.tieneCredito) return false;
            if (currentSocioFilter === 'moroso' && !socio.tieneMora) return false;
        }

        // Filtro por país (solo en modo país)
        if (currentSociosFilterMode === 'pais' && currentPaisFilterSocios) {
            const paisSocio = normalizePaisSocios(socio.paisresidencia);
            if (!paisSocio.includes(currentPaisFilterSocios)) return false;
        }

        // Filtro por búsqueda
        if (currentSearchTerm) {
            const nombre = (socio.nombre || '').toLowerCase();
            const cedula = (socio.cedula || '').toLowerCase();
            if (!nombre.includes(currentSearchTerm) && !cedula.includes(currentSearchTerm)) {
                return false;
            }
        }

        return true;
    });

    renderSocios();
}

// ==========================================
// RENDERIZADO
// ==========================================
function renderSocios() {
    const grid = document.getElementById('socios-grid');
    if (!grid) return;

    if (filteredSocios.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users-slash"></i>
                <p>No se encontraron socios</p>
            </div>
        `;
        return;
    }

    const activos = filteredSocios.filter(s => s.creditoEstado === 'ACTIVO');
    // Ordenar morosos por días de mora (más moroso primero) y luego por país
    const morosos = filteredSocios
        .filter(s => s.creditoEstado === 'MOROSO')
        .sort((a, b) => {
            // Primero por país
            const paisA = (a.paisresidencia || '').toLowerCase();
            const paisB = (b.paisresidencia || '').toLowerCase();
            if (paisA !== paisB) return paisA.localeCompare(paisB);
            // Luego por días de mora (mayor primero)
            return (b.diasMora || 0) - (a.diasMora || 0);
        });
    const pausados = filteredSocios.filter(s => s.creditoEstado === 'PAUSADO');
    const sinCredito = filteredSocios.filter(s => s.creditoEstado === 'SIN_CREDITO');

    // Función para renderizar morosos agrupados por país
    const renderMorososByPais = (morososList) => {
        if (!morososList || morososList.length === 0) return '';

        // Agrupar por país
        const porPais = {};
        morososList.forEach(s => {
            const pais = (s.paisresidencia || 'Sin país').toUpperCase();
            if (!porPais[pais]) porPais[pais] = [];
            porPais[pais].push(s);
        });

        // Ordenar países por el socio con más días de mora
        const paisesOrdenados = Object.keys(porPais).sort((a, b) => {
            const maxA = Math.max(...porPais[a].map(s => s.diasMora || 0));
            const maxB = Math.max(...porPais[b].map(s => s.diasMora || 0));
            return maxB - maxA;
        });

        // Ordenar socios dentro de cada país por días de mora
        paisesOrdenados.forEach(pais => {
            porPais[pais].sort((a, b) => (b.diasMora || 0) - (a.diasMora || 0));
        });

        const getPaisFlag = (pais) => {
            const paisLower = pais.toLowerCase();
            const flags = {
                'ecuador': 'https://flagcdn.com/w20/ec.png',
                'colombia': 'https://flagcdn.com/w20/co.png',
                'peru': 'https://flagcdn.com/w20/pe.png',
                'perú': 'https://flagcdn.com/w20/pe.png',
                'venezuela': 'https://flagcdn.com/w20/ve.png',
                'estados unidos': 'https://flagcdn.com/w20/us.png',
                'usa': 'https://flagcdn.com/w20/us.png',
                'españa': 'https://flagcdn.com/w20/es.png'
            };
            return flags[paisLower] || '';
        };

        return paisesOrdenados.map(pais => {
            const flagUrl = getPaisFlag(pais);
            const flagImg = flagUrl ? `<img src="${flagUrl}" alt="" class="pais-flag-mini" style="width:18px;height:12px;margin-right:6px;">` : '';
            return `
                <div class="morosos-pais-section">
                    <div class="morosos-pais-title">
                        ${flagImg}
                        <span>${pais}</span>
                        <span class="morosos-pais-count">${porPais[pais].length}</span>
                    </div>
                    <div class="socios-grid">
                        ${porPais[pais].map(s => createSocioCard(s)).join('')}
                    </div>
                </div>
            `;
        }).join('');
    };

    const renderSubsection = (title, variant, socios) => {
        if (!socios || socios.length === 0) return '';
        return `
            <div class="socios-subsection">
                <div class="socios-subsection-title ${variant}">
                    <span class="dot"></span>
                    <span>${title}</span>
                </div>
                <div class="socios-grid">
                    ${socios.map(s => createSocioCard(s)).join('')}
                </div>
            </div>
        `;
    };

    const conCreditoHtml = (activos.length || morosos.length || pausados.length)
        ? `
            <section class="socios-section">
                <div class="socios-section-header">
                    <div class="socios-section-title">Socios con crédito</div>
                </div>
                <div class="socios-subsections">
                    ${morosos.length ? `
                        <div class="socios-subsection">
                            <div class="socios-subsection-title moroso">
                                <span class="dot"></span>
                                <span>Morosos</span>
                            </div>
                            ${renderMorososByPais(morosos)}
                        </div>
                    ` : ''}
                    ${renderSubsection('Activos', 'activo', activos)}
                    ${renderSubsection('Pausados', 'pausado', pausados)}
                </div>
            </section>
        `
        : '';

    const sinCreditoHtml = sinCredito.length
        ? `
            <section class="socios-section">
                <div class="socios-section-header">
                    <div class="socios-section-title">Socios sin crédito</div>
                </div>
                <div class="socios-grid">
                    ${sinCredito.map(s => createSocioCard(s)).join('')}
                </div>
            </section>
        `
        : '';

    grid.innerHTML = conCreditoHtml + sinCreditoHtml;
}

function createSocioCard(socio) {
    const initials = getInitials(socio.nombre);
    const paisFlag = getPaisFlagSocios(socio.paisresidencia);
    const statusBadge = getStatusBadge(socio);

    // Color dinámico para morosos basado en días de mora
    const getMoraColor = (dias) => {
        const maxDias = 90;
        const porcentaje = Math.min(dias / maxDias, 1);
        const r = Math.round(255 - (porcentaje * 55));
        const g = Math.round(180 - (porcentaje * 150));
        const b = Math.round(100 - (porcentaje * 70));
        return `rgb(${r}, ${g}, ${b})`;
    };

    const esMoroso = socio.creditoEstado === 'MOROSO' && socio.diasMora > 0;
    const moraColor = esMoroso ? getMoraColor(socio.diasMora) : null;

    const avatarClass = socio.creditoEstado === 'MOROSO'
        ? 'moroso'
        : (socio.creditoEstado === 'ACTIVO' ? 'activo' : (socio.creditoEstado === 'PAUSADO' ? 'pausado' : ''));

    // Estilo dinámico del avatar para morosos
    const avatarStyle = esMoroso
        ? `style="background: linear-gradient(135deg, ${moraColor} 0%, rgba(220,38,38,0.8) 100%); border-color: ${moraColor};"`
        : '';

    // Ya no necesitamos indicador separado, está en el badge principal

    return `
        <div class="socio-card ${esMoroso ? 'socio-card-moroso' : ''}" onclick="showSocioDetails('${socio.idsocio}')" ${esMoroso ? `style="border-left: 3px solid ${moraColor};"` : ''}>
            <div class="socio-card-header">
                <div class="socio-avatar ${avatarClass}" ${avatarStyle}>
                    ${initials}
                </div>
                ${statusBadge}
            </div>
            <div class="socio-card-body">
                <h3 class="socio-nombre">${socio.nombre || 'Sin nombre'}</h3>
                <p class="socio-cedula">
                    <i class="fas fa-id-card"></i>
                    ${socio.cedula || 'Sin cédula'}
                </p>
                <div class="socio-info-row">
                    ${paisFlag ? `<span class="socio-pais-badge"><img src="${paisFlag}" alt="" class="socio-flag"></span>` : ''}
                    ${socio.whatsapp ? `<span class="socio-whatsapp-badge"><i class="fab fa-whatsapp"></i></span>` : ''}
                </div>
            </div>
            <div class="socio-card-footer">
                <span class="socio-creditos">
                    <i class="fas fa-hand-holding-usd"></i>
                    ${socio.creditosVigentes} créditos vigentes
                </span>
            </div>
        </div>
    `;
}

function getInitials(nombre) {
    if (!nombre) return '?';
    return nombre.split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
}

function getPaisFlagSocios(pais) {
    if (!pais) return '';
    const normalized = normalizePaisSocios(pais);
    const config = PAIS_CONFIG_SOCIOS[normalized];
    return config ? config.flag : '';
}

function getStatusBadge(socio) {
    if (socio.creditoEstado === 'MOROSO') {
        // Color dinámico basado en días de mora
        const getMoraColorBadge = (dias) => {
            const maxDias = 90;
            const porcentaje = Math.min(dias / maxDias, 1);
            const r = Math.round(255 - (porcentaje * 55));
            const g = Math.round(180 - (porcentaje * 150));
            const b = Math.round(100 - (porcentaje * 70));
            return `rgb(${r}, ${g}, ${b})`;
        };
        const diasMora = socio.diasMora || 0;
        const moraColor = getMoraColorBadge(diasMora);
        return `<span class="socio-badge moroso" style="background: ${moraColor}; border-color: ${moraColor};">MOROSO - ${diasMora} DÍAS</span>`;
    }
    if (socio.creditoEstado === 'ACTIVO') {
        return '<span class="socio-badge activo">ACTIVO</span>';
    }
    if (socio.creditoEstado === 'PAUSADO') {
        return '<span class="socio-badge pausado">PAUSADO</span>';
    }
    return '<span class="socio-badge sin-credito">SIN CRÉDITO</span>';
}

// ==========================================
// MODAL DE DETALLES
// ==========================================
function showSocioDetails(idsocio) {
    const socio = allSocios.find(s => s.idsocio === idsocio);
    if (!socio) return;

    const modal = document.getElementById('modal-socio-detalle');
    const modalNombre = document.getElementById('modal-socio-nombre');
    const modalBody = document.getElementById('modal-socio-body');

    if (!modal || !modalNombre || !modalBody) return;

    modalNombre.textContent = socio.nombre || 'Socio';

    const paisFlag = getPaisFlagSocios(socio.paisresidencia);
    const paisNombre = socio.paisresidencia ? socio.paisresidencia.toUpperCase() : '-';

    // Determinar badge de estado
    let estadoBadge = '';
    if (socio.esMoroso) {
        estadoBadge = '<span class="socio-status-badge moroso"><i class="fas fa-exclamation-triangle"></i> Moroso</span>';
    } else if (socio.totalCreditos > 0) {
        estadoBadge = '<span class="socio-status-badge activo"><i class="fas fa-check-circle"></i> Con Crédito</span>';
    } else {
        estadoBadge = '<span class="socio-status-badge sin-credito"><i class="fas fa-clock"></i> Sin Crédito</span>';
    }

    // Obtener foto de caché o usar placeholder
    const cachedFoto = getCachedFoto(idsocio);
    const fotoUrl = cachedFoto || socio.fotoidentidad || null;
    const fotoId = 'socio-foto-' + idsocio;

    modalBody.innerHTML = `
        <!-- Header con foto de perfil y info básica - NUEVO DISEÑO -->
        <div class="socio-modal-hero">
            <div class="socio-hero-photo" id="${fotoId}">
                ${fotoUrl ?
            '<img src="' + fotoUrl + '" alt="Foto" class="socio-photo-img" onerror="this.parentElement.innerHTML=\'' + getInitials(socio.nombre) + '\'">' :
            getInitials(socio.nombre)
        }
            </div>
            <div class="socio-hero-gradient"></div>
            <div class="socio-hero-info">
                <div class="socio-hero-cedula">
                    <i class="fas fa-id-card"></i> ${socio.cedula || '-'}
                </div>
                <div class="socio-hero-pais">
                    ${paisFlag ? '<img src="' + paisFlag + '" class="modal-flag">' : ''}
                    <span>${paisNombre}</span>
                </div>
                ${estadoBadge}
            </div>
        </div>

        <!-- Grid de información -->
        <div class="socio-modal-grid">
            <!-- Columna izquierda -->
            <div class="socio-modal-column">
                <!-- Datos Personales -->
                <div class="modal-info-card">
                    <div class="modal-card-header">
                        <i class="fas fa-user-circle"></i>
                        <span>Datos Personales</span>
                    </div>
                    <div class="modal-card-content">
                        <div class="modal-info-row">
                            <span class="info-label">Domicilio</span>
                            <span class="info-value">${socio.domicilio || 'No registrado'}</span>
                        </div>
                        <div class="modal-info-row">
                            <span class="info-label">Estado Civil</span>
                            <span class="info-value">${socio.estadocivil || '-'}</span>
                        </div>
                    </div>
                </div>

                <!-- Referencia -->
                <div class="modal-info-card">
                    <div class="modal-card-header">
                        <i class="fas fa-user-friends"></i>
                        <span>Referencia</span>
                    </div>
                    <div class="modal-card-content">
                        <div class="modal-info-row">
                            <span class="info-label">Nombre</span>
                            <span class="info-value">${socio.nombrereferencia || 'No registrado'}</span>
                        </div>
                        <div class="modal-info-row">
                            <span class="info-label">Teléfono</span>
                            <span class="info-value">
                                ${socio.whatsappreferencia ? `
                                    <a href="https://wa.me/${socio.whatsappreferencia}" target="_blank" class="whatsapp-btn-mini">
                                        <i class="fab fa-whatsapp"></i> ${socio.whatsappreferencia}
                                    </a>
                                ` : '-'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Columna derecha -->
            <div class="socio-modal-column">
                <!-- Contacto -->
                <div class="modal-info-card highlight">
                    <div class="modal-card-header">
                        <i class="fas fa-phone-alt"></i>
                        <span>Contacto</span>
                    </div>
                    <div class="modal-card-content">
                        ${socio.whatsapp ? `
                            <a href="https://wa.me/${socio.whatsapp}" target="_blank" class="whatsapp-btn-large">
                                <i class="fab fa-whatsapp"></i>
                                <span>${socio.whatsapp}</span>
                            </a>
                        ` : '<span class="no-data-text">Sin WhatsApp registrado</span>'}
                    </div>
                </div>

                <!-- Cónyuge -->
                <div class="modal-info-card ${socio.nombreconyuge && socio.nombreconyuge !== 'NO APLICA' ? '' : 'muted'}">
                    <div class="modal-card-header">
                        <i class="fas fa-heart"></i>
                        <span>Cónyuge</span>
                    </div>
                    <div class="modal-card-content">
                        ${socio.nombreconyuge && socio.nombreconyuge !== 'NO APLICA' ? `
                            <div class="modal-info-row">
                                <span class="info-label">Nombre</span>
                                <span class="info-value">${socio.nombreconyuge}</span>
                            </div>
                            <div class="modal-info-row">
                                <span class="info-label">Cédula</span>
                                <span class="info-value">${socio.cedulaconyuge || '-'}</span>
                            </div>
                            <div class="modal-info-row">
                                <span class="info-label">Teléfono</span>
                                <span class="info-value">
                                    ${socio.whatsappconyuge && socio.whatsappconyuge !== 'NO APLICA' ? `
                                        <a href="https://wa.me/${socio.whatsappconyuge}" target="_blank" class="whatsapp-btn-mini">
                                            <i class="fab fa-whatsapp"></i> ${socio.whatsappconyuge}
                                        </a>
                                    ` : '-'}
                                </span>
                            </div>
                        ` : '<span class="no-data-text">No aplica / Soltero(a)</span>'}
                    </div>
                </div>
            </div>
        </div>

        <!-- Sección de Créditos -->
        <div class="modal-creditos-section">
            <div class="modal-section-header">
                <div class="section-title-group">
                    <i class="fas fa-hand-holding-usd"></i>
                    <span>Historial de Créditos</span>
                </div>
                <span class="creditos-count">${socio.totalCreditos || 0}</span>
            </div>
            <div class="modal-creditos-list">
                ${socio.creditos && socio.creditos.length > 0 ?
            socio.creditos.map(c => `
                        <div class="credito-card ${c.estado_credito.toLowerCase()}">
                            <div class="credito-card-left">
                                <div class="credito-indicator"></div>
                                <div class="credito-details">
                                    <span class="credito-codigo">${c.id_credito.substring(0, 8)}...</span>
                                    <span class="credito-estado-badge ${c.estado_credito.toLowerCase()}">${c.estado_credito}</span>
                                </div>
                            </div>
                            <div class="credito-card-right">
                                <span class="credito-monto">$${parseFloat(c.capital || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    `).join('')
            : `
                    <div class="no-creditos">
                        <i class="fas fa-folder-open"></i>
                        <span>Este socio no tiene créditos registrados</span>
                    </div>
                `}
            </div>
        </div>
    `;

    // Mostrar modal
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Resetear scroll al inicio
    modalBody.scrollTop = 0;

    // Cargar foto si no está en caché
    if (!cachedFoto && socio.fotoidentidad) {
        // Cachear la foto para uso futuro
        setFotoCache(idsocio, socio.fotoidentidad);
    } else if (!cachedFoto && !socio.fotoidentidad) {
        // Intentar cargar foto desde la base de datos si no está disponible
        loadSocioFoto(idsocio, fotoId);
    }

    const closeModal = () => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    };

    // Cerrar modal
    modal.querySelectorAll('[data-close-modal]').forEach(el => {
        el.onclick = closeModal;
    });
}

// Cargar foto del socio desde la BD
async function loadSocioFoto(idsocio, containerId) {
    try {
        const supabase = window.getSupabaseClient();
        const { data, error } = await supabase
            .from('ic_socios')
            .select('fotoidentidad')
            .eq('idsocio', idsocio)
            .single();

        if (error || !data || !data.fotoidentidad) return;

        // Cachear la foto
        setFotoCache(idsocio, data.fotoidentidad);

        // Actualizar el contenedor si existe
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '<img src="' + data.fotoidentidad + '" alt="Foto" class="socio-photo-img">';
        }
    } catch (e) {
        console.warn('Error cargando foto del socio:', e);
    }
}

// Función auxiliar para obtener iniciales
function getInitials(nombre) {
    if (!nombre) return '??';
    const parts = nombre.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return nombre.substring(0, 2).toUpperCase();
}

// ==========================================
// UTILIDADES
// ==========================================
async function refreshSocios() {
    const btn = document.getElementById('btn-sync-socios');
    btn?.classList.add('spinning');

    await loadSocios(true); // Forzar actualización ignorando caché

    setTimeout(() => btn?.classList.remove('spinning'), 500);
    showToast('Socios actualizados', 'success');
}

function showSociosError(message) {
    const grid = document.getElementById('socios-grid');
    if (!grid) return;
    grid.innerHTML = `
        <div class="error-state">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${message}</p>
            <button onclick="refreshSocios()" class="btn btn-primary">Reintentar</button>
        </div>
    `;
}

// Exponer inicializador para que app.js lo ejecute al cargar la vista.
window.initSociosModule = initSociosModule;
