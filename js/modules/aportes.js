/**
 * INKA CORP - Módulo de Aportes Semanales
 * Maneja el registro y gestión de aportes de socios
 */

// Estado del módulo
let aportesData = [];
let sociosAportes = [];
let selectedAporteFile = null;

/**
 * Inicializa el módulo de Aportes Semanales
 */
async function initAportesModule() {
    console.log('Inicializando Módulo de Aportes Semanales...');

    // Configurar event listeners
    setupAportesEventListeners();

    // Cargar datos iniciales
    await cargarDatosAportes();

    // Llenar selects de socios
    await llenarSelectsSocios();
}

/**
 * Configura los event listeners del módulo
 */
function setupAportesEventListeners() {
    // Botón Nuevo Aporte
    const btnNuevo = document.getElementById('btn-nuevo-aporte');
    if (btnNuevo) {
        btnNuevo.addEventListener('click', () => {
            closeAllModals();
            resetFormAporte();
            const modal = document.getElementById('modal-aporte');
            modal.style.display = 'flex';
            modal.classList.remove('hidden');

            // Set fecha actual por defecto
            document.getElementById('aporte-fecha').value = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
        });
    }

    // Botón Historial Completo
    const btnHistorial = document.getElementById('btn-ver-historial-completo');
    if (btnHistorial) {
        btnHistorial.addEventListener('click', async () => {
            closeAllModals();
            const modal = document.getElementById('modal-historial-aportes');
            modal.style.display = 'flex';
            modal.classList.remove('hidden');
            await cargarHistorialCompleto();
        });
    }

    // Cerrar modales
    const closeElements = document.querySelectorAll('[data-close-modal]');
    closeElements.forEach(el => {
        el.addEventListener('click', closeAllModals);
    });

    // Manejo de carga de imagen
    const uploadPlaceholder = document.getElementById('aporte-upload-placeholder');
    const fileInput = document.getElementById('aporte-comprobante');

    if (uploadPlaceholder && fileInput) {
        uploadPlaceholder.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleAporteFileSelect(file);
        });
    }

    const btnRemovePreview = document.querySelector('.btn-remove-preview');
    if (btnRemovePreview) {
        btnRemovePreview.addEventListener('click', (e) => {
            e.stopPropagation();
            resetAporteImage();
        });
    }

    // Formulario de Registro
    const formAporte = document.getElementById('form-aporte');
    if (formAporte) {
        formAporte.addEventListener('submit', handleAporteSubmit);
    }

    // Filtros de Historial
    const btnFilter = document.getElementById('btn-filter-aportes');
    if (btnFilter) {
        btnFilter.addEventListener('click', cargarHistorialCompleto);
    }
}

/**
 * Cierra todos los modales del módulo
 */
function closeAllModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(m => {
        m.style.display = 'none';
        m.classList.add('hidden');
    });
}

/**
 * Maneja la selección de archivo de comprobante
 */
