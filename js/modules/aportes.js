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

    // Search input for aporte modal (filtro en tiempo real)
    const aporteSearch = document.getElementById('aporte-socio-search');
    const aporteHidden = document.getElementById('aporte-socio');
    const aporteDatalist = document.getElementById('aporte-socio-list');
    const aporteSelectedView = document.getElementById('aporte-socio-selected');

    if (aporteSearch) {
        const suggestionsEl = document.getElementById('aporte-socio-suggestions');
        let focusedIndex = -1;

        // Render suggestions under the input using filterAporteSocios
        async function renderSuggestions(q) {
            const matches = await filterAporteSocios(q) || [];
            if (!suggestionsEl) return matches;

            if (!matches || matches.length === 0) {
                suggestionsEl.innerHTML = '';
                suggestionsEl.classList.add('hidden');
                focusedIndex = -1;
                return matches;
            }

            suggestionsEl.innerHTML = matches.map((m, idx) =>
                `<div role="option" aria-selected="false" class="aporte-suggestion" data-idx="${idx}" data-id="${m.idsocio}">
                    <div class="suggestion-name">${(m.nombre || '').replace(/</g,'&lt;')}</div>
                </div>`
            ).join('');

            suggestionsEl.classList.remove('hidden');
            focusedIndex = -1;

            // attach click handlers
            Array.from(suggestionsEl.children).forEach(node => {
                node.addEventListener('click', (ev) => {
                    const id = node.getAttribute('data-id');
                    selectAporteById(id);
                    hideSuggestions();
                });
            });

            return matches;
        }

        function showSuggestions() { if (suggestionsEl) suggestionsEl.classList.remove('hidden'); }
        function hideSuggestions() { if (suggestionsEl) suggestionsEl.classList.add('hidden'); focusedIndex = -1; }

        function highlight(index) {
            if (!suggestionsEl) return;
            const items = suggestionsEl.querySelectorAll('.aporte-suggestion');
            items.forEach((it, i) => {
                const sel = i === index;
                it.setAttribute('aria-selected', sel ? 'true' : 'false');
                it.classList.toggle('is-active', sel);
                if (sel) it.scrollIntoView({ block: 'nearest' });
            });
            focusedIndex = index;
        }

        aporteSearch.addEventListener('input', async (e) => {
            clearSelectedAporte(false);
            await renderSuggestions(e.target.value);
        });

        aporteSearch.addEventListener('keydown', (e) => {
            const items = suggestionsEl ? suggestionsEl.querySelectorAll('.aporte-suggestion') : [];
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (items.length === 0) return;
                const next = Math.min(focusedIndex + 1, items.length - 1);
                highlight(next);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (items.length === 0) return;
                const prev = Math.max(focusedIndex - 1, 0);
                highlight(prev);
            } else if (e.key === 'Enter') {
                if (focusedIndex >= 0 && suggestionsEl) {
                    const node = suggestionsEl.querySelector(`.aporte-suggestion[data-idx="${focusedIndex}"]`);
                    if (node) {
                        selectAporteById(node.getAttribute('data-id'));
                        hideSuggestions();
                        e.preventDefault();
                    }
                } else {
                    // if exact single match, select it
                    const matches = (sociosAportes || []).filter(s => (s.nombre || '').toLowerCase() === (aporteSearch.value || '').trim().toLowerCase() || String(s.idsocio) === (aporteSearch.value || '').trim());
                    if (matches.length === 1) {
                        selectAporteById(matches[0].idsocio);
                        hideSuggestions();
                        e.preventDefault();
                    }
                }
            } else if (e.key === 'Escape') {
                hideSuggestions();
                clearSelectedAporte(true);
            }
        });

        aporteSearch.addEventListener('focus', (e) => {
            if ((aporteSearch.value || '').trim().length > 0) renderSuggestions(aporteSearch.value);
        });

        // click outside hides suggestions
        document.addEventListener('click', (ev) => {
            if (!document.getElementById('modal-aporte')) return;
            const within = ev.target.closest && ev.target.closest('#modal-aporte');
            if (!within) return;
            const insideInput = ev.target.closest && ev.target.closest('#aporte-socio-search');
            const insideSug = ev.target.closest && ev.target.closest('#aporte-socio-suggestions');
            if (!insideInput && !insideSug) hideSuggestions();
        });

        function hideSuggestionsOnBlur() { setTimeout(() => hideSuggestions(), 120); }
        aporteSearch.addEventListener('blur', hideSuggestionsOnBlur);
    }

    // Filtros de Historial
    const btnFilter = document.getElementById('btn-filter-aportes');
    if (btnFilter) {
        btnFilter.addEventListener('click', cargarHistorialCompleto);
    }

    // Botón Reporte General PDF
    const btnReportePDF = document.getElementById('btn-reporte-general-aportes');
    if (btnReportePDF) {
        btnReportePDF.addEventListener('click', generateAportesReport);
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
            .select('*, socio:ic_socios!id_socio(nombre)')
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
            // selectAporte fue eliminado del DOM — mantener compatibilidad: escribir el primer match en el hidden si existe
            if (socios.length === 1) {
                selectAporte.value = socios[0].idsocio;
            }
        }

        if (selectFilter) {
            selectFilter.innerHTML = '<option value="">Todos los socios</option>' +
                socios.map(s => `<option value="${s.idsocio}">${s.nombre}</option>`).join('');
        }

        // Reset visual/search state
        const aporteSearch = document.getElementById('aporte-socio-search');
        if (aporteSearch) aporteSearch.value = '';
        if (typeof filterAporteSocios === 'function') filterAporteSocios('');

    } catch (error) {
        console.error('Error al llenar selects de socios:', error);
    }
}

