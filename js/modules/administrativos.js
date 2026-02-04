/**
 * INKA CORP - Módulo Gastos Administrativos
 * Maneja el registro y visualización de gastos operativos internos.
 */

// Estado del módulo
let gastosAdmData = [];
let admImageFile = null;

/**
 * Inicializa el módulo de Gastos Administrativos
 */
async function initAdministrativosModule() {

    const tableBody = document.getElementById('adm-table-body');
    if (!tableBody) {
        console.warn('Vista de Gastos Administrativos no encontrada en el DOM.');
        return;
    }

    // Configurar event listeners
    setupAdmEventListeners();

    // Cargar datos iniciales
    await loadAdmData();
}

/**
 * Configura los event listeners del módulo
 */
function setupAdmEventListeners() {
    // Búsqueda
    const searchInput = document.getElementById('search-administrativos');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterAdmGastos(e.target.value);
        });
    }

    // Botón Sincronizar
    const refreshBtn = document.getElementById('refresh-administrativos');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            await loadAdmData(true);
        });
    }

    // Botón Nuevo Gasto (Abre modal)
    const btnNuevo = document.getElementById('btn-nuevo-gasto-adm');
    if (btnNuevo) {
        btnNuevo.addEventListener('click', () => {
            resetAdmForm();
            openAdmModal();
        });
    }

    // Modal Close
    const closeButtons = document.querySelectorAll('#modal-gasto-adm [data-close-modal], #modal-evidencia-adm [data-close-modal]');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('modal-gasto-adm').classList.add('hidden');
            document.getElementById('modal-evidencia-adm').classList.add('hidden');
        });
    });

    // Manejo de Archivo/Imagen (Galería y Cámara)
    const fileInput = document.getElementById('adm-file-input');
    const cameraInput = document.getElementById('adm-camera-input');

    const handleFileChange = (e) => {
        if (e.target.files[0]) {
            handleAdmImageSelected(e.target.files[0]);
        }
    };

    if (fileInput) fileInput.addEventListener('change', handleFileChange);
    if (cameraInput) cameraInput.addEventListener('change', handleFileChange);

    const removePreviewBtn = document.getElementById('remove-adm-preview');
    if (removePreviewBtn) {
        removePreviewBtn.addEventListener('click', clearAdmImagePreview);
    }

    // Filtros de fecha
    const filterDesde = document.getElementById('filter-adm-desde');
    const filterHasta = document.getElementById('filter-adm-hasta');
    if (filterDesde) filterDesde.addEventListener('change', () => filterAdmByDateRange());
    if (filterHasta) filterHasta.addEventListener('change', () => filterAdmByDateRange());

    // Botón Ver Todo
    const btnVerTodo = document.getElementById('btn-adm-ver-todo');
    if (btnVerTodo) {
        btnVerTodo.addEventListener('click', () => {
            if (filterDesde) filterDesde.value = '';
            if (filterHasta) filterHasta.value = '';
            renderAdmTable(gastosAdmData);
            btnVerTodo.classList.add('hidden');
        });
    }

    // Formulario Submit
    const form = document.getElementById('form-gasto-adm');
    if (form) {
        form.addEventListener('submit', handleAdmFormSubmit);
    }
}

/**
 * Carga los datos desde Supabase
 */
async function loadAdmData(forceRefresh = false) {
    const tableBody = document.getElementById('adm-table-body');
    const emptyMsg = document.getElementById('adm-empty');

    if (!tableBody) return; // Evitar errores si la vista cambió rápido

    // PASO 1: Usar caché si está disponible y es válido
    if (!forceRefresh && window.hasCacheData && window.hasCacheData('administrativos')) {
        gastosAdmData = window.getCacheData('administrativos');
        renderAdmDataImmediate();

        // Si el caché es reciente, no re-consultar
        if (window.isCacheValid && window.isCacheValid('administrativos')) {
            return;
        }
    }

    if (!gastosAdmData.length) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 3rem;"><div class="spinner" style="margin: 0 auto 1rem;"></div><p>Cargando gastos...</p></td></tr>';
    }

    try {
        const supabase = window.getSupabaseClient();
        if (!supabase) throw new Error('Cliente Supabase no disponible');

        const { data, error } = await supabase
            .from('ic_gastos_administrativos')
            .select('*')
            .order('fecha', { ascending: false });

        if (error) throw error;

        gastosAdmData = data || [];

        // Guardar en caché global
        if (window.setCacheData) {
            window.setCacheData('administrativos', gastosAdmData);
        }

        renderAdmDataImmediate();

    } catch (error) {
        console.error('Error al cargar gastos administrativos:', error);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red">Error: ${error.message}</td></tr>`;
        }
    }
}

/**
 * Función auxiliar para renderizar sin repetir código
 */