function handleAporteFileSelect(file) {
    if (!file.type.startsWith('image/')) {
        showAlert('Por favor seleccione un archivo de imagen válido', 'Error', 'error');
        return;
    }

    selectedAporteFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        const previewImg = document.querySelector('#aporte-preview img');
        previewImg.src = e.target.result;
        document.getElementById('aporte-upload-placeholder').classList.add('hidden');
        document.getElementById('aporte-preview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

/**
 * Resetea la imagen del formulario
 */
function resetAporteImage() {
    selectedAporteFile = null;
    document.getElementById('aporte-comprobante').value = '';
    document.getElementById('aporte-upload-placeholder').classList.remove('hidden');
    document.getElementById('aporte-preview').classList.add('hidden');
    document.querySelector('#aporte-preview img').src = '';
}

/**
 * Carga los datos iniciales de aportes
 */
async function cargarDatosAportes() {
    try {
        const supabase = window.getSupabaseClient();
        if (!supabase) return;

        // Intentar cargar aportes (limitado a los últimos de la semana para el dashboard)
        // Usamos una tabla hipotética ic_aportes_semanales
        const { data, error } = await supabase
            .from('ic_aportes_semanales')
            .select('*, socio:ic_socios(nombre)')
            .order('fecha', { ascending: false });

        if (error) {
            console.warn('Error cargando aportes (posible tabla inexistente):', error.message);
            // Si la tabla no existe, mostramos mensaje vacío
            renderAportesRecientes([]);
            return;
        }

        aportesData = data;
        renderAportesRecientes(data);

    } catch (error) {
        console.error('Error en cargarDatosAportes:', error);
    }
}

/**
 * Renderiza la tabla de aportes recientes (mini-historial)
 * Mostramos el último aporte de cada persona en la semana actual
 */
function renderAportesRecientes(data) {
    const listContainer = document.getElementById('lista-aportes-recientes');
    if (!listContainer) return;

    if (!data || data.length === 0) {
        listContainer.innerHTML = '<tr><td colspan="5" class="text-center py-5">No hay aportes registrados esta semana</td></tr>';

        // Reset stats
        updateAportesStats([], 0);
        return;
    }

    // Calcular estadísticas generales para el panel
    const sociosUnicos = new Set(data.map(a => a.id_socio));
    const totalCaja = data.reduce((sum, a) => sum + parseFloat(a.monto || 0), 0);

    // Aportes de la semana actual
    const hoy = new Date();
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay());
    inicioSemana.setHours(0, 0, 0, 0);
    const aportesSemana = data.filter(a => new Date(a.fecha) >= inicioSemana);

    // Actualizar Panel de Stats
    updateAportesStats(sociosUnicos, totalCaja, aportesSemana.length);

    // Mostrar los últimos 10 aportes
    const itemsToShow = data.slice(0, 10);

    let html = '';
    itemsToShow.forEach(aporte => {
        html += `
            <tr class="fade-in">
                <td>
                    <div class="d-flex align-items-center">
                        <div class="avatar-initial">${(aporte.socio?.nombre || 'S').charAt(0)}</div>
                        <div>
                            <div class="font-weight-bold text-dark">${aporte.socio?.nombre || 'Desconocido'}</div>
                            <small class="text-muted">ID: ${aporte.id_socio}</small>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="font-weight-bold text-primary" style="font-size: 1.1rem;">
                        $${parseFloat(aporte.monto).toLocaleString('es-EC', { minimumFractionDigits: 2 })}
                    </div>
                </td>
                <td>
                    <div class="d-flex flex-column">
                        <span>${formatDate(aporte.fecha)}</span>
                        <small class="text-muted"><i class="far fa-clock"></i> ${formatDateTime(aporte.created_at).split(' ')[1] || ''}</small>
                    </div>
                </td>
                <td><span class="badge badge-success px-3 py-2 rounded-pill shadow-sm"><i class="fas fa-check mr-1"></i> Recibido</span></td>
                <td class="text-center">
                    <button class="btn-icon shadow-sm" style="background: white; border: 1px solid var(--border-color); width: 35px; height: 35px;" onclick="verComprobanteAporte('${aporte.comprobante_url}')" title="Ver Comprobante">
                        <i class="fas fa-image text-gold"></i>
                    </button>
                    <button class="btn-icon shadow-sm ml-2" style="background: white; border: 1px solid var(--border-color); width: 35px; height: 35px;" onclick="window.open('${aporte.comprobante_url}', '_blank')" title="Descargar">
                        <i class="fas fa-download text-primary"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    listContainer.innerHTML = html;
}

/**
 * Actualiza los contadores del panel de estadísticas
 */
function updateAportesStats(sociosSet, totalMonto, countSemana) {
    const elSocios = document.getElementById('stat-socios-count');
    const elTotal = document.getElementById('stat-total-caja');
    const elWeek = document.getElementById('stat-week-count');

    if (elSocios) elSocios.textContent = sociosSet.size || sociosSet.length || 0;
    if (elTotal) elTotal.textContent = `$${totalMonto.toLocaleString('es-EC', { minimumFractionDigits: 2 })}`;
    if (elWeek) elWeek.textContent = countSemana || 0;
}
/**
 * Llena los selects de socios
 */
async function llenarSelectsSocios() {
    try {
        const supabase = window.getSupabaseClient();
        if (!supabase) return;

        // Cargar socios del caché o DB
        let socios = [];
        if (window.hasCacheData && window.hasCacheData('socios')) {
            socios = window.getCacheData('socios');
        } else {
            const { data } = await supabase.from('ic_socios').select('idsocio, nombre').order('nombre');
            socios = data || [];
        }

        sociosAportes = socios;

        const selectAporte = document.getElementById('aporte-socio');
        const selectFilter = document.getElementById('filter-aporte-socio');

        if (selectAporte) {
            selectAporte.innerHTML = '<option value="">Seleccione una persona...</option>' +
                socios.map(s => `<option value="${s.idsocio}">${s.nombre}</option>`).join('');
        }

        if (selectFilter) {
            selectFilter.innerHTML = '<option value="">Todos los socios</option>' +
                socios.map(s => `<option value="${s.idsocio}">${s.nombre}</option>`).join('');
        }

    } catch (error) {
        console.error('Error al llenar selects de socios:', error);
    }
}

/**
 * Maneja el envío del formulario de registro
 */
async function handleAporteSubmit(e) {
    e.preventDefault();

    const socioId = document.getElementById('aporte-socio').value;
    const monto = document.getElementById('aporte-monto').value;
    const fecha = document.getElementById('aporte-fecha').value;

    if (!socioId || !monto || !fecha) {
        showAlert('Por favor complete todos los campos obligatorios', 'Atención', 'warning');
        return;
    }

    if (!selectedAporteFile) {
        showAlert('Debe subir una imagen del comprobante', 'Atención', 'warning');
        return;
    }

    try {
        beginLoading('Guardando aporte...');
        const supabase = window.getSupabaseClient();
        const currentUser = window.getCurrentUser ? window.getCurrentUser() : null;

        // 1. Subir imagen
        let imageUrl = null;
        const timestamp = Date.now();
        const extension = selectedAporteFile.name.split('.').pop();
        const fileName = `aportes/${socioId}/${timestamp}.${extension}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('inkacorp')
            .upload(fileName, selectedAporteFile);

        if (uploadError) throw new Error('Error al subir comprobante: ' + uploadError.message);

        const { data: urlData } = supabase.storage
            .from('inkacorp')
            .getPublicUrl(fileName);

        imageUrl = urlData.publicUrl;

        // 2. Guardar en DB
        const { data, error } = await supabase
            .from('ic_aportes_semanales')
            .insert({
                id_socio: socioId,
                monto: parseFloat(monto),
                fecha: fecha,
                comprobante_url: imageUrl,
                id_usuario_registro: currentUser ? currentUser.id : null
            });

        if (error) throw error;

        showToast('Aporte registrado exitosamente', 'success');
        closeAllModals();
        resetFormAporte();

        // Recargar datos
        await cargarDatosAportes();

    } catch (error) {
        console.error('Error al guardar aporte:', error);
        showAlert('No se pudo guardar el aporte: ' + error.message, 'Error', 'error');
    } finally {
        endLoading();
    }
}

/**
 * Resetea el formulario de aporte
 */
function resetFormAporte() {
    const form = document.getElementById('form-aporte');
    if (form) form.reset();
    resetAporteImage();
}

/**
 * Carga el historial completo con filtros
 */
async function cargarHistorialCompleto() {
    try {
        const socioId = document.getElementById('filter-aporte-socio').value;
        const desde = document.getElementById('filter-aporte-desde').value;
        const hasta = document.getElementById('filter-aporte-hasta').value;

        const supabase = window.getSupabaseClient();
        if (!supabase) return;

        let query = supabase
            .from('ic_aportes_semanales')
            .select('*, socio:ic_socios(nombre)')
            .order('fecha', { ascending: false });

        if (socioId) query = query.eq('id_socio', socioId);
        if (desde) query = query.gte('fecha', desde);
        if (hasta) query = query.lte('fecha', hasta);

        const { data, error } = await query;

        if (error) throw error;

        renderHistorialAportes(data);

    } catch (error) {
        console.error('Error al cargar historial completo:', error);
        showToast('Error al cargar historial', 'error');
    }
}

/**
 * Renderiza el historial completo en el modal
 */
function renderHistorialAportes(data) {
    const container = document.getElementById('lista-historial-aportes');
    const summaryContainer = document.getElementById('summary-historial-aportes');
    const labelTotalMonto = document.getElementById('resumen-total-monto');
    const labelTotalConteo = document.getElementById('resumen-total-conteo');

    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = '<tr><td colspan="5" class="text-center py-5">No se encontraron aportes con los filtros seleccionados</td></tr>';
        if (summaryContainer) summaryContainer.style.display = 'none';
        return;
    }

    // Calcular estadísticas
    let totalMonto = 0;
    data.forEach(item => {
        totalMonto += parseFloat(item.monto || 0);
    });

    // Actualizar UI de resumen
    if (summaryContainer) {
        summaryContainer.style.display = 'flex';
        if (labelTotalMonto) labelTotalMonto.textContent = `$${totalMonto.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (labelTotalConteo) labelTotalConteo.textContent = data.length;
    }

    let html = '';
    data.forEach(item => {
        const initial = (item.socio?.nombre || 'S').charAt(0);
        html += `
            <tr class="fade-in">
                <td>
                    <div class="d-flex flex-column">
                        <span class="font-weight-bold">${formatDate(item.fecha)}</span>
                        <small class="text-muted"><i class="far fa-calendar-alt"></i></small>
                    </div>
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="avatar-initial" style="width: 32px; height: 32px; font-size: 0.8rem;">${initial}</div>
                        <span class="font-weight-600">${item.socio?.nombre || 'Socio'}</span>
                    </div>
                </td>
                <td>
                    <span class="text-amount">$${parseFloat(item.monto).toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span>
                </td>
                <td class="text-center">
                    <a href="${item.comprobante_url}" target="_blank" class="comprobante-link" title="Ver Comprobante">
                        <i class="fas fa-image"></i>
                    </a>
                </td>
                <td>
                    <div class="d-flex flex-column">
                        <small class="text-muted">${formatDateTime(item.created_at).split(' ')[0]}</small>
                        <small class="text-muted" style="font-size: 0.7rem;">${formatDateTime(item.created_at).split(' ')[1] || ''}</small>
                    </div>
                </td>
            </tr>
        `;
    });

    container.innerHTML = html;
}

/**
 * Abre visualización de comprobante
 */
function verComprobanteAporte(url) {
    if (url) window.open(url, '_blank');
}

// Exponer funciones necesarias globalmente
window.initAportesModule = initAportesModule;
window.verComprobanteAporte = verComprobanteAporte;
