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
                compare = parseDate(a.fecha_desembolso) - parseDate(b.fecha_desembolso);
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

        // Llenar info del crédito y socio (nuevos campos)
        const codigoElem = document.getElementById('pago-credito-codigo');
        const socioElem = document.getElementById('pago-socio-nombre');
        if (codigoElem) codigoElem.textContent = currentViewingCredito.codigo_credito || '-';
        if (socioElem) socioElem.textContent = currentViewingCredito.socio?.nombre || 'Socio';

        // Función para actualizar mora y total
        const actualizarMoraYTotal = () => {
            const fechaPagoInput = document.getElementById('pago-fecha').value;
            const count = parseInt(document.getElementById('pago-cuotas-select').value) || 1;
            const cuotasSeleccionadas = currentUnpaidInstallments.slice(0, count);

            // Calcular monto base
            const montoBase = cuotasSeleccionadas.reduce(
                (sum, c) => sum + parseFloat(c.cuota_total), 0
            );

            // Calcular mora total
            const { totalMora, cuotasConMora } = calcularMoraMultiple(cuotasSeleccionadas, fechaPagoInput);

            // Actualizar UI de mora
            const moraRow = document.getElementById('pago-mora-row');
            const diasMoraElem = document.getElementById('pago-dias-mora');
            const montoMoraElem = document.getElementById('pago-monto-mora');

            if (totalMora > 0) {
                if (moraRow) moraRow.style.display = 'flex';
                const totalDias = cuotasConMora.reduce((sum, c) => sum + c.diasMora, 0);
                if (diasMoraElem) diasMoraElem.textContent = totalDias;
                if (montoMoraElem) montoMoraElem.textContent = formatMoney(totalMora);
            } else {
                if (moraRow) moraRow.style.display = 'none';
            }

            // Actualizar total
            const totalFinal = montoBase + totalMora;
            const totalElem = document.getElementById('pago-total-final');
            if (totalElem) totalElem.textContent = formatMoney(totalFinal);

            // Actualizar cuota base
            const montoCuotaElem = document.getElementById('pago-monto-cuota');
            if (montoCuotaElem) montoCuotaElem.textContent = formatMoney(montoBase);

            // Actualizar monto en el input (incluye mora)
            document.getElementById('pago-monto').value = totalFinal.toFixed(2);

            // Actualizar fecha de vencimiento (última cuota seleccionada)
            const lastCuota = cuotasSeleccionadas[cuotasSeleccionadas.length - 1];
            const fechaVencElem = document.getElementById('pago-fecha-vencimiento');
            if (fechaVencElem) fechaVencElem.textContent = formatDate(lastCuota.fecha_vencimiento);
        };

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
                return `<option value="${count}">Cuotas #${currentUnpaidInstallments[0].numero_cuota} - #${endNum} (${count}) - ${formatMoney(total)}</option>`;
            }
        }).join('');

        // Configurar listener para cambio de selección de cuotas
        select.onchange = actualizarMoraYTotal;

        // Configurar listener para cambio de fecha de pago
        const fechaInput = document.getElementById('pago-fecha');
        fechaInput.onchange = actualizarMoraYTotal;

        // Establecer fecha de pago inicial (fecha de Ecuador)
        const ecuadorDate = getEcuadorDateString();
        fechaInput.value = ecuadorDate;

        // Llenar información inicial
        document.getElementById('pago-referencia').value = '';
        document.getElementById('pago-observaciones').value = '';

        // Resetear comprobante
        clearComprobantePreview();

        // Calcular mora inicial
        actualizarMoraYTotal();

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
            btnConfirmar.innerHTML = '<i class="fas fa-check-circle"></i> Confirmar Pago';
            return;
        }

        // Validar comprobante obligatorio
        if (!selectedComprobanteFile) {
            showToast('Debe subir el comprobante de pago', 'warning');
            btnConfirmar.disabled = false;
            btnConfirmar.innerHTML = '<i class="fas fa-check-circle"></i> Confirmar Pago';
            return;
        }

        // Obtener cantidad de cuotas seleccionadas
        const cantidadCuotas = parseInt(document.getElementById('pago-cuotas-select').value);
        const cuotasAPagar = currentUnpaidInstallments.slice(0, cantidadCuotas);

        // Calcular mora total para la validación (usando la fecha de pago seleccionada)
        const { totalMora, cuotasConMora } = calcularMoraMultiple(cuotasAPagar, fechaPago);

        // Validar que el monto coincida (Base + Mora)
        const montoBase = cuotasAPagar.reduce((sum, c) => sum + parseFloat(c.cuota_total), 0);
        const totalEsperado = montoBase + totalMora;

        if (Math.abs(montoPagado - totalEsperado) > 0.01) {
            showToast('El monto no coincide. Esperado: ' + formatMoney(totalEsperado) + ' (Base: ' + formatMoney(montoBase) + ' + Mora: ' + formatMoney(totalMora) + ')', 'warning');
            btnConfirmar.disabled = false;
            btnConfirmar.innerHTML = '<i class="fas fa-check-circle"></i> Confirmar Pago';
            return;
        }

        // Preparar observaciones con detalle de mora si existe
        let obsFinal = observaciones;
        if (totalMora > 0) {
            const detalleMora = cuotasConMora
                .filter(c => c.estaEnMora)
                .map(c => `Cuota #${c.numero}: ${c.diasMora}d x $2 = $${c.montoMora.toFixed(2)}`)
                .join(', ');
            obsFinal = `${observaciones} | MORA TOTAL: $${totalMora.toFixed(2)} (${detalleMora})`.trim();
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
            btnConfirmar.innerHTML = '<i class="fas fa-check-circle"></i> Confirmar Pago';
            return;
        }

        const comprobanteUrl = uploadResult.url;
        console.log('Comprobante subido:', comprobanteUrl);

        // Procesar cada cuota
        for (const infoCuota of cuotasConMora) {
            const montoFinalCuota = infoCuota.monto + infoCuota.montoMora;

            // 1. Registrar el pago
            const { error: errorPago } = await supabase
                .from('ic_creditos_pagos')
                .insert({
                    id_detalle: infoCuota.id_detalle,
                    id_credito: currentViewingCredito.id_credito,
                    fecha_pago: fechaPago,
                    monto_pagado: montoFinalCuota,
                    metodo_pago: metodoPago,
                    referencia_pago: referencia,
                    observaciones: obsFinal,
                    comprobante_url: comprobanteUrl,
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
                .eq('id_detalle', infoCuota.id_detalle);

            if (errorCuota) throw errorCuota;

            // 3. Actualizar ahorro a ACUMULADO
            const { error: errorAhorro } = await supabase
                .from('ic_creditos_ahorro')
                .update({ estado: 'ACUMULADO' })
                .eq('id_credito', currentViewingCredito.id_credito)
                .eq('numero_cuota', infoCuota.numero);

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

        // ==========================================
        // NOTIFICACIONES (SISTEMA DE PRODUCCIÓN)
        // ==========================================
        try {
            console.log('Iniciando sistema de notificaciones...');
            
            // Reusar la lógica de construcción de datos para el recibo
            const fechaRegistro = formatEcuadorDateTime();
            const cuotasPagadasActualizado = nuevasCuotasPagadas - cantidadCuotas; // Estado previo al commit de hoy

            const reciboData = {
                socioNombre: currentViewingCredito.socio?.nombre || 'Socio',
                socioCedula: currentViewingCredito.socio?.cedula || 'N/A',
                codigoCredito: currentViewingCredito.codigo_credito,
                capitalTotal: currentViewingCredito.capital,
                plazo: currentViewingCredito.plazo,
                montoBase: montoBase,
                totalMora: totalMora,
                montoPagado: montoPagado,
                fechaPago: fechaPago,
                fechaRegistro: fechaRegistro,
                metodoPago: metodoPago,
                cantidadCuotas: cantidadCuotas,
                cuotasPagadasAntes: cuotasPagadasActualizado,
                estaEnMora: totalMora > 0,
                cuotas: cuotasConMora.map(c => ({
                    numero: c.numero,
                    monto: parseFloat(c.monto),
                    estado: c.estaEnMora ? 'EN MORA' : 'A TIEMPO',
                    fechaVencimiento: c.fecha_vencimiento,
                    diasMora: c.diasMora,
                    montoMora: c.montoMora,
                    estaEnMora: c.estaEnMora
                }))
            };

            let image_base64;
            let message;

            if (cantidadCuotas === 1) {
                const cuota = cuotasConMora[0];
                reciboData.numeroCuota = cuota.numero;
                reciboData.fechaVencimiento = cuota.fecha_vencimiento;
                reciboData.diasMora = cuota.diasMora;
                reciboData.estaEnMora = cuota.estaEnMora;
                reciboData.estadoCuota = cuota.estaEnMora ? 'EN MORA' : 'A TIEMPO';

                image_base64 = await generateReceiptCanvas(reciboData);

                let moraTexto = cuota.estaEnMora ? `\n⚠️ *MORA:* ${cuota.diasMora} días × $2 = ${formatMoney(cuota.montoMora)}` : '';
                message = `¡HOLA ${reciboData.socioNombre.toUpperCase()}! 👋\n\n✅ *PAGO REGISTRADO EXITOSAMENTE*\n\nMuchas gracias por realizar tu pago de cuota ${reciboData.numeroCuota} de ${reciboData.plazo}, te informamos que ha sido registrado correctamente.\n\n📋 *DETALLES DEL PAGO:*\n━━━━━━━━━━━━━━━\n🔢 Cuota: ${reciboData.numeroCuota} de ${reciboData.plazo}\n📊 Estado: ${reciboData.estadoCuota}${moraTexto}\n💰 *TOTAL PAGADO:* ${formatMoney(montoPagado)}\n━━━━━━━━━━━━━━━\n📅 Fecha de pago: ${formatDate(fechaPago)}\n🕐 Registrado: ${fechaRegistro}\n💳 Método: ${metodoPago}\n\n📈 *PROGRESO:* ${nuevasCuotasPagadas}/${reciboData.plazo} cuotas pagadas\n\n🏦 _INKA CORP - Tu confianza, nuestro compromiso_`;
            } else {
                image_base64 = await generateMultiQuotaReceiptCanvas(reciboData);
                const listaCuotas = cuotasConMora.map(c => `  • Cuota ${c.numero}: ${formatMoney(c.monto + c.montoMora)}`).join('\n');
                let moraTexto = totalMora > 0 ? `\n⚠️ *MORA TOTAL:* ${formatMoney(totalMora)}` : '';
                message = `¡HOLA ${reciboData.socioNombre.toUpperCase()}! 👋\n\n✅ *PAGO MÚLTIPLE REGISTRADO*\n\nMuchas gracias por adelantar ${cantidadCuotas} cuotas de tu crédito. Tu pago ha sido registrado correctamente.\n\n📋 *DETALLE DE CUOTAS PAGADAS:*\n━━━━━━━━━━━━━━━\n${listaCuotas}\n━━━━━━━━━━━━━━━\n💵 Subtotal cuotas: ${formatMoney(montoBase)}${moraTexto}\n💰 *TOTAL PAGADO:* ${formatMoney(montoPagado)}\n━━━━━━━━━━━━━━━\n📅 Fecha de pago: ${formatDate(fechaPago)}\n🕐 Registrado: ${fechaRegistro}\n💳 Método: ${metodoPago}\n\n📈 *PROGRESO:* ${nuevasCuotasPagadas}/${reciboData.plazo} cuotas pagadas\n\n🏦 _INKA CORP - Tu confianza, nuestro compromiso_`;
            }

            const whatsapp = currentViewingCredito.socio?.whatsapp || '';
            const socioResult = await sendPaymentWebhook({ 
                whatsapp: whatsapp, 
                image_base64: image_base64, 
                message: message 
            });

            if (socioResult.success) {
                const noticeimage_base64 = cantidadCuotas === 1 ? await generateNoticeCanvas(reciboData) : await generateMultiQuotaNoticeCanvas(reciboData);
                const detailList = cantidadCuotas === 1 
                    ? `🔢 Cuota: ${reciboData.numeroCuota} de ${reciboData.plazo}\n📊 Estado: ${reciboData.estadoCuota}${totalMora > 0 ? ` (Mora: ${formatMoney(totalMora)})` : ''}`
                    : `🔢 Cuotas pagadas: ${cantidadCuotas}\n💰 Detalle: ${montoBase.toFixed(2)}${totalMora > 0 ? ` + Mora: ${totalMora.toFixed(2)}` : ''}`;

                const ownerMessage = `JOSÉ KLEVER NISHVE CORO se ha registrado el pago de un crédito con los siguientes detalles:\n\n👤 Socio: ${reciboData.socioNombre.toUpperCase()}\n🆔 Cédula: ${reciboData.socioCedula}\n📑 Crédito: ${reciboData.codigoCredito}\n${detailList}\n💵 TOTAL RECIBIDO: ${formatMoney(montoPagado)}\n📅 Fecha Pago: ${formatDate(fechaPago)}\n🕐 Registro: ${fechaRegistro}\n💳 Método: ${metodoPago}\n\nTe comentamos que el socio ya ha sido notificado correctamente vía WhatsApp. ✅`;

                await sendOwnerWebhook({ 
                    whatsapp: whatsapp, // Enviamos el whatsapp del socio como referencia o destino si el hook lo requiere
                    image_base64: noticeimage_base64, 
                    message: ownerMessage 
                });
                console.log('Notificaciones de producción enviadas correctamente');
            }
        } catch (errorNotif) {
            console.error('Error en el sistema de notificaciones:', errorNotif);
            // No bloqueamos el flujo principal si fallan las notificaciones
        }

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
        btnConfirmar.innerHTML = '<i class="fas fa-check-circle"></i> Confirmar Pago';
    }
}

// ==========================================
// UTILIDADES
// ==========================================
function formatMoney(amount) {
    return '$' + parseFloat(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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

/**
 * Obtiene la fecha/hora actual en zona horaria Ecuador
 * @returns {Date} Fecha actual en Ecuador
 */
function getEcuadorNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
}

/**
 * Obtiene la fecha actual de Ecuador como string YYYY-MM-DD
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
function getEcuadorDateString() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { // format yyyy-mm-dd
        timeZone: 'America/Guayaquil',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(now);
}

/**
 * Formatea fecha/hora actual de Ecuador para mostrar
 * @returns {string} Fecha y hora formateada
 */
function formatEcuadorDateTime() {
    return new Date().toLocaleString('es-EC', {
        timeZone: 'America/Guayaquil',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * Calcula la mora para una cuota vencida
 * @param {string} fechaVencimiento - Fecha de vencimiento de la cuota (YYYY-MM-DD)
 * @param {string} fechaPago - Fecha en que se realiza el pago (YYYY-MM-DD). Si es null, usa fecha actual.
 * @param {number} costoPorDia - Costo por día de mora (default: $2)
 * @returns {Object} { diasMora, montoMora, estaEnMora }
 */
function calcularMora(fechaVencimiento, fechaPago = null, costoPorDia = 2) {
    if (!fechaVencimiento) {
        return { diasMora: 0, montoMora: 0, estaEnMora: false };
    }

    // Fecha de pago (o fecha actual si no se especifica)
    const fechaPagoDate = fechaPago
        ? parseDate(fechaPago)
        : getEcuadorNow();

    // Fecha de vencimiento
    const fechaVencDate = parseDate(fechaVencimiento);

    if (!fechaPagoDate || !fechaVencDate) {
        return { diasMora: 0, montoMora: 0, estaEnMora: false };
    }

    // Calcular diferencia en días
    const diffTime = fechaPagoDate.getTime() - fechaVencDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
        // Pago a tiempo o anticipado
        return { diasMora: 0, montoMora: 0, estaEnMora: false };
    }

    return {
        diasMora: diffDays,
        montoMora: diffDays * costoPorDia,
        estaEnMora: true
    };
}

/**
 * Calcula mora total para múltiples cuotas
 * @param {Array} cuotas - Array de cuotas con fecha_vencimiento
 * @param {string} fechaPago - Fecha de pago
 * @param {number} costoPorDia - Costo por día de mora
 * @returns {Object} { totalMora, cuotasConMora }
 */
function calcularMoraMultiple(cuotas, fechaPago = null, costoPorDia = 2) {
    let totalMora = 0;
    const cuotasConMora = cuotas.map(cuota => {
        const mora = calcularMora(cuota.fecha_vencimiento, fechaPago, costoPorDia);
        totalMora += mora.montoMora;
        return {
            ...cuota,
            ...mora
        };
    });

    return { totalMora, cuotasConMora };
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
    const controls = document.getElementById('pago-upload-controls');
    const previewWrapper = document.getElementById('pago-preview-wrapper');
    const previewImg = document.getElementById('pago-comprobante-preview');

    if (controls && previewWrapper && previewImg) {
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            controls.classList.add('hidden');
            previewWrapper.classList.remove('hidden');
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

    const controls = document.getElementById('pago-upload-controls');
    const previewWrapper = document.getElementById('pago-preview-wrapper');
    const previewImg = document.getElementById('pago-comprobante-preview');
    const cameraInput = document.getElementById('pago-comprobante-camera');
    const galleryInput = document.getElementById('pago-comprobante-gallery');

    if (controls) controls.classList.remove('hidden');
    if (previewWrapper) previewWrapper.classList.add('hidden');
    if (previewImg) previewImg.src = '';
    if (cameraInput) cameraInput.value = '';
    if (galleryInput) galleryInput.value = '';
}

// ==========================================
// WEBHOOK DE PAGO CON RECIBO CANVAS
// ==========================================

/**
 * Genera una imagen de recibo de pago usando Canvas
 * @param {Object} data - Datos del pago
 * @returns {Promise<string>} - Imagen en formato base64
 */
async function generateReceiptCanvas(data) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Dimensiones del recibo
        canvas.width = 600;
        canvas.height = 750;

        // Cargar logo
        const logo = new Image();
        logo.crossOrigin = 'anonymous';
        logo.src = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';

        logo.onload = () => {
            // Fondo blanco
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Barra superior verde
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
            gradient.addColorStop(0, '#0B4E32');
            gradient.addColorStop(1, '#146E3A');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, 110);

            // Dibujar logo (izquierda del encabezado)
            const logoSize = 60;
            const logoX = 30;
            const logoY = 25;
            ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);

            // Título INKA CORP (al lado del logo)
            ctx.fillStyle = '#F2BB3A';
            ctx.font = 'bold 32px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('INKA CORP', logoX + logoSize + 15, 55);

            // Subtítulo
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '13px Arial';
            ctx.fillText('COMPROBANTE DE PAGO', logoX + logoSize + 15, 80);

            finishDrawing();
        };

        logo.onerror = () => {
            // Si falla la carga del logo, dibujar sin él
            console.warn('No se pudo cargar el logo, dibujando sin él');

            // Fondo blanco
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Barra superior verde
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
            gradient.addColorStop(0, '#0B4E32');
            gradient.addColorStop(1, '#146E3A');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, 100);

            // Título INKA CORP (centrado si no hay logo)
            ctx.fillStyle = '#F2BB3A';
            ctx.font = 'bold 36px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('INKA CORP', canvas.width / 2, 55);

            // Subtítulo
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '14px Arial';
            ctx.fillText('COMPROBANTE DE PAGO', canvas.width / 2, 80);

            finishDrawing();
        };

        function finishDrawing() {

            // Fecha y hora
            const now = new Date();
            ctx.fillStyle = '#64748B';
            ctx.font = '12px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(now.toLocaleString('es-EC', {
                timeZone: 'America/Guayaquil',
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
            }), canvas.width - 30, 130);

            // Línea decorativa
            ctx.strokeStyle = '#E2E8F0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(30, 150);
            ctx.lineTo(canvas.width - 30, 150);
            ctx.stroke();

            // Sección SOCIO
            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('SOCIO', 30, 180);

            ctx.fillStyle = '#0F172A';
            ctx.font = 'bold 22px Arial';
            ctx.fillText(data.socioNombre || 'N/A', 30, 210);

            ctx.fillStyle = '#64748B';
            ctx.font = '14px Arial';
            ctx.fillText('Cédula: ' + (data.socioCedula || 'N/A'), 30, 235);

            // Línea
            ctx.strokeStyle = '#E2E8F0';
            ctx.beginPath();
            ctx.moveTo(30, 260);
            ctx.lineTo(canvas.width - 30, 260);
            ctx.stroke();

            // Sección CRÉDITO
            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 14px Arial';
            ctx.fillText('CRÉDITO', 30, 290);

            ctx.fillStyle = '#0F172A';
            ctx.font = 'bold 18px Arial';
            ctx.fillText(data.codigoCredito || 'N/A', 30, 318);

            // Grid de información
            const infoY = 350;
            const colWidth = (canvas.width - 60) / 2;

            // Columna 1: Capital
            ctx.fillStyle = '#64748B';
            ctx.font = '12px Arial';
            ctx.fillText('CAPITAL TOTAL', 30, infoY);
            ctx.fillStyle = '#0F172A';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(formatMoney(data.capitalTotal), 30, infoY + 22);

            // Columna 2: Plazo
            ctx.fillStyle = '#64748B';
            ctx.font = '12px Arial';
            ctx.fillText('PLAZO', 30 + colWidth, infoY);
            ctx.fillStyle = '#0F172A';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(data.plazo + ' meses', 30 + colWidth, infoY + 22);

            // Línea
            ctx.strokeStyle = '#E2E8F0';
            ctx.beginPath();
            ctx.moveTo(30, infoY + 50);
            ctx.lineTo(canvas.width - 30, infoY + 50);
            ctx.stroke();

            // Sección DETALLES DEL PAGO (caja destacada)
            const pagoBoxY = infoY + 70;
            const boxHeight = data.estaEnMora ? 240 : 200;
            ctx.fillStyle = 'rgba(11, 78, 50, 0.08)';
            ctx.beginPath();
            ctx.roundRect(30, pagoBoxY, canvas.width - 60, boxHeight, 15);
            ctx.fill();

            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('DETALLES DEL PAGO', 50, pagoBoxY + 30);

            // Cuota
            ctx.fillStyle = '#64748B';
            ctx.font = '12px Arial';
            ctx.fillText('CUOTA', 50, pagoBoxY + 60);
            ctx.fillStyle = '#0F172A';
            ctx.font = 'bold 18px Arial';
            ctx.fillText(`${data.numeroCuota} de ${data.plazo}`, 50, pagoBoxY + 82);

            // Estado
            ctx.fillStyle = '#64748B';
            ctx.font = '12px Arial';
            ctx.textAlign = 'right';
            ctx.fillText('ESTADO', canvas.width - 50, pagoBoxY + 60);

            // Badge de estado (basado en mora)
            const estadoColor = data.estaEnMora ? '#EF4444' : '#10B981';
            const estadoText = data.estaEnMora ? `MORA (${data.diasMora}d)` : 'A TIEMPO';
            ctx.fillStyle = estadoColor;
            ctx.font = 'bold 14px Arial';
            ctx.fillText(estadoText, canvas.width - 50, pagoBoxY + 82);

            // Si hay mora, mostrar detalle
            let yOffset = 0;
            if (data.estaEnMora && data.totalMora > 0) {
                ctx.textAlign = 'center';
                ctx.fillStyle = '#EF4444';
                ctx.font = '12px Arial';
                ctx.fillText(`⚠️ Mora: ${data.diasMora} días × $2 = ${formatMoney(data.totalMora)}`, canvas.width / 2, pagoBoxY + 105);
                yOffset = 25;
            }

            // Monto pagado (grande y destacado)
            ctx.textAlign = 'center';
            ctx.fillStyle = '#64748B';
            ctx.font = '12px Arial';
            ctx.fillText('TOTAL PAGADO', canvas.width / 2, pagoBoxY + 120 + yOffset);

            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 42px Arial';
            ctx.fillText(formatMoney(data.montoPagado), canvas.width / 2, pagoBoxY + 170 + yOffset);

            // Información adicional (fechas y método)
            const adicionalY = pagoBoxY + boxHeight + 20;
            ctx.textAlign = 'left';

            // Fila 1: Fechas
            const col3Width = (canvas.width - 60) / 3;

            // Fecha de pago
            ctx.fillStyle = '#64748B';
            ctx.font = '11px Arial';
            ctx.fillText('FECHA DE PAGO', 30, adicionalY);
            ctx.fillStyle = '#0F172A';
            ctx.font = '13px Arial';
            ctx.fillText(formatDate(data.fechaPago), 30, adicionalY + 16);

            // Fecha de registro
            ctx.fillStyle = '#64748B';
            ctx.font = '11px Arial';
            ctx.fillText('REGISTRADO', 30 + col3Width, adicionalY);
            ctx.fillStyle = '#0F172A';
            ctx.font = '12px Arial';
            ctx.fillText(data.fechaRegistro || formatEcuadorDateTime(), 30 + col3Width, adicionalY + 16);

            // Método
            ctx.fillStyle = '#64748B';
            ctx.font = '11px Arial';
            ctx.fillText('MÉTODO', 30 + col3Width * 2, adicionalY);
            ctx.fillStyle = '#0F172A';
            ctx.font = '13px Arial';
            ctx.fillText(data.metodoPago || 'N/A', 30 + col3Width * 2, adicionalY + 16);

            // Pie de página
            ctx.fillStyle = '#94A3B8';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Este comprobante fue generado automáticamente por INKA CORP', canvas.width / 2, canvas.height - 40);
            ctx.fillText('Guarda este comprobante como respaldo de tu pago', canvas.width / 2, canvas.height - 22);

            // Convertir a base64
            const base64 = canvas.toDataURL('image/png');
            console.log('Recibo generado como imagen base64');
            resolve(base64);
        }
    });
}

