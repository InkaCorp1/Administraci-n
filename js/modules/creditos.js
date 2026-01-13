/**
 * INKA CORP - Módulo de Administración de Créditos
 * Gestión y monitoreo de créditos activos
 */

// ==========================================
// ESTADO DEL MÓDULO
// ==========================================
let allCreditos = [];
let filteredCreditos = [];
let currentEstadoFilterCreditos = '';
let currentPaisFilter = ''; // Filtro por país
let estadoSortEnabled = true; // Si está activo, ordena por estado (Activos > Morosos > Otros)
let currentSort = { field: 'cuotas', direction: 'desc' }; // Ordenamiento secundario
let currentViewingCredito = null;
let currentViewingCuota = null;
let currentUnpaidInstallments = []; // Para pagos múltiples
let selectedComprobanteFile = null; // Archivo de comprobante de pago seleccionado

// Mapeo de países a códigos ISO, nombres y URLs de banderas
const PAIS_CONFIG = {
    'ECUADOR': { code: 'EC', name: 'Ecuador', flag: 'https://flagcdn.com/w20/ec.png' },
    'ESTADOS UNIDOS': { code: 'US', name: 'USA', flag: 'https://flagcdn.com/w20/us.png' },
    'USA': { code: 'US', name: 'USA', flag: 'https://flagcdn.com/w20/us.png' },
    'PERÚ': { code: 'PE', name: 'Perú', flag: 'https://flagcdn.com/w20/pe.png' },
    'PERU': { code: 'PE', name: 'Perú', flag: 'https://flagcdn.com/w20/pe.png' }
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
function initCreditosModule() {
    loadCreditos();
    setupCreditosEventListeners();

    // Exponer funciones al scope global para onclick handlers
    window.openPaymentModal = openPaymentModal;
    window.viewCredito = viewCredito;
    window.filterByPais = filterByPais;
    window.sortCreditos = sortCreditos;
    window.refreshCreditosCache = refreshCreditosCache;
    window.toggleEstadoFilter = toggleEstadoFilter;
    window.filterCreditosByEstado = filterCreditosByEstado;
    window.cleanupStickyHeaders = cleanupStickyHeaders;
}

// ==========================================
// MODAL HELPERS (aislados del resto de módulos)
// ==========================================
function openCreditosModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeCreditosModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Si se cierra el modal principal, cerrar también el modal anidado
    if (modalId === 'ver-credito-modal') {
        const pagoModal = document.getElementById('registrar-pago-modal');
        if (pagoModal) {
            pagoModal.classList.add('hidden');
            pagoModal.style.display = 'none';
        }
    }

    modal.classList.add('hidden');
    modal.style.display = 'none';

    // Restaurar scroll solo si no queda ningún modal abierto
    const verCreditoModal = document.getElementById('ver-credito-modal');
    const registrarPagoModal = document.getElementById('registrar-pago-modal');
    const anyOpen =
        (verCreditoModal && !verCreditoModal.classList.contains('hidden')) ||
        (registrarPagoModal && !registrarPagoModal.classList.contains('hidden'));

    if (!anyOpen) {
        document.body.style.overflow = '';
    }
}

function setupCreditosModalCloseHandlers(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.querySelectorAll('[data-close-modal]').forEach(el => {
        el.addEventListener('click', () => closeCreditosModal(modalId));
    });
}

function setupCreditosEventListeners() {
    // Búsqueda
    const searchInput = document.getElementById('search-creditos');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            filterCreditos();
        }, 300));
    }

    // Tabs de estado
    const estadoTabs = document.querySelectorAll('.estado-tab');
    estadoTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            estadoTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentEstadoFilterCreditos = tab.dataset.estado || '';
            filterCreditos();
        });
    });

    // Modal close handlers
    setupCreditosModalCloseHandlers('ver-credito-modal');
    setupCreditosModalCloseHandlers('registrar-pago-modal');

    // Setup sticky headers con scroll listener
    setupStickyHeaders();
}

// ==========================================
// STICKY HEADERS CON JAVASCRIPT
// ==========================================
let currentStickyHeader = null;
let stickyHeaderClone = null;

function setupStickyHeaders() {
    // Escuchar scroll del window
    window.addEventListener('scroll', handleStickyScroll, { passive: true });
}

function handleStickyScroll() {
    const sections = document.querySelectorAll('.creditos-section');
    if (sections.length === 0) return;

    const scrollTop = window.scrollY;
    let activeSection = null;

    // Encontrar la sección activa (la que está visible en el viewport)
    sections.forEach(section => {
        const rect = section.getBoundingClientRect();
        const sectionTop = rect.top + scrollTop;
        const sectionBottom = sectionTop + section.offsetHeight;

        // Si el scroll está dentro de esta sección
        if (scrollTop >= sectionTop - 60 && scrollTop < sectionBottom - 100) {
            activeSection = section;
        }
    });

    // Si encontramos una sección activa, mostrar su header fijo
    if (activeSection) {
        const header = activeSection.querySelector('.section-sticky-header');
        const headerRect = header.getBoundingClientRect();

        // Si el header original está fuera del viewport (arriba)
        if (headerRect.top < 0) {
            showFixedHeader(header, activeSection);
        } else {
            hideFixedHeader();
        }
    } else {
        hideFixedHeader();
    }
}

