/**
 * INKA CORP - Módulo Situación Bancaria
 * Maneja la visualización de créditos bancarios, tabla de amortización y registro de pagos.
 */

// Estado del módulo
let bancosData = [];
let bancosDetalleData = [];
let currentBancoId = null;
let currentBancoDetalle = null;
let showingArchived = false; // State for history view

/**
 * Inicializa el módulo de Bancos
 */
async function initBancosModule() {
    console.log('Inicializando Módulo Situación Bancaria...');

    // Configurar event listeners
    setupBancosEventListeners();

    // Cargar datos iniciales
    await loadBancosData();
}

/**
 * Configura los event listeners del módulo
 */
function setupBancosEventListeners() {
    // Búsqueda
    const searchInput = document.getElementById('search-bancos');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterBancos(e.target.value);
        });
    }

    // Botón Sincronizar
    const refreshBtn = document.getElementById('refresh-bancos');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            await loadBancosData(true);
        });
    }

    // Botón Historial
    const historyBtn = document.getElementById('toggle-history-bancos');
    if (historyBtn) {
        historyBtn.addEventListener('click', () => {
            showingArchived = !showingArchived;
            // Visual toggle state
            historyBtn.classList.toggle('active', showingArchived);

            // Update Icon and Title for better UX
            const icon = historyBtn.querySelector('i');
            if (showingArchived) {
                icon.className = 'fas fa-arrow-left';
                historyBtn.title = 'Volver a Créditos Activos';
            } else {
                icon.className = 'fas fa-history';
                historyBtn.title = 'Ver Historial Pagados';
            }

            loadBancosData(false); // Reload with new filter
        });
    }

    // Modal Close buttons (general)
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
            closePremiumModals();
        });
    });

    // Formulario de Pago
    const formPago = document.getElementById('form-pago-banco');
    if (formPago) {
        formPago.addEventListener('submit', handleBancoPaymentSubmit);
    }

    // Botón Generar Reporte de Pagos
    const btnReporte = document.getElementById('btn-generar-reporte-pagos');
    if (btnReporte) {
        btnReporte.addEventListener('click', generateMonthlyPaymentsReport);
    }

    // Previews de imagen
    const cameraInput = document.getElementById('banco-camera');
    const galleryInput = document.getElementById('banco-gallery');

    if (cameraInput) {
        cameraInput.addEventListener('change', (e) => handleBancoImageUpload(e.target.files[0]));
    }
    if (galleryInput) {
        galleryInput.addEventListener('change', (e) => handleBancoImageUpload(e.target.files[0]));
    }

    const removePreviewBtn = document.getElementById('remove-banco-preview');
    if (removePreviewBtn) {
        removePreviewBtn.addEventListener('click', clearBancoPreview);
    }
}

/**
 * Carga los datos de bancos desde Supabase
 */
async function loadBancosData(forceRefresh = false) {
    const grid = document.getElementById('bancos-grid');
    const emptyMsg = document.getElementById('bancos-empty');

    if (grid) {
        grid.innerHTML = '<div class="loading-placeholder"><div class="spinner"></div><span>Cargando créditos bancarios...</span></div>';
    }

    try {
        const supabase = window.getSupabaseClient();
        if (!supabase) throw new Error('Cliente Supabase no disponible');

        // En un entorno de producción, estos vendrían de tablas reales.
        // Aquí simulamos la carga basada en la estructura de los CSVs.
        // Asumimos nombres de tabla: ic_bancos e ic_bancos_detalle (o similar en schemas.txt)

        // El schemas.txt muestra ic_creditos, ic_creditos_amortizacion etc. 
        // Para este módulo específico usaremos tablas ic_situacion_bancaria e ic_situacion_bancaria_detalle
        // (Ajustar según nombres reales si existen en Supabase)

        // 1. Fetch Banks
        // 1. Fetch Banks based on state
        // If showingArchived is true, fetch 'ARCHIVADO' or 'COMPLETADO', else 'ACTIVO' (default)
        // Note: The CSV migration might not have 'ARCHIVADO' status yet, so default is ACTIVO.

        let queryState = showingArchived ? 'ARCHIVADO' : 'ACTIVO';

        // If showingArchived is true, we want to see items we manually archived (set to ARCHIVADO).
        // If false, we show ACTIVO (or basically anything NOT archived).
        // Let's use simple logic:

        let query = supabase
            .from('ic_situacion_bancaria')
            .select('*')
            .order('nombre_banco', { ascending: true });

        if (showingArchived) {
            query = query.eq('estado', 'ARCHIVADO');
        } else {
            query = query.neq('estado', 'ARCHIVADO'); // Show everything except archived
        }

        const { data: bancos, error: errorBancos } = await query;

        if (errorBancos) throw errorBancos;

        bancosData = bancos || [];

        // 2. Fetch Paid Counts for these banks
        // We want to count rows in ic_situacion_bancaria_detalle where estado = 'PAGADO'
        // For efficiency, we can fetch all paid details for these transaction IDs.
        // Assuming not massive data volume for this specific module.
        const transaccionIds = bancosData.map(b => b.id_transaccion);
        let pagosMap = {};

        if (transaccionIds.length > 0) {
            const { data: pagos, error: errorPagos } = await supabase
                .from('ic_situacion_bancaria_detalle')
                .select('transaccion')
                .eq('estado', 'PAGADO')
                .in('transaccion', transaccionIds);

            if (!errorPagos && pagos) {
                // Count per transaction
                pagos.forEach(p => {
                    pagosMap[p.transaccion] = (pagosMap[p.transaccion] || 0) + 1;
                });
            }
        }

        window.currentPagosMap = pagosMap; // Store globally for filtering

        // Sort: Active (incomplete) first, then Paid (complete)
        bancosData.sort((a, b) => {
            const totalA = parseInt(a.contador || 0);
            const pagadasA = pagosMap[a.id_transaccion] || 0;
            const isCompleteA = totalA > 0 && pagadasA >= totalA;

            const totalB = parseInt(b.contador || 0);
            const pagadasB = pagosMap[b.id_transaccion] || 0;
            const isCompleteB = totalB > 0 && pagadasB >= totalB;

            // If both have same status, keep original order (or sort by name/date if preferred)
            if (isCompleteA === isCompleteB) return 0;

            // False (Incomplete) comes before True (Complete)
            return isCompleteA ? 1 : -1;
        });

        renderBancosCards(bancosData, pagosMap);
        updateBancosStats(bancosData);

        if (bancosData.length === 0) {
            if (emptyMsg) emptyMsg.classList.remove('hidden');
        } else {
            if (emptyMsg) emptyMsg.classList.add('hidden');
        }

    } catch (error) {
        console.error('Error al cargar datos de bancos:', error);
        if (grid) {
            grid.innerHTML = `<div class="error-container">Error: ${error.message}</div>`;
        }
    }
}