/**
 * Filtra el select `#aporte-socio` usando el array `sociosAportes` (sin volver a pedir al servidor)
 * @param {string} query
 */
function escapeHtml(str){ return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function filterAporteSocios(query) {
    const q = String(query || '').trim().toLowerCase();

    // Si aún no tenemos socios cargados, cargarlos (fallback silencioso)
    if (!Array.isArray(sociosAportes) || sociosAportes.length === 0) {
        try {
            await llenarSelectsSocios();
        } catch (err) {
            console.warn('filterAporteSocios: no se pudieron cargar socios a tiempo', err);
        }
    }

    const matches = q === ''
        ? sociosAportes
        : sociosAportes.filter(s => (s.nombre || '').toLowerCase().includes(q) || String(s.idsocio).includes(q));

    // Poblar datalist con coincidencias (para que el navegador muestre sugerencias)
    const aporteDatalist = document.getElementById('aporte-socio-list');
    if (aporteDatalist) {
        if (!matches || matches.length === 0) {
            aporteDatalist.innerHTML = `<option value="No se encontraron socios"></option>`;
        } else {
            aporteDatalist.innerHTML = matches.map(s => `<option value="${escapeHtml(s.nombre)}"></option>`).join('');
        }
    }

    return matches;
}

/**
 * Setea la selección actual del socio: actualiza el hidden, muestra la 'pill' y limpia el input
 */
function selectAporteById(id) {
    const found = sociosAportes.find(s => String(s.idsocio) === String(id));
    const aporteHidden = document.getElementById('aporte-socio');
    const aporteSearch = document.getElementById('aporte-socio-search');
    const aporteSelectedView = document.getElementById('aporte-socio-selected');
    if (!found || !aporteHidden || !aporteSearch || !aporteSelectedView) return;

    aporteHidden.value = found.idsocio;
    aporteSelectedView.classList.remove('hidden');
    aporteSelectedView.innerHTML = `
        <div class="selected-socio-pill">
            <i class="fas fa-user-circle mr-2"></i>
            <span class="selected-socio-name">${escapeHtml(found.nombre)}</span>
            <button type="button" class="btn-clear-selected" aria-label="Quitar socio">&times;</button>
        </div>
    `;
    aporteSearch.value = '';

    // Clear handler for the pill
    const btn = aporteSelectedView.querySelector('.btn-clear-selected');
    if (btn) btn.addEventListener('click', () => clearSelectedAporte(true));
}

function clearSelectedAporte(focusInput = false) {
    const aporteHidden = document.getElementById('aporte-socio');
    const aporteSearch = document.getElementById('aporte-socio-search');
    const aporteSelectedView = document.getElementById('aporte-socio-selected');
    if (aporteHidden) aporteHidden.value = '';
    if (aporteSelectedView) { aporteSelectedView.classList.add('hidden'); aporteSelectedView.innerHTML = ''; }
    if (focusInput && aporteSearch) aporteSearch.focus();
}


/**
 * Intenta abrir el dropdown nativo de un <select> de forma no destructiva.
 * Prueba varios métodos (keydown ArrowDown, mousedown/click) y atrapa errores.
 */
function openSelectDropdown(select) {
    if (!select) return;

    // 1) Focus + ArrowDown (funciona en Chrome/Edge/Firefox en escritorio)
    try {
        select.focus();
        const kd = new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true, cancelable: true });
        select.dispatchEvent(kd);
    } catch (e) {
        /* noop */
    }

    // 2) Simular mousedown/click (algunos navegadores abren el dropdown con mousedown)
    try {
        const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
        select.dispatchEvent(md);
        const mu = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
        select.dispatchEvent(mu);
        const ck = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        select.dispatchEvent(ck);
    } catch (e) {
        /* noop */
    }

    // 3) Fallback para móviles: temporariamente mostrar el select como lista (no persistente)
    try {
        if ('ontouchstart' in window && !select.hasAttribute('data-size-temp')) {
            const size = Math.min(8, Math.max(3, select.options.length));
            select.setAttribute('data-size-temp', String(size));
            select.setAttribute('size', String(size));
            // Restaurar después de 2s para no romper el layout permanentemente
            setTimeout(() => {
                select.removeAttribute('size');
                select.removeAttribute('data-size-temp');
            }, 2000);
        }
    } catch (e) {
        /* noop */
    }
}

