/**
 * INKA CORP MOBILE - Módulo Caja
 * Adaptación móvil del sistema de aperturas, cierres y movimientos operativos.
 */

const CAJA_TABLE = 'ic_caja_aperturas';
const MOVIMIENTOS_TABLE = 'ic_caja_movimientos';

let currentCajaSession = null;
let currentBalance = 0;
let ingresosTurno = 0;
let egresosTurno = 0;

/**
 * Inicializaciï¿½n del mï¿½dulo - Requerido por mobile-app.js
 */
async function initCajaModule() {
    try {
        console.log('[MOBILE-CAJA] Inicializando módulo de Caja...');
        setupDateFilters();
        await checkCajaStatus();
        await loadCajaData();
    } catch (error) {
        console.error("[MOBILE-CAJA] Error inicializando módulo:", error);
    }
}

function setupDateFilters() {
    const today = new Date();
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(today.getDate() - 2);

    const inputInicio = document.getElementById('filter-caja-inicio');
    const inputFin = document.getElementById('filter-caja-fin');

    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    if (inputInicio && !inputInicio.value) inputInicio.value = formatDate(threeDaysAgo);
    if (inputFin && !inputFin.value) inputFin.value = formatDate(today);

    // Event listeners para filtros
    if (inputInicio) inputInicio.onchange = () => loadCajaData();
    if (inputFin) inputFin.onchange = () => loadCajaData();
}

/**
 * Verifica estado de caja para el usuario actual
 */
async function checkCajaStatus() {
    const sb = getSupabaseClient();
    if (!sb) return;

    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;

    const { data: activeSessions, error } = await sb
        .from(CAJA_TABLE)
        .select('*')
        .eq('id_usuario', session.user.id)
        .eq('estado', 'ABIERTA')
        .order('fecha_apertura', { ascending: false })
        .limit(1);

    if (error) {
        console.error("[MOBILE-CAJA] Error verificando estado:", error);
        return;
    }

    if (activeSessions && activeSessions.length > 0) {
        currentCajaSession = activeSessions[0];
        window.sysCajaAbierta = true;
        toggleCajaLayout('open');
    } else {
        currentCajaSession = null;
        window.sysCajaAbierta = false;
        toggleCajaLayout('closed');
    }
}

function toggleCajaLayout(state) {
    const badge = document.getElementById('caja-status-badge');
    const btnAbrir = document.getElementById('btn-abrir-caja');
    const btnCerrar = document.getElementById('btn-cerrar-caja');
    const manualRow = document.getElementById('caja-manual-actions');

    if (state === 'open') {
        if (badge) {
            badge.className = "caja-badge status-open";
            badge.innerHTML = '<i class="fas fa-unlock"></i> TRABAJANDO CON CAJA';
        }
        btnAbrir?.classList.add('hidden');
        btnCerrar?.classList.remove('hidden');
        manualRow?.classList.remove('hidden');
    } else {
        if (badge) {
            badge.className = "caja-badge status-closed";
            badge.innerHTML = '<i class="fas fa-lock"></i> CAJA CERRADA';
        }
        btnAbrir?.classList.remove('hidden');
        btnCerrar?.classList.add('hidden');
        manualRow?.classList.add('hidden');
        
        // Reset visible stats
        updateStat('caja-total-ingresos', 0);
        updateStat('caja-total-egresos', 0);
        updateStat('caja-saldo-actual', 0);
    }
}

async function loadCajaData() {
    const sb = getSupabaseClient();
    if (!sb) return;

    const inputInicio = document.getElementById('filter-caja-inicio')?.value;
    const inputFin = document.getElementById('filter-caja-fin')?.value;

    const container = document.getElementById('caja-movimientos-container');
    if (container) container.innerHTML = '<div class="loading-inline"><i class="fas fa-spinner fa-spin"></i><span>Sincronizando...</span></div>';

    try {
        const { data: { session } } = await sb.auth.getSession();
        
        let query = sb.from(MOVIMIENTOS_TABLE)
            .select('*')
            .eq('id_usuario', session.user.id);

        if (inputInicio) query = query.gte('fecha_movimiento', `${inputInicio}T00:00:00`);
        if (inputFin) query = query.lte('fecha_movimiento', `${inputFin}T23:59:59`);

        const { data: movimientos, error } = await query.order('fecha_movimiento', { ascending: false });

        if (error) throw error;

        renderMovimientosCards(movimientos);

        // Stats del turno activo
        if (currentCajaSession) {
            const { data: turnMovs } = await sb.from(MOVIMIENTOS_TABLE)
                .select('*')
                .eq('id_apertura', currentCajaSession.id_apertura);
            
            processMovimientos(turnMovs || []);
        }
    } catch (error) {
        console.error("[MOBILE-CAJA] Error cargando movimientos:", error);
    }
}