function showFixedHeader(originalHeader, section) {
    // Si ya existe el clone para este header, no hacer nada
    if (stickyHeaderClone && currentStickyHeader === originalHeader) {
        return;
    }

    // Remover clone anterior si existe
    hideFixedHeader();

    // Obtener la tabla de la sección para clonar su thead
    const originalTable = section.querySelector('.creditos-section-table');
    const originalThead = originalTable ? originalTable.querySelector('thead') : null;
    const tableContainer = section.querySelector('.section-table-container');

    // Crear contenedor para el header fijo
    stickyHeaderClone = document.createElement('div');
    stickyHeaderClone.classList.add('fixed-header-clone');
    stickyHeaderClone.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 100;
        background: var(--card-bg, #1a1f2e);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        animation: slideDown 0.2s ease;
    `;

    // Clonar el header de sección
    const headerClone = originalHeader.cloneNode(true);
    headerClone.style.cssText = `
        margin: 0;
        border-radius: 0;
    `;
    stickyHeaderClone.appendChild(headerClone);

    // Clonar el thead de la tabla
    if (originalThead && originalTable) {
        // Obtener anchos reales de las columnas de la tabla original
        const originalThs = originalTable.querySelectorAll('thead th');
        const columnWidths = Array.from(originalThs).map(th => th.offsetWidth);

        // Crear una tabla para contener el thead clonado
        const tableClone = document.createElement('table');
        tableClone.className = 'creditos-section-table sticky-table-header';
        tableClone.style.cssText = `
            width: ${originalTable.offsetWidth}px;
            margin: 0 auto;
            border-collapse: collapse;
            table-layout: fixed;
        `;

        // Crear colgroup con anchos dinámicos
        const colgroup = document.createElement('colgroup');
        columnWidths.forEach(width => {
            const col = document.createElement('col');
            col.style.width = `${width}px`;
            colgroup.appendChild(col);
        });
        tableClone.appendChild(colgroup);

        const theadClone = originalThead.cloneNode(true);
        tableClone.appendChild(theadClone);

        // Contenedor para la tabla con padding igual al original
        const tableWrapper = document.createElement('div');
        const originalPadding = tableContainer ? window.getComputedStyle(tableContainer).padding : '0 1rem';
        tableWrapper.style.cssText = `
            padding: ${originalPadding};
            background: var(--card-bg, #1a1f2e);
            overflow: hidden;
        `;
        tableWrapper.appendChild(tableClone);

        stickyHeaderClone.appendChild(tableWrapper);
    }

    document.body.appendChild(stickyHeaderClone);
    currentStickyHeader = originalHeader;
}

function hideFixedHeader() {
    if (stickyHeaderClone) {
        stickyHeaderClone.remove();
        stickyHeaderClone = null;
        currentStickyHeader = null;
    }
}

// Cleanup cuando se cambia de vista
function cleanupStickyHeaders() {
    hideFixedHeader();
    window.removeEventListener('scroll', handleStickyScroll);
}

// ==========================================
// CARGAR DATOS (Patrón: Caché Instantáneo + Actualización en Segundo Plano)
// ==========================================
async function loadCreditos(forceRefresh = false) {
    try {
        // PASO 1: Mostrar datos de caché INMEDIATAMENTE si existen
        if (!forceRefresh && window.hasCacheData && window.hasCacheData('creditos')) {
            console.log('⚡ Mostrando créditos desde caché (instantáneo)');
            allCreditos = window.getCacheData('creditos');
            filteredCreditos = [...allCreditos];
            updateEstadoCountsCreditos();
            updateStats();
            applySorting();
            renderCreditosTable(filteredCreditos);

            // Si el caché es reciente, no recargar
            if (window.isCacheValid && window.isCacheValid('creditos')) {
                console.log('✓ Caché fresco, no se requiere actualización');
                return;
            }
        }

        // PASO 2: Actualizar en segundo plano
        console.log('⟳ Actualizando créditos en segundo plano...');
        const supabase = window.getSupabaseClient();

        const { data: creditos, error } = await supabase
            .from('ic_creditos')
            .select(`
                *,
                socio:ic_socios!id_socio (
                    idsocio,
                    nombre,
                    cedula,
                    whatsapp,
                    paisresidencia
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        allCreditos = creditos || [];
        filteredCreditos = [...allCreditos];

        // Guardar en caché
        if (window.setCacheData) {
            window.setCacheData('creditos', allCreditos);
        }

        updateEstadoCountsCreditos();
        updateStats();
        applySorting();
        renderCreditosTable(filteredCreditos);
        console.log('✓ Créditos actualizados');

    } catch (error) {
        console.error('Error loading creditos:', error);
        // Si hay error pero tenemos caché, mantener los datos de caché
        if (!window.hasCacheData || !window.hasCacheData('creditos')) {
            showErrorMessage('Error al cargar los créditos');
        }
    }
}

// ==========================================
// ESTADÍSTICAS
// ==========================================
function updateStats() {
    const activos = allCreditos.filter(c => c.estado_credito === 'ACTIVO');
    const morosos = allCreditos.filter(c => c.estado_credito === 'MOROSO');

    const carteraTotal = activos.reduce((sum, c) => sum + parseFloat(c.capital || 0), 0);
    const ahorroTotal = allCreditos.reduce((sum, c) => {
        return sum + (parseFloat(c.ahorro_programado_cuota || 0) * (c.cuotas_pagadas || 0));
    }, 0);

    // Calcular porcentaje de mora (morosos / (activos + morosos))
    const totalActivosMorosos = activos.length + morosos.length;
    const porcentajeMora = totalActivosMorosos > 0
        ? Math.round((morosos.length / totalActivosMorosos) * 100)
        : 0;

    document.getElementById('stat-activos').textContent = activos.length;
    document.getElementById('stat-mora').textContent = morosos.length;
    document.getElementById('stat-mora-pct').textContent = `${porcentajeMora}%`;
    document.getElementById('stat-cartera').textContent = formatMoney(carteraTotal);
    document.getElementById('stat-ahorro').textContent = formatMoney(ahorroTotal);
}

// ==========================================
// ACTUALIZAR CONTADORES
// ==========================================
function updateEstadoCountsCreditos() {
    const counts = {
        all: allCreditos.length,
        activo: allCreditos.filter(c => c.estado_credito === 'ACTIVO').length,
        moroso: allCreditos.filter(c => c.estado_credito === 'MOROSO').length,
        cancelado: allCreditos.filter(c => c.estado_credito === 'CANCELADO').length,
        precancelado: allCreditos.filter(c => c.estado_credito === 'PRECANCELADO').length
    };

    document.getElementById('count-all').textContent = counts.all;
    document.getElementById('count-activo').textContent = counts.activo;
    document.getElementById('count-moroso').textContent = counts.moroso;
    document.getElementById('count-cancelado').textContent = counts.cancelado;
    document.getElementById('count-precancelado').textContent = counts.precancelado;
}

// ==========================================
// FILTRAR CRÉDITOS
// ==========================================
function filterCreditos() {
    const searchTerm = document.getElementById('search-creditos')?.value?.toLowerCase() || '';

    filteredCreditos = allCreditos.filter(credito => {
        // Filtro por estado (si está activado)
        if (currentEstadoFilterCreditos && credito.estado_credito !== currentEstadoFilterCreditos) {
            return false;
        }

        // Filtro por país (banderitas)
        if (currentPaisFilter) {
            const paisCredito = normalizePais(credito.socio?.paisresidencia);
            if (paisCredito !== currentPaisFilter) return false;
        }

        // Filtro por búsqueda
        if (searchTerm) {
            const codigo = (credito.codigo_credito || '').toLowerCase();
            const nombre = (credito.socio?.nombre || '').toLowerCase();
            const cedula = (credito.socio?.cedula || '').toLowerCase();

            if (!codigo.includes(searchTerm) &&
                !nombre.includes(searchTerm) &&
                !cedula.includes(searchTerm)) {
                return false;
            }
        }

        return true;
    });

    // Aplicar ordenamiento
    applySorting();

    renderCreditosTable(filteredCreditos);
}

// Aplicar ordenamiento según estado, país y ordenamiento secundario
function applySorting() {
    // Prioridad de estados para ordenamiento (menor número = mayor prioridad)
    const estadoPriority = {
        'ACTIVO': 1,
        'MOROSO': 2,
        'PAUSADO': 3,
        'PRECANCELADO': 4,
        'CANCELADO': 5,
        'PENDIENTE': 6
    };

    filteredCreditos.sort((a, b) => {
        // 1. Si estadoSortEnabled, ordenar primero por estado
        if (estadoSortEnabled) {
            const aEstadoPrio = estadoPriority[a.estado_credito] || 99;
            const bEstadoPrio = estadoPriority[b.estado_credito] || 99;
            if (aEstadoPrio !== bEstadoPrio) {
                return aEstadoPrio - bEstadoPrio;
            }
        }

        // 2. Si hay filtro de país, priorizar ese país
        if (currentPaisFilter) {
            const aIsPais = normalizePais(a.socio?.paisresidencia) === currentPaisFilter;
            const bIsPais = normalizePais(b.socio?.paisresidencia) === currentPaisFilter;
            if (aIsPais && !bIsPais) return -1;
            if (!aIsPais && bIsPais) return 1;
        }

        // 3. Ordenamiento secundario (cuotas, monto, fecha)
        let compare = 0;

        switch (currentSort.field) {
            case 'cuotas':
                // Por cuotas pendientes (descendente = más cuotas pendientes primero)
                const aPendientes = (a.plazo || 0) - (a.cuotas_pagadas || 0);
                const bPendientes = (b.plazo || 0) - (b.cuotas_pagadas || 0);
                compare = bPendientes - aPendientes;
                break;
            case 'monto':
                // Por monto (descendente = mayor monto primero)
                compare = parseFloat(b.capital || 0) - parseFloat(a.capital || 0);
                break;
            case 'fecha':
                // Por fecha de otorgamiento (ascendente = más antiguo primero)
                compare = new Date(a.fecha_desembolso) - new Date(b.fecha_desembolso);
                break;
        }

        // Invertir si es ascendente
        if (currentSort.direction === 'asc') {
            compare = -compare;
        }

        return compare;
    });
}

// Normalizar nombre de país
function normalizePais(pais) {
    if (!pais) return '';
    const normalized = pais.toUpperCase().trim();
    if (normalized === 'USA' || normalized === 'ESTADOS UNIDOS') return 'USA';
    if (normalized === 'PERÚ' || normalized === 'PERU') return 'PERU';
    return normalized;
}

// Filtrar por país
function filterByPais(pais) {
    const target = normalizePais(pais);
    currentPaisFilter = target;

    // Actualizar UI de botones de país
    document.querySelectorAll('.pais-filter-btn').forEach(btn => {
        btn.classList.toggle('active', normalizePais(btn.dataset.pais) === target);
    });

    filterCreditos();
}

// Cambiar ordenamiento secundario
function sortCreditos(field) {
    // Si es el mismo campo, invertir dirección
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'desc' ? 'asc' : 'desc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'desc';
    }

    // Actualizar UI de botones de ordenamiento
    document.querySelectorAll('.sort-btn').forEach(btn => {
        const isActive = btn.dataset.sort === field;
        btn.classList.toggle('active', isActive);
        const icon = btn.querySelector('.sort-icon');
        if (icon && isActive) {
            icon.className = `fas fa-sort-${currentSort.direction === 'desc' ? 'down' : 'up'} sort-icon`;
        }
    });

    filterCreditos();
}

// Toggle ordenamiento por estado (Activos > Morosos > Otros)
function toggleEstadoFilter() {
    const btn = document.getElementById('btn-estado-filter');
    estadoSortEnabled = !estadoSortEnabled;
    btn?.classList.toggle('active', estadoSortEnabled);
    filterCreditos();
}

// Forzar actualización del caché de créditos
async function refreshCreditosCache() {
    const btn = document.querySelector('.btn-sync');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        // Recargar créditos forzando actualización
        await loadCreditos(true);

        console.log('✓ Créditos sincronizados');
        showToast('Créditos actualizados', 'success');
    } catch (error) {
        console.error('Error sincronizando:', error);
        showToast('Error al sincronizar', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
        }
    }
}