/**
 * Actualiza las estadísticas del hero
 */
function updateBancosStats(data) {
    document.getElementById('stat-bancos-activos').textContent = data.length;

    const deudaTotal = data.reduce((sum, b) => {
        const monto = parseFloat(b.monto_final || 0);
        // Aquí deberíamos calcular el pendiente real basado en detalle si lo tenemos cargado,
        // por ahora usamos monto_final como referencia si no hay detalles.
        return sum + monto;
    }, 0);

    document.getElementById('stat-bancos-deuda-total').textContent =
        '$' + deudaTotal.toLocaleString('es-EC', { minimumFractionDigits: 2 });
}

/**
 * Renderiza las tarjetas de bancos
 */
/**
 * Obtiene el esquema de colores según el banco
 */
function getBankTheme(bankName) {
    const name = (bankName || '').toUpperCase();

    // Default (INKA CORP Green)
    const themes = {
        DEFAULT: {
            bg: 'linear-gradient(145deg, #f0fdf4 0%, #dcfce7 100%)',
            primary: 'var(--primary)',
            light: 'var(--primary-light)',
            glow: 'var(--primary-glow)',
            border: 'rgba(11, 78, 50, 0.1)',
            textOnPill: 'var(--primary)'
        },
        PICHINCHA: {
            bg: 'linear-gradient(145deg, #fffbeb 0%, #fef3c7 100%)',
            primary: '#B29100', // Un dorado oscuro legible
            light: '#F2BB3A',
            glow: 'rgba(242, 187, 58, 0.2)',
            border: 'rgba(211, 144, 13, 0.2)',
            textOnPill: '#856404'
        },
        GUAYAQUIL: {
            bg: 'linear-gradient(145deg, #fdf2f8 0%, #fce7f3 100%)',
            primary: '#E10098',
            light: '#FF69B4',
            glow: 'rgba(225, 0, 152, 0.1)',
            border: 'rgba(225, 0, 152, 0.15)',
            textOnPill: '#E10098'
        },
        PACIFICO: {
            bg: 'linear-gradient(145deg, #f0f9ff 0%, #e0f2fe 100%)',
            primary: '#0070BA', // Azul Pacífico
            light: '#00AEEF',
            glow: 'rgba(0, 174, 239, 0.1)',
            border: 'rgba(0, 112, 186, 0.15)',
            textOnPill: '#0070BA'
        },
        PRODUBANCO: {
            bg: 'linear-gradient(145deg, #f7fee7 0%, #ecfccb 100%)',
            primary: '#008751',
            light: '#22c55e',
            glow: 'rgba(0, 135, 81, 0.1)',
            border: 'rgba(0, 135, 81, 0.15)',
            textOnPill: '#008751'
        },
        MUSHUC_RUNA: {
            bg: 'linear-gradient(145deg, #f1fcf1 0%, #e1f7e1 100%)',
            primary: '#1a5d1a', // Bosque oscuro
            light: '#2d8a2d',
            glow: 'rgba(26, 93, 26, 0.1)',
            border: 'rgba(26, 93, 26, 0.15)',
            textOnPill: '#1a5d1a'
        },
        DAQUILEMA: {
            bg: 'linear-gradient(145deg, #f0fdfa 0%, #ccfbf1 100%)',
            primary: '#0d9488', // Teal/Turquesa
            light: '#14b8a6',
            glow: 'rgba(13, 148, 136, 0.1)',
            border: 'rgba(13, 148, 136, 0.15)',
            textOnPill: '#0d9488'
        },
        TUPAK: {
            bg: 'linear-gradient(145deg, #f7fee7 0%, #f0fdf4 100%)',
            primary: '#65a30d', // Lima oscuro / Oliva
            light: '#84cc16',
            glow: 'rgba(101, 163, 13, 0.1)',
            border: 'rgba(101, 163, 13, 0.15)',
            textOnPill: '#65a30d'
        }
    };

    if (name.includes('PICHINCHA')) return themes.PICHINCHA;
    if (name.includes('GUAYAQUIL')) return themes.GUAYAQUIL;
    if (name.includes('PACIFICO')) return themes.PACIFICO;
    if (name.includes('PRODUBANCO')) return themes.PRODUBANCO;
    if (name.includes('MUSHUC')) return themes.MUSHUC_RUNA;
    if (name.includes('DAQUILEMA')) return themes.DAQUILEMA;
    if (name.includes('TUPAK')) return themes.TUPAK;

    return themes.DEFAULT;
}

