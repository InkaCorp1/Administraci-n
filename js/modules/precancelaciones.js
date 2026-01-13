/**
 * INKA CORP - Módulo de Precancelaciones
 * Gestión de precancelaciones de créditos activos
 */

// ==========================================
// ESTADO DEL MÓDULO
// ==========================================
let allCreditosPrecancelables = [];
let filteredCreditosPrecancelables = [];
let historialPrecancelaciones = [];
let creditoActual = null;
let calculoPrecancelacion = null;
let currentPaisFilterPrecanc = '';
let currentTab = 'activos';

// Configuración de caché para precancelaciones
const CACHE_DURATION_PRECANC = 5 * 60 * 1000; // 5 minutos
let precancCacheTimestamp = 0;

// Mapeo de países
const PAIS_CONFIG_PRECANC = {
    'ECUADOR': { code: 'EC', name: 'Ecuador', flag: 'https://flagcdn.com/w20/ec.png' },
    'ESTADOS UNIDOS': { code: 'US', name: 'USA', flag: 'https://flagcdn.com/w20/us.png' },
    'USA': { code: 'US', name: 'USA', flag: 'https://flagcdn.com/w20/us.png' },
    'PERÚ': { code: 'PE', name: 'Perú', flag: 'https://flagcdn.com/w20/pe.png' },
    'PERU': { code: 'PE', name: 'Perú', flag: 'https://flagcdn.com/w20/pe.png' }
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
async function initPrecancelacionesModule() {
    console.log('Inicializando módulo de Precancelaciones...');

    // Cargar datos (desde caché si está disponible)
    await loadCreditosPrecancelables();
    await loadHistorialPrecancelaciones();

    // Event listeners
    setupPrecancelacionesEventListeners();

    // Exponer funciones globalmente
    window.abrirModalCalculo = abrirModalCalculo;
    window.verDetallePrecancelacion = verDetallePrecancelacion;
    window.filterPrecancelacionesByPais = filterPrecancelacionesByPais;
    window.switchPrecancelacionTab = switchPrecancelacionTab;
    window.refreshPrecancelaciones = refreshPrecancelaciones;

    // Sincronización en segundo plano
    syncPrecancelacionesBackground();
}

function setupPrecancelacionesEventListeners() {
    // Búsqueda
    const searchInput = document.getElementById('search-precancelacion');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearchPrecanc, 300));
    }

    // Modal calcular precancelación
    const btnCalcular = document.getElementById('btn-calcular-montos');
    if (btnCalcular) {
        btnCalcular.addEventListener('click', handleCalcularMontos);
    }

    // Botón procesar precancelación
    const btnProcesar = document.getElementById('btn-procesar-precancelacion');
    if (btnProcesar) {
        btnProcesar.addEventListener('click', abrirModalConfirmacion);
    }

    // Botón confirmar final
    const btnConfirmar = document.getElementById('btn-confirmar-final');
    if (btnConfirmar) {
        btnConfirmar.addEventListener('click', handleConfirmarPrecancelacion);
    }

    // Fecha de hoy por defecto
    const fechaInput = document.getElementById('fecha-precancelacion');
    if (fechaInput) {
        fechaInput.valueAsDate = new Date();
    }

    // Setup modal close handlers
    setupPrecancModalCloseHandlers('modal-calcular-precancelacion');
    setupPrecancModalCloseHandlers('modal-confirmar-precancelacion');
    setupPrecancModalCloseHandlers('modal-ver-precancelacion');
}

// ==========================================
// MODAL HELPERS
// ==========================================
function openPrecancModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closePrecancModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
    
    // Restaurar scroll si no hay modales abiertos
    const anyOpen = document.querySelector('.modal:not(.hidden)');
    if (!anyOpen) {
        document.body.style.overflow = '';
    }
}

function setupPrecancModalCloseHandlers(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.querySelectorAll('[data-close-modal]').forEach(el => {
        el.addEventListener('click', () => closePrecancModal(modalId));
    });
}

// ==========================================
// CARGA DE DATOS CON CACHÉ PERSISTENTE
// ==========================================

// Verificar si el caché tiene datos (para carga instantánea)
// Usa el caché global de créditos para cargar instantáneamente
function hasPrecancCacheData() {
    // Primero verificar datos en memoria
    if (allCreditosPrecancelables.length > 0) {
        return true;
    }
    // Luego verificar caché global de créditos (que tiene los datos necesarios)
    return window.hasCacheData && window.hasCacheData('creditos');
}