// ==========================================
// RENDERIZAR TABLA POR SECCIONES
// ==========================================

// Configuración de estados para secciones
const ESTADO_CONFIG = {
    'ACTIVO': { icon: 'fa-check-circle', color: '#10B981', label: 'Créditos Activos', bgColor: 'rgba(16, 185, 129, 0.15)' },
    'MOROSO': { icon: 'fa-exclamation-triangle', color: '#EF4444', label: 'Créditos en Mora', bgColor: 'rgba(239, 68, 68, 0.15)' },
    'PAUSADO': { icon: 'fa-pause-circle', color: '#F59E0B', label: 'Créditos Pausados', bgColor: 'rgba(245, 158, 11, 0.15)' },
    'PRECANCELADO': { icon: 'fa-calendar-check', color: '#3B82F6', label: 'Créditos Precancelados', bgColor: 'rgba(59, 130, 246, 0.15)' },
    'CANCELADO': { icon: 'fa-flag-checkered', color: '#6B7280', label: 'Créditos Cancelados', bgColor: 'rgba(107, 114, 128, 0.15)' },
    'PENDIENTE': { icon: 'fa-clock', color: '#8B5CF6', label: 'Créditos Pendientes', bgColor: 'rgba(139, 92, 246, 0.15)' }
};

// Orden de prioridad para mostrar secciones
const ESTADO_ORDER = ['ACTIVO', 'MOROSO', 'PAUSADO', 'PRECANCELADO', 'CANCELADO', 'PENDIENTE'];