/**
 * Renderiza las tarjetas de bancos
 */
function renderBancosCards(data, pagosMap = {}) {
    const grid = document.getElementById('bancos-grid');
    if (!grid) return;

    grid.innerHTML = '';

    data.forEach(banco => {
        const theme = getBankTheme(banco.nombre_banco);
        const card = document.createElement('div');
        card.className = 'bank-card';
        card.onclick = () => openBancoDetail(banco);

        // Aplicar variables de tema
        card.style.setProperty('--bank-bg', theme.bg);
        card.style.setProperty('--bank-primary', theme.primary);
        card.style.setProperty('--bank-light', theme.light);
        card.style.setProperty('--bank-glow', theme.glow);
        card.style.setProperty('--bank-border', theme.border);
        card.style.setProperty('--bank-pill-text', theme.textOnPill);

        // Calcular progreso real con los datos obtenidos
        const totalCuotas = parseInt(banco.contador || 0);
        const pagadas = pagosMap[banco.id_transaccion] || 0;
        const pct = totalCuotas > 0 ? Math.round((pagadas / totalCuotas) * 100) : 0;

        // Saldo pendiente estimado (Monto final - (pagadas * mensual))
        // Ojo: esto es una estimación si no tenemos el total pagado exacto aqui.
        // Si queremos exacto, deberíamos sumar los montos en el query anterior.
        // Por simplicidad y consistencia visual usaremos esto o el valor_descontado si existe.
        const mensual = parseFloat(banco.mensual || 0);
        const montoFinal = parseFloat(banco.monto_final || 0);
        let pendiente = montoFinal - (pagadas * mensual);
        if (pendiente < 0) pendiente = 0;

        card.innerHTML = `
            <div class="bank-card-header">
                <span class="bank-name-label">${banco.nombre_banco}</span>
                <div class="bank-progress-circle">${pagadas}/${totalCuotas}</div>
            </div>
            
            <div class="bank-card-progress">
                <div class="progress-label-group">
                    <span>Progreso del Crédito</span>
                    <span class="progress-percentage">${pct}%</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${pct}%"></div>
                </div>
            </div>

            <div class="bank-card-amounts">
                <div class="amount-item">
                    <span class="amount-label">Valor Cuota</span>
                    <span class="amount-value">$${mensual.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span>
                </div>
                <div class="amount-item">
                    <span class="amount-label">Saldo Pendiente</span>
                    <span class="amount-value pending">$${pendiente.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span>
                </div>
            </div>

            <div class="bank-card-footer">
                <span class="debtor-label">DEUDOR</span>
                <span class="debtor-name">${banco.a_nombre_de || 'N/A'}</span>
                ${pct >= 100 && !showingArchived ? `<button class="btn-delete-credit" onclick="archiveBanco(event, '${banco.id_transaccion}')"><i class="fas fa-archive"></i> Mover al Historial</button>` : ''}
                ${showingArchived ? `<div class="archived-badge"><i class="fas fa-check-circle"></i> Archivado</div>` : ''}
            </div>
        `;
        grid.appendChild(card);
    });
}

/**
 * Archiva un crédito pagado (Soft Delete)
 */
async function archiveBanco(event, id) {
    event.stopPropagation(); // Evitar abrir el modal

    if (!confirm('¿Deseas mover este crédito al historial de pagados? Desaparecerá de esta lista.')) {
        return;
    }

    try {
        const supabase = window.getSupabaseClient();

        // Update status to 'ARCHIVADO'
        const { error } = await supabase
            .from('ic_situacion_bancaria')
            .update({ estado: 'ARCHIVADO' })
            .eq('id_transaccion', id);

        if (error) throw error;

        window.showToast('Crédito movido al historial', 'success');
        await loadBancosData(true); // Recargar datos

    } catch (error) {
        console.error('Error al archivar crédito:', error);
        window.showAlert('No se pudo archivar: ' + error.message, 'Error', 'error');
    }
}