// Verificar si necesita sincronización
function needsPrecancSync() {
    return precancCacheTimestamp === 0 || 
           (Date.now() - precancCacheTimestamp) >= CACHE_DURATION_PRECANC;
}

// Sincronización en segundo plano
function syncPrecancelacionesBackground() {
    // Sincronizar silenciosamente en segundo plano siempre
    console.log('🔄 Sincronizando precancelaciones en segundo plano...');
    setTimeout(async () => {
        await loadCreditosPrecancelablesFromDB(true); // silently = true
        await loadHistorialFromDB(true);
    }, 1500); // Esperar 1.5 segundos antes de sincronizar
}

// Forzar recarga desde DB (botón sincronizar)
async function refreshPrecancelaciones() {
    const btn = document.querySelector('.btn-sync');
    if (btn) {
        btn.classList.add('syncing');
        btn.querySelector('i')?.classList.add('fa-spin');
    }

    try {
        // Forzar recarga desde la base de datos
        await loadCreditosPrecancelablesFromDB(false);
        await loadHistorialFromDB(false);
        showNotification('Datos actualizados correctamente', 'success');
    } catch (error) {
        showNotification('Error al sincronizar: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.classList.remove('syncing');
            btn.querySelector('i')?.classList.remove('fa-spin');
        }
    }
}

async function loadCreditosPrecancelables() {
    // 1. PRIMERO: Carga instantánea desde caché global de créditos
    if (window.hasCacheData && window.hasCacheData('creditos') && allCreditosPrecancelables.length === 0) {
        console.log('⚡ Carga instantánea de precancelaciones desde caché de créditos');
        
        // Filtrar créditos activos y morosos del caché global
        const creditosCache = window.dataCache.creditos.filter(c => 
            c.estado_credito === 'ACTIVO' || c.estado_credito === 'MOROSO'
        );
        
        // Procesar créditos para cálculos básicos
        await procesarCreditosParaPrecancelacion(creditosCache);
        
        // Sincronizar en segundo plano para obtener datos completos
        syncPrecancelacionesBackground();
        return;
    }
    
    // Si ya hay datos en memoria, usarlos
    if (allCreditosPrecancelables.length > 0) {
        console.log('⚡ Usando datos en memoria para precancelaciones');
        filteredCreditosPrecancelables = [...allCreditosPrecancelables];
        updatePrecancelacionesStats();
        renderPrecancelacionesSections();
        
        if (needsPrecancSync()) {
            syncPrecancelacionesBackground();
        }
        return;
    }

    // Si no hay caché, cargar desde DB
    await loadCreditosPrecancelablesFromDB(false);
}

// Procesar créditos del caché para mostrar instantáneamente
async function procesarCreditosParaPrecancelacion(creditos) {
    // Cálculos básicos sin consultar DB adicional
    allCreditosPrecancelables = creditos.map(credito => {
        // Estimación básica del capital pendiente (se actualizará en segundo plano)
        const cuotasPagadas = credito.cuotas_pagadas || 0;
        const plazo = credito.plazo || 12;
        const capitalOriginal = credito.capital || 0;
        
        // Estimación simple: proporción del capital
        const porcentajePagado = cuotasPagadas / plazo;
        const capitalPendienteEstimado = capitalOriginal * (1 - porcentajePagado);
        
        return {
            ...credito,
            capital_pendiente: credito.capital_pendiente || capitalPendienteEstimado,
            ahorro_acumulado: (credito.ahorro_programado_cuota || 0) * cuotasPagadas,
            cuotas_pagadas_count: cuotasPagadas
        };
    });
    
    filteredCreditosPrecancelables = [...allCreditosPrecancelables];
    precancCacheTimestamp = Date.now();
    
    updatePrecancelacionesStats();
    renderPrecancelacionesSections();
}

async function loadCreditosPrecancelablesFromDB(silently = false) {
    try {
        const supabase = window.getSupabaseClient();
        
        // Obtener créditos activos y morosos (ambos pueden precancelarse)
        const { data: creditos, error } = await supabase
            .from('ic_creditos')
            .select(`
                *,
                socio:ic_socios!id_socio(*)
            `)
            .in('estado_credito', ['ACTIVO', 'MOROSO'])
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Calcular capital pendiente de cada crédito
        await calcularCapitalPendiente(creditos);

        allCreditosPrecancelables = creditos;
        filteredCreditosPrecancelables = [...creditos];
        precancCacheTimestamp = Date.now();

        // Actualizar estadísticas y UI
        updatePrecancelacionesStats();
        renderPrecancelacionesSections();

        if (!silently) {
            console.log(`✓ Cargados ${creditos.length} créditos precancelables`);
        } else {
            console.log(`🔄 Sincronizados ${creditos.length} créditos en segundo plano`);
        }

    } catch (error) {
        console.error('Error al cargar créditos:', error);
        if (!silently) {
            showNotification('Error al cargar créditos: ' + error.message, 'error');
        }
    }
}

