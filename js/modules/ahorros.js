/**
 * INKA CORP - Módulo de Ahorros Programados
 * Gestión de ahorros acumulados de los créditos
 */

// ==========================================
// ESTADO DEL MÓDULO
// ==========================================
let allAhorros = [];
let filteredAhorros = [];
let currentFilterAhorro = '';
let currentViewingAhorro = null;

// ==========================================
// UTILIDADES DE MODALES
// ==========================================
function setupModalCloseHandlers(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Cerrar al hacer click en backdrop o botón close
    modal.querySelectorAll('[data-close-modal]').forEach(el => {
        el.onclick = () => closeModal(modalId);
    });

    // Cerrar con ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeModal(modalId);
        }
    });
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// ==========================================
// INICIALIZACIÓN
// ==========================================
function initAhorrosModule() {
    loadAhorros();
    setupAhorrosEventListeners();
}

function setupAhorrosEventListeners() {
    // Búsqueda
    const searchInput = document.getElementById('search-ahorros');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            filterAhorros();
        }, 300));
    }

    // Modal close handlers
    setupModalCloseHandlers('ver-ahorro-modal');
    setupModalCloseHandlers('devolucion-modal');
}

// Función para filtrar por estado desde toolbar
function filterAhorrosByEstado(estado) {
    // Actualizar botones activos
    document.querySelectorAll('.ahorros-toolbar .filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.estado === estado) {
            btn.classList.add('active');
        }
    });
    
    currentFilterAhorro = estado;
    filterAhorros();
}

// Función para refrescar datos
async function refreshAhorros() {
    const btn = document.getElementById('btn-sync-ahorros');
    if (btn) {
        btn.classList.add('spinning');
        btn.disabled = true;
    }
    
    await loadAhorros(true); // Forzar actualización
    showToast('Ahorros actualizados', 'success');
    
    if (btn) {
        btn.classList.remove('spinning');
        btn.disabled = false;
    }
}