/**
 * Filtra las tarjetas por texto
 */
function filterBancos(query) {
    const q = query.toLowerCase();
    const filtered = bancosData.filter(b =>
        (b.nombre_banco || '').toLowerCase().includes(q) ||
        (b.a_nombre_de || '').toLowerCase().includes(q) ||
        (b.motivo || '').toLowerCase().includes(q)
    );
    // Note: We need the pagosMap here. For simplicity, we can store it globally or re-fetch.
    // Let's assume for this specific fix we just want the Initial Load to work. 
    // Ideally, we refactor loadBancosData to store global PagosMap.
    renderBancosCards(filtered, window.currentPagosMap || {});
}

/**
 * Abre el modal de detalle de un banco
 */
async function openBancoDetail(banco) {
    currentBancoId = banco.id_transaccion;
    const modal = document.getElementById('modal-detalle-banco');

    // Llenar datos básicos
    document.getElementById('modal-bank-logo').src = banco.logo_banco || 'img/bank-placeholder.png';
    document.getElementById('modal-bank-name').textContent = banco.nombre_banco;
    document.getElementById('modal-credit-id').textContent = `ID: ${banco.id_transaccion}`;

    document.getElementById('det-banco-monto').textContent = '$' + parseFloat(banco.valor || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 });
    document.getElementById('det-banco-plazo').textContent = `${banco.plazo} cuotas`;
    document.getElementById('det-banco-cuota').textContent = '$' + parseFloat(banco.mensual || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 });
    document.getElementById('det-banco-interes').textContent = `${banco.interes}%`;
    document.getElementById('det-banco-deudor').textContent = banco.a_nombre_de;
    document.getElementById('det-banco-motivo').textContent = banco.motivo;

    // Mostrar modal
    modal.classList.remove('hidden');

    // Cargar tabla de amortización
    await loadAmortizacionBanco(banco.id_transaccion);
}

/**
 * Verifica si hay pagos en el mes actual para activar el botón de reporte
 */
async function checkMonthlyPayments(bancoId) {
    const btn = document.getElementById('btn-generar-reporte-pagos');
    if (!btn) return;

    btn.classList.add('hidden'); // Reset

    try {
        const supabase = window.getSupabaseClient();
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

        // Check specifically for THIS bank first (to enable button access)
        const { data, error } = await supabase
            .from('ic_situacion_bancaria_detalle')
            .select('id_detalle')
            .eq('transaccion', bancoId)
            .eq('estado', 'PAGADO')
            .ilike('fecha_pagado', `${currentMonth}%`) // Starts with YYYY-MM
            .limit(1);

        // Also check if fecha_pagado is used or fecha_pago. Using fecha_pagado (real payment date).

        if (!error && data && data.length > 0) {
            btn.classList.remove('hidden');
        }
    } catch (e) {
        console.error('Error verificando pagos del mes:', e);
    }
}

/**
 * Genera el reporte PDF de todos los pagos bancarios del mes actual
 */
/**
 * Genera el reporte PDF de pagos (Solicita fecha, corrige error de tipo fecha)
 */