function renderCreditosTable(creditos) {
    const container = document.getElementById('creditos-sections-container');
    const emptyDiv = document.getElementById('creditos-empty');

    if (!creditos || creditos.length === 0) {
        container.innerHTML = '';
        emptyDiv?.classList.remove('hidden');
        return;
    }

    emptyDiv?.classList.add('hidden');

    // Agrupar créditos por estado
    const groupedByEstado = {};
    creditos.forEach(credito => {
        const estado = credito.estado_credito || 'PENDIENTE';
        if (!groupedByEstado[estado]) {
            groupedByEstado[estado] = [];
        }
        groupedByEstado[estado].push(credito);
    });

    // Si hay filtro de estado activo, solo mostrar ese estado
    if (currentEstadoFilterCreditos) {
        const singleEstado = currentEstadoFilterCreditos;
        const singleCreditos = groupedByEstado[singleEstado] || [];

        if (singleCreditos.length === 0) {
            container.innerHTML = '';
            emptyDiv?.classList.remove('hidden');
            return;
        }

        container.innerHTML = renderEstadoSection(singleEstado, singleCreditos, true);
        return;
    }

    // Renderizar todas las secciones en orden de prioridad
    let html = '';
    ESTADO_ORDER.forEach(estado => {
        if (groupedByEstado[estado] && groupedByEstado[estado].length > 0) {
            html += renderEstadoSection(estado, groupedByEstado[estado], false);
        }
    });

    // Agregar estados no contemplados
    Object.keys(groupedByEstado).forEach(estado => {
        if (!ESTADO_ORDER.includes(estado) && groupedByEstado[estado].length > 0) {
            html += renderEstadoSection(estado, groupedByEstado[estado], false);
        }
    });

    container.innerHTML = html;
}

