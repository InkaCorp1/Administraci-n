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

    // Botón Pendientes
    const btnPendientes = document.getElementById('btn-ver-pendientes');
    if (btnPendientes) {
        btnPendientes.addEventListener('click', verAportesPendientes);
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

    // Aportes de la semana actual (Lunes a Domingo)
    const hoy = new Date();
    const day = hoy.getDay();
    const inicioSemana = new Date(hoy);
    // Ajustar para que inicie en Lunes (si es Domingo [0], retroceder 6 días)
    inicioSemana.setDate(hoy.getDate() - (day === 0 ? 6 : day - 1));
    inicioSemana.setHours(0, 0, 0, 0);
    const aportesSemana = data.filter(a => new Date(a.fecha + 'T12:00:00') >= inicioSemana);

    // Actualizar Label de Semana Actual
    // Usamos Lunes 17 Nov 2025 como Semana 1 para que los primeros registros sean positivos
    const anchor = new Date(2025, 10, 17, 12, 0, 0);
    const diffMs = inicioSemana.getTime() - anchor.getTime();
    const currentWeekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
    const weekLabel = document.getElementById('current-week-label');
    if (weekLabel) {
        weekLabel.textContent = `Semana ${currentWeekNum}`;
    }

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
                    <div class="d-flex flex-column align-items-center justify-content-center" style="gap: 8px;">
                        <button class="btn-icon shadow-sm" style="background: var(--gray-800); border: 1px solid var(--border-color); width: 35px; height: 35px;" onclick="verComprobanteAporte('${aporte.comprobante_url}')" title="Ver Comprobante">
                            <i class="fas fa-image text-gold"></i>
                        </button>
                        <button class="btn-icon shadow-sm" style="background: var(--gray-800); border: 1px solid var(--border-color); width: 35px; height: 35px;" onclick="window.open('${aporte.comprobante_url}', '_blank')" title="Descargar">
                            <i class="fas fa-download text-gold"></i>
                        </button>
                    </div>
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
    const subSemana = document.getElementById('aporte-subsemana')?.value || null;

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

        // 1. Subir imagen usando la utilidad centralizada
        let imageUrl = null;
        const uploadRes = await window.uploadFileToStorage(selectedAporteFile, 'aportes', socioId);
        
        if (!uploadRes.success) {
            throw new Error('Error al subir comprobante: ' + uploadRes.error);
        }

        imageUrl = uploadRes.url;

        // 2. Guardar en DB
        const { data, error } = await supabase
            .from('ic_aportes_semanales')
            .insert({
                id_socio: socioId,
                monto: parseFloat(monto),
                fecha: fecha,
                sub_semana: subSemana,
                es_igualacion: document.getElementById('aporte-igualacion')?.checked || false,
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

    // Agrupar por semanas (Lunes a Sábado/Domingo) y Sub-semanas
    // Usamos Lunes 17 Nov 2025 como Semana 1 para que los primeros registros sean positivos
    const anchor = new Date(2025, 10, 17, 12, 0, 0);
    const groups = {};

    data.forEach(item => {
        const d = new Date(item.fecha + 'T12:00:00');
        const day = d.getDay();
        const diff = d.getDate() - (day === 0 ? 6 : day - 1);
        const monday = new Date(d);
        monday.setDate(diff);
        monday.setHours(12, 0, 0, 0);

        const diffMs = monday.getTime() - anchor.getTime();
        const weekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
        const sub = item.sub_semana || '';
        const groupKey = `${weekNum}${sub}`;

        const saturday = new Date(monday);
        saturday.setDate(monday.getDate() + 5);

        const mondayStr = monday.toLocaleDateString('es-EC', { day: 'numeric', month: 'short' });
        const saturdayStr = saturday.toLocaleDateString('es-EC', { day: 'numeric', month: 'short' });
        const weekLabel = `Semana ${weekNum}${sub} (${mondayStr} - ${saturdayStr})`;

        if (!groups[groupKey]) {
            groups[groupKey] = { label: weekLabel, items: [], sortVal: weekNum + (sub.charCodeAt(0) || 0) / 1000 };
        }
        groups[groupKey].items.push(item);
    });

    const sortedGroupKeys = Object.keys(groups).sort((a, b) => groups[b].sortVal - groups[a].sortVal);

    let html = '';
    sortedGroupKeys.forEach(key => {
        const group = groups[key];
        
        // Fila de encabezado de semana
        html += `
            <tr class="week-group-header">
                <td colspan="5" style="background: rgba(242, 187, 58, 0.08); border-left: 4px solid #f2bb3a; padding: 12px 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 800; color: #f2bb3a; letter-spacing: 0.5px; font-size: 0.95rem; text-transform: uppercase;">
                            <i class="fas fa-calendar-week mr-2"></i> ${group.label}
                        </span>
                        <span class="badge" style="background: rgba(242, 187, 58, 0.15); color: #f2bb3a; font-weight: 700; border-radius: 20px; padding: 4px 12px; font-size: 0.75rem;">
                            ${group.items.length} REGISTRO${group.items.length !== 1 ? 'S' : ''}
                        </span>
                    </div>
                </td>
            </tr>
        `;

        group.items.forEach(item => {
            const initial = (item.socio?.nombre || 'S').charAt(0);
            html += `
                <tr class="fade-in">
                    <td>
                        <div class="d-flex align-items-center" style="gap: 10px;">
                            <div class="d-flex flex-column">
                                <span class="font-weight-bold">${formatDate(item.fecha)}</span>
                                <small class="text-muted"><i class="far fa-calendar-alt"></i></small>
                            </div>
                            <button class="btn-icon-tiny" onclick="gestionarSemana('${item.id_aporte}', '${item.fecha}', '${item.sub_semana || ''}')" title="Gestionar Semana" style="color: var(--gold); background: rgba(242, 187, 58, 0.1); border: none; border-radius: 4px; padding: 2px 6px; cursor: pointer;">
                                <i class="fas fa-pencil-alt" style="font-size: 0.8rem;"></i>
                            </button>
                        </div>
                    </td>
                    <td>
                        <div class="d-flex align-items-center">
                            <div class="avatar-initial" style="width: 32px; height: 32px; font-size: 0.8rem;">${initial}</div>
                            <div class="d-flex flex-column">
                                <span class="font-weight-600">${item.socio?.nombre || 'Socio'}</span>
                                ${item.es_igualacion ? '<span class="badge badge-warning" style="font-size: 0.65rem; background: #f2bb3a; color: #000;"><i class="fas fa-clock"></i> IGUALACIÓN</span>' : ''}
                            </div>
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
 * Función para gestionar la semana y sub-división de un aporte
 */
async function gestionarSemana(idAporte, fechaActual, subActual) {
    try {
        const { value: formValues } = await Swal.fire({
            title: 'Gestionar Semana del Aporte',
            background: '#1a1d21',
            color: '#ffffff',
            html: `
                <div style="text-align: left; padding: 10px;">
                    <label style="display: block; margin-bottom: 5px; color: #f2bb3a;">Fecha del Aporte</label>
                    <input type="date" id="swal-fecha-aporte" class="swal2-input" value="${fechaActual}" style="width: 100%; margin: 0 0 15px 0;">
                    
                    <label style="display: block; margin-bottom: 5px; color: #f2bb3a;">Sub-división (A, B, C...)</label>
                    <select id="swal-sub-semana" class="swal2-input" style="width: 100%; margin: 0;">
                        <option value="" ${subActual === '' ? 'selected' : ''}>Ninguna (Normal)</option>
                        <option value="A" ${subActual === 'A' ? 'selected' : ''}>A (Primer grupo)</option>
                        <option value="B" ${subActual === 'B' ? 'selected' : ''}>B (Segundo grupo)</option>
                        <option value="C" ${subActual === 'C' ? 'selected' : ''}>C (Tercer grupo)</option>
                    </select>
                    <small style="color: #64748B; margin-top: 5px; display: block;">Úsalo para mover este aporte a un grupo secundario en la misma semana.</small>

                    <div style="margin-top: 15px; display: flex; align-items: center; gap: 10px;">
                        <input type="checkbox" id="swal-es-igualacion" style="width: 20px; height: 20px;">
                        <label for="swal-es-igualacion" style="color: #f2bb3a; font-weight: bold; margin: 0;">Marcar como IGUALACIÓN</label>
                    </div>
                </div>
            `,
            didOpen: () => {
                // Intentar detectar si ya es igualacion para marcar el checkbox
                const supabase = window.getSupabaseClient();
                supabase.from('ic_aportes_semanales').select('es_igualacion').eq('id_aporte', idAporte).single()
                    .then(({data}) => {
                        if (data && data.es_igualacion) document.getElementById('swal-es-igualacion').checked = true;
                    });
            },
            focusConfirm: false,
            preConfirm: () => {
                return {
                    fecha: document.getElementById('swal-fecha-aporte').value,
                    sub_semana: document.getElementById('swal-sub-semana').value,
                    es_igualacion: document.getElementById('swal-es-igualacion').checked
                }
            },
            showCancelButton: true,
            confirmButtonText: 'Guardar Cambios',
            cancelButtonText: 'Cancelar',
            customClass: {
                confirmButton: 'btn btn-primary',
                cancelButton: 'btn btn-secondary'
            }
        });

        if (formValues) {
            const supabase = window.getSupabaseClient();
            const { error } = await supabase
                .from('ic_aportes_semanales')
                .update({ 
                    fecha: formValues.fecha,
                    sub_semana: formValues.sub_semana || null,
                    es_igualacion: formValues.es_igualacion
                })
                .eq('id_aporte', idAporte);

            if (error) throw error;

            showToast('Información actualizada correctamente', 'success');
            
            // Recargar datos
            await cargarHistorialCompleto();
            await cargarDatosAportes();
        }
    } catch (error) {
        console.error('Error al gestionar semana:', error);
        showToast('Error al actualizar los datos', 'error');
    }
}

/**
 * Muestra una ventana con los aportes pendientes por socio y semana
 */
async function verAportesPendientes() {
    try {
        beginLoading('Calculando pendientes...');
        const supabase = window.getSupabaseClient();
        
        // Cargar todos los aportes para calcular deudas
        const { data: todosAportes, error } = await supabase
            .from('ic_aportes_semanales')
            .select('id_socio, fecha, sub_semana');
            
        if (error) throw error;

        const anchor = new Date(2025, 10, 17, 12, 0, 0); // Lunes 17 Nov
        const hoy = new Date();
        const sociosObjetivo = sociosAportes.filter(s => ['69c69e99', 'be3ff55b', '20b691de'].includes(s.idsocio));
        
        // Calcular semanas transcurridas hasta hoy
        const day = hoy.getDay();
        const inicioSemanaActual = new Date(hoy);
        inicioSemanaActual.setDate(hoy.getDate() - (day === 0 ? 6 : day - 1));
        inicioSemanaActual.setHours(0, 0, 0, 0);
        
        const diffMs = inicioSemanaActual.getTime() - anchor.getTime();
        const maxWeek = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;

        const pendientes = [];

        // Por cada semana desde la 1 hasta hoy
        for (let w = 1; w <= maxWeek; w++) {
            const subs = ['', 'A', 'B'];
            subs.forEach(s => {
                const hayAportesEnSub = todosAportes.some(a => {
                    const ad = new Date(a.fecha + 'T12:00:00');
                    const aday = ad.getDay();
                    const adiff = ad.getDate() - (aday === 0 ? 6 : aday - 1);
                    const amon = new Date(ad); amon.setDate(adiff); amon.setHours(12, 0, 0, 0);
                    const aw = Math.floor((amon.getTime() - anchor.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
                    return aw === w && (a.sub_semana || '') === s;
                });

                if (hayAportesEnSub || (s === '' && w <= maxWeek)) {
                    sociosObjetivo.forEach(socio => {
                        const tieneAporte = todosAportes.some(a => {
                            const ad = new Date(a.fecha + 'T12:00:00');
                            const aday = ad.getDay();
                            const adiff = ad.getDate() - (aday === 0 ? 6 : aday - 1);
                            const amon = new Date(ad); amon.setDate(adiff); amon.setHours(12, 0, 0, 0);
                            const aw = Math.floor((amon.getTime() - anchor.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
                            return aw === w && (a.sub_semana || '') === s && a.id_socio === socio.idsocio;
                        });

                        if (!tieneAporte) {
                            const monDate = new Date(anchor);
                            monDate.setDate(anchor.getDate() + (w - 1) * 7);
                            pendientes.push({
                                socioNom: socio.nombre,
                                socioId: socio.idsocio,
                                semana: w,
                                sub: s,
                                fechaSugerida: monDate.toISOString().split('T')[0]
                            });
                        }
                    });
                }
            });
        }

        endLoading();

        if (pendientes.length === 0) {
            Swal.fire({ title: '¡Todo al día!', text: 'Sin pendientes.', icon: 'success', background: '#1a1d21', color: '#fff' });
            return;
        }

        const { value: selected } = await Swal.fire({
            title: '<i class="fas fa-exclamation-circle text-danger"></i> Aportes Pendientes',
            background: '#1a1d21',
            color: '#fff',
            width: '600px',
            html: `
                <div style="max-height: 400px; overflow-y: auto; text-align: left; padding: 10px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                        <thead style="border-bottom: 2px solid #334155;">
                            <tr><th style="padding: 10px;">Socio</th><th style="padding: 10px;">Semana</th><th style="padding: 10px; text-align: center;">Acción</th></tr>
                        </thead>
                        <tbody>
                            ${pendientes.reverse().map(p => `
                                <tr style="border-bottom: 1px solid #334155;">
                                    <td style="padding: 10px;"><b>${p.socioNom}</b></td>
                                    <td style="padding: 10px;">Semana ${p.semana}${p.sub}</td>
                                    <td style="padding: 10px; text-align: center;">
                                        <button onclick="window.igualarAportePendiente('${p.socioId}', '${p.socioNom}', '${p.fechaSugerida}', '${p.sub}')" 
                                                style="background: #0E5936; color: white; border: none; padding: 5px 12px; border-radius: 4px; cursor: pointer;">
                                            <i class="fas fa-check"></i> Igualar
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>`,
            showConfirmButton: false, showCloseButton: true
        });
    } catch (err) { endLoading(); showToast('Error al cargar pendientes', 'error'); }
}

window.igualarAportePendiente = (idSocio, nombre, fecha, sub) => {
    Swal.close();
    resetFormAporte();
    const modal = document.getElementById('modal-aporte');
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    document.getElementById('aporte-socio').value = idSocio;
    document.getElementById('aporte-socio-search').value = nombre;
    document.getElementById('aporte-socio-selected').innerHTML = `<div class="selected-socio-item"><div class="avatar-initial">${nombre.charAt(0)}</div><span>${nombre}</span></div>`;
    document.getElementById('aporte-socio-selected').classList.remove('hidden');
    document.getElementById('aporte-fecha').value = fecha;
    document.getElementById('aporte-subsemana').value = sub;
    document.getElementById('aporte-igualacion').checked = true;
};

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
                    <div class="filter-group-corporate" style="margin-top: 20px; background: #2d3238; border-color: #3f444a; position: relative;">
                        <label class="export-label-corporate" style="color: #f2bb3a;">
                            <i class="fas fa-user" style="margin-right: 8px; color: #F2BB3A;"></i>Aportante(s)
                        </label>
                        <div class="input-with-icon" style="position: relative;">
                            <i class="fas fa-search" style="position: absolute; left: 10px; top: 12px; color: #94a3b8;"></i>
                            <input type="text" id="swal-socio-search" class="premium-input-swal" placeholder="Buscar aportante..." style="padding-left: 35px; background: #1a1d21; color: #fff; border-color: #3f444a;" autocomplete="off">
                            <input type="hidden" id="swal-socio-id" value="ALL">
                            <div id="swal-socio-suggestions" class="hidden" style="position: absolute; top: 100%; left: 0; right: 0; background: #1a1d21; border: 1px solid #3f444a; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.8); z-index: 99999; max-height: none; overflow: visible; margin-top: 5px;"></div>
                        </div>
                        <div id="swal-socio-selected-tag" style="margin-top: 8px; display: flex; align-items: center; gap: 5px; background: #3f444a; color: #fff; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; width: fit-content;" class="hidden">
                            <span id="swal-socio-selected-name">TODOS LOS APORTANTES</span>
                            <i class="fas fa-times" id="btn-clear-swal-socio" style="cursor: pointer; color: #EF4444;"></i>
                        </div>
                    </div>
                </div>

                <style>
                    /* Estilos Corporativos Dark Mode */
                    .premium-swal-popup {
                        border-radius: 1.25rem;
                        padding-bottom: 1.5rem;
                        background: #1a1d21 !important;
                        color: #ffffff !important;
                        overflow-y: visible !important; /* Permitir que la lista se vea fuera del modal */
                    }

                    .swal2-html-container {
                        overflow: visible !important; /* Evitar scroll interno del modal */
                        z-index: 10 !important; /* Prioridad sobre el footer del modal */
                    }

                    .swal2-actions {
                        z-index: 1 !important; /* Los botones se quedan atrás de la lista */
                    }

                    .report-mode-selector {
                        display: flex;
                        background: #2d3238;
                        border-radius: 12px;
                        padding: 4px;
                        margin-bottom: 20px;
                        border: 1px solid #3f444a;
                    }

                    .report-mode-btn {
                        flex: 1;
                        padding: 10px 15px;
                        border: none;
                        background: transparent;
                        color: #94a3b8;
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
                        color: #000000;
                        background: #f2bb3a; 
                        box-shadow: 0 4px 10px rgba(242, 187, 58, 0.2);
                    }

                    .export-label-corporate {
                        display: block; 
                        font-weight: 700; 
                        margin-bottom: 8px; 
                        color: #f2bb3a;
                        font-size: 0.85rem;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }

                    .filter-group-corporate {
                        background: #2d3238;
                        padding: 10px;
                        border-radius: 10px;
                        border: 1px solid #3f444a;
                    }

                    .premium-input-swal {
                        width: 100%;
                        padding: 10px;
                        border-radius: 8px;
                        border: 1px solid #3f444a;
                        font-family: inherit;
                        font-size: 0.95rem;
                        color: #ffffff;
                        background: #1a1d21;
                        outline: none;
                        transition: border-color 0.2s;
                    }

                    .premium-input-swal:focus {
                        border-color: #f2bb3a;
                        box-shadow: 0 0 0 3px rgba(242, 187, 58, 0.1);
                    }

                    .swal-suggestion-item {
                        color: #fff !important;
                        border-bottom: 1px solid #3f444a !important;
                    }
                    .swal-suggestion-item:hover {
                        background: #3f444a !important;
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

        const { data: rawAportes, error: errorAportes } = await query;

        if (errorAportes) throw errorAportes;
        if (!rawAportes || rawAportes.length === 0) {
            throw new Error(`No hay aportes registrados en el periodo seleccionado.`);
        }

        // --- Lógica de Agrupación por Semanas y Detección de Faltantes ---
        const anchor = new Date(2025, 10, 17, 12, 0, 0);
        const socioListForReport = params.socioId === 'ALL' 
            ? sociosAportes.filter(s => ['69c69e99', 'be3ff55b', '20b691de'].includes(s.idsocio))
            : sociosAportes.filter(s => s.idsocio === params.socioId);

        const groups = {};

        // Pre-poblar grupos para asegurar que se muestren semanas sin aportes (faltantes)
        if (startDate && endDate) {
            let curr = new Date(startDate + 'T12:00:00');
            const endLimit = new Date(endDate + 'T12:00:00');
            while (curr <= endLimit) {
                const d = new Date(curr);
                const day = d.getDay();
                const diff = d.getDate() - (day === 0 ? 6 : day - 1);
                const monday = new Date(d);
                monday.setDate(diff);
                monday.setHours(12, 0, 0, 0);

                const diffMs = monday.getTime() - anchor.getTime();
                const weekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
                const key = `${weekNum}`;

                if (!groups[key] && weekNum > 0) {
                    const saturday = new Date(monday);
                    saturday.setDate(monday.getDate() + 5);
                    groups[key] = {
                        weekNum,
                        sub: '',
                        monday: new Date(monday),
                        label: `SEMANA ${weekNum} (${monday.toLocaleDateString('es-EC', {day:'numeric', month:'short'})} - ${saturday.toLocaleDateString('es-EC', {day:'numeric', month:'short'})})`,
                        items: [],
                        sortVal: weekNum
                    };
                }
                curr.setDate(curr.getDate() + 1);
            }
        } else if (params.type === 'all') {
            // Si es reporte general, pre-poblamos desde la semana 1 hasta la actual
            const hoy = new Date();
            let curr = new Date(anchor);
            while (curr <= hoy) {
                const d = new Date(curr);
                const day = d.getDay();
                const diff = d.getDate() - (day === 0 ? 6 : day - 1);
                const monday = new Date(d);
                monday.setDate(diff);
                monday.setHours(12, 0, 0, 0);

                const diffMs = monday.getTime() - anchor.getTime();
                const weekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
                const key = `${weekNum}`;

                if (!groups[key] && weekNum > 0) {
                    const saturday = new Date(monday);
                    saturday.setDate(monday.getDate() + 5);
                    groups[key] = {
                        weekNum,
                        sub: '',
                        monday: new Date(monday),
                        label: `SEMANA ${weekNum} (${monday.toLocaleDateString('es-EC', {day:'numeric', month:'short'})} - ${saturday.toLocaleDateString('es-EC', {day:'numeric', month:'short'})})`,
                        items: [],
                        sortVal: weekNum
                    };
                }
                curr.setDate(curr.getDate() + 7);
            }
        }

        rawAportes.forEach(a => {
            const d = new Date(a.fecha + 'T12:00:00');
            const day = d.getDay();
            const diff = d.getDate() - (day === 0 ? 6 : day - 1);
            const monday = new Date(d);
            monday.setDate(diff);
            monday.setHours(12, 0, 0, 0);

            const diffMs = monday.getTime() - anchor.getTime();
            const weekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
            const sub = a.sub_semana || '';
            const key = `${weekNum}${sub}`;

            if (!groups[key]) {
                const saturday = new Date(monday);
                saturday.setDate(monday.getDate() + 5);
                groups[key] = {
                    weekNum,
                    sub,
                    monday,
                    label: `SEMANA ${weekNum}${sub} (${monday.toLocaleDateString('es-EC', {day:'numeric', month:'short'})} - ${saturday.toLocaleDateString('es-EC', {day:'numeric', month:'short'})})`,
                    items: [],
                    sortVal: weekNum + (sub.charCodeAt(0) || 0) / 1000
                };
            }
            groups[key].items.push(a);
        });

        const sortedKeys = Object.keys(groups).sort((a, b) => groups[a].sortVal - groups[b].sortVal);
        const finalProcessedAportes = [];

        sortedKeys.forEach(key => {
            const group = groups[key];
            // Marcador de inicio de semana
            finalProcessedAportes.push({ isHeader: true, label: group.label });
            
            // Aportes registrados
            group.items.forEach(item => finalProcessedAportes.push(item));

            // Detección de faltantes
            const sociosQueAportaron = group.items.map(i => i.id_socio);
            socioListForReport.forEach(s => {
                if (!sociosQueAportaron.includes(s.idsocio)) {
                    finalProcessedAportes.push({ 
                        isMissing: true, 
                        socioNombre: s.nombre,
                        fechaRef: group.monday.toISOString().split('T')[0]
                    });
                }
            });
        });

        const aportes = finalProcessedAportes;
        // --- Fin Lógica de Agrupación ---

        // 2. Obtener acumulado de cada persona involucrada (hasta la fecha final del reporte)
        const idSocios = [...new Set(rawAportes.map(a => a.id_socio))];
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
            // Manejar encabezados de semana
            if (aporte.isHeader) {
                if (yPos + 15 > (pageHeight - marginBottom)) {
                    doc.addPage();
                    yPos = 20;
                }
                yPos += 5;
                doc.setFillColor(11, 78, 50); // Fondo Verde Oscuro Corporativo
                doc.rect(15, yPos, 180, 8, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(255, 255, 255); // Texto Blanco para máxima legibilidad
                doc.text(aporte.label, 20, yPos + 6);
                yPos += 12;
                continue;
            }

            // Manejar aportes faltantes
            if (aporte.isMissing) {
                if (yPos + 15 > (pageHeight - marginBottom)) {
                    doc.addPage();
                    yPos = 20;
                }
                doc.setDrawColor(239, 68, 68); // Rojo
                doc.setLineWidth(0.3);
                doc.roundedRect(15, yPos, 180, 10, 2, 2);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(239, 68, 68);
                doc.text(`FALTA APORTE: ${aporte.socioNombre}`, 22, yPos + 6.5);
                yPos += 14;
                continue;
            }

            count++;
            window.showLoader(`Procesando comprobante ${count} de ${rawAportes.length}...`);
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

            if (aporte.es_igualacion) {
                textY += 7;
                doc.setFontSize(8);
                doc.setTextColor(242, 187, 58);
                doc.setFont('helvetica', 'bold');
                doc.text(`[ PAGO DE IGUALACIÓN ]`, leftMargin, textY);
            }

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
            const socio = (rawAportes.find(a => a.id_socio === id))?.socio?.nombre || 'Socio';
            const periodSum = rawAportes.filter(a => a.id_socio === id).reduce((s, a) => s + parseFloat(a.monto), 0);
            const totalSum = acumuladoMap[id] || 0;
            
            if (params.socioId !== 'ALL') {
                return [socio, `$${periodSum.toFixed(2)}` ];
            }
            return [socio, `$${periodSum.toFixed(2)}`, `$${totalSum.toFixed(2)}` ];
        });

        const tableHead = params.socioId !== 'ALL' 
            ? [['Socio', 'Aportado en Periodo']]
            : [['Socio', 'Aportado en Periodo', 'Total Acumulado']];

        doc.autoTable({
            startY: yPos,
            head: tableHead,
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
        doc.text(`TOTAL DEL PERIODO SELECCIONADO:`, 15, yPos);
        doc.setTextColor(11, 78, 50);
        doc.text(`$${totalAportadoPeriodo.toFixed(2)}`, 110, yPos);

        // Solo mostrar acumulado histórico si se seleccionaron TODOS los socios
        if (params.socioId === 'ALL') {
            const totalAcumuladoGeneral = Object.values(acumuladoMap).reduce((s, v) => s + v, 0);
            yPos += 8;
            doc.setTextColor(0);
            doc.text(`TOTAL ACUMULADO HISTÓRICO:`, 15, yPos);
            doc.setTextColor(11, 78, 50);
            doc.text(`$${totalAcumuladoGeneral.toFixed(2)}`, 110, yPos);
        }

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