async function generateMonthlyPaymentsReport() {
    try {
        // 1. Pedir mes y año
        const { value: selectedDate } = await Swal.fire({
            title: 'Seleccionar Mes del Reporte',
            html: `
                <div style="display:flex; flex-direction:column; gap:10px; align-items:center;">
                    <label for="swal-report-date">Seleccione una fecha dentro del mes deseado:</label>
                    <input type="date" id="swal-report-date" class="swal2-input" value="${new Date().toISOString().slice(0, 10)}">
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Generar PDF',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#0b4e32', // Colors from App Brand
            cancelButtonColor: '#64748b',
            customClass: {
                container: 'swal-high-z-index'
            },
            preConfirm: () => {
                return document.getElementById('swal-report-date').value;
            }
        });

        if (!selectedDate) return;

        const targetMonth = selectedDate.slice(0, 7); // YYYY-MM
        const [year, month] = targetMonth.split('-');

        // Calculate date range for filter
        const startDate = `${targetMonth}-01`;
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        const endDate = `${targetMonth}-${lastDay}`;

        window.showLoader(`Generando reporte PDF (${targetMonth})...`);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const supabase = window.getSupabaseClient();

        // Fetch ALL payments for the target month across ALL banks
        const { data: pagos, error } = await supabase
            .from('ic_situacion_bancaria_detalle')
            .select(`
                *,
                ic_situacion_bancaria (nombre_banco, a_nombre_de)
            `)
            .eq('estado', 'PAGADO')
            .gte('fecha_pagado', startDate)
            .lte('fecha_pagado', endDate)
            .order('fecha_pagado', { ascending: true });

        if (error) throw error;
        if (!pagos || pagos.length === 0) throw new Error(`No hay pagos registrados en ${targetMonth} para generar el reporte.`);

        // Generate PDF content
        let yPos = 20;

        // Header Global
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text("ESTADO DE PAGOS DE OBLIGACIONES DE LA CORPORACION INKA CORP", 105, yPos, { align: "center" });
        yPos += 7;
        doc.setFontSize(10);
        doc.text("DEPARTAMENTO DE GERENCIA", 105, yPos, { align: "center" });

        yPos += 5;
        doc.setDrawColor(204, 84, 34); // Accent Orange/Gold line
        doc.setLineWidth(1);
        doc.line(20, yPos, 190, yPos);

        yPos += 10;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generado el: ${new Date().toLocaleString('es-EC')}`, 190, yPos, { align: "right" });

        yPos += 10;

        // Loop through payments
        for (const pago of pagos) {
            // Check page break
            if (yPos > 240) {
                doc.addPage();
                yPos = 20;
            }

            const boxHeight = 90; // Approx height for each entry

            // Draw Box Border (Optional, like example?) Example has separate boxes.
            doc.setDrawColor(220, 220, 220);
            doc.setLineWidth(0.5);
            doc.roundedRect(15, yPos, 180, boxHeight, 3, 3);

            // Left Column: Details
            const bancoName = pago.ic_situacion_bancaria?.nombre_banco || 'Banco';
            const deudor = pago.ic_situacion_bancaria?.a_nombre_de || 'N/A';
            const valor = parseFloat(pago.valor || 0).toFixed(2);
            const fecha = pago.fecha_pagado;
            const refFoto = pago.fotografia ? pago.fotografia.split('/').pop() : 'Sin imagen';

            let textY = yPos + 10;
            const leftMargin = 20;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text(`ENTIDAD: ${bancoName}`, leftMargin, textY);

            textY += 6;
            doc.text(`DEUDOR: ${deudor}`, leftMargin, textY);

            textY += 6;
            doc.text(`VALOR PAGADO: $${valor}`, leftMargin, textY);

            textY += 6;
            doc.setFont('helvetica', 'normal');
            doc.text(`FECHA PAGO: ${fecha}`, leftMargin, textY);

            textY += 6;
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(`Ref. Fotografía:`, leftMargin, textY);
            textY += 4;
            doc.text(`${refFoto}`, leftMargin, textY, { maxWidth: 80 });
            doc.setTextColor(0);

            // Right Column: Image
            if (pago.fotografia) {
                try {
                    // Load image
                    // Note: This relies on 'js/image-utils.js' or direct fetch if CORS allows.
                    // Assuming public URL.
                    const imgData = await fetchImageAsBase64(pago.fotografia);
                    if (imgData) {
                        // Fit image in right box: x=110, y=yPos+5, w=80, h=80
                        doc.addImage(imgData, 'JPEG', 110, yPos + 5, 80, 80, undefined, 'FAST');
                    }
                } catch (imgErr) {
                    console.error('Error loading image for PDF:', imgErr);
                    doc.text("[Error cargando imagen]", 130, yPos + 40);
                }
            } else {
                doc.text("[Sin Comprobante]", 130, yPos + 40);
            }

            yPos += boxHeight + 10; // Space + Gap
        }

        doc.save(`Estado_Pagos_Bancos_${targetMonth}.pdf`);
        window.hideLoader();
        window.showToast('Reporte generado correctamente', 'success');

    } catch (error) {
        window.hideLoader();
        console.error('Error generando reporte:', error);
        window.showAlert('Error al generar reporte: ' + error.message, 'Error', 'error');
    }
}

/**
 * Helper to fetch image and convert to Base64 (using canvas or fetch)
 */
async function fetchImageAsBase64(url) {
    if (!url) return null;
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn('Could not fetch image for PDF (CORS?):', url);
        return null;
    }
}

/**
 * Carga la tabla de amortización filtrada por transacción
 */
async function loadAmortizacionBanco(idTransaccion) {
    const tableBody = document.getElementById('tabla-amortizacion-banco');
    tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center">Cargando pagos...</td></tr>';

    try {
        const supabase = window.getSupabaseClient();
        const { data: detalles, error } = await supabase
            .from('ic_situacion_bancaria_detalle')
            .select('*')
            .eq('transaccion', idTransaccion)
            .order('cuota', { ascending: true });

        if (error) throw error;

        bancosDetalleData = detalles || [];
        renderAmortizacionTable(bancosDetalleData);
        updateAmortizacionProgress(bancosDetalleData);

    } catch (error) {
        console.error('Error al cargar detalle de banco:', error);
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red">Error al cargar datos</td></tr>';
    }
}

/**
 * Renderiza las filas de la tabla de amortización
 */