function renderEstadoSection(estado, creditos, isSingleSection) {
    const config = ESTADO_CONFIG[estado] || {
        icon: 'fa-folder',
        color: '#9CA3AF',
        label: estado,
        bgColor: 'rgba(156, 163, 175, 0.15)'
    };

    return `
        <div class="creditos-section" data-estado="${estado}">
            <div class="section-sticky-header" style="--section-color: ${config.color}; --section-bg: ${config.bgColor};">
                <div class="section-header-content">
                    <i class="fas ${config.icon}" style="color: ${config.color};"></i>
                    <span class="section-title">${config.label}</span>
                    <span class="section-count" style="background: ${config.bgColor}; color: ${config.color};">${creditos.length}</span>
                </div>
            </div>
            <div class="section-table-container">
                <table class="creditos-section-table">
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th class="col-socio">Socio</th>
                            <th class="col-capital text-right">Capital</th>
                            <th class="text-right">Cuota</th>
                            <th class="text-center">País</th>
                            <th class="text-center">Pagadas</th>
                            <th class="text-center">Próx. Pago</th>
                            <th class="text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${creditos.map(credito => renderCreditoRow(credito)).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderCreditoRow(credito) {
    const progreso = `${credito.cuotas_pagadas || 0}/${credito.plazo}`;
    const proximoPago = getProximoPago(credito);
    const pais = credito.socio?.paisresidencia || '';
    const paisFlag = getPaisFlag(pais);
    const paisCode = getPaisCode(pais);

    return `
        <tr class="credito-row" data-credito-id="${credito.id_credito}" onclick="viewCredito('${credito.id_credito}')">
            <td>
                <span class="codigo-credito">${credito.codigo_credito}</span>
            </td>
            <td class="col-socio">
                <div class="socio-info">
                    <span class="socio-nombre">${credito.socio?.nombre || 'N/A'}</span>
                    <span class="socio-cedula">${credito.socio?.cedula || ''}</span>
                </div>
            </td>
            <td class="col-capital text-right">${formatMoney(credito.capital)}</td>
            <td class="text-right">${formatMoney(credito.cuota_con_ahorro)}</td>
            <td class="col-pais text-center">
                ${paisFlag ? `<img src="${paisFlag}" alt="${paisCode}" class="pais-flag-img" title="${pais}">` : '-'}
            </td>
            <td class="col-pagadas text-center">
                <span class="progress-badge">${progreso}</span>
            </td>
            <td class="col-prox-pago text-center">${proximoPago}</td>
            <td class="text-center">
                <button class="btn-icon btn-ver-credito" onclick="event.stopPropagation(); viewCredito('${credito.id_credito}')" title="Ver detalle">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `;
}

// Filtrar por estado desde los counters
function filterCreditosByEstado(estado) {
    currentEstadoFilterCreditos = estado;

    // Actualizar UI de counters
    document.querySelectorAll('.estado-counter').forEach(counter => {
        counter.classList.toggle('active', counter.dataset.estado === estado);
    });

    filterCreditos();
}

// Obtener URL de imagen de bandera del país
function getPaisFlag(pais) {
    if (!pais) return '';
    const normalized = pais.toUpperCase().trim();
    const config = PAIS_CONFIG[normalized];
    return config ? config.flag : '';
}

// Obtener código corto del país
function getPaisCode(pais) {
    if (!pais) return '';
    const normalized = pais.toUpperCase().trim();
    const config = PAIS_CONFIG[normalized];
    return config ? config.code : pais.substring(0, 2).toUpperCase();
}

function getProximoPago(credito) {
    // Estados sin próximo pago
    const estadosSinPago = ['CANCELADO', 'PRECANCELADO', 'PAUSADO'];
    if (estadosSinPago.includes(credito.estado_credito)) {
        return '<span class="text-muted">-</span>';
    }

    // Calcular próxima fecha de pago basada en cuotas pagadas
    const fechaBase = parseDate(credito.fecha_primer_pago);
    if (!fechaBase) return '<span class="text-muted">-</span>';

    fechaBase.setMonth(fechaBase.getMonth() + (credito.cuotas_pagadas || 0));

    const hoy = new Date();
    const diasRestantes = Math.ceil((fechaBase - hoy) / (1000 * 60 * 60 * 24));

    if (diasRestantes < 0) {
        return `<span class="text-danger">Vencido (${Math.abs(diasRestantes)} días)</span>`;
    } else if (diasRestantes <= 5) {
        return `<span class="text-warning">${formatDateShort(fechaBase)}</span>`;
    }

    return formatDateShort(fechaBase);
}

function getEstadoBadgeCredito(estado) {
    const badges = {
        'ACTIVO': '<span class="badge badge-activo">Activo</span>',
        'MOROSO': '<span class="badge badge-moroso">Moroso</span>',
        'CANCELADO': '<span class="badge badge-cancelado">Cancelado</span>',
        'PRECANCELADO': '<span class="badge badge-precancelado">Precancelado</span>',
        'PENDIENTE': '<span class="badge badge-pendiente">Pendiente</span>'
    };
    return badges[estado] || `<span class="badge">${estado}</span>`;
}

// ==========================================
// VER DETALLE DE CRÉDITO
// ==========================================
async function viewCredito(creditoId) {
    const credito = allCreditos.find(c => c.id_credito === creditoId);
    if (!credito) {
        showToast('Crédito no encontrado', 'error');
        return;
    }

    currentViewingCredito = credito;

    // Llenar información del modal
    document.getElementById('modal-codigo-credito').textContent = credito.codigo_credito;
    document.getElementById('det-nombre-socio').textContent = credito.socio?.nombre || '-';
    document.getElementById('det-cedula-socio').textContent = credito.socio?.cedula || '-';
    document.getElementById('det-whatsapp-socio').textContent = credito.socio?.whatsapp || '-';

    // Resumen
    document.getElementById('det-capital').textContent = formatMoney(credito.capital);
    document.getElementById('det-interes').textContent = formatMoney(credito.total_interes);
    document.getElementById('det-gastos').textContent = formatMoney(credito.gastos_administrativos);
    document.getElementById('det-cuota').textContent = formatMoney(credito.cuota_base);
    document.getElementById('det-ahorro-cuota').textContent = formatMoney(credito.ahorro_programado_cuota);
    document.getElementById('det-cuota-total').textContent = formatMoney(credito.cuota_con_ahorro);

    // Progreso
    const cuotasPagadas = credito.cuotas_pagadas || 0;
    const progresoPct = Math.round((cuotasPagadas / credito.plazo) * 100);
    document.getElementById('det-progreso-text').textContent = `${cuotasPagadas}/${credito.plazo} cuotas`;
    document.getElementById('det-progreso-pct').textContent = `${progresoPct}%`;
    document.getElementById('det-progreso-bar').style.width = `${progresoPct}%`;

    // Fechas
    document.getElementById('det-fecha-desembolso').textContent = formatDate(credito.fecha_desembolso);
    document.getElementById('det-fecha-primer-pago').textContent = formatDate(credito.fecha_primer_pago);
    document.getElementById('det-fecha-fin').textContent = formatDate(credito.fecha_fin_credito);
    document.getElementById('det-dia-pago').textContent = `Día ${credito.dia_pago} de cada mes`;

    // Ahorro
    const ahorroAcumulado = credito.ahorro_programado_cuota * cuotasPagadas;
    const ahorroPendiente = credito.ahorro_programado_total - ahorroAcumulado;
    document.getElementById('det-ahorro-total').textContent = formatMoney(credito.ahorro_programado_total);
    document.getElementById('det-ahorro-acumulado').textContent = formatMoney(ahorroAcumulado);
    document.getElementById('det-ahorro-pendiente').textContent = formatMoney(ahorroPendiente);

    // Cargar tabla de amortización
    await loadAmortizacionTable(creditoId);

    // Configurar botón de registrar pago
    const btnRegistrarPago = document.getElementById('btn-registrar-pago');
    if (btnRegistrarPago) {
        const canPay = credito.estado_credito === 'ACTIVO' || credito.estado_credito === 'MOROSO';
        btnRegistrarPago.style.display = canPay ? 'inline-flex' : 'none';
        btnRegistrarPago.onclick = () => openNextPaymentModal(creditoId);
    }

    // Abrir modal
    openCreditosModal('ver-credito-modal');
}

// ==========================================
// TABLA DE AMORTIZACIÓN
// ==========================================
async function loadAmortizacionTable(creditoId) {
    const tbody = document.getElementById('amortizacion-table-body');
    tbody.innerHTML = '<tr><td colspan="10" class="text-center">Cargando...</td></tr>';

    try {
        const supabase = window.getSupabaseClient();
        const { data: cuotas, error } = await supabase
            .from('ic_creditos_amortizacion')
            .select('*')
            .eq('id_credito', creditoId)
            .order('numero_cuota', { ascending: true });

        if (error) throw error;

        if (!cuotas || cuotas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center">No hay datos de amortización</td></tr>';
            return;
        }

        // Encontrar la última cuota pagada
        let lastPaidIndex = -1;
        for (let i = cuotas.length - 1; i >= 0; i--) {
            if (cuotas[i].estado_cuota === 'PAGADO') {
                lastPaidIndex = i;
                break;
            }
        }

        // La siguiente cuota pagable es la inmediatamente después de la última pagada
        const nextPayableIndex = lastPaidIndex + 1;

        tbody.innerHTML = cuotas.map((cuota, index) => {
            const estadoBadge = getEstadoCuotaBadge(cuota.estado_cuota);

            // Solo habilitar botón para la siguiente cuota pagable
            const canPay = index === nextPayableIndex &&
                (cuota.estado_cuota === 'PENDIENTE' || cuota.estado_cuota === 'VENCIDO');

            return `
                <tr class="${cuota.estado_cuota === 'PAGADO' ? 'row-paid' : ''}">
                    <td class="text-center hide-mobile">${cuota.numero_cuota}</td>
                    <td>${formatDateShort(cuota.fecha_vencimiento)}</td>
                    <td class="text-right hide-mobile">${formatMoney(cuota.pago_capital)}</td>
                    <td class="text-right hide-mobile">${formatMoney(cuota.pago_interes)}</td>
                    <td class="text-right hide-mobile">${formatMoney(cuota.cuota_base)}</td>
                    <td class="text-right hide-mobile">${formatMoney(cuota.ahorro_programado)}</td>
                    <td class="text-right"><strong>${formatMoney(cuota.cuota_total)}</strong></td>
                    <td class="text-right">${formatMoney(cuota.saldo_capital)}</td>
                    <td>${estadoBadge}</td>
                    <td>
                        ${canPay ? `<button class="btn-pagar-cuota" onclick="openPaymentModal('${cuota.id_detalle}')">
                            <i class="fas fa-dollar-sign"></i> <span>Pagar</span>
                        </button>` : '<span class="text-muted">-</span>'}
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading amortización:', error);
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-danger">Error al cargar datos</td></tr>';
    }
}