function processMovimientos(movimientos) {
    ingresosTurno = 0;
    egresosTurno = 0;

    movimientos.forEach(m => {
        const monto = parseFloat(m.monto || 0);
        if (m.tipo_movimiento === 'INGRESO') ingresosTurno += monto;
        else egresosTurno += monto;
    });

    currentBalance = (parseFloat(currentCajaSession.saldo_inicial) + ingresosTurno) - egresosTurno;

    updateStat('caja-total-ingresos', ingresosTurno);
    updateStat('caja-total-egresos', egresosTurno);
    updateStat('caja-saldo-actual', currentBalance);
}

function updateStat(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = formatCurrency(val);
}

function renderMovimientosCards(movimientos) {
    const container = document.getElementById('caja-movimientos-container');
    if (!container) return;

    if (!movimientos || movimientos.length === 0) {
        container.innerHTML = `
            <div class="empty-state-mobile">
                <i class="fas fa-receipt"></i>
                <p>No se encontraron movimientos en este rango.</p>
            </div>`;
        return;
    }

    container.innerHTML = movimientos.map(m => {
        const isIngreso = m.tipo_movimiento === 'INGRESO';
        const date = new Date(m.fecha_movimiento);
        
        return `
            <div class="caja-move-card">
                <div class="move-icon ${isIngreso ? 'income' : 'expense'}">
                    <i class="fas ${isIngreso ? 'fa-plus' : 'fa-minus'}"></i>
                </div>
                <div class="move-details">
                    <div class="move-header">
                        <span class="move-cat">${(m.categoria || 'MANUAL').replace('_', ' ')}</span>
                        <span class="move-amount ${isIngreso ? 'text-success' : 'text-danger'}">
                            ${isIngreso ? '+' : '-'} ${formatCurrency(m.monto)}
                        </span>
                    </div>
                    <div class="move-desc">${m.descripcion || 'Sin descripción'}</div>
                    <div class="move-footer">
                        <span><i class="fas fa-clock"></i> ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span><i class="fas fa-calendar-day"></i> ${date.toLocaleDateString()}</span>
                        ${m.comprobante_url ? `<button onclick="window.open('${m.comprobante_url}', '_blank')" class="btn-eye-mobile"><i class="fas fa-eye"></i></button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Acciones Móviles 
 */

function showAperturaModal() {
    openLiteModal('modal-apertura-caja');
}

async function handleAperturaCaja(e) {
    e.preventDefault();
    const sb = getSupabaseClient();
    const formData = new FormData(e.target);
    const saldoInicial = parseFloat(formData.get('saldo_inicial'));
    const observaciones = formData.get('observaciones');
    
    const { data: { session } } = await sb.auth.getSession();

    try {
        const { data, error } = await sb
            .from(CAJA_TABLE)
            .insert([{
                id_usuario: session.user.id,
                saldo_inicial: saldoInicial,
                observaciones: observaciones,
                fecha_apertura: new Date().toISOString(),
                estado: 'ABIERTA'
            }])
            .select();

        if (error) throw error;

        currentCajaSession = data[0];
        window.sysCajaAbierta = true;
        closeLiteModal('modal-apertura-caja');
        e.target.reset();
        toggleCajaLayout('open');
        await loadCajaData();
        
        // Activación dinámica: Sincronizar estado global
        if (typeof window.checkCajaStatusGlobal === 'function') {
            await window.checkCajaStatusGlobal();
        }

        if (window.Swal) Swal.fire("¡Éxito!", "Caja abierta correctamente", "success");
    } catch (e) {
        if (window.Swal) Swal.fire("Error", e.message, "error");
    }
}

function showMovimientoManualModal(tipo) {
    const title = document.getElementById('manual-modal-title');
    const typeField = document.getElementById('manual-tipo');
    
    if (typeField) typeField.value = tipo;
    if (title) title.innerHTML = tipo === 'INGRESO' 
        ? '<i class="fas fa-plus-circle text-success"></i> Nuevo Ingreso' 
        : '<i class="fas fa-minus-circle text-danger"></i> Nuevo Egreso';
    
    // Limpiar preview
    document.getElementById('preview-box').classList.add('hidden');
    document.getElementById('preview-img').src = '';
    
    openLiteModal('modal-movimiento-manual');
}

async function handleMovimientoManual(e) {
    e.preventDefault();
    if (!currentCajaSession) return;

    const sb = getSupabaseClient();
    const formData = new FormData(e.target);
    const monto = parseFloat(formData.get('monto'));
    const tipo = formData.get('tipo_movimiento');
    const desc = formData.get('descripcion');
    const metodo = formData.get('metodo_pago');
    const file = document.getElementById('manual-comprobante')?.files[0];

    const { data: { session } } = await sb.auth.getSession();

    try {
        let comprobanteUrl = null;
        if (file) {
            const uploadRes = await window.uploadFileToStorage(file, 'caja', session.user.id);
            
            if (!uploadRes.success) {
                throw new Error(uploadRes.error);
            }
            
            comprobanteUrl = uploadRes.url;
        }

        const { error } = await sb
            .from(MOVIMIENTOS_TABLE)
            .insert([{
                id_apertura: currentCajaSession.id_apertura,
                tipo_movimiento: tipo,
                monto: monto,
                descripcion: desc,
                metodo_pago: metodo,
                comprobante_url: comprobanteUrl,
                categoria: tipo === 'INGRESO' ? 'INCREMENTO_EXTERNO' : 'RETIRO_EXTERNO',
                id_usuario: session.user.id,
                fecha_movimiento: new Date().toISOString()
            }]);

        if (error) throw error;

        closeLiteModal('modal-movimiento-manual');
        e.target.reset();
        await loadCajaData();
        if (window.Swal) Swal.fire("Registrado", `${tipo} guardado con éxito`, "success");
    } catch (e) {
        if (window.Swal) Swal.fire("Error", e.message, "error");
    }
}

function showCierreModal() {
    const label = document.getElementById('cierre-saldo-previsto');
    if (label) label.textContent = formatCurrency(currentBalance);
    openLiteModal('modal-cierre-caja');
}

async function handleCierreCaja(e) {
    e.preventDefault();
    const sb = getSupabaseClient();
    const formData = new FormData(e.target);
    const saldoReal = parseFloat(formData.get('saldo_final'));
    const observaciones = formData.get('observaciones');

    try {
        const { error } = await sb
            .from(CAJA_TABLE)
            .update({
                saldo_final: saldoReal,
                observaciones: (currentCajaSession.observaciones || '') + ' | CIERRE MOVIL: ' + observaciones,
                fecha_cierre: new Date().toISOString(),
                estado: 'CERRADA'
            })
            .eq('id_apertura', currentCajaSession.id_apertura);

        if (error) throw error;

        closeLiteModal('modal-cierre-caja');
        currentCajaSession = null;
        window.sysCajaAbierta = false;
        toggleCajaLayout('closed');

        // Activación dinámica: Sincronizar estado global
        if (typeof window.checkCajaStatusGlobal === 'function') {
            await window.checkCajaStatusGlobal();
        }

        if (window.Swal) Swal.fire("Caja Cerrada", "Sesion de trabajo finalizada", "info");
    } catch (e) {
        if (window.Swal) Swal.fire("Error", e.message, "error");
    }
}

function previewMobileImage(event, targetId) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const previewBox = document.getElementById(targetId);
            const previewImg = document.getElementById('preview-img');
            if (previewImg) previewImg.src = e.target.result;
            if (previewBox) previewBox.classList.remove('hidden');
        }
        reader.readAsDataURL(file);
    }
}

// Helpers
function formatCurrency(val) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
}

// Global Exports
window.initCajaModule = initCajaModule;
window.showAperturaModal = showAperturaModal;
window.handleAperturaCaja = handleAperturaCaja;
window.showMovimientoManualModal = showMovimientoManualModal;
window.handleMovimientoManual = handleMovimientoManual;
window.showCierreModal = showCierreModal;
window.handleCierreCaja = handleCierreCaja;
window.previewMobileImage = previewMobileImage;
window.loadCajaData = loadCajaData;