function renderAmortizacionTable(data) {
    const tableBody = document.getElementById('tabla-amortizacion-banco');
    tableBody.innerHTML = '';

    data.forEach(item => {
        const tr = document.createElement('tr');
        const isPaid = item.estado === 'PAGADO';
        if (isPaid) tr.classList.add('paid');

        tr.onclick = () => handleRowClick(item);

        tr.innerHTML = `
            <td>${item.cuota}</td>
            <td>${item.fecha_pago}</td>
            <td>$${parseFloat(item.valor || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}</td>
            <td>
                <span class="status-pill ${item.estado.toLowerCase()}">
                    ${item.estado}
                </span>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

/**
 * Maneja el click en una fila de la tabla
 */
function handleRowClick(item) {
    if (item.estado === 'PAGADO') {
        showComprobanteViewer(item);
    } else {
        openPagoBancoModal(item);
    }
}

/**
 * Abre el modal para registrar un pago
 */
function openPagoBancoModal(item) {
    currentBancoDetalle = item;

    document.getElementById('pago-banco-id-detalle').value = item.id_detalle;
    document.getElementById('pago-banco-cuota-num').textContent = item.cuota;
    document.getElementById('pago-banco-valor').value = item.valor;

    // Set default date to today
    document.getElementById('pago-banco-fecha').value = new Date().toISOString().split('T')[0];

    clearBancoPreview();
    document.getElementById('modal-pago-banco').classList.remove('hidden');
}

/**
 * Muestra el comprobante ya pagado
 */
function showComprobanteViewer(item) {
    document.getElementById('viewer-img-banco').src = item.fotografia || 'img/no-image.png';
    document.getElementById('viewer-fecha-banco').textContent = item.fecha_pagado || 'N/A';
    document.getElementById('modal-comprobante-banco').classList.remove('hidden');
}

/**
 * Actualiza el progreso en el modal de detalle
 */
function updateAmortizacionProgress(data) {
    const total = data.length;
    const pagados = data.filter(i => i.estado === 'PAGADO').length;
    const pct = total > 0 ? Math.round((pagados / total) * 100) : 0;

    document.getElementById('det-banco-progreso-text').textContent = `${pagados} de ${total} cuotas`;
    document.getElementById('det-banco-progreso-pct').textContent = `${pct}%`;
    document.getElementById('det-banco-barra').style.width = `${pct}%`;

    const totalPagado = data
        .filter(i => i.estado === 'PAGADO')
        .reduce((sum, i) => sum + parseFloat(i.valor || 0), 0);

    const totalPendiente = data
        .filter(i => i.estado !== 'PAGADO')
        .reduce((sum, i) => sum + parseFloat(i.valor || 0), 0);

    document.getElementById('det-banco-pagado').textContent = '$' + totalPagado.toLocaleString('es-EC', { minimumFractionDigits: 2 });
    document.getElementById('det-banco-pendiente').textContent = '$' + totalPendiente.toLocaleString('es-EC', { minimumFractionDigits: 2 });
}

/**
 * Cierra todos los modales premium abiertos
 */
function closePremiumModals() {
    document.querySelectorAll('.modal-premium').forEach(m => m.classList.add('hidden'));
}

/**
 * Maneja el envío del formulario de pago
 */
async function handleBancoPaymentSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-guardar-pago-banco');

    const idDetalle = document.getElementById('pago-banco-id-detalle').value;
    const fecha = document.getElementById('pago-banco-fecha').value;
    const previewImg = document.getElementById('pago-banco-preview');

    if (!previewImg.src || previewImg.src.includes('data:image/gif')) {
        return window.showAlert('Por favor sube o toma una foto del comprobante', 'Comprobante requerido', 'warning');
    }

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        const supabase = window.getSupabaseClient();

        // 1. Subir imagen a Storage
        const fileName = `bancos/pago_${idDetalle}_${Date.now()}.jpg`;
        const blob = await fetch(previewImg.src).then(r => r.blob());

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('comprobantes')
            .upload(fileName, blob);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
            .from('comprobantes')
            .getPublicUrl(fileName);

        // 2. Actualizar registro en DB
        const { error: updateError } = await supabase
            .from('ic_situacion_bancaria_detalle')
            .update({
                estado: 'PAGADO',
                fecha_pagado: fecha,
                fotografia: publicUrlData.publicUrl
            })
            .eq('id_detalle', idDetalle);

        if (updateError) throw updateError;

        window.showToast('Pago registrado correctamente', 'success');
        closePremiumModals();

        // Recargar tabla de amortización para el banco actual
        if (currentBancoId) {
            await loadAmortizacionBanco(currentBancoId);
        }

        // Recargar grid principal en segundo plano
        loadBancosData();

    } catch (error) {
        console.error('Error al guardar pago:', error);
        window.showAlert(error.message, 'Error', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Guardar Pago';
    }
}

/**
 * Maneja la carga de imagen y muestra el preview
 */
function handleBancoImageUpload(file) {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        return window.showAlert('La imagen no debe pesar más de 5MB', 'Imagen muy grande', 'warning');
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const container = document.getElementById('pago-banco-preview-container');
        const placeholder = document.getElementById('pago-banco-upload-placeholder');
        const img = document.getElementById('pago-banco-preview');

        img.src = e.target.result;
        container.classList.remove('hidden');
        placeholder.classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

/**
 * Limpia el preview de imagen
 */
function clearBancoPreview() {
    const container = document.getElementById('pago-banco-preview-container');
    const placeholder = document.getElementById('pago-banco-upload-placeholder');
    const img = document.getElementById('pago-banco-preview');

    img.src = '';
    container.classList.add('hidden');
    placeholder.classList.remove('hidden');
}

// Exponer funciones necesarias globalmente si se requiere
window.initBancosModule = initBancosModule;
// Need to expose deleteBanco globally
// Need to expose archiveBanco globally
window.archiveBanco = archiveBanco;

// =========================================================================
// NUEVA FUNCIONALIDAD: AGREGAR CRÉDITO/PÓLIZA
// =========================================================================

// Variables globales para la nueva funcionalidad
let bancosLogosList = [];

// Init extra listeners for new functionality
function setupNewBancoListeners() {
    const btnNew = document.getElementById('btn-nuevo-banco');
    if (btnNew) {
        btnNew.addEventListener('click', openNewBancoModal);
    }

    const btnSave = document.getElementById('btn-save-new-banco');
    if (btnSave) {
        btnSave.addEventListener('click', handleSaveNewBanco);
    }

    // Auto-calculo on input change
    const formInputs = document.querySelectorAll('#form-nuevo-banco input, #form-nuevo-banco select');
    formInputs.forEach(input => {
        input.addEventListener('input', updateBancoPreview);
    });

    // Toggle fields based on type
    const typeSelect = document.getElementById('new-banco-tipo');
    if (typeSelect) {
        typeSelect.addEventListener('change', toggleBancoFields);
    }
}

// Hook into existing setup
const originalSetup = setupBancosEventListeners;
setupBancosEventListeners = function () {
    originalSetup();
    setupNewBancoListeners();
}

/**
 * Abre el modal de nuevo banco
 */
async function openNewBancoModal() {
    // Reset form
    document.getElementById('form-nuevo-banco').reset();

    // Load Banks List if empty
    if (bancosLogosList.length === 0) {
        await loadBancoLogos();
    }

    // Set default date
    document.getElementById('new-banco-fecha').value = new Date().toISOString().split('T')[0];

    // Reset UI state
    toggleBancoFields();
    updateBancoPreview();

    document.getElementById('modal-nuevo-banco').classList.remove('hidden');
}

/**
 * Carga la lista de bancos y logos para el select
 */
async function loadBancoLogos() {
    try {
        const supabase = window.getSupabaseClient();
        const { data, error } = await supabase
            .from('ic_bancos_logos')
            .select('bancos, imagenes')
            .order('bancos', { ascending: true });

        if (error) throw error;

        bancosLogosList = data || [];

        const select = document.getElementById('new-banco-nombre');
        select.innerHTML = '<option value="">Seleccione Banco...</option>';

        bancosLogosList.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.bancos;
            opt.dataset.logo = b.imagenes || '';
            opt.textContent = b.bancos;
            select.appendChild(opt);
        });

    } catch (e) {
        console.error('Error cargando lista de bancos:', e);
    }
}

/**
 * Alterna campos según tipo (Crédito vs Póliza)
 */
function toggleBancoFields() {
    const type = document.getElementById('new-banco-tipo').value;
    const isCredito = type === 'CREDITO';

    // Labels
    document.getElementById('lbl-monto').textContent = isCredito ? 'Monto Solicitado' : 'Monto Depositado';

    // Visibility
    const groupPrimerPago = document.getElementById('group-primer-pago');
    const groupValorRecibir = document.getElementById('group-valor-recibir');

    if (isCredito) {
        groupPrimerPago.classList.remove('hidden');
        groupValorRecibir.classList.add('hidden');
        document.getElementById('new-banco-primer-pago').required = true;
        document.getElementById('new-banco-valor-recibir').required = false;
    } else {
        groupPrimerPago.classList.add('hidden');
        groupValorRecibir.classList.remove('hidden');
        document.getElementById('new-banco-primer-pago').required = false;
        document.getElementById('new-banco-valor-recibir').required = true; // Maybe optional?
    }
}

/**
 * Actualiza la tarjeta de previsualización en tiempo real
 */
function updateBancoPreview() {
    // Get values
    const bancoName = document.getElementById('new-banco-nombre').value;
    const plazo = parseInt(document.getElementById('new-banco-plazo').value) || 0;
    const monto = parseFloat(document.getElementById('new-banco-monto').value) || 0;
    const interes = parseFloat(document.getElementById('new-banco-interes').value) || 0;
    const deudor = document.getElementById('new-banco-deudor').value || 'Nombre...';

    // Get Logo
    const select = document.getElementById('new-banco-nombre');
    const selectedOpt = select.options[select.selectedIndex];
    const logoUrl = selectedOpt ? selectedOpt.dataset.logo : '';

    // Calculations
    let cuota = 0;
    let total = parseFloat(document.getElementById('new-banco-total').value) || 0;

    // Detect if we should calculate total or use the manual one
    const isManualTotal = event && event.target && event.target.id === 'new-banco-total';

    if (plazo > 0 && monto > 0) {
        if (!isManualTotal) {
            // Calculate total only if it's not being manually edited right now
            const interesTotal = monto * (interes / 100);
            total = monto + interesTotal;
            document.getElementById('new-banco-total').value = total.toFixed(2);
        }

        // Calculate cuota based on current total (whether manual or calculated)
        cuota = total / plazo;
    }

    // Render Preview
    const cardFunc = (name, p, c, mot) => `
        <div class="bank-card-header">
            <span class="bank-name-label">${name || 'Banco'}</span>
            <div class="bank-progress-circle">0/${p}</div>
        </div>
        ${logoUrl ? `<img src="${logoUrl}" style="position:absolute; right:10px; top:40px; height:30px; opacity:0.8;">` : ''}
        <div class="bank-card-progress">
            <div class="progress-label-group">
                <span>Progreso</span>
                <span class="progress-percentage">0%</span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: 0%"></div>
            </div>
        </div>
        <div class="bank-card-amounts">
            <div class="amount-item">
                <span class="amount-label">Cuota</span>
                <span class="amount-value">$${cuota.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="amount-item">
                <span class="amount-label">Total</span>
                <span class="amount-value">$${total.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span>
            </div>
        </div>
        <div class="bank-card-footer">
            <span class="debtor-label">DEUDOR</span>
            <span class="debtor-name">${deudor}</span>
        </div>
    `;

    document.getElementById('new-banco-preview-card').innerHTML = cardFunc(bancoName, plazo, cuota, '');
}

/**
 * Guarda el nuevo banco y genera la tabla
 */
async function handleSaveNewBanco() {
    const form = document.getElementById('form-nuevo-banco');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const btn = document.getElementById('btn-save-new-banco');

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        // Gather Data
        const nombre_banco = document.getElementById('new-banco-nombre').value;
        const select = document.getElementById('new-banco-nombre');
        const logo_url = select.options[select.selectedIndex].dataset.logo;

        const tipo = document.getElementById('new-banco-tipo').value;
        const monto = parseFloat(document.getElementById('new-banco-monto').value);
        const plazo = parseInt(document.getElementById('new-banco-plazo').value);
        const interes = parseFloat(document.getElementById('new-banco-interes').value);
        const total = parseFloat(document.getElementById('new-banco-total').value);
        const mensual = total / plazo;

        const fecha = document.getElementById('new-banco-fecha').value;
        const primerPago = document.getElementById('new-banco-primer-pago').value;
        const deudor = document.getElementById('new-banco-deudor').value;
        const motivo = document.getElementById('new-banco-motivo').value;
        const valor_recibido = document.getElementById('new-banco-recibido').value || 0; // Cash received

        const id_transaccion = `TRX-${Date.now()}`; // Generate unique ID

        const supabase = window.getSupabaseClient();

        // 1. Insert Header (ic_situacion_bancaria)
        const { error: headerError } = await supabase
            .from('ic_situacion_bancaria')
            .insert({
                id_transaccion: id_transaccion,
                nombre_banco: nombre_banco,
                tipo: tipo, // Póliza or Crédito (Add column if missing in DB, assuming keys map)
                monto_inicial: monto,
                monto_final: total,
                plazo: plazo,
                interes: interes,
                mensual: mensual,
                fecha_inicio: fecha,
                a_nombre_de: deudor,
                motivo: motivo,
                valor_recibido: valor_recibido, // If column exists
                logo_banco: logo_url,
                estado: 'ACTIVO',
                contador: plazo // Total quotas
            });

        if (headerError) throw headerError;

        // 2. Generate Amortization Table (ic_situacion_bancaria_detalle)
        const detalles = [];
        let currentDate = new Date(primerPago || fecha); // Use primerPago for credits

        // If primerPago is set, use it. If not (policy), handle differently or just start next month
        if (!primerPago && tipo === 'POLIZA') {
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        for (let i = 1; i <= plazo; i++) {
            detalles.push({
                transaccion: id_transaccion,
                cuota: i,
                fecha_pago: currentDate.toISOString().split('T')[0],
                valor: mensual, // Fixed quota
                estado: 'PENDIENTE',
                interes: 0, // Simplified
                capital: 0, // Simplified
                saldo: total - (mensual * i)
            });

            // Next Month
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        const { error: detailError } = await supabase
            .from('ic_situacion_bancaria_detalle')
            .insert(detalles);

        if (detailError) throw detailError;

        // Success
        window.showToast('Registro creado exitosamente', 'success');
        document.getElementById('modal-nuevo-banco').classList.add('hidden');

        // Reload Stats and Grid
        loadBancosData(true);

    } catch (error) {
        console.error('Error guardando nuevo banco:', error);
        window.showAlert('Error al guardar: ' + error.message, 'Error', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Guardar y Crear';
    }
}