function getEstadoCuotaBadge(estado) {
    const badges = {
        'PAGADO': '<span class="badge badge-pagado">Pagado</span>',
        'PENDIENTE': '<span class="badge badge-pendiente">Pendiente</span>',
        'VENCIDO': '<span class="badge badge-vencido">Vencido</span>',
        'PARCIAL': '<span class="badge badge-pendiente">Parcial</span>',
        'CONDONADO': '<span class="badge badge-cancelado">Condonado</span>'
    };
    return badges[estado] || `<span class="badge">${estado}</span>`;
}

// ==========================================
// MODAL DE PAGO
// ==========================================

// Obtener cuotas consecutivas impagadas
async function getConsecutiveUnpaidInstallments(creditoId, startDetalleId) {
    try {
        const supabase = window.getSupabaseClient();

        // Obtener todas las cuotas del crédito
        const { data: allCuotas, error } = await supabase
            .from('ic_creditos_amortizacion')
            .select('*')
            .eq('id_credito', creditoId)
            .order('numero_cuota', { ascending: true });

        if (error) throw error;

        // Encontrar el índice de la cuota inicial
        const startIndex = allCuotas.findIndex(c => c.id_detalle === startDetalleId);

        if (startIndex === -1) return [];

        // Obtener cuotas consecutivas impagadas
        const consecutive = [];
        for (let i = startIndex; i < allCuotas.length; i++) {
            if (allCuotas[i].estado_cuota === 'PENDIENTE' || allCuotas[i].estado_cuota === 'VENCIDO') {
                consecutive.push(allCuotas[i]);
            } else {
                break; // Detener al encontrar una cuota pagada
            }
        }

        return consecutive;

    } catch (error) {
        console.error('Error getting consecutive installments:', error);
        return [];
    }
}