function renderAdmDataImmediate() {
    const filterDesde = document.getElementById('filter-adm-desde');
    const filterHasta = document.getElementById('filter-adm-hasta');
    const btnVerTodo = document.getElementById('btn-adm-ver-todo');
    const emptyMsg = document.getElementById('adm-empty');

    if (filterDesde && filterHasta) {
        if (!filterDesde.value && !filterHasta.value) {
            renderAdmTable(gastosAdmData.slice(0, 6));
            if (btnVerTodo) btnVerTodo.classList.remove('hidden');
        } else {
            filterAdmByDateRange();
        }
    } else {
        renderAdmTable(gastosAdmData.slice(0, 6));
    }

    updateAdmStats(gastosAdmData);

    if (gastosAdmData.length === 0) {
        if (emptyMsg) emptyMsg.classList.remove('hidden');
    } else {
        if (emptyMsg) emptyMsg.classList.add('hidden');
    }
}

/**
 * Renderiza la tabla de gastos
 */
function renderAdmTable(data) {
    const tableBody = document.getElementById('adm-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    data.forEach(gasto => {
        const tr = document.createElement('tr');
        tr.className = 'expense-row';

        const tieneFoto = gasto.fotografia && gasto.fotografia.trim() !== '';

        tr.innerHTML = `
            <td><span class="expense-date">${formatAdmDate(gasto.fecha)}</span></td>
            <td><div class="expense-reason">${gasto.motivo}</div></td>
            <td><span class="expense-amount">$${parseFloat(gasto.monto).toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span></td>
            <td>
                ${tieneFoto ? `
                    <button class="btn-view-photo" onclick="viewAdmEvidencia('${gasto.fotografia}')">
                        <i class="fas fa-image"></i> Ver Foto
                    </button>
                ` : '<span style="color:var(--gray-300); font-size: 0.8rem">Sin evidencia</span>'}
            </td>
            <td>
                <button class="btn-delete-expense" onclick="deleteAdmGasto(event, '${gasto.id_gastos}')" title="Eliminar">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;

        // Agregar evento de click para editar (opcional, por ahora solo borrar y ver foto)
        // tr.onclick = () => editAdmGasto(gasto);

        tableBody.appendChild(tr);
    });
}

/**
 * Actualiza las estadísticas
 */
function updateAdmStats(data) {
    const totalCount = data.length;
    const totalMonto = data.reduce((sum, g) => sum + parseFloat(g.monto || 0), 0);

    // Calcular mes actual
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const mesMonto = data.reduce((sum, g) => {
        const d = new Date(g.fecha);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
            return sum + parseFloat(g.monto || 0);
        }
        return sum;
    }, 0);

    document.getElementById('stat-adm-total-count').textContent = totalCount;
    document.getElementById('stat-adm-total-monto').textContent = '$' + totalMonto.toLocaleString('es-EC', { minimumFractionDigits: 2 });
    document.getElementById('stat-adm-mes-actual').textContent = '$' + mesMonto.toLocaleString('es-EC', { minimumFractionDigits: 2 });
}

/**
 * Filtra los gastos
 */
function filterAdmGastos(query) {
    const q = query.toLowerCase();
    const filtered = gastosAdmData.filter(g =>
        (g.motivo || '').toLowerCase().includes(q) ||
        (g.id_gastos || '').toLowerCase().includes(q)
    );
    renderAdmTable(filtered);
}

/**
 * Filtra los datos por el mes actual
 */
function filterByCurrentMonth(data) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return data.filter(g => {
        const d = new Date(g.fecha);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
}

/**
 * Filtra los gastos por rango de fechas
 */
function filterAdmByDateRange() {
    const elDesde = document.getElementById('filter-adm-desde');
    const elHasta = document.getElementById('filter-adm-hasta');
    const btnVerTodo = document.getElementById('btn-adm-ver-todo');

    if (!elDesde || !elHasta) return;

    const desde = elDesde.value;
    const hasta = elHasta.value;

    if (!desde && !hasta) {
        // Por defecto mostrar los últimos 6
        renderAdmTable(gastosAdmData.slice(0, 6));
        if (btnVerTodo) btnVerTodo.classList.remove('hidden');
        return;
    }

    let filtered = [...gastosAdmData];

    if (desde) {
        filtered = filtered.filter(g => g.fecha >= desde);
    }
    if (hasta) {
        filtered = filtered.filter(g => g.fecha <= hasta);
    }

    renderAdmTable(filtered);
    if (btnVerTodo) btnVerTodo.classList.remove('hidden');
}

/**
 * Abre el modal
 */
function openAdmModal() {
    document.getElementById('modal-gasto-adm').classList.remove('hidden');
}

/**
 * Resetea el formulario
 */
function resetAdmForm() {
    const form = document.getElementById('form-gasto-adm');
    if (form) form.reset();

    document.getElementById('adm-id-gasto').value = '';
    document.getElementById('adm-fotografia-url').value = '';
    document.getElementById('adm-fecha').value = new Date().toISOString().split('T')[0];

    clearAdmImagePreview();
}

/**
 * Maneja la selección de imagen
 */
async function handleAdmImageSelected(file) {
    admImageFile = file;
    const preview = document.getElementById('adm-preview');
    const container = document.getElementById('adm-preview-container');
    const placeholder = document.getElementById('adm-upload-placeholder');

    try {
        await window.showImagePreview(file, preview);
        container.classList.remove('hidden');
        placeholder.classList.add('hidden');
    } catch (err) {
        console.error('Error en preview:', err);
    }
}

/**
 * Limpia el preview
 */
function clearAdmImagePreview() {
    admImageFile = null;
    document.getElementById('adm-preview').src = '';
    document.getElementById('adm-preview-container').classList.add('hidden');
    document.getElementById('adm-upload-placeholder').classList.remove('hidden');
}

/**
 * Elmina un gasto
 */
async function deleteAdmGasto(event, id) {
    event.stopPropagation();

    const confirmed = await window.showConfirm(
        '¿Estás seguro de que deseas eliminar este registro de gasto?',
        'Eliminar Gasto',
        { type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar' }
    );

    if (!confirmed) return;

    try {
        const supabase = window.getSupabaseClient();
        const { error } = await supabase
            .from('ic_gastos_administrativos')
            .delete()
            .eq('id_gastos', id);

        if (error) throw error;

        window.showToast('Gasto eliminado correctamente', 'success');
        await loadAdmData();

    } catch (err) {
        console.error('Error al eliminar:', err);
        window.showAlert('No se pudo eliminar: ' + err.message, 'Error', 'error');
    }
}

/**
 * Maneja el submit del formulario
 */
async function handleAdmFormSubmit(e) {
    e.preventDefault();

    const btnSave = document.getElementById('btn-save-gasto-adm');
    const originalText = btnSave.innerHTML;

    try {
        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        const id_gastos = document.getElementById('adm-id-gasto').value || 'adm-' + Date.now().toString(16);
        const monto = parseFloat(document.getElementById('adm-monto').value);
        const motivo = document.getElementById('adm-motivo').value;
        // Obtener la fecha del input y mantenerla en formato YYYY-MM-DD sin conversión de zona horaria
        const fechaInput = document.getElementById('adm-fecha').value;
        const fecha = fechaInput; // Se guarda directamente en formato DATE de PostgreSQL
        let fotografia = document.getElementById('adm-fotografia-url').value;

        // 1. Subir imagen si hay una seleccionada
        if (admImageFile) {
            btnSave.innerHTML = '<i class="fas fa-camera fa-spin"></i> Subiendo imagen...';
            // Carpeta: administrativos, ID: id_gastos, Bucket: inkacorp
            const uploadRes = await window.uploadImageToStorage(admImageFile, 'administrativos', id_gastos, 'inkacorp');

            if (uploadRes.success) {
                fotografia = uploadRes.url;
            } else {
                throw new Error('Error al subir comprobante: ' + uploadRes.error);
            }
        }

        // 2. Guardar en DB
        const supabase = window.getSupabaseClient();
        const dataToSave = {
            id_gastos,
            monto,
            motivo,
            fecha,
            fotografia,
            created_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('ic_gastos_administrativos')
            .upsert(dataToSave);

        if (error) throw error;

        await window.showAlert('El gasto administrativo se ha guardado correctamente.', '¡Guardado Exitoso!', 'success');
        document.getElementById('modal-gasto-adm').classList.add('hidden');
        await loadAdmData();

    } catch (err) {
        console.error('Error al guardar:', err);
        window.showAlert(err.message, 'Error', 'error');
    } finally {
        btnSave.disabled = false;
        btnSave.innerHTML = originalText;
    }
}

/**
 * Muestra la evidencia en el modal viewer
 */
function viewAdmEvidencia(url) {
    const modal = document.getElementById('modal-evidencia-adm');
    const img = document.getElementById('evidencia-full-img');
    const downloadBtn = document.getElementById('btn-download-evidencia');

    img.src = url;
    downloadBtn.href = url;

    modal.classList.remove('hidden');
}

/**
 * Helper para formatear fechas
 */
function formatAdmDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
        return dateStr;
    }
}

// Exponer funciones globales para eventos onclick
window.viewAdmEvidencia = viewAdmEvidencia;
window.deleteAdmGasto = deleteAdmGasto;
window.initAdministrativosModule = initAdministrativosModule;