async function loadHistorialPrecancelaciones() {
    // Primero renderizamos con datos en memoria si existen
    if (historialPrecancelaciones.length > 0) {
        renderHistorialSections();
        return;
    }
    await loadHistorialFromDB(false);
}

async function loadHistorialFromDB(silently = false) {
    try {
        const supabase = window.getSupabaseClient();
        
        const { data, error } = await supabase
            .from('ic_creditos_precancelacion')
            .select(`
                *,
                credito:ic_creditos!id_credito(
                    codigo_credito,
                    capital,
                    plazo,
                    socio:ic_socios!id_socio(nombre, cedula, paisresidencia)
                )
            `)
            .order('fecha_precancelacion', { ascending: false });

        if (error) throw error;

        historialPrecancelaciones = data || [];
        
        // Actualizar contador del tab
        const countEl = document.getElementById('tab-count-historial');
        if (countEl) countEl.textContent = historialPrecancelaciones.length;

        // Actualizar stat de procesados
        const procesadosEl = document.getElementById('precanc-stat-procesados');
        if (procesadosEl) procesadosEl.textContent = historialPrecancelaciones.length;

        // Renderizar si estamos en el tab de historial
        if (currentTab === 'historial') {
            renderHistorialSections();
        }

        if (!silently) {
            console.log(`✓ Cargadas ${historialPrecancelaciones.length} precancelaciones del historial`);
        }

    } catch (error) {
        console.error('Error al cargar historial:', error);
    }
}

async function calcularCapitalPendiente(creditos) {
    const supabase = window.getSupabaseClient();
    
    for (const credito of creditos) {
        try {
            const { data: cuotas, error } = await supabase
                .from('ic_creditos_amortizacion')
                .select('saldo_capital, numero_cuota, estado_cuota')
                .eq('id_credito', credito.id_credito)
                .order('numero_cuota', { ascending: true });

            if (error) throw error;

            const cuotasPagadas = cuotas.filter(c => c.estado_cuota === 'PAGADO');
            const ultimaCuotaPagada = cuotasPagadas.length > 0 ? cuotasPagadas[cuotasPagadas.length - 1] : null;

            if (ultimaCuotaPagada) {
                credito.capital_pendiente = ultimaCuotaPagada.saldo_capital;
            } else {
                credito.capital_pendiente = credito.capital_financiado || credito.capital;
            }

            credito.ahorro_acumulado = cuotasPagadas.length * (credito.ahorro_programado_cuota || 0);
            credito.cuotas_pagadas_count = cuotasPagadas.length;

        } catch (error) {
            console.error('Error al calcular capital para crédito:', credito.codigo_credito, error);
            credito.capital_pendiente = credito.capital;
            credito.ahorro_acumulado = 0;
        }
    }
}

// ==========================================
// ACTUALIZACIÓN DE STATS
// ==========================================
function updatePrecancelacionesStats() {
    const creditos = filteredCreditosPrecancelables;

    // Total créditos activos
    const activosEl = document.getElementById('precanc-stat-activos');
    if (activosEl) activosEl.textContent = creditos.length;

    // Capital pendiente total
    const capitalTotal = creditos.reduce((sum, c) => sum + (c.capital_pendiente || 0), 0);
    const capitalEl = document.getElementById('precanc-stat-capital');
    if (capitalEl) capitalEl.textContent = formatMoney(capitalTotal);

    // Ahorro acumulado total
    const ahorroTotal = creditos.reduce((sum, c) => sum + (c.ahorro_acumulado || 0), 0);
    const ahorroEl = document.getElementById('precanc-stat-ahorro');
    if (ahorroEl) ahorroEl.textContent = formatMoney(ahorroTotal);

    // Contador tab activos
    const tabCountEl = document.getElementById('tab-count-activos');
    if (tabCountEl) tabCountEl.textContent = creditos.length;
}