async function openPaymentModal(detalleId) {
    try {
        const supabase = window.getSupabaseClient();

        // Obtener la cuota inicial
        const { data: cuota, error } = await supabase
            .from('ic_creditos_amortizacion')
            .select('*')
            .eq('id_detalle', detalleId)
            .single();

        if (error) throw error;

        currentViewingCuota = cuota;

        // Obtener cuotas consecutivas impagadas
        currentUnpaidInstallments = await getConsecutiveUnpaidInstallments(
            currentViewingCredito.id_credito,
            detalleId
        );

        // Poblar el dropdown de selección de cuotas
        const select = document.getElementById('pago-cuotas-select');
        select.innerHTML = currentUnpaidInstallments.map((_, idx) => {
            const count = idx + 1;
            const endNum = currentUnpaidInstallments[0].numero_cuota + idx;
            const total = currentUnpaidInstallments.slice(0, count).reduce(
                (sum, c) => sum + parseFloat(c.cuota_total), 0
            );

            if (count === 1) {
                return `<option value="${count}">Cuota #${currentUnpaidInstallments[0].numero_cuota} - ${formatMoney(total)}</option>`;
            } else {
                return `<option value="${count}">Cuotas #${currentUnpaidInstallments[0].numero_cuota} - #${endNum} (${count} cuotas) - ${formatMoney(total)}</option>`;
            }
        }).join('');

        // Configurar listener para cambio de selección
        select.onchange = () => {
            const count = parseInt(select.value);
            const total = currentUnpaidInstallments.slice(0, count).reduce(
                (sum, c) => sum + parseFloat(c.cuota_total), 0
            );
            document.getElementById('pago-monto-cuota').textContent = formatMoney(total);
            document.getElementById('pago-monto').value = total.toFixed(2);

            // Actualizar fecha de vencimiento (última cuota seleccionada)
            const lastCuota = currentUnpaidInstallments[count - 1];
            document.getElementById('pago-fecha-vencimiento').textContent = formatDate(lastCuota.fecha_vencimiento);
        };

        // Llenar información inicial
        document.getElementById('pago-fecha-vencimiento').textContent = formatDate(cuota.fecha_vencimiento);
        document.getElementById('pago-monto-cuota').textContent = formatMoney(cuota.cuota_total);
        document.getElementById('pago-monto').value = cuota.cuota_total.toFixed(2);
        document.getElementById('pago-fecha').valueAsDate = new Date();
        document.getElementById('pago-referencia').value = '';
        document.getElementById('pago-observaciones').value = '';

        // Resetear comprobante
        clearComprobantePreview();

        // Configurar botón confirmar
        const btnConfirmar = document.getElementById('btn-confirmar-pago');
        btnConfirmar.onclick = () => confirmarPago();

        // Abrir modal
        openCreditosModal('registrar-pago-modal');


    } catch (error) {
        console.error('Error opening payment modal:', error);
        showToast('Error al cargar datos de la cuota', 'error');
    }
}

async function openNextPaymentModal(creditoId) {
    try {
        const supabase = window.getSupabaseClient();
        const { data: cuotas, error } = await supabase
            .from('ic_creditos_amortizacion')
            .select('*')
            .eq('id_credito', creditoId)
            .in('estado_cuota', ['PENDIENTE', 'VENCIDO'])
            .order('numero_cuota', { ascending: true })
            .limit(1);

        if (error) throw error;

        if (!cuotas || cuotas.length === 0) {
            showToast('No hay cuotas pendientes de pago', 'info');
            return;
        }

        openPaymentModal(cuotas[0].id_detalle);

    } catch (error) {
        console.error('Error finding next payment:', error);
        showToast('Error al buscar cuota pendiente', 'error');
    }
}