/**
 * Envía el webhook de notificación de pago
 * @param {Object} payload - Datos a enviar
 */
async function sendPaymentWebhook(payload) {
    const WEBHOOK_URL = 'https://lpwebhook.luispinta.com/webhook/recibosocios';

    try {
        console.log('Enviando webhook de pago a:', WEBHOOK_URL);
        console.log('Payload:', { ...payload, image_base64: '[BASE64_IMAGE]' });

        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.text();
        console.log('Webhook enviado exitosamente. Respuesta:', result);
        return { success: true, response: result };

    } catch (error) {
        console.error('Error enviando webhook:', error);
        return { success: false, error: error.message };
    }
}


/**
 * Genera un recibo para pago de múltiples cuotas usando Canvas
 * @param {Object} data - Datos del pago con múltiples cuotas
 * @returns {Promise<string>} - Imagen en formato base64
 */
async function generateMultiQuotaReceiptCanvas(data) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Altura dinámica según cantidad de cuotas
        const baseHeight = 650;
        const cuotaRowHeight = 35;
        const extraHeight = Math.max(0, (data.cuotas.length - 3) * cuotaRowHeight);
        canvas.width = 600;
        canvas.height = baseHeight + extraHeight;

        // Cargar logo
        const logo = new Image();
        logo.crossOrigin = 'anonymous';
        logo.src = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';

        logo.onload = () => {
            drawReceipt(true);
        };

        logo.onerror = () => {
            console.warn('No se pudo cargar el logo');
            drawReceipt(false);
        };

        function drawReceipt(withLogo) {
            // Fondo blanco
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Barra superior verde
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
            gradient.addColorStop(0, '#0B4E32');
            gradient.addColorStop(1, '#146E3A');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, 110);

            if (withLogo) {
                ctx.drawImage(logo, 30, 25, 60, 60);
                ctx.fillStyle = '#F2BB3A';
                ctx.font = 'bold 32px Arial';
                ctx.textAlign = 'left';
                ctx.fillText('INKA CORP', 105, 55);
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '13px Arial';
                ctx.fillText('PAGO DE MÚLTIPLES CUOTAS', 105, 80);
            } else {
                ctx.fillStyle = '#F2BB3A';
                ctx.font = 'bold 36px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('INKA CORP', canvas.width / 2, 55);
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '14px Arial';
                ctx.fillText('PAGO DE MÚLTIPLES CUOTAS', canvas.width / 2, 80);
            }

            // Badge de cantidad de cuotas
            ctx.fillStyle = '#F2BB3A';
            ctx.beginPath();
            ctx.roundRect(canvas.width - 100, 35, 70, 40, 10);
            ctx.fill();
            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${data.cantidadCuotas}`, canvas.width - 65, 55);
            ctx.font = 'bold 11px Arial';
            ctx.fillText('CUOTAS', canvas.width - 65, 68);

            // Fecha y hora
            const now = new Date();
            ctx.fillStyle = '#64748B';
            ctx.font = '12px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(now.toLocaleString('es-EC', {
                timeZone: 'America/Guayaquil',
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
            }), canvas.width - 30, 130);

            // Línea
            ctx.strokeStyle = '#E2E8F0';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(30, 145);
            ctx.lineTo(canvas.width - 30, 145);
            ctx.stroke();

            // Sección SOCIO
            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('SOCIO', 30, 170);
            ctx.fillStyle = '#0F172A';
            ctx.font = 'bold 20px Arial';
            ctx.fillText(data.socioNombre || 'N/A', 30, 195);
            ctx.fillStyle = '#64748B';
            ctx.font = '13px Arial';
            ctx.fillText('Cédula: ' + (data.socioCedula || 'N/A') + '  |  Crédito: ' + (data.codigoCredito || 'N/A'), 30, 218);

            // Línea
            ctx.strokeStyle = '#E2E8F0';
            ctx.beginPath();
            ctx.moveTo(30, 235);
            ctx.lineTo(canvas.width - 30, 235);
            ctx.stroke();

            // Tabla de cuotas
            let tableY = 255;

            // Header de tabla (añadir columna MORA)
            ctx.fillStyle = 'rgba(11, 78, 50, 0.1)';
            ctx.fillRect(30, tableY, canvas.width - 60, 30);
            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('CUOTA', 50, tableY + 20);
            ctx.textAlign = 'center';
            ctx.fillText('ESTADO', canvas.width * 0.4, tableY + 20);
            ctx.fillText('MORA', canvas.width * 0.6, tableY + 20);
            ctx.textAlign = 'right';
            ctx.fillText('SUBTOTAL', canvas.width - 50, tableY + 20);

            tableY += 35;

            // Filas de cuotas (con mora)
            ctx.font = '12px Arial';
            data.cuotas.forEach((cuota, idx) => {
                // Fondo alternado
                if (idx % 2 === 0) {
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.02)';
                    ctx.fillRect(30, tableY - 5, canvas.width - 60, cuotaRowHeight);
                }

                // Cuota
                ctx.textAlign = 'left';
                ctx.fillStyle = '#0F172A';
                ctx.font = 'bold 12px Arial';
                ctx.fillText(`Cuota ${cuota.numero}`, 50, tableY + 15);

                // Estado con color (basado en mora)
                ctx.textAlign = 'center';
                const estadoColor = cuota.estaEnMora ? '#EF4444' : '#10B981';
                const estadoTexto = cuota.estaEnMora ? `Mora ${cuota.diasMora}d` : 'A tiempo';
                ctx.fillStyle = estadoColor;
                ctx.font = 'bold 11px Arial';
                ctx.fillText(estadoTexto, canvas.width * 0.4, tableY + 15);

                // Mora
                ctx.fillStyle = cuota.estaEnMora ? '#EF4444' : '#64748B';
                ctx.font = '11px Arial';
                const moraText = cuota.estaEnMora ? formatMoney(cuota.montoMora) : '$0.00';
                ctx.fillText(moraText, canvas.width * 0.6, tableY + 15);

                // Subtotal (cuota + mora)
                ctx.textAlign = 'right';
                ctx.fillStyle = '#0F172A';
                ctx.font = '12px Arial';
                const subtotal = cuota.monto + (cuota.montoMora || 0);
                ctx.fillText(formatMoney(subtotal), canvas.width - 50, tableY + 15);

                tableY += cuotaRowHeight;
            });

            // Línea antes del total
            ctx.strokeStyle = '#0B4E32';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(30, tableY + 5);
            ctx.lineTo(canvas.width - 30, tableY + 5);
            ctx.stroke();

            // Si hay mora, mostrar subtotal + mora = total
            if (data.totalMora > 0) {
                tableY += 20;

                // Subtotal cuotas
                ctx.textAlign = 'left';
                ctx.fillStyle = '#64748B';
                ctx.font = '12px Arial';
                ctx.fillText('Subtotal cuotas:', 50, tableY + 10);
                ctx.textAlign = 'right';
                ctx.fillStyle = '#0F172A';
                ctx.fillText(formatMoney(data.montoBase), canvas.width - 50, tableY + 10);

                tableY += 20;

                // Total mora
                ctx.textAlign = 'left';
                ctx.fillStyle = '#EF4444';
                ctx.font = 'bold 12px Arial';
                ctx.fillText('⚠️ Total mora:', 50, tableY + 10);
                ctx.textAlign = 'right';
                ctx.fillText(formatMoney(data.totalMora), canvas.width - 50, tableY + 10);

                tableY += 15;
            }

            // TOTAL
            tableY += 20;
            ctx.fillStyle = 'rgba(11, 78, 50, 0.08)';
            ctx.beginPath();
            ctx.roundRect(30, tableY, canvas.width - 60, 50, 10);
            ctx.fill();

            ctx.textAlign = 'left';
            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 16px Arial';
            ctx.fillText('TOTAL PAGADO', 50, tableY + 32);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 28px Arial';
            ctx.fillText(formatMoney(data.montoPagado), canvas.width - 50, tableY + 35);

            // Información adicional (3 columnas: Fecha pago, Registrado, Método)
            tableY += 70;
            const col3Width = (canvas.width - 60) / 3;
            ctx.textAlign = 'left';

            // Fecha de pago
            ctx.fillStyle = '#64748B';
            ctx.font = '11px Arial';
            ctx.fillText('FECHA DE PAGO', 30, tableY);
            ctx.fillStyle = '#0F172A';
            ctx.font = '13px Arial';
            ctx.fillText(formatDate(data.fechaPago), 30, tableY + 16);

            // Fecha de registro
            ctx.fillStyle = '#64748B';
            ctx.font = '11px Arial';
            ctx.fillText('REGISTRADO', 30 + col3Width, tableY);
            ctx.fillStyle = '#0F172A';
            ctx.font = '11px Arial';
            ctx.fillText(data.fechaRegistro || formatEcuadorDateTime(), 30 + col3Width, tableY + 16);

            // Método
            ctx.fillStyle = '#64748B';
            ctx.font = '11px Arial';
            ctx.fillText('MÉTODO', 30 + col3Width * 2, tableY);
            ctx.fillStyle = '#0F172A';
            ctx.font = '13px Arial';
            ctx.fillText(data.metodoPago || 'N/A', 30 + col3Width * 2, tableY + 16);

            // Pie de página
            ctx.fillStyle = '#94A3B8';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Este comprobante fue generado automáticamente por INKA CORP', canvas.width / 2, canvas.height - 30);
            ctx.fillText('Guarda este comprobante como respaldo de tu pago', canvas.width / 2, canvas.height - 14);

            // Convertir a base64
            const base64 = canvas.toDataURL('image/png');
            console.log('Recibo multicuota generado como imagen base64');
            resolve(base64);
        }
    });
}

/**
 * Genera una imagen de aviso de pago para el administrador
 */
async function generateNoticeCanvas(data) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 600;
        canvas.height = 750;

        const logo = new Image();
        logo.crossOrigin = 'anonymous';
        logo.src = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';

        logo.onload = () => { draw('withLogo'); };
        logo.onerror = () => { draw('noLogo'); };

        function draw(mode) {
            // Fondo blanco con borde verde
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#0B4E32';
            ctx.lineWidth = 15;
            ctx.strokeRect(0, 0, canvas.width, canvas.height);

            // Barra superior de "AVISO"
            ctx.fillStyle = '#C2410C'; // Color naranja fuerte para aviso
            ctx.fillRect(15, 15, canvas.width - 30, 90);

            if (mode === 'withLogo') {
                ctx.drawImage(logo, 40, 30, 60, 60);
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 36px Arial';
                ctx.textAlign = 'left';
                ctx.fillText('AVISO DE PAGO', 120, 65);
                ctx.font = '14px Arial';
                ctx.fillText('NOTIFICACIÓN DE REGISTRO', 120, 85);
            } else {
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 40px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('AVISO DE PAGO', canvas.width / 2, 70);
            }

            // Datos del socio
            ctx.fillStyle = '#0F172A';
            ctx.textAlign = 'center';
            ctx.font = 'bold 24px Arial';
            ctx.fillText(data.socioNombre.toUpperCase(), canvas.width / 2, 160);
            ctx.font = '16px Arial';
            ctx.fillStyle = '#475569';
            ctx.fillText('Ha registrado el pago de una cuota', canvas.width / 2, 190);

            // Caja de detalles
            ctx.fillStyle = '#F8FAFC';
            ctx.beginPath();
            ctx.roundRect(50, 220, canvas.width - 100, 380, 20);
            ctx.fill();
            ctx.strokeStyle = '#E2E8F0';
            ctx.stroke();

            // Detalles
            const startY = 270;
            ctx.textAlign = 'left';
            ctx.fillStyle = '#64748B';
            ctx.font = '14px Arial';

            const fields = [
                { label: 'CÓDIGO CRÉDITO:', value: data.codigoCredito },
                { label: 'NÚMERO CUOTA:', value: `${data.numeroCuota} de ${data.plazo}` },
                { label: 'ESTADO:', value: data.estaEnMora ? 'CON MORA' : 'A TIEMPO' },
                { label: 'MONTO BASE:', value: formatMoney(data.montoBase) },
                { label: 'MORA:', value: formatMoney(data.totalMora) },
                { label: 'MONTO PAGADO:', value: formatMoney(data.montoPagado), color: '#0B4E32', size: 'bold 22px' },
                { label: 'FECHA PAGO:', value: formatDate(data.fechaPago) },
                { label: 'MÉTODO:', value: data.metodoPago }
            ];

            fields.forEach((f, i) => {
                ctx.fillStyle = '#64748B';
                ctx.font = 'bold 13px Arial';
                ctx.fillText(f.label, 80, startY + (i * 45));
                
                ctx.fillStyle = f.color || '#0F172A';
                ctx.font = f.size || 'bold 16px Arial';
                ctx.fillText(f.value, 250, startY + (i * 45));
            });

            // Footer aviso
            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('El socio ya ha sido notificado vía WhatsApp', canvas.width / 2, 650);

            ctx.fillStyle = '#94A3B8';
            ctx.font = 'italic 12px Arial';
            ctx.fillText('Generado por el sistema de INKA CORP', canvas.width / 2, 710);

            resolve(canvas.toDataURL('image/png'));
        }
    });
}

/**
 * Genera una imagen de aviso de multicuota para el administrador
 */
async function generateMultiQuotaNoticeCanvas(data) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 600;
        canvas.height = 850;

        const logo = new Image();
        logo.crossOrigin = 'anonymous';
        logo.src = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';

        logo.onload = () => { draw('withLogo'); };
        logo.onerror = () => { draw('noLogo'); };

        function draw(mode) {
            // Fondo blanco con borde verde
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#0B4E32';
            ctx.lineWidth = 15;
            ctx.strokeRect(0, 0, canvas.width, canvas.height);

            // Barra superior de "AVISO"
            ctx.fillStyle = '#C2410C'; 
            ctx.fillRect(15, 15, canvas.width - 30, 90);

            if (mode === 'withLogo') {
                ctx.drawImage(logo, 40, 30, 60, 60);
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 36px Arial';
                ctx.textAlign = 'left';
                ctx.fillText('AVISO MULTIPAGO', 120, 65);
                ctx.font = '14px Arial';
                ctx.fillText('REPORTE DE MULTICUOTAS', 120, 85);
            }

            ctx.fillStyle = '#0F172A';
            ctx.textAlign = 'center';
            ctx.font = 'bold 24px Arial';
            ctx.fillText(data.socioNombre.toUpperCase(), canvas.width / 2, 160);
            ctx.font = '16px Arial';
            ctx.fillStyle = '#475569';
            ctx.fillText(`Ha registrado el pago de ${data.cantidadCuotas} cuotas`, canvas.width / 2, 190);

            // Caja de detalles
            ctx.fillStyle = '#F8FAFC';
            ctx.beginPath();
            ctx.roundRect(50, 220, canvas.width - 100, 520, 20);
            ctx.fill();

            // Lista resumida de cuotas
            let y = 260;
            ctx.textAlign = 'left';
            ctx.font = 'bold 14px Arial';
            ctx.fillStyle = '#0B4E32';
            ctx.fillText('RESUMEN DE CUOTAS:', 80, y);
            y += 30;

            const cuotasAMostrar = data.cuotas.slice(0, 8);
            cuotasAMostrar.forEach((c, i) => {
                ctx.fillStyle = '#475569';
                ctx.font = '13px Arial';
                const moraPart = c.estaEnMora ? ` (+ mora ${formatMoney(c.montoMora)})` : '';
                ctx.fillText(`• Cuota ${c.numero}: ${formatMoney(c.monto)}${moraPart}`, 80, y + (i * 25));
            });

            if (data.cuotas.length > 8) {
                ctx.fillText(`... y ${data.cuotas.length - 8} cuotas más`, 80, y + (8 * 25));
            }

            // Totales
            const totalsY = 530;
            ctx.strokeStyle = '#E2E8F0';
            ctx.beginPath();
            ctx.moveTo(80, totalsY);
            ctx.lineTo(520, totalsY);
            ctx.stroke();

            const finalFields = [
                { label: 'MONTO BASE:', value: formatMoney(data.montoBase) },
                { label: 'MORA TOTAL:', value: formatMoney(data.totalMora) },
                { label: 'TOTAL PAGADO:', value: formatMoney(data.montoPagado), color: '#0B4E32', size: 'bold 24px' },
                { label: 'FECHA PAGO:', value: formatDate(data.fechaPago) },
                { label: 'REGISTRADO:', value: data.fechaRegistro }
            ];

            finalFields.forEach((f, i) => {
                ctx.fillStyle = '#64748B';
                ctx.font = 'bold 13px Arial';
                ctx.fillText(f.label, 80, totalsY + 30 + (i * 40));
                ctx.fillStyle = f.color || '#0F172A';
                ctx.font = f.size || 'bold 16px Arial';
                ctx.fillText(f.value, 250, totalsY + 30 + (i * 40));
            });

            ctx.fillStyle = '#0B4E32';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('El socio ya ha sido notificado vía WhatsApp', canvas.width / 2, 780);

            resolve(canvas.toDataURL('image/png'));
        }
    });
}

/**
 * Envía el segundo webhook al administrador (Jose)
 */
async function sendOwnerWebhook(payload) {
    const WEBHOOK_URL_OWNER = 'https://lpwebhook.luispinta.com/webhook/recibosociosJose';

    try {
        console.log('Enviando aviso al administrador:', WEBHOOK_URL_OWNER);
        const response = await fetch(WEBHOOK_URL_OWNER, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { success: true };
    } catch (error) {
        console.error('Error enviando aviso al admin:', error);
        return { success: false, error: error.message };
    }
}

// Exponer función al scope global

// Exponer funciones necesarias al scope global
window.generateReceiptCanvas = generateReceiptCanvas;
window.generateNoticeCanvas = generateNoticeCanvas;
window.sendPaymentWebhook = sendPaymentWebhook;
window.sendOwnerWebhook = sendOwnerWebhook;