// ==========================================
// RENDERIZADO
// ==========================================
function renderPrecancelacionesSections() {
    const container = document.getElementById('precancelaciones-sections-container');
    const emptyEl = document.getElementById('precancelaciones-empty');
    
    if (!container) return;

    const creditos = filteredCreditosPrecancelables;

    if (!creditos || creditos.length === 0) {
        container.innerHTML = '';
        emptyEl?.classList.remove('hidden');
        return;
    }

    emptyEl?.classList.add('hidden');

    // Agrupar por estado
    const activos = creditos.filter(c => c.estado_credito === 'ACTIVO');
    const morosos = creditos.filter(c => c.estado_credito === 'MOROSO');

    let html = '';

    // Sección Activos
    if (activos.length > 0) {
        html += renderSeccionCreditos('activos', 'Créditos al Día', 'fa-check-circle', activos);
    }

    // Sección Morosos
    if (morosos.length > 0) {
        html += renderSeccionCreditos('morosos', 'Créditos en Mora', 'fa-exclamation-triangle', morosos);
    }

    container.innerHTML = html;
}

function renderSeccionCreditos(tipo, titulo, icono, creditos) {
    return `
        <div class="precancelaciones-section" data-tipo="${tipo}">
            <div class="section-header-precanc ${tipo}">
                <i class="fas ${icono}"></i>
                <span class="section-title-precanc">${titulo}</span>
                <span class="section-count-precanc">${creditos.length}</span>
            </div>
            <table class="precancelaciones-table">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Socio</th>
                        <th class="text-right">Capital Original</th>
                        <th class="text-center">Cuotas</th>
                        <th class="text-right">Capital Pendiente</th>
                        <th class="text-right">Ahorro</th>
                        <th class="text-center">País</th>
                        <th class="text-center">Acción</th>
                    </tr>
                </thead>
                <tbody>
                    ${creditos.map(c => renderCreditoRowPrecanc(c)).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderCreditoRowPrecanc(credito) {
    const progreso = `${credito.cuotas_pagadas_count || 0}/${credito.plazo}`;
    const pais = credito.socio?.paisresidencia || '';
    const paisConfig = PAIS_CONFIG_PRECANC[pais.toUpperCase()];
    const paisFlag = paisConfig ? paisConfig.flag : '';

    return `
        <tr data-credito-id="${credito.id_credito}">
            <td>
                <span class="codigo-credito">${credito.codigo_credito}</span>
            </td>
            <td>
                <div class="socio-info">
                    <span class="socio-nombre">${credito.socio?.nombre || 'N/A'}</span>
                    <span class="socio-cedula">${credito.socio?.cedula || ''}</span>
                </div>
            </td>
            <td class="text-right">${formatMoney(credito.capital)}</td>
            <td class="text-center">
                <span class="progress-badge">${progreso}</span>
            </td>
            <td class="text-right">
                <span class="capital-amount">${formatMoney(credito.capital_pendiente || 0)}</span>
            </td>
            <td class="text-right">
                <span class="ahorro-amount">${formatMoney(credito.ahorro_acumulado || 0)}</span>
            </td>
            <td class="text-center">
                ${paisFlag ? `<img src="${paisFlag}" alt="${pais}" class="pais-flag-img" title="${pais}">` : '-'}
            </td>
            <td class="text-center">
                <button class="btn-precancelar" onclick="abrirModalCalculo('${credito.id_credito}')">
                    <i class="fas fa-calculator"></i>
                    <span>Precancelar</span>
                </button>
            </td>
        </tr>
    `;
}

function renderHistorialSections() {
    const container = document.getElementById('historial-sections-container');
    const emptyEl = document.getElementById('historial-empty');
    
    if (!container) return;

    if (!historialPrecancelaciones || historialPrecancelaciones.length === 0) {
        container.innerHTML = '';
        emptyEl?.classList.remove('hidden');
        return;
    }

    emptyEl?.classList.add('hidden');

    const html = `
        <div class="precancelaciones-section">
            <div class="section-header-precanc historial">
                <i class="fas fa-history"></i>
                <span class="section-title-precanc">Precancelaciones Procesadas</span>
                <span class="section-count-precanc">${historialPrecancelaciones.length}</span>
            </div>
            <table class="precancelaciones-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Código</th>
                        <th>Socio</th>
                        <th class="text-right">Capital Cancelado</th>
                        <th class="text-right">Monto Pagado</th>
                        <th class="text-right">Ahorro Devuelto</th>
                        <th class="text-center">Acción</th>
                    </tr>
                </thead>
                <tbody>
                    ${historialPrecancelaciones.map(p => renderHistorialRow(p)).join('')}
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

function renderHistorialRow(precancelacion) {
    const fecha = formatDate(precancelacion.fecha_precancelacion);

    return `
        <tr data-precancelacion-id="${precancelacion.id}">
            <td>
                <span class="fecha-precancelacion">${fecha}</span>
            </td>
            <td>
                <span class="codigo-credito">${precancelacion.credito?.codigo_credito || 'N/A'}</span>
            </td>
            <td>
                <div class="socio-info">
                    <span class="socio-nombre">${precancelacion.credito?.socio?.nombre || 'N/A'}</span>
                    <span class="socio-cedula">${precancelacion.credito?.socio?.cedula || ''}</span>
                </div>
            </td>
            <td class="text-right">${formatMoney(precancelacion.capital_pendiente)}</td>
            <td class="text-right">
                <span class="monto-pagado">${formatMoney(precancelacion.monto_total_pagado)}</span>
            </td>
            <td class="text-right">
                <span class="ahorro-devuelto">${formatMoney(precancelacion.ahorro_devuelto)}</span>
            </td>
            <td class="text-center">
                <button class="btn-ver-detalle" onclick="verDetallePrecancelacion('${precancelacion.id}')">
                    <i class="fas fa-eye"></i>
                    <span>Ver</span>
                </button>
            </td>
        </tr>
    `;
}

// ==========================================
// TABS Y FILTROS
// ==========================================
function switchPrecancelacionTab(tab) {
    currentTab = tab;

    // Actualizar botones
    document.querySelectorAll('.precancelaciones-tabs .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Mostrar contenido
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tab}`);
    });

    // Renderizar contenido del tab
    if (tab === 'historial') {
        renderHistorialSections();
    }
}

function filterPrecancelacionesByPais(pais) {
    currentPaisFilterPrecanc = pais;

    // Actualizar UI botones
    document.querySelectorAll('.precancelaciones-toolbar .pais-filter-btn').forEach(btn => {
        const btnPais = btn.dataset.pais || '';
        btn.classList.toggle('active', btnPais === pais);
    });

    applyFiltersPrecanc();
}

function handleSearchPrecanc(e) {
    applyFiltersPrecanc();
}

function applyFiltersPrecanc() {
    const searchInput = document.getElementById('search-precancelacion');
    const query = searchInput?.value.toLowerCase().trim() || '';

    filteredCreditosPrecancelables = allCreditosPrecancelables.filter(credito => {
        // Filtro de búsqueda
        const matchesSearch = !query || 
            credito.codigo_credito.toLowerCase().includes(query) ||
            credito.socio?.nombre?.toLowerCase().includes(query) ||
            credito.socio?.cedula?.includes(query);

        // Filtro de país
        const paisCredito = credito.socio?.paisresidencia?.toUpperCase() || '';
        const matchesPais = !currentPaisFilterPrecanc || 
            paisCredito.includes(currentPaisFilterPrecanc.toUpperCase());

        return matchesSearch && matchesPais;
    });

    updatePrecancelacionesStats();
    renderPrecancelacionesSections();
}

async function refreshPrecancelaciones() {
    showNotification('Actualizando datos...', 'info');
    await Promise.all([
        loadCreditosPrecancelables(),
        loadHistorialPrecancelaciones()
    ]);
    
    if (currentTab === 'historial') {
        renderHistorialSections();
    }
    
    showNotification('Datos actualizados', 'success');
}

// ==========================================
// MODAL CÁLCULO PRECANCELACIÓN
// ==========================================
async function abrirModalCalculo(idCredito) {
    try {
        const credito = allCreditosPrecancelables.find(c => c.id_credito === idCredito);
        if (!credito) throw new Error('Crédito no encontrado');

        creditoActual = credito;

        // Llenar info del crédito
        document.getElementById('calc-credito-codigo').textContent = credito.codigo_credito;
        document.getElementById('calc-credito-socio').textContent = credito.socio?.nombre || 'N/A';
        document.getElementById('calc-capital-original').textContent = formatMoney(credito.capital);
        document.getElementById('calc-cuotas-info').textContent = `${credito.cuotas_pagadas_count || 0}/${credito.plazo}`;
        document.getElementById('calc-tasa-info').textContent = `${credito.tasa_interes_mensual || 2}%`;

        // Resetear resultados
        document.getElementById('resultados-calculo')?.classList.add('hidden');
        document.getElementById('btn-procesar-precancelacion')?.classList.add('hidden');

        // Fecha por defecto
        document.getElementById('fecha-precancelacion').valueAsDate = new Date();

        // Abrir modal
        openPrecancModal('modal-calcular-precancelacion');

    } catch (error) {
        console.error('Error al abrir modal:', error);
        showNotification('Error al cargar datos del crédito', 'error');
    }
}

async function handleCalcularMontos() {
    if (!creditoActual) return;

    const fechaPrecancelacion = document.getElementById('fecha-precancelacion').value;

    if (!fechaPrecancelacion) {
        showNotification('Por favor seleccione una fecha de precancelación', 'warning');
        return;
    }

    const fechaPrecanc = parseDate(fechaPrecancelacion);
    const fechaDesembolso = parseDate(creditoActual.fecha_desembolso);

    if (fechaPrecanc <= fechaDesembolso) {
        showNotification('La fecha de precancelación debe ser posterior al desembolso', 'error');
        return;
    }

    try {
        beginLoading('Calculando montos...');
        
        const calculo = await calcularPrecancelacion(creditoActual.id_credito, fechaPrecanc);
        calculoPrecancelacion = calculo;

        mostrarResultadosCalculo(calculo);

        document.getElementById('btn-procesar-precancelacion')?.classList.remove('hidden');

    } catch (error) {
        console.error('Error al calcular:', error);
        showNotification(error.message, 'error');
    } finally {
        endLoading();
    }
}

async function calcularPrecancelacion(idCredito, fechaPrecancelacion) {
    const supabase = window.getSupabaseClient();
    
    // 1. Obtener tabla de amortización
    const { data: amortizacion, error: errorAmort } = await supabase
        .from('ic_creditos_amortizacion')
        .select('*')
        .eq('id_credito', idCredito)
        .order('numero_cuota', { ascending: true });

    if (errorAmort) throw errorAmort;
    if (!amortizacion?.length) throw new Error('No se encontró tabla de amortización');

    // 2. Determinar cuotas pagadas
    const cuotasPagadasArr = amortizacion.filter(c => c.estado_cuota === 'PAGADO');
    const cuotasPagadas = cuotasPagadasArr.length;
    const cuotasRestantes = amortizacion.length - cuotasPagadas;

    if (cuotasRestantes === 0) throw new Error('El crédito ya está completamente pagado');

    // 3. Validar mora
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaCorte = fechaPrecancelacion < hoy ? fechaPrecancelacion : hoy;

    const cuotasVencidasSinPagar = amortizacion.filter(c => {
        const fv = parseDate(c.fecha_vencimiento);
        return fv < fechaCorte && c.estado_cuota !== 'PAGADO';
    });

    // En lugar de bloquear, advertir si hay mora
    let tieneMorea = cuotasVencidasSinPagar.length > 0;

    // 4. Capital pendiente
    let capitalPendiente;
    let fechaUltimaCuotaPagada;

    if (cuotasPagadas === 0) {
        capitalPendiente = creditoActual.capital_financiado || creditoActual.capital;
        fechaUltimaCuotaPagada = parseDate(creditoActual.fecha_desembolso);
    } else {
        const ultima = cuotasPagadasArr[cuotasPagadasArr.length - 1];
        capitalPendiente = ultima.saldo_capital;
        fechaUltimaCuotaPagada = parseDate(ultima.fecha_vencimiento);
    }

    // 5. Interés restante y ahorro
    let interesRestante = 0;
    for (let i = cuotasPagadas; i < amortizacion.length; i++) {
        interesRestante += amortizacion[i].interes;
    }
    const ahorroPagado = cuotasPagadas * (creditoActual.ahorro_programado_cuota || 0);

    // 6. Interés proporcional por días
    const unDiaEnMs = 1000 * 60 * 60 * 24;
    const diasTranscurridos = Math.max(0, Math.round((fechaPrecancelacion - fechaUltimaCuotaPagada) / unDiaEnMs));
    
    const tasaMensual = (creditoActual.tasa_interes_mensual || 0) / 100;
    const tasaDiaria = (tasaMensual * 12) / 365;
    const interesProporcional = capitalPendiente * tasaDiaria * diasTranscurridos;

    const montoPrecancelar = capitalPendiente + interesProporcional;
    const interesPerdonado = Math.max(0, interesRestante - interesProporcional);

    return {
        idCredito,
        fechaPrecancelacion,
        cuotasPagadas,
        cuotasRestantes,
        capitalPendiente,
        diasTranscurridos,
        interesProporcional,
        interesPerdonado,
        ahorroDevolver: ahorroPagado,
        montoPrecancelar,
        tieneMora: tieneMorea,
        cuotasMora: cuotasVencidasSinPagar.length
    };
}

function mostrarResultadosCalculo(calculo) {
    const ids = {
        'calc-cuotas-pagadas': calculo.cuotasPagadas,
        'calc-cuotas-restantes': calculo.cuotasRestantes,
        'calc-capital-pendiente': formatMoney(calculo.capitalPendiente),
        'calc-dias-transcurridos': `${calculo.diasTranscurridos} días`,
        'calc-interes-proporcional': formatMoney(calculo.interesProporcional),
        'calc-interes-perdonado': formatMoney(calculo.interesPerdonado),
        'calc-ahorro-devolver': formatMoney(calculo.ahorroDevolver),
        'calc-monto-total': formatMoney(calculo.montoPrecancelar),
        'calc-detalle-pagar': formatMoney(calculo.montoPrecancelar),
        'calc-detalle-devolver': formatMoney(calculo.ahorroDevolver),
        'calc-detalle-ahorro': formatMoney(calculo.interesPerdonado)
    };

    for (const [id, value] of Object.entries(ids)) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    document.getElementById('resultados-calculo')?.classList.remove('hidden');
}

// ==========================================
// MODAL CONFIRMACIÓN
// ==========================================
function abrirModalConfirmacion() {
    if (!calculoPrecancelacion || !creditoActual) return;

    const resumen = `
        <div class="confirm-info">
            <p><strong>Crédito:</strong> ${creditoActual.codigo_credito}</p>
            <p><strong>Socio:</strong> ${creditoActual.socio?.nombre}</p>
            <p><strong>Fecha:</strong> ${formatDate(calculoPrecancelacion.fechaPrecancelacion)}</p>
            <hr style="border-color: var(--border-color); margin: 1rem 0;">
            <p><strong>Monto a pagar:</strong> <span style="color: var(--gold); font-size: 1.25rem;">${formatMoney(calculoPrecancelacion.montoPrecancelar)}</span></p>
            <p><strong>Ahorro a devolver:</strong> <span style="color: #60A5FA;">${formatMoney(calculoPrecancelacion.ahorroDevolver)}</span></p>
        </div>
    `;

    const resumenEl = document.getElementById('confirm-resumen');
    if (resumenEl) resumenEl.innerHTML = resumen;

    closePrecancModal('modal-calcular-precancelacion');
    openPrecancModal('modal-confirmar-precancelacion');
}

async function handleConfirmarPrecancelacion() {
    if (!calculoPrecancelacion || !creditoActual) return;

    const referencia = document.getElementById('confirm-referencia')?.value || '';
    const observaciones = document.getElementById('confirm-observaciones')?.value || '';

    try {
        beginLoading('Procesando precancelación...');
        
        await ejecutarProcesamiento(calculoPrecancelacion, referencia, observaciones);

        showNotification('Precancelación completada con éxito', 'success');
        closePrecancModal('modal-confirmar-precancelacion');
        
        // Limpiar formulario
        document.getElementById('confirm-referencia').value = '';
        document.getElementById('confirm-observaciones').value = '';
        
        // Recargar datos
        await refreshPrecancelaciones();

    } catch (error) {
        console.error('Error al procesar precancelación:', error);
        showNotification('Error: ' + error.message, 'error');
    } finally {
        endLoading();
    }
}

async function ejecutarProcesamiento(calculo, referencia, observacion) {
    const supabase = window.getSupabaseClient();
    const user = window.getCurrentUser();

    // 1. Insertar registro de precancelación
    const { data: precanc, error: errP } = await supabase
        .from('ic_creditos_precancelacion')
        .insert({
            id_credito: calculo.idCredito,
            fecha_precancelacion: toISODate(calculo.fechaPrecancelacion),
            cuotas_pagadas: calculo.cuotasPagadas,
            cuotas_restantes: calculo.cuotasRestantes,
            capital_pendiente: calculo.capitalPendiente,
            dias_desde_ultima_cuota: calculo.diasTranscurridos,
            interes_proporcional: calculo.interesProporcional,
            interes_perdonado: calculo.interesPerdonado,
            ahorro_acumulado: calculo.ahorroDevolver,
            ahorro_devuelto: calculo.ahorroDevolver,
            monto_total_pagado: calculo.montoPrecancelar,
            referencia_pago: referencia,
            observacion: observacion,
            procesado_por: user?.id
        })
        .select()
        .single();

    if (errP) throw errP;

    // 2. Marcar crédito como PRECANCELADO
    const { error: errC } = await supabase
        .from('ic_creditos')
        .update({ estado_credito: 'PRECANCELADO' })
        .eq('id_credito', calculo.idCredito);

    if (errC) throw errC;

    // 3. Cancelar cuotas pendientes
    const { error: errA } = await supabase
        .from('ic_creditos_amortizacion')
        .update({ estado_cuota: 'CANCELADO' })
        .eq('id_credito', calculo.idCredito)
        .eq('estado_cuota', 'PENDIENTE');

    if (errA) throw errA;

    // 4. Invalidar caché de créditos
    if (window.invalidateCache) {
        window.invalidateCache('creditos');
    }

    return precanc;
}

// ==========================================
// VER DETALLE PRECANCELACIÓN
// ==========================================
function verDetallePrecancelacion(idPrecancelacion) {
    const precanc = historialPrecancelaciones.find(p => p.id === idPrecancelacion);
    if (!precanc) {
        showNotification('Precancelación no encontrada', 'error');
        return;
    }

    const fecha = formatDate(precanc.fecha_precancelacion, { weekday: 'long', month: 'long' });

    const html = `
        <div class="detalle-precancelacion">
            <div class="credito-info-card">
                <div class="credito-info-header">
                    <span class="credito-codigo">${precanc.credito?.codigo_credito || 'N/A'}</span>
                    <span class="credito-estado" style="background: rgba(59, 130, 246, 0.15); color: #60A5FA;">PRECANCELADO</span>
                </div>
                <div class="credito-info-socio">${precanc.credito?.socio?.nombre || 'N/A'}</div>
                <div class="credito-info-details">
                    <div class="detail-item">
                        <span class="detail-label">Cédula</span>
                        <span class="detail-value">${precanc.credito?.socio?.cedula || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Capital Original</span>
                        <span class="detail-value">${formatMoney(precanc.credito?.capital)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Plazo</span>
                        <span class="detail-value">${precanc.credito?.plazo} meses</span>
                    </div>
                </div>
            </div>

            <h4 class="section-title"><i class="fas fa-calendar-check"></i> Fecha de Precancelación</h4>
            <p style="margin-bottom: 1.5rem; color: var(--text-secondary);">${fecha}</p>

            <h4 class="section-title"><i class="fas fa-receipt"></i> Detalle del Cálculo</h4>
            <div class="resumen-grid">
                <div class="resumen-item">
                    <div class="resumen-label">Cuotas Pagadas</div>
                    <div class="resumen-value">${precanc.cuotas_pagadas}</div>
                </div>
                <div class="resumen-item">
                    <div class="resumen-label">Cuotas Restantes</div>
                    <div class="resumen-value">${precanc.cuotas_restantes}</div>
                </div>
            </div>

            <div class="resumen-grid">
                <div class="resumen-item">
                    <div class="resumen-label">Capital Pendiente</div>
                    <div class="resumen-value">${formatMoney(precanc.capital_pendiente)}</div>
                </div>
                <div class="resumen-item">
                    <div class="resumen-label">Días desde última cuota</div>
                    <div class="resumen-value">${precanc.dias_desde_ultima_cuota} días</div>
                </div>
            </div>

            <div class="resumen-grid">
                <div class="resumen-item">
                    <div class="resumen-label">Interés Proporcional</div>
                    <div class="resumen-value">${formatMoney(precanc.interes_proporcional)}</div>
                </div>
                <div class="resumen-item success">
                    <div class="resumen-label">Interés Perdonado</div>
                    <div class="resumen-value">${formatMoney(precanc.interes_perdonado)}</div>
                </div>
            </div>

            <div class="resumen-grid highlight-grid">
                <div class="resumen-item highlight devolucion">
                    <div class="resumen-label"><i class="fas fa-piggy-bank"></i> Ahorro Devuelto</div>
                    <div class="resumen-value">${formatMoney(precanc.ahorro_devuelto)}</div>
                </div>
                <div class="resumen-item highlight pagar">
                    <div class="resumen-label"><i class="fas fa-dollar-sign"></i> Monto Pagado</div>
                    <div class="resumen-value">${formatMoney(precanc.monto_total_pagado)}</div>
                </div>
            </div>

            ${precanc.referencia_pago ? `
                <div class="info-box" style="margin-top: 1.5rem;">
                    <strong><i class="fas fa-receipt"></i> Referencia:</strong> ${precanc.referencia_pago}
                </div>
            ` : ''}

            ${precanc.observacion ? `
                <div class="info-box" style="margin-top: 0.75rem;">
                    <strong><i class="fas fa-comment"></i> Observaciones:</strong> ${precanc.observacion}
                </div>
            ` : ''}
        </div>
    `;

    document.getElementById('modal-detalle-precancelacion-body').innerHTML = html;
    openPrecancModal('modal-ver-precancelacion');
}

// ==========================================
// UTILIDADES
// ==========================================
function formatMoney(amount) {
    return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(amount || 0);
}

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

// Exponer globalmente
window.initPrecancelacionesModule = initPrecancelacionesModule;