// ==========================================
// CONFIRMAR PAGO
// ==========================================
async function confirmarPago() {
    if (!currentViewingCuota || !currentViewingCredito) {
        showToast('Error: No hay datos de pago', 'error');
        return;
    }

    const btnConfirmar = document.getElementById('btn-confirmar-pago');
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';

    try {
        const supabase = window.getSupabaseClient();
        const currentUser = getCurrentUser();

        const fechaPago = document.getElementById('pago-fecha').value;
        const montoPagado = parseFloat(document.getElementById('pago-monto').value);
        const metodoPago = document.getElementById('pago-metodo').value;
        const referencia = document.getElementById('pago-referencia').value;
        const observaciones = document.getElementById('pago-observaciones').value;

        if (!fechaPago || isNaN(montoPagado) || montoPagado <= 0) {
            showToast('Por favor complete los datos del pago', 'warning');
            btnConfirmar.disabled = false;
            btnConfirmar.innerHTML = '<i class="fas fa-check"></i> Confirmar Pago';
            return;
        }

        // Validar comprobante obligatorio
        if (!selectedComprobanteFile) {
            showToast('Debe subir el comprobante de pago', 'warning');
            btnConfirmar.disabled = false;
            btnConfirmar.innerHTML = '<i class="fas fa-check"></i> Confirmar Pago';
            return;
        }

        // Obtener cantidad de cuotas seleccionadas
        const cantidadCuotas = parseInt(document.getElementById('pago-cuotas-select').value);
        const cuotasAPagar = currentUnpaidInstallments.slice(0, cantidadCuotas);

        // Validar que el monto coincida
        const totalEsperado = cuotasAPagar.reduce((sum, c) => sum + parseFloat(c.cuota_total), 0);
        if (Math.abs(montoPagado - totalEsperado) > 0.01) {
            showToast('El monto no coincide. Esperado: ' + formatMoney(totalEsperado), 'warning');
            btnConfirmar.disabled = false;
            btnConfirmar.innerHTML = '<i class="fas fa-check"></i> Confirmar Pago';
            return;
        }

        // Subir comprobante a Storage (una sola vez para todos los pagos)
        btnConfirmar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo comprobante...';
        const uploadResult = await uploadReceiptToStorage(
            selectedComprobanteFile,
            currentViewingCredito.id_credito,
            cuotasAPagar[0].numero_cuota
        );

        if (!uploadResult.success) {
            showToast('Error al subir comprobante: ' + uploadResult.error, 'error');
            btnConfirmar.disabled = false;
            btnConfirmar.innerHTML = '<i class="fas fa-check"></i> Confirmar Pago';
            return;
        }

        const comprobanteUrl = uploadResult.url;
        console.log('Comprobante subido:', comprobanteUrl);

        // Procesar cada cuota
        for (const cuota of cuotasAPagar) {
            // 1. Registrar el pago
            const { error: errorPago } = await supabase
                .from('ic_creditos_pagos')
                .insert({
                    id_detalle: cuota.id_detalle,
                    id_credito: currentViewingCredito.id_credito,
                    fecha_pago: fechaPago,
                    monto_pagado: parseFloat(cuota.cuota_total),
                    metodo_pago: metodoPago,
                    referencia_pago: referencia,
                    observaciones: `${observaciones} (Pago de ${cantidadCuotas} cuotas)`,
                    comprobante_url: comprobanteUrl, // URL del comprobante (misma para todas las cuotas)
                    cobrado_por: currentUser?.id || null
                });

            if (errorPago) throw errorPago;

            // 2. Actualizar estado de la cuota
            const { error: errorCuota } = await supabase
                .from('ic_creditos_amortizacion')
                .update({
                    estado_cuota: 'PAGADO',
                    requiere_cobro: false,
                    recordatorio_enviado: false
                })
                .eq('id_detalle', cuota.id_detalle);

            if (errorCuota) throw errorCuota;

            // 3. Actualizar ahorro a ACUMULADO
            const { error: errorAhorro } = await supabase
                .from('ic_creditos_ahorro')
                .update({ estado: 'ACUMULADO' })
                .eq('id_credito', currentViewingCredito.id_credito)
                .eq('numero_cuota', cuota.numero_cuota);

            if (errorAhorro) console.error('Error updating ahorro:', errorAhorro);
        }

        // 4. Actualizar contador de cuotas pagadas en el crédito
        const nuevasCuotasPagadas = (currentViewingCredito.cuotas_pagadas || 0) + cantidadCuotas;
        const nuevoEstadoCredito = nuevasCuotasPagadas >= currentViewingCredito.plazo ? 'CANCELADO' : 'ACTIVO';

        const { error: errorCredito } = await supabase
            .from('ic_creditos')
            .update({
                cuotas_pagadas: nuevasCuotasPagadas,
                estado_credito: nuevoEstadoCredito
            })
            .eq('id_credito', currentViewingCredito.id_credito);

        if (errorCredito) throw errorCredito;

        // Cerrar modal y recargar
        closeCreditosModal('registrar-pago-modal');
        showToast('Pago de ' + cantidadCuotas + ' cuota' + (cantidadCuotas > 1 ? 's' : '') + ' registrado exitosamente', 'success');

        // Recargar datos
        await loadCreditos();
        await loadAmortizacionTable(currentViewingCredito.id_credito);

        // Actualizar datos del modal principal
        const creditoActualizado = allCreditos.find(c => c.id_credito === currentViewingCredito.id_credito);
        if (creditoActualizado) {
            currentViewingCredito = creditoActualizado;
            // Actualizar progreso
            const cuotasPagadas = creditoActualizado.cuotas_pagadas || 0;
            const progresoPct = Math.round((cuotasPagadas / creditoActualizado.plazo) * 100);
            document.getElementById('det-progreso-text').textContent = `${cuotasPagadas}/${creditoActualizado.plazo} cuotas`;
            document.getElementById('det-progreso-pct').textContent = `${progresoPct}%`;
            document.getElementById('det-progreso-bar').style.width = `${progresoPct}%`;

            // Actualizar ahorro
            const ahorroAcumulado = creditoActualizado.ahorro_programado_cuota * cuotasPagadas;
            document.getElementById('det-ahorro-acumulado').textContent = formatMoney(ahorroAcumulado);
            document.getElementById('det-ahorro-pendiente').textContent = formatMoney(creditoActualizado.ahorro_programado_total - ahorroAcumulado);
        }

    } catch (error) {
        console.error('Error al registrar pago:', error);
        showAlert('Error al registrar el pago: ' + (error.message || error), 'Error', 'error');
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = '<i class="fas fa-check"></i> Confirmar Pago';
    }
}

// ==========================================
// UTILIDADES
// ==========================================
function formatMoney(amount) {
    return '$' + parseFloat(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = parseDate(dateStr);
    if (!date) return '-';
    const options = { year: 'numeric', month: 'short', day: '2-digit', timeZone: 'America/Guayaquil' };
    return date.toLocaleDateString('es-EC', options);
}

function formatDateShort(dateStr) {
    if (!dateStr) return '-';
    const date = parseDate(dateStr);
    if (!date) return '-';
    return date.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Guayaquil' });
}

function showErrorMessage(message) {
    console.error(message);
    // Implementar toast o notificación si está disponible
}

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ==========================================
// MANEJO DE COMPROBANTE DE PAGO
// ==========================================

/**
 * Maneja la selección de archivo de comprobante
 * Muestra preview de la imagen
 */
function handleComprobanteSelect(input) {
    const file = input.files[0];
    if (!file) return;

    // Validar que sea imagen
    if (!file.type.startsWith('image/')) {
        showToast('Por favor seleccione una imagen', 'warning');
        input.value = '';
        return;
    }

    selectedComprobanteFile = file;

    // Mostrar preview
    const placeholder = document.getElementById('comprobante-placeholder');
    const preview = document.getElementById('comprobante-preview');
    const previewImg = document.getElementById('comprobante-preview-img');

    if (placeholder && preview && previewImg) {
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            placeholder.style.display = 'none';
            preview.style.display = 'inline-block';
        };
        reader.readAsDataURL(file);
    }

    console.log(`Comprobante seleccionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
}

/**
 * Limpia el preview y resetea el archivo de comprobante
 */
function clearComprobantePreview() {
    selectedComprobanteFile = null;

    const placeholder = document.getElementById('comprobante-placeholder');
    const preview = document.getElementById('comprobante-preview');
    const previewImg = document.getElementById('comprobante-preview-img');
    const cameraInput = document.getElementById('pago-comprobante-camera');
    const galleryInput = document.getElementById('pago-comprobante-gallery');

    if (placeholder) placeholder.style.display = 'flex';
    if (preview) preview.style.display = 'none';
    if (previewImg) previewImg.src = '';
    if (cameraInput) cameraInput.value = '';
    if (galleryInput) galleryInput.value = '';
}