// ==========================================
// CARGAR DATOS (Patrón: Caché Instantáneo + Actualización en Segundo Plano)
// ==========================================
async function loadAhorros(forceRefresh = false) {
    try {
        // PASO 1: Mostrar datos de caché INMEDIATAMENTE si existen
        if (!forceRefresh && window.hasCacheData && window.hasCacheData('creditos')) {
            console.log('⚡ Mostrando ahorros desde caché de créditos (instantáneo)');
            const creditos = window.getCacheData('creditos');
            processAhorrosFromCreditos(creditos);

            // Si el caché es reciente, no recargar
            if (window.isCacheValid && window.isCacheValid('creditos')) {
                console.log('✓ Caché fresco, no se requiere actualización');
                return;
            }
        }

        // PASO 2: Actualizar en segundo plano
        console.log('⟳ Actualizando ahorros en segundo plano...');
        const supabase = window.getSupabaseClient();

        const { data: creditos, error } = await supabase
            .from('ic_creditos')
            .select(`
                id_credito,
                codigo_credito,
                ahorro_programado_cuota,
                ahorro_programado_total,
                cuotas_pagadas,
                plazo,
                estado_credito,
                socio:ic_socios!id_socio (
                    idsocio,
                    nombre,
                    cedula
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        processAhorrosFromCreditos(creditos);
        console.log('✓ Ahorros actualizados');

    } catch (error) {
        console.error('Error loading ahorros:', error);
        if (!window.hasCacheData || !window.hasCacheData('creditos')) {
            showAhorrosError('Error al cargar los ahorros');
        }
    }
}

// Procesar ahorros desde datos de créditos
function processAhorrosFromCreditos(creditos) {
    allAhorros = (creditos || []).map(credito => {
        const acumulado = (credito.ahorro_programado_cuota || 0) * (credito.cuotas_pagadas || 0);
        const total = credito.ahorro_programado_total || 0;
        const pendiente = total - acumulado;

        return {
            ...credito,
            ahorro_acumulado: acumulado,
            ahorro_pendiente: pendiente > 0 ? pendiente : 0
        };
    });

    filteredAhorros = [...allAhorros];
    updateAhorrosStats();
    renderAhorrosTable(filteredAhorros);
}

// ==========================================
// ESTADÍSTICAS
// ==========================================
function updateAhorrosStats() {
    let totalCreditos = 0;
    let totalAcumulado = 0;
    let pendienteDevolucion = 0;

    // Contadores para tabs
    let countActivos = 0;
    let countCancelados = 0;

    allAhorros.forEach(ahorro => {
        totalCreditos++;
        
        if (ahorro.estado_credito === 'ACTIVO' || ahorro.estado_credito === 'MOROSO') {
            totalAcumulado += ahorro.ahorro_acumulado || 0;
            countActivos++;
        }
        
        // Pendientes de devolución: créditos cancelados/precancelados con ahorro acumulado
        if ((ahorro.estado_credito === 'CANCELADO' || ahorro.estado_credito === 'PRECANCELADO')) {
            countCancelados++;
            // Verificar si tiene ahorro pendiente de devolver (no devuelto aún)
            if (ahorro.ahorro_acumulado > 0) {
                pendienteDevolucion++;
            }
        }
    });

    // Actualizar stats del hero
    document.getElementById('stat-total-ahorros').textContent = totalCreditos;
    document.getElementById('stat-total-acumulado').textContent = formatMoney(totalAcumulado);
    document.getElementById('stat-pendiente-devolucion').textContent = pendienteDevolucion;

    // Actualizar contadores de tabs
    document.getElementById('count-ahorros-all').textContent = totalCreditos;
    document.getElementById('count-ahorros-activo').textContent = countActivos;
    document.getElementById('count-ahorros-cancelado').textContent = countCancelados;
}

// ==========================================
// FILTRAR AHORROS
// ==========================================
function filterAhorros() {
    const searchTerm = document.getElementById('search-ahorros')?.value?.toLowerCase() || '';

    filteredAhorros = allAhorros.filter(ahorro => {
        // Filtro por estado del crédito
        if (currentFilterAhorro) {
            if (currentFilterAhorro === 'ACTIVO') {
                // Mostrar activos y morosos (créditos vigentes)
                if (ahorro.estado_credito !== 'ACTIVO' && ahorro.estado_credito !== 'MOROSO') return false;
            } else if (currentFilterAhorro === 'CANCELADO') {
                // Mostrar cancelados y precancelados
                if (ahorro.estado_credito !== 'CANCELADO' && ahorro.estado_credito !== 'PRECANCELADO') return false;
            }
        }

        // Filtro por búsqueda
        if (searchTerm) {
            const codigo = (ahorro.codigo_credito || '').toLowerCase();
            const nombre = (ahorro.socio?.nombre || '').toLowerCase();
            const cedula = (ahorro.socio?.cedula || '').toLowerCase();

            return codigo.includes(searchTerm) ||
                nombre.includes(searchTerm) ||
                cedula.includes(searchTerm);
        }

        return true;
    });

    renderAhorrosTable(filteredAhorros);
}

// ==========================================
// RENDERIZAR TABLA
// ==========================================
function renderAhorrosTable(ahorros) {
    const tbody = document.getElementById('ahorros-table-body');
    const emptyDiv = document.getElementById('ahorros-empty');

    if (!ahorros || ahorros.length === 0) {
        tbody.innerHTML = '';
        emptyDiv?.classList.remove('hidden');
        return;
    }

    emptyDiv?.classList.add('hidden');

    tbody.innerHTML = ahorros.map(ahorro => {
        const estadoBadge = getEstadoCreditoBadge(ahorro.estado_credito);

        return `
            <tr>
                <td>
                    <span class="codigo-credito">${ahorro.codigo_credito}</span>
                </td>
                <td>
                    <div class="socio-info">
                        <span class="socio-nombre">${ahorro.socio?.nombre || 'N/A'}</span>
                        <span class="socio-cedula">${ahorro.socio?.cedula || ''}</span>
                    </div>
                </td>
                <td class="text-right">${formatMoney(ahorro.ahorro_programado_cuota)}</td>
                <td class="text-right">
                    <strong style="color: #10B981;">${formatMoney(ahorro.ahorro_acumulado)}</strong>
                </td>
                <td>${estadoBadge}</td>
                <td>
                    <button class="btn-ver-ahorro" onclick="viewAhorroDetail('${ahorro.id_credito}')">
                        <i class="fas fa-eye"></i> Ver Detalle
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function getEstadoCreditoBadge(estado) {
    const badges = {
        'ACTIVO': '<span class="badge badge-activo">Activo</span>',
        'MOROSO': '<span class="badge badge-moroso">Moroso</span>',
        'CANCELADO': '<span class="badge badge-cancelado">Cancelado</span>',
        'PRECANCELADO': '<span class="badge badge-devuelto">Precancelado</span>'
    };
    return badges[estado] || `<span class="badge">${estado}</span>`;
}

// ==========================================
// VER DETALLE DE AHORRO
// ==========================================
async function viewAhorroDetail(creditoId) {
    const ahorro = allAhorros.find(a => a.id_credito === creditoId);
    if (!ahorro) {
        showToast('Crédito no encontrado', 'error');
        return;
    }

    currentViewingAhorro = ahorro;

    // Llenar información del modal
    document.getElementById('modal-codigo-ahorro').innerHTML = `
        <i class="fas fa-piggy-bank"></i>
        Ahorro - ${ahorro.codigo_credito}
    `;
    
    // Info del socio
    document.getElementById('ahorro-det-nombre').textContent = ahorro.socio?.nombre || '-';
    document.getElementById('ahorro-det-credito').textContent = ahorro.codigo_credito;

    // Resumen del ahorro
    document.getElementById('ahorro-det-cuota').textContent = formatMoney(ahorro.ahorro_programado_cuota);
    document.getElementById('ahorro-det-acumulado').textContent = formatMoney(ahorro.ahorro_acumulado);
    document.getElementById('ahorro-det-cuotas-pagadas').textContent = `${ahorro.cuotas_pagadas || 0}/${ahorro.plazo}`;

    // Cargar detalle por cuota
    await loadAhorroDetalle(creditoId);

    // Mostrar/ocultar botón de devolución
    const btnDevolver = document.getElementById('btn-devolver-ahorro');
    if (btnDevolver) {
        const canDevolver = ahorro.ahorro_acumulado > 0 &&
            (ahorro.estado_credito === 'CANCELADO' || ahorro.estado_credito === 'PRECANCELADO');
        btnDevolver.style.display = canDevolver ? 'inline-flex' : 'none';
        btnDevolver.onclick = () => openDevolucionModal();
    }

    // Abrir modal
    const modal = document.getElementById('ver-ahorro-modal');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

async function loadAhorroDetalle(creditoId) {
    const tbody = document.getElementById('ahorro-detalle-body');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Cargando...</td></tr>';

    try {
        const supabase = window.getSupabaseClient();
        const { data: ahorros, error } = await supabase
            .from('ic_creditos_ahorro')
            .select('*')
            .eq('id_credito', creditoId)
            .order('numero_cuota', { ascending: true });

        if (error) throw error;

        if (!ahorros || ahorros.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">No hay registros de ahorro</td></tr>';
            return;
        }

        tbody.innerHTML = ahorros.map(item => {
            const estadoBadge = getEstadoAhorroBadge(item.estado);
            const fechaDevolucion = formatDate(item.fecha_devolucion);

            return `
                <tr>
                    <td class="text-center">${item.numero_cuota}</td>
                    <td class="text-right">${formatMoney(item.monto)}</td>
                    <td>${estadoBadge}</td>
                    <td class="text-center">${fechaDevolucion}</td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading ahorro detail:', error);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error al cargar datos</td></tr>';
    }
}

function getEstadoAhorroBadge(estado) {
    const badges = {
        'PENDIENTE': '<span class="badge badge-pendiente">Pendiente</span>',
        'ACUMULADO': '<span class="badge badge-acumulado">Acumulado</span>',
        'DEVUELTO': '<span class="badge badge-devuelto">Devuelto</span>'
    };
    return badges[estado] || `<span class="badge">${estado}</span>`;
}

// ==========================================
// DEVOLUCIÓN DE AHORRO
// ==========================================
function openDevolucionModal() {
    if (!currentViewingAhorro) return;

    document.getElementById('devolucion-monto').textContent = formatMoney(currentViewingAhorro.ahorro_acumulado);
    
    const observacionesEl = document.getElementById('devolucion-observaciones');
    if (observacionesEl) observacionesEl.value = '';

    // Configurar confirmación
    const btnConfirmar = document.getElementById('btn-confirmar-devolucion');
    btnConfirmar.onclick = () => confirmarDevolucion();

    // Abrir modal
    const modal = document.getElementById('devolucion-modal');
    modal.classList.remove('hidden');
}

async function confirmarDevolucion() {
    if (!currentViewingAhorro) return;

    const btnConfirmar = document.getElementById('btn-confirmar-devolucion');
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';

    try {
        const supabase = window.getSupabaseClient();
        const observacion = document.getElementById('devolucion-observaciones')?.value || '';
        const fechaHoy = todayISODate();

        // Actualizar todos los ahorros ACUMULADOS a DEVUELTO
        const { error } = await supabase
            .from('ic_creditos_ahorro')
            .update({
                estado: 'DEVUELTO',
                fecha_devolucion: fechaHoy,
                observacion: observacion
            })
            .eq('id_credito', currentViewingAhorro.id_credito)
            .eq('estado', 'ACUMULADO');

        if (error) throw error;

        // Cerrar modales
        closeModal('devolucion-modal');
        closeModal('ver-ahorro-modal');

        showToast('Ahorro devuelto exitosamente', 'success');
        await loadAhorros();

    } catch (error) {
        console.error('Error devolviendo ahorro:', error);
        showAlert('Error al devolver el ahorro: ' + (error.message || 'Error desconocido'), 'Error', 'error');
    } finally {
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = '<i class="fas fa-check"></i> Confirmar';
    }
}

// ==========================================
// UTILIDADES
// ==========================================
function formatMoney(amount) {
    return '$' + parseFloat(amount || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function showAhorrosError(message) {
    console.error(message);
    const tbody = document.getElementById('ahorros-table-body');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center" style="padding: 2rem; color: var(--error-light);">
                    <i class="fas fa-exclamation-triangle"></i> ${message}
                </td>
            </tr>
        `;
    }
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

// Exponer funciones globalmente para que sean accesibles desde HTML
window.initAhorrosModule = initAhorrosModule;
window.viewAhorroDetail = viewAhorroDetail;
window.filterAhorrosByEstado = filterAhorrosByEstado;
window.refreshAhorros = refreshAhorros;