/**
 * Maneja el envío del formulario de registro
 */
async function handleAporteSubmit(e) {
    e.preventDefault();

    // resolver socioId desde el hidden; si está vacío, intentar resolver por texto escrito
    let socioId = (document.getElementById('aporte-socio') || {}).value || '';
    const monto = document.getElementById('aporte-monto').value;
    const fecha = document.getElementById('aporte-fecha').value;

    if (!socioId) {
        const q = (document.getElementById('aporte-socio-search') || {}).value || '';
        const matches = sociosAportes.filter(s => (s.nombre || '').toLowerCase() === q.trim().toLowerCase() || String(s.idsocio) === q.trim());
        if (matches.length === 1) socioId = matches[0].idsocio;
    }

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

        // mostrar confirmación visible en el botón de guardar (breve)
        try {
            const _saveBtn = document.getElementById('btn-save-aporte');
            await flashSaveButtonState(_saveBtn, 'success', 900);
        } catch (e) { /* noop - no bloquear si falla */ }

        // cerrar el modal primero para evitar que overlays (backdrop) oculten el toast,
        // esperar un reflow corto y luego mostrar el toast (asegura visibilidad)
        try { closeAllModals(); } catch (e) { /* noop */ }
        await new Promise(res => setTimeout(res, 90));

        // mostrar el toast DESPUÉS de cerrar el modal para que sea visible inmediatamente
        try { showToast('Aporte registrado exitosamente', 'success'); } catch (e) { /* noop */ }

        // limpiar la selección del socio para que el modal abra vacío la próxima vez
        try { clearSelectedAporte(); } catch (e) { /* noop - protección defensiva */ }
        resetFormAporte();

        // Recargar datos
        await cargarDatosAportes();

    } catch (error) {
        console.error('Error al guardar aporte:', error);
        showAlert('No se pudo guardar el aporte: ' + error.message, 'Error', 'error');
        // indicar error en el botón de guardar (visible en el modal)
        try {
            const _saveBtn = document.getElementById('btn-save-aporte');
            await flashSaveButtonState(_saveBtn, 'error', 1400);
        } catch (e) { /* noop */ }
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
 * Muestra un estado breve y visual en el botón de guardar ("success" | "error").
 * No altera la lógica de guardado; es puramente visual y tolerante a errores.
 * Devuelve una Promise que se resuelve cuando la animación termina.
 */
function flashSaveButtonState(btn, state = 'success', duration = 900) {
    if (!btn) return Promise.resolve();
    try {
        const original = {
            innerHTML: btn.innerHTML,
            disabled: btn.disabled,
            style: btn.getAttribute('style') || ''
        };

        // Estado visual temporal
        btn.disabled = true;
        btn.style.transition = 'transform 120ms ease, opacity 120ms ease, background-color 200ms ease';
        btn.style.transform = 'translateY(-1px) scale(1.02)';

        if (state === 'success') {
            btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:.5rem;"><i class="fas fa-check-circle"></i> Guardado</span>';
            btn.style.backgroundColor = '#1e6f3a';
            btn.style.color = '#ffffff';
        } else {
            btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:.5rem;"><i class="fas fa-exclamation-circle"></i> Error</span>';
            btn.style.backgroundColor = '#b22222';
            btn.style.color = '#ffffff';
        }

        return new Promise(res => {
            setTimeout(() => {
                // restaurar estado original
                btn.innerHTML = original.innerHTML;
                btn.disabled = original.disabled;
                if (original.style) btn.setAttribute('style', original.style); else btn.removeAttribute('style');
                res();
            }, Math.max(200, duration));
        });
    } catch (err) {
        return Promise.resolve();
    }
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
            .select('*, socio:ic_socios!id_socio(nombre)')
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

/**
 * Genera el reporte PDF de aportes (Solicita fecha o rango)
 */
async function generateAportesReport() {
    try {
        const { value: formValues } = await Swal.fire({
            title: 'Reporte de Aportes',
            width: '500px',
            background: '#ffffff',
            customClass: {
                popup: 'premium-swal-popup'
            },
            html: `
                <div class="export-options-container" style="text-align: left; padding: 10px 5px;">
                    <!-- Selector de Modo (Slider) -->
                    <div class="report-mode-selector">
                        <button type="button" class="report-mode-btn active" data-mode="month" id="btn-mode-month">
                            <i class="fas fa-calendar-alt"></i> POR MES
                        </button>
                        <button type="button" class="report-mode-btn" data-mode="range" id="btn-mode-range">
                            <i class="fas fa-calendar-day"></i> RANGO
                        </button>
                        <button type="button" class="report-mode-btn" data-mode="all" id="btn-mode-all">
                            <i class="fas fa-globe"></i> GENERAL
                        </button>
                    </div>

                    <p id="export-mode-desc" style="margin-bottom: 20px; color: #64748B; font-size: 0.9rem; text-align: center;">
                        Seleccione el mes para el reporte consolidado.
                    </p>
                    
                    <!-- Sección MENSUAL -->
                    <div id="container-month" class="mode-container">
                        <div class="filter-group-corporate">
                            <label class="export-label-corporate">
                                <i class="fas fa-check-circle" style="margin-right: 8px; color: #F2BB3A;"></i>Seleccione Mes
                            </label>
                            <input type="month" id="swal-month" class="premium-input-swal" value="${new Date().toISOString().substring(0, 7)}">
                        </div>
                    </div>

                    <!-- Sección RANGO (Oculta) -->
                    <div id="container-range" class="mode-container hidden">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div class="filter-group-corporate">
                                <label class="export-label-corporate">Desde</label>
                                <input type="date" id="swal-start" class="premium-input-swal">
                            </div>
                            <div class="filter-group-corporate">
                                <label class="export-label-corporate">Hasta</label>
                                <input type="date" id="swal-end" class="premium-input-swal">
                            </div>
                        </div>
                    </div>

                    <!-- Sección GENERAL (Oculta) -->
                    <div id="container-all" class="mode-container hidden">
                        <div class="filter-group-corporate" style="text-align: center; padding: 20px;">
                            <i class="fas fa-info-circle" style="font-size: 2rem; color: #0E5936; margin-bottom: 10px; display: block;"></i>
                            <p style="margin: 0; color: #1E293B; font-weight: 600;">Se incluirán todos los registros históricos.</p>
                        </div>
                    </div>

                    <!-- NUEVO: Selector de Aportante -->
                    <div class="filter-group-corporate" style="margin-top: 20px;">
                        <label class="export-label-corporate">
                            <i class="fas fa-user" style="margin-right: 8px; color: #F2BB3A;"></i>Aportante(s)
                        </label>
                        <div class="input-with-icon" style="position: relative;">
                            <i class="fas fa-search" style="position: absolute; left: 10px; top: 12px; color: #64748B;"></i>
                            <input type="text" id="swal-socio-search" class="premium-input-swal" placeholder="Buscar aportante..." style="padding-left: 35px;" autocomplete="off">
                            <input type="hidden" id="swal-socio-id" value="ALL">
                            <div id="swal-socio-suggestions" class="hidden" style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #E2E8F0; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 1000; max-height: 200px; overflow-y: auto;"></div>
                        </div>
                        <div id="swal-socio-selected-tag" style="margin-top: 8px; display: flex; align-items: center; gap: 5px; background: #E2E8F0; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; width: fit-content;" class="hidden">
                            <span id="swal-socio-selected-name">TODOS LOS APORTANTES</span>
                            <i class="fas fa-times" id="btn-clear-swal-socio" style="cursor: pointer; color: #EF4444;"></i>
                        </div>
                    </div>
                </div>

                <style>
                    /* Estilos Corporativos */
                    .premium-swal-popup {
                        border-radius: 1.25rem;
                        padding-bottom: 1.5rem;
                    }

                    .report-mode-selector {
                        display: flex;
                        background: #F1F5F9;
                        border-radius: 12px;
                        padding: 4px;
                        margin-bottom: 20px;
                        border: 1px solid #E2E8F0;
                    }

                    .report-mode-btn {
                        flex: 1;
                        padding: 10px 15px;
                        border: none;
                        background: transparent;
                        color: #64748B;
                        font-size: 0.8rem;
                        font-weight: 700;
                        cursor: pointer;
                        border-radius: 8px;
                        transition: all 0.3s ease;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                    }

                    .report-mode-btn.active {
                        color: #ffffff;
                        background: #0E5936; 
                        box-shadow: 0 4px 10px rgba(14, 89, 54, 0.2);
                    }

                    .export-label-corporate {
                        display: block; 
                        font-weight: 700; 
                        margin-bottom: 8px; 
                        color: #0E5936;
                        font-size: 0.85rem;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }

                    .filter-group-corporate {
                        background: #F8FAFC;
                        padding: 10px;
                        border-radius: 10px;
                        border: 1px solid #E2E8F0;
                    }

                    .premium-input-swal {
                        width: 100%;
                        padding: 10px;
                        border-radius: 8px;
                        border: 1px solid #CBD5E1;
                        font-family: inherit;
                        font-size: 0.95rem;
                        color: #1E293B;
                        outline: none;
                        transition: border-color 0.2s;
                    }

                    .premium-input-swal:focus {
                        border-color: #0E5936;
                        box-shadow: 0 0 0 3px rgba(14, 89, 54, 0.1);
                    }

                    .hidden { display: none; }
                </style>
            `,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-file-pdf"></i> Generar PDF',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#0E5936',
            cancelButtonColor: '#64748B',
            focusConfirm: false,
            didOpen: () => {
                Swal.getPopup().style.borderRadius = '1.25rem';

                const btnMonth = Swal.getHtmlContainer().querySelector('#btn-mode-month');
                const btnRange = Swal.getHtmlContainer().querySelector('#btn-mode-range');
                const btnAll = Swal.getHtmlContainer().querySelector('#btn-mode-all');
                
                const containerMonth = Swal.getHtmlContainer().querySelector('#container-month');
                const containerRange = Swal.getHtmlContainer().querySelector('#container-range');
                const containerAll = Swal.getHtmlContainer().querySelector('#container-all');
                
                const desc = Swal.getHtmlContainer().querySelector('#export-mode-desc');

                btnMonth.addEventListener('click', () => {
                    [btnMonth, btnRange, btnAll].forEach(b => b.classList.remove('active'));
                    btnMonth.classList.add('active');
                    [containerMonth, containerRange, containerAll].forEach(c => c.classList.add('hidden'));
                    containerMonth.classList.remove('hidden');
                    desc.textContent = 'Seleccione el mes para el reporte consolidado.';
                });

                btnRange.addEventListener('click', () => {
                    [btnMonth, btnRange, btnAll].forEach(b => b.classList.remove('active'));
                    btnRange.classList.add('active');
                    [containerMonth, containerRange, containerAll].forEach(c => c.classList.add('hidden'));
                    containerRange.classList.remove('hidden');
                    desc.textContent = 'Defina un rango de fechas personalizado.';
                });

                btnAll.addEventListener('click', () => {
                    [btnMonth, btnRange, btnAll].forEach(b => b.classList.remove('active'));
                    btnAll.classList.add('active');
                    [containerMonth, containerRange, containerAll].forEach(c => c.classList.add('hidden'));
                    containerAll.classList.remove('hidden');
                    desc.textContent = 'Generar reporte de todos los aportes existentes.';
                });

                // Lógica de búsqueda de aportante en el modal
                const socioSearch = Swal.getHtmlContainer().querySelector('#swal-socio-search');
                const socioIdHidden = Swal.getHtmlContainer().querySelector('#swal-socio-id');
                const suggestionsBox = Swal.getHtmlContainer().querySelector('#swal-socio-suggestions');
                const selectedTag = Swal.getHtmlContainer().querySelector('#swal-socio-selected-tag');
                const selectedName = Swal.getHtmlContainer().querySelector('#swal-socio-selected-name');
                const clearBtn = Swal.getHtmlContainer().querySelector('#btn-clear-swal-socio');

                if (socioSearch) {
                    socioSearch.addEventListener('input', (e) => {
                        const q = e.target.value.toLowerCase().trim();
                        if (q.length < 1) {
                            suggestionsBox.innerHTML = '';
                            suggestionsBox.classList.add('hidden');
                            return;
                        }

                        const matches = (sociosAportes || []).filter(s => 
                            (s.nombre || '').toLowerCase().includes(q)
                        ).slice(0, 5);

                        if (matches.length > 0) {
                            suggestionsBox.innerHTML = matches.map(m => `
                                <div class="swal-suggestion-item" data-id="${m.idsocio}" data-name="${m.nombre}" style="padding: 10px; cursor: pointer; border-bottom: 1px solid #F1F5F9; font-size: 0.9rem;">
                                    ${m.nombre}
                                </div>
                            `).join('');
                            suggestionsBox.classList.remove('hidden');

                            suggestionsBox.querySelectorAll('.swal-suggestion-item').forEach(item => {
                                item.addEventListener('click', () => {
                                    const id = item.getAttribute('data-id');
                                    const name = item.getAttribute('data-name');
                                    socioIdHidden.value = id;
                                    selectedName.textContent = name;
                                    selectedTag.classList.remove('hidden');
                                    socioSearch.value = '';
                                    suggestionsBox.classList.add('hidden');
                                });
                            });
                        } else {
                            suggestionsBox.innerHTML = '<div style="padding: 10px; color: #64748B;">No se encontraron socios</div>';
                            suggestionsBox.classList.remove('hidden');
                        }
                    });

                    // Cerrar sugerencias al hacer clic fuera
                    document.addEventListener('click', (ev) => {
                        if (!socioSearch.contains(ev.target) && !suggestionsBox.contains(ev.target)) {
                            suggestionsBox.classList.add('hidden');
                        }
                    });
                }

                if (clearBtn) {
                    clearBtn.addEventListener('click', () => {
                        socioIdHidden.value = 'ALL';
                        selectedTag.classList.add('hidden');
                    });
                }
            },
            preConfirm: () => {
                const activeMode = Swal.getHtmlContainer().querySelector('.report-mode-btn.active').getAttribute('data-mode');
                const socioId = document.getElementById('swal-socio-id').value;
                
                if (activeMode === 'range') {
                    const start = document.getElementById('swal-start').value;
                    const end = document.getElementById('swal-end').value;
                    if (!start || !end) {
                        Swal.showValidationMessage('Por favor seleccione ambas fechas');
                        return false;
                    }
                    return { type: 'range', start, end, socioId };
                } else if (activeMode === 'month') {
                    const month = document.getElementById('swal-month').value;
                    if (!month) {
                        Swal.showValidationMessage('Por favor seleccione el mes');
                        return false;
                    }
                    return { type: 'month', month, socioId };
                } else {
                    return { type: 'all', socioId };
                }
            }
        });

        if (!formValues) return;

        await generatePDFReporteAportes(formValues);

    } catch (error) {
        console.error('Error al abrir modal de reporte:', error);
        Swal.fire('Error', error.message, 'error');
    }
}

/**
 * Genera el documento PDF con los aportes y comprobantes
 */
async function generatePDFReporteAportes(params) {
    let startDate, endDate, titlePeriod;

    if (params.type === 'month') {
        const [year, month] = params.month.split('-');
        startDate = `${year}-${month}-01`;
        endDate = `${year}-${month}-${new Date(year, month, 0).getDate()}`;
        const monthNames = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
        titlePeriod = `${monthNames[parseInt(month) - 1]} ${year}`;
    } else if (params.type === 'range') {
        startDate = params.start;
        endDate = params.end;
        titlePeriod = `${startDate} AL ${endDate}`;
    } else {
        titlePeriod = "GENERAL (TODO EL HISTORIAL)";
        endDate = new Date().toISOString().split('T')[0];
    }

    // Ajustar título si es para un socio específico
    if (params.socioId !== 'ALL') {
        const socio = sociosAportes.find(s => s.idsocio === params.socioId);
        if (socio) titlePeriod += ` - SOCIO: ${socio.nombre}`;
    }

    if (typeof window.enableLoader === 'function') window.enableLoader();
    window.showLoader(`Generando reporte PDF de aportes...`);

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const supabase = window.getSupabaseClient();

        // 1. Obtener los aportes del periodo
        let query = supabase
            .from('ic_aportes_semanales')
            .select('*, socio:ic_socios(nombre)')
            .order('fecha', { ascending: true });

        if (params.type !== 'all') {
            query = query.gte('fecha', startDate).lte('fecha', endDate);
        }

        // Filtro por socio si no es ALL
        if (params.socioId !== 'ALL') {
            query = query.eq('id_socio', params.socioId);
        }

        const { data: aportes, error: errorAportes } = await query;

        if (errorAportes) throw errorAportes;
        if (!aportes || aportes.length === 0) {
            throw new Error(`No hay aportes registrados en el periodo seleccionado.`);
        }

        // 2. Obtener acumulado de cada persona involucrada (hasta la fecha final del reporte)
        const idSocios = [...new Set(aportes.map(a => a.id_socio))];
        const { data: acumulados, error: errorAcum } = await supabase
            .from('ic_aportes_semanales')
            .select('id_socio, monto')
            .lte('fecha', endDate)
            .in('id_socio', idSocios);

        if (errorAcum) throw errorAcum;

        // Calcular mapa de acumulados por socio
        const acumuladoMap = {};
        (acumulados || []).forEach(a => {
            acumuladoMap[a.id_socio] = (acumuladoMap[a.id_socio] || 0) + parseFloat(a.monto);
        });

        // 3. Generar PDF
        let yPos = 20;
        const pageHeight = 297;
        const marginBottom = 20;
        const logoUrl = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';
        const now = new Date();
        const genDate = now.toLocaleDateString('es-EC');
        const genTime = now.toLocaleTimeString('es-EC');

        // Header
        try {
            doc.addImage(logoUrl, 'PNG', 15, 12, 18, 18);
        } catch (e) { console.warn('Logo no disponible'); }

        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(11, 78, 50);
        doc.text("INKA CORP", 38, 18);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text("REPORTE CONSOLIDADO DE APORTES SEMANALES", 38, 24);

        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Generado: ${genDate} | ${genTime}`, 148, 18);
        doc.text(`Registros: ${aportes.length}`, 148, 23);

        yPos = 34;
        doc.setFontSize(9);
        doc.setTextColor(11, 78, 50);
        doc.setFont('helvetica', 'bold');
        doc.text(`PERIODO: ${titlePeriod}`, 15, yPos);

        yPos += 2;
        doc.setDrawColor(242, 187, 58);
        doc.setLineWidth(0.5);
        doc.line(15, yPos, 195, yPos);
        yPos += 10;

        // Loop de aportes
        let totalAportadoPeriodo = 0;
        let count = 0;

        for (const aporte of aportes) {
            count++;
            window.showLoader(`Procesando comprobante ${count} de ${aportes.length}...`);
            totalAportadoPeriodo += parseFloat(aporte.monto);

            const boxHeight = 85; 
            if (yPos + boxHeight > (pageHeight - marginBottom)) {
                doc.addPage();
                yPos = 20;
            }

            // Box
            doc.setDrawColor(220, 220, 220);
            doc.setLineWidth(0.5);
            doc.roundedRect(15, yPos, 180, boxHeight, 3, 3);

            let textY = yPos + 10;
            const leftMargin = 22;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text(`APORTANTE:`, leftMargin, textY);
            doc.setFont('helvetica', 'normal');
            const socioNombre = aporte.socio?.nombre || 'Socio Desconocido';
            const socioLines = doc.splitTextToSize(socioNombre, 70);
            doc.text(socioLines, leftMargin + 25, textY);
            
            textY += (socioLines.length * 5) + 5;
            doc.setFont('helvetica', 'bold');
            doc.text(`FECHA:`, leftMargin, textY);
            doc.setFont('helvetica', 'normal');
            doc.text(`${aporte.fecha}`, leftMargin + 25, textY);

            textY += 10;
            doc.setFont('helvetica', 'bold');
            doc.text(`MONTO:`, leftMargin, textY);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(11, 78, 50);
            doc.text(`$${parseFloat(aporte.monto).toFixed(2)}`, leftMargin + 25, textY);

            // Comprobante
            if (aporte.comprobante_url) {
                try {
                    const imgData = await fetchImageAsBase64Aportes(aporte.comprobante_url);
                    if (imgData) {
                        doc.addImage(imgData, 'JPEG', 115, yPos + 5, 75, 75, undefined, 'FAST');
                    }
                } catch (e) {
                    doc.setFontSize(8);
                    doc.setTextColor(150);
                    doc.text("[Imagen no disponible]", 130, yPos + 40);
                }
            } else {
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text("[Sin comprobante]", 130, yPos + 40);
            }

            yPos += boxHeight + 5;
        }

        // Resumen Final
        if (yPos + 60 > (pageHeight - marginBottom)) {
            doc.addPage();
            yPos = 20;
        }

        yPos += 5;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(11, 78, 50);
        doc.text("RESUMEN DE APORTES", 15, yPos);

        yPos += 8;
        doc.setDrawColor(11, 78, 50);
        doc.line(15, yPos, 195, yPos);
        yPos += 10;

        // Tabla de Totales
        const tableData = idSocios.map(id => {
            const socio = (aportes.find(a => a.id_socio === id))?.socio?.nombre || 'Socio';
            const periodSum = aportes.filter(a => a.id_socio === id).reduce((s, a) => s + parseFloat(a.monto), 0);
            const totalSum = acumuladoMap[id] || 0;
            return [socio, `$${periodSum.toFixed(2)}`, `$${totalSum.toFixed(2)}` ];
        });

        doc.autoTable({
            startY: yPos,
            head: [['Socio', 'Aportado en Periodo', 'Total Acumulado']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [11, 78, 50], textColor: [255, 255, 255] },
            columnStyles: {
                1: { halign: 'right' },
                2: { halign: 'right' }
            },
            margin: { left: 15, right: 15 }
        });

        yPos = doc.lastAutoTable.finalY + 15;
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        doc.text(`TOTAL GENERAL DEL PERIODO:`, 15, yPos);
        doc.setTextColor(11, 78, 50);
        doc.text(`$${totalAportadoPeriodo.toFixed(2)}`, 110, yPos);

        const totalAcumuladoGeneral = Object.values(acumuladoMap).reduce((s, v) => s + v, 0);
        yPos += 8;
        doc.setTextColor(0);
        doc.text(`TOTAL ACUMULADO HISTÓRICO:`, 15, yPos);
        doc.setTextColor(11, 78, 50);
        doc.text(`$${totalAcumuladoGeneral.toFixed(2)}`, 110, yPos);

        doc.save(`Reporte_Aportes_${titlePeriod.replace(/ /g, '_')}.pdf`);
        window.disableLoader();
        Swal.fire({
            icon: 'success',
            title: 'Reporte Generado',
            text: 'El documento ha sido descargado correctamente.',
            confirmButtonColor: '#0E5936'
        });

    } catch (error) {
        console.error('Error al generar PDF:', error);
        window.disableLoader();
        Swal.fire('Error', error.message, 'error');
    }
}

/**
 * Utilidad para cargar imágenes como Base64
 */
async function fetchImageAsBase64Aportes(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error('fetchImageAsBase64 Error:', e);
        return null;
    }
}

function verComprobanteAporte(url) {
    if (url) window.open(url, '_blank');
}

// Exponer funciones necesarias globalmente
window.initAportesModule = initAportesModule;
window.verComprobanteAporte = verComprobanteAporte;
