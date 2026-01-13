/**
 * INKA CORP - Módulo de Administración de Pólizas
 * Gestión de inversiones y certificados
 */

// ==========================================
// ESTADO DEL MÓDULO
// ==========================================
let allPolizas = [];
let filteredPolizas = [];
let currentEstadoFilterPolizas = '';
let currentSortPolizas = 'alfabetico'; // 'alfabetico', 'fecha', 'valor'

// ==========================================
// INICIALIZACIÓN
// ==========================================
function initPolizasModule() {
    loadPolizas();
    setupPolizasEventListeners();

    // Global scope exposure
    window.viewPoliza = viewPoliza;
    window.openPolizaModal = openPolizaModal;
}

// ==========================================
// CARGA DE DATOS (Patrón: Caché Instantáneo + Actualización en Segundo Plano)
// ==========================================
async function loadPolizas(forceRefresh = false) {
    const mainContent = document.getElementById('main-content');
    if (!mainContent || !mainContent.querySelector('.polizas-wrapper')) return;

    try {
        // PASO 1: Mostrar datos de caché INMEDIATAMENTE si existen
        if (!forceRefresh && window.hasCacheData && window.hasCacheData('polizas')) {
            console.log('⚡ Mostrando pólizas desde caché (instantáneo)');
            allPolizas = window.getCacheData('polizas');
            renderPolizas();

            // Si el caché es reciente, no recargar
            if (window.isCacheValid && window.isCacheValid('polizas')) {
                console.log('✓ Caché fresco, no se requiere actualización');
                return;
            }
        } else if (!forceRefresh) {
            // Solo mostrar loading si no hay caché
            beginLoading('Cargando pólizas...');
        }

        // PASO 2: Actualizar en segundo plano
        console.log('⟳ Actualizando pólizas en segundo plano...');
        const supabase = getSupabaseClient();
        if (!supabase) return;

        const { data, error } = await supabase
            .from('ic_polizas')
            .select(`
                *,
                socio:ic_socios!id_socio (
                    idsocio,
                    nombre,
                    cedula,
                    whatsapp
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        allPolizas = data || [];

        // Guardar en caché
        if (window.setCacheData) {
            window.setCacheData('polizas', allPolizas);
        }

        renderPolizas();
        console.log('✓ Pólizas actualizadas');

    } catch (error) {
        console.error('Error cargando pólizas:', error);
        // Si hay error pero tenemos caché, mantener los datos de caché
        if (!window.hasCacheData || !window.hasCacheData('polizas')) {
            Swal.fire('Error', 'No se pudieron cargar las pólizas', 'error');
        }
    } finally {
        endLoading();
    }
}

// ==========================================
// RENDERIZADO
// ==========================================
function renderPolizas() {
    filterAndSortPolizas();
    renderPolizasStats();
    renderPolizasTable();
}

function filterAndSortPolizas() {
    const search = document.getElementById('search-polizas')?.value.toLowerCase() || '';

    filteredPolizas = allPolizas.filter(p => {
        const matchesEstado = !currentEstadoFilterPolizas || p.estado === currentEstadoFilterPolizas;
        const socioName = p.socio?.nombre || '';
        const cedula = p.socio?.cedula || '';
        const idPoliza = p.id_poliza || '';
        const matchesSearch = socioName.toLowerCase().includes(search) ||
            cedula.includes(search) ||
            idPoliza.toLowerCase().includes(search);

        return matchesEstado && matchesSearch;
    });

    // Ordenamiento
    filteredPolizas.sort((a, b) => {
        if (currentSortPolizas === 'alfabetico') {
            return (a.socio?.nombre || '').localeCompare(b.socio?.nombre || '');
        } else if (currentSortPolizas === 'fecha') {
            return new Date(b.fecha_vencimiento) - new Date(a.fecha_vencimiento);
        } else if (currentSortPolizas === 'valor') {
            return b.valor - a.valor;
        }
        return 0;
    });
}

function renderPolizasStats() {
    const statsActivos = allPolizas.filter(p => p.estado === 'ACTIVO');
    const totalInvertido = statsActivos.reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0);
    const interesProyectado = statsActivos.reduce((sum, p) => sum + ((parseFloat(p.valor_final) || 0) - (parseFloat(p.valor) || 0)), 0);

    // Determinar pólizas por vencer (próximos 30 días)
    const hoy = new Date();
    const proximoMes = new Date();
    proximoMes.setDate(hoy.getDate() + 30);
    const porVencer = statsActivos.filter(p => {
        const venc = new Date(p.fecha_vencimiento);
        return venc >= hoy && venc <= proximoMes;
    }).length;

    // Actualizar UI
    document.getElementById('stat-polizas-activos').textContent = statsActivos.length;
    document.getElementById('stat-polizas-vencimiento').textContent = porVencer;
    document.getElementById('stat-polizas-total').textContent = formatMoney(totalInvertido);
    document.getElementById('stat-polizas-interes').textContent = formatMoney(interesProyectado);

    // Actualizar contadores de pestañas
    document.getElementById('count-polizas-all').textContent = allPolizas.length;
    document.getElementById('count-polizas-activo').textContent = statsActivos.length;
    document.getElementById('count-polizas-pagado').textContent = allPolizas.filter(p => p.estado === 'PAGADO').length;
    document.getElementById('count-polizas-capitalizado').textContent = allPolizas.filter(p => p.estado === 'CAPITALIZADO').length;
}

function renderPolizasTable() {
    const tbody = document.getElementById('tbody-polizas');
    if (!tbody) return;

    if (filteredPolizas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center">No se encontraron pólizas</td></tr>`;
        return;
    }

    tbody.innerHTML = filteredPolizas.map(p => {
        const estadoBadge = getEstadoBadgePoliza(p.estado);
        const fecha = formatDate(p.fecha);
        const vencimiento = formatDate(p.fecha_vencimiento);

        return `
            <tr>
                <td>
                    <div class="socio-info-cell">
                        <span class="socio-name">${p.socio?.nombre || 'Desconocido'}</span>
                        <span class="socio-meta">${p.socio?.cedula || ''}</span>
                    </div>
                </td>
                <td class="hide-mobile">${fecha}</td>
                <td class="font-weight-bold">${formatMoney(p.valor)}</td>
                <td class="hide-mobile text-muted">${p.interes}%</td>
                <td>
                    <div class="vencimiento-cell ${isCloseToVencimiento(p.fecha_vencimiento) ? 'text-warning' : ''}">
                        ${vencimiento}
                    </div>
                </td>
                <td>${estadoBadge}</td>
                <td class="text-center">
                    <button class="btn-action" onclick="viewPoliza('${p.id_poliza}')" title="Ver detalle">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupPolizasEventListeners() {
    // Tabs de estado
    document.querySelectorAll('.polizas-wrapper .estado-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.polizas-wrapper .estado-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentEstadoFilterPolizas = tab.dataset.estado;
            renderPolizas();
        });
    });

    // Búsqueda
    document.getElementById('search-polizas')?.addEventListener('input', () => {
        renderPolizas();
    });

    // Ordenamiento
    document.querySelectorAll('.polizas-wrapper .btn-sort-primary').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.polizas-wrapper .btn-sort-primary').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSortPolizas = btn.dataset.sort;
            renderPolizas();
        });
    });

    // Refresh
    document.getElementById('btn-refresh-polizas')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-refresh-polizas');
        btn.classList.add('loading');
        await loadPolizas(true); // Forzar actualización
        btn.classList.remove('loading');
        showToast('Pólizas actualizadas', 'success');
    });

    // Nuevo / Guardar
    document.getElementById('btn-nueva-poliza')?.addEventListener('click', () => openPolizaModal());
    document.getElementById('btn-guardar-poliza')?.addEventListener('click', savePoliza);

    // Cálculos automáticos
    ['poliza-valor', 'poliza-interes', 'poliza-plazo', 'poliza-fecha'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', calculatePolizaProjections);
        document.getElementById(id)?.addEventListener('input', calculatePolizaProjections);
    });

    // Modal Close
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none';
                document.body.style.overflow = '';
            }
        });
    });
}

// ==========================================
// CRUD OPERATIONS
// ==========================================
function openPolizaModal(poliza = null) {
    const modal = document.getElementById('poliza-modal');
    const form = document.getElementById('form-poliza');
    const title = document.getElementById('poliza-modal-title');

    if (!modal || !form) return;

    form.reset();
    populateSocioSelect();

    if (poliza) {
        title.textContent = 'Editar Póliza';
        document.getElementById('poliza-id').value = poliza.id_poliza;
        document.getElementById('poliza-socio').value = poliza.id_socio;
        document.getElementById('poliza-fecha').value = poliza.fecha;
        document.getElementById('poliza-valor').value = poliza.valor;
        document.getElementById('poliza-interes').value = poliza.interes;
        document.getElementById('poliza-plazo').value = poliza.plazo;
        document.getElementById('poliza-vencimiento').value = poliza.fecha_vencimiento;
        document.getElementById('poliza-valor-final').value = poliza.valor_final;
        document.getElementById('poliza-certificado').value = poliza.certificado_firmado || '';
        document.getElementById('poliza-estado').value = poliza.estado;
    } else {
        title.textContent = 'Nueva Póliza';
        document.getElementById('poliza-id').value = '';
        document.getElementById('poliza-fecha').value = todayISODate();
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function populateSocioSelect() {
    const select = document.getElementById('poliza-socio');
    if (!select) return;

    const socios = window.dataCache?.socios || [];
    select.innerHTML = '<option value="">Seleccione un socio...</option>' +
        socios.map(s => `<option value="${s.idsocio}">${s.nombre} (${s.cedula})</option>`).join('');
}

function calculatePolizaProjections() {
    const valor = parseFloat(document.getElementById('poliza-valor').value) || 0;
    const interesPct = parseFloat(document.getElementById('poliza-interes').value) || 0;
    const plazoMeses = parseInt(document.getElementById('poliza-plazo').value) || 0;
    const fechaInicio = document.getElementById('poliza-fecha').value;

    if (valor > 0 && plazoMeses > 0 && fechaInicio) {
        // Cálculo simple: Interés anual prorrateado
        const interesTotal = (valor * (interesPct / 100) * (plazoMeses / 12));
        const valorFinal = valor + interesTotal;
        document.getElementById('poliza-valor-final').value = valorFinal.toFixed(2);

        // Calcular fecha vencimiento
        const date = new Date(fechaInicio + 'T00:00:00');
        date.setMonth(date.getMonth() + plazoMeses);
        document.getElementById('poliza-vencimiento').value = toISODate(date);
    }
}

async function savePoliza() {
    const form = document.getElementById('form-poliza');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const id = document.getElementById('poliza-id').value;
    const data = {
        id_socio: document.getElementById('poliza-socio').value,
        fecha: document.getElementById('poliza-fecha').value,
        valor: parseFloat(document.getElementById('poliza-valor').value),
        interes: parseFloat(document.getElementById('poliza-interes').value),
        plazo: parseInt(document.getElementById('poliza-plazo').value),
        fecha_vencimiento: document.getElementById('poliza-vencimiento').value,
        valor_final: parseFloat(document.getElementById('poliza-valor-final').value),
        certificado_firmado: document.getElementById('poliza-certificado').value || null,
        estado: document.getElementById('poliza-estado').value,
        updated_at: new Date().toISOString()
    };

    try {
        beginLoading('Guardando póliza...');
        const supabase = getSupabaseClient();

        let result;
        if (id) {
            result = await supabase.from('ic_polizas').update(data).eq('id_poliza', id);
        } else {
            result = await supabase.from('ic_polizas').insert([data]);
        }

        if (result.error) throw result.error;

        Swal.fire('Éxito', 'Póliza guardada correctamente', 'success');

        // Cerrar modal
        const modal = document.getElementById('poliza-modal');
        modal.classList.add('hidden');
        modal.style.display = 'none';
        document.body.style.overflow = '';

        // Recargar datos
        if (window.dataCache) window.dataCache.lastUpdate.polizas = 0;
        await loadPolizas();

    } catch (error) {
        console.error('Error al guardar póliza:', error);
        Swal.fire('Error', 'No se pudo guardar la póliza', 'error');
    } finally {
        endLoading();
    }
}

// ==========================================
// HELPERS
// ==========================================
function getEstadoBadgePoliza(estado) {
    const badges = {
        'ACTIVO': '<span class="badge badge-poliza-activo">Activo</span>',
        'PAGADO': '<span class="badge badge-poliza-pagado">Pagado</span>',
        'CAPITALIZADO': '<span class="badge badge-poliza-capitalizado">Capitalizado</span>'
    };
    return badges[estado] || `<span class="badge">${estado}</span>`;
}

function isCloseToVencimiento(fechaVenc) {
    const hoy = new Date();
    const venc = new Date(fechaVenc);
    const diffTime = venc - hoy;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 15;
}

function viewPoliza(id) {
    const poliza = allPolizas.find(p => p.id_poliza === id);
    if (poliza) {
        openPolizaModal(poliza);
    }
}

// Inicializar si el módulo está cargado
document.addEventListener('DOMContentLoaded', () => {
    // El sistema dinámico de INKA CORP suele inicializar mediante app.js
    // pero dejamos esto por precaución o integración directa
});
