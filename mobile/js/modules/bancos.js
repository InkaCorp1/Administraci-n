/**
 * Módulo de Bancos Móvil (Versión Express)
 */

let mobileBancosData = [];
let mobilePagosMap = {}; // Mapa para contar cuotas pagadas
let currentBankAmortization = [];
let currentBankId = null;

async function initBancosModule() {
    await fetchBancosMobile();
}

// Exponer funciones necesarias al scope global
window.initBancosModule = initBancosModule;
window.showLiteComprobante = showLiteComprobante;
window.closeLiteComprobante = closeLiteComprobante;

/**
 * Obtiene el tema visual según el nombre del banco (Sincronizado con versión PC)
 */
function getBankTheme(bankName) {
    const name = (bankName || '').toUpperCase();
    const themes = {
        DEFAULT: {
            bg: 'linear-gradient(145deg, #f0fdf4 0%, #dcfce7 100%)',
            primary: '#0B4E32',
            light: '#146E3A',
            glow: 'rgba(11, 78, 50, 0.1)',
            border: 'rgba(11, 78, 50, 0.12)',
            textOnPill: '#0B4E32'
        },
        PICHINCHA: {
            bg: 'linear-gradient(145deg, #fffcf0 0%, #fff9db 100%)',
            primary: '#856404',
            light: '#f2bb3a',
            glow: 'rgba(242, 187, 58, 0.1)',
            border: 'rgba(242, 187, 58, 0.2)',
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
            primary: '#0070BA',
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
            primary: '#1a5d1a',
            light: '#2d8a2d',
            glow: 'rgba(26, 93, 26, 0.1)',
            border: 'rgba(26, 93, 26, 0.15)',
            textOnPill: '#1a5d1a'
        },
        DAQUILEMA: {
            bg: 'linear-gradient(145deg, #fef2f2 0%, #fee2e2 100%)',
            primary: '#dc2626',
            light: '#ef4444',
            glow: 'rgba(220, 38, 38, 0.1)',
            border: 'rgba(220, 38, 38, 0.15)',
            textOnPill: '#dc2626'
        },
        TUPAK: {
            bg: 'linear-gradient(145deg, #f0f9ff 0%, #dbeafe 100%)',
            primary: '#2563eb',
            light: '#60a5fa',
            glow: 'rgba(37, 99, 235, 0.1)',
            border: 'rgba(37, 99, 235, 0.15)',
            textOnPill: '#1e40af'
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

async function fetchBancosMobile() {
    const container = document.getElementById('mobile-bancos-list');
    if (!container) return;

    try {
        const supabase = window.getSupabaseClient();

        const { data: bancos, error: errorBancos } = await supabase
            .from('ic_situacion_bancaria')
            .select('*')
            .neq('estado', 'ARCHIVADO')
            .order('nombre_banco', { ascending: true });

        if (errorBancos) throw errorBancos;

        mobileBancosData = bancos || [];
        const transaccionIds = mobileBancosData.map(b => b.id_transaccion);

        mobilePagosMap = {};
        if (transaccionIds.length > 0) {
            const { data: pagos, error: errorPagos } = await supabase
                .from('ic_situacion_bancaria_detalle')
                .select('transaccion')
                .eq('estado', 'PAGADO')
                .in('transaccion', transaccionIds);

            if (!errorPagos && pagos) {
                pagos.forEach(p => {
                    const key = String(p.transaccion);
                    mobilePagosMap[key] = (mobilePagosMap[key] || 0) + 1;
                });
            }
        }

        renderBankCards(mobileBancosData);

    } catch (error) {
        console.error('Error fetching mobile bancos:', error);
        container.innerHTML = `<p style="text-align:center; padding: 2rem;">Error al cargar datos bancarios: ${error.message}</p>`;
    }
}

function renderBankCards(data) {
    const container = document.getElementById('mobile-bancos-list');
    if (!container) return;

    if (data.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 2rem; color: var(--text-secondary);">No hay bancos activos.</p>';
        return;
    }

    container.innerHTML = data.map(b => {
        const theme = getBankTheme(b.nombre_banco);
        const totalCuotas = parseInt(b.contador || 0);
        const pagadas = mobilePagosMap[String(b.id_transaccion)] || 0;
        const pct = totalCuotas > 0 ? Math.round((pagadas / totalCuotas) * 100) : 0;

        const valorCuota = b.mensual || 0;
        const montoTotal = parseFloat(b.monto_final || 0);
        const saldoPendiente = montoTotal - (pagadas * valorCuota);

        let logoUrl = b.logo_banco || '../img/bank-placeholder.png';
        if ((b.nombre_banco || '').toUpperCase().includes('PICHINCHA')) {
            logoUrl = 'https://lh3.googleusercontent.com/d/10zy2rxIR2dp_MfdGO7JiOjVvovGSIGCZ=w2048?name=Pichincha.png';
        }

        const bankNameUpper = (b.nombre_banco || '').toUpperCase();
        const needsZoom = bankNameUpper.includes('PACIFICO') ||
            bankNameUpper.includes('PRODUBANCO') ||
            bankNameUpper.includes('MUSHUC');

        const logoClass = needsZoom ? 'zoom-lg' : (bankNameUpper.includes('PICHINCHA') ? 'zoom-sm' : '');

        const styles = `
            --bank-bg: ${theme.bg};
            --bank-primary: ${theme.primary};
            --bank-light: ${theme.light};
            --bank-glow: ${theme.glow};
            --bank-border: ${theme.border};
            --bank-pill-text: ${theme.textOnPill};
        `;

        return `
            <div class="lite-bank-card theme-card" style="${styles}" onclick="showAmortizationLite('${b.id_transaccion}')">
                <div class="lite-bank-card-header">
                    <span class="lite-bank-name">${b.nombre_banco}</span>
                    <div class="lite-bank-progress-badge">${pagadas}/${totalCuotas}</div>
                </div>
                
                <div class="lite-bank-main">
                    <div class="lite-bank-debtor-label">DEUDOR</div>
                    <div class="lite-bank-debtor-name">${b.a_nombre_de || 'N/A'}</div>
                </div>

                <div class="lite-bank-progress-section">
                    <div class="lite-progress-info">
                        <span>Progreso del Crédito</span>
                        <span class="lite-pct-text">${pct}%</span>
                    </div>
                    <div class="lite-progress-bar-bg">
                        <div class="lite-progress-bar-fill" style="width: ${pct}%"></div>
                    </div>
                </div>

                <div class="lite-bank-amounts-grid">
                    <div class="lite-amount-col">
                        <span class="lite-amount-sub">Valor Cuota</span>
                        <span class="lite-amount-val">$${parseFloat(valorCuota).toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div class="lite-amount-col">
                        <span class="lite-amount-sub">Saldo Pendiente</span>
                        <span class="lite-amount-val val-pending">$${Math.max(0, saldoPendiente).toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>

                <img src="${logoUrl}" class="lite-card-logo ${logoClass}" alt="Logo">
            </div>
        `;
    }).join('');
}

async function showAmortizationLite(id) {
    const banco = mobileBancosData.find(b => b.id_transaccion === id);
    if (!banco) return;

    const tbody = document.getElementById('lite-amortization-body');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 2rem;"><i class="fas fa-spinner fa-spin"></i> Cargando cuotas...</td></tr>';

    const theme = getBankTheme(banco.nombre_banco);
    const styles = `
        --bank-bg: ${theme.bg};
        --bank-primary: ${theme.primary};
        --bank-light: ${theme.light};
        --bank-glow: ${theme.glow};
        --bank-border: ${theme.border};
        --bank-pill-text: ${theme.textOnPill};
    `;

    const modal = document.getElementById('modal-amortizacion-lite');
    const modalContent = modal.querySelector('.modal-content');
    modalContent.setAttribute('style', styles);

    document.getElementById('lite-bank-name').textContent = banco.nombre_banco;
    document.getElementById('lite-bank-debtor').textContent = banco.a_nombre_de;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    try {
        const supabase = window.getSupabaseClient();
        const { data: detalles, error } = await supabase
            .from('ic_situacion_bancaria_detalle')
            .select('*')
            .eq('transaccion', id)
            .order('cuota', { ascending: true });

        if (error) throw error;

        currentBankId = id;
        currentBankAmortization = detalles || [];

        let nextToPayFound = false;

        tbody.innerHTML = currentBankAmortization.map(item => {
            const isPaid = item.estado === 'PAGADO';
            const fecha = item.fecha_pago ? new Date(item.fecha_pago + 'T12:00:00') : null;
            const fechaTxt = fecha ? fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : (item.fecha_pago || '---');

            let actionHtml = '';
            if (isPaid && item.fotografia) {
                actionHtml = `<button class="lite-action-btn btn-view" onclick="showLiteComprobante('${item.id_detalle}')">
                                <i class="fas fa-eye"></i>
                             </button>`;
            } else if (!isPaid && !nextToPayFound) {
                actionHtml = `<button class="lite-action-btn btn-pay" onclick="openLitePago('${item.id_detalle}')">
                                <i class="fas fa-dollar-sign"></i>
                             </button>`;
                nextToPayFound = true;
            }

            return `
                <tr class="${isPaid ? 'lite-row-paid' : ''}">
                    <td style="font-weight:700">${item.cuota}</td>
                    <td>${fechaTxt}</td>
                    <td style="text-align: center;">
                        <span class="lite-status-pill ${isPaid ? 'pill-pagado' : 'pill-pendiente'}">
                            ${isPaid ? 'PAGADO' : 'PENDIENTE'}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        ${actionHtml}
                    </td>
                </tr>
            `;
        }).join('');

        if (currentBankAmortization.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 2rem;">No hay cuotas registradas.</td></tr>';
        }

    } catch (error) {
        console.error('Error loading amortization details:', error);
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 2rem; color: var(--error);">Error: ${error.message}</td></tr>`;
    }
}

function closeAmortizationLite() {
    const modal = document.getElementById('modal-amortizacion-lite');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

function showLiteComprobante(idDetalle) {
    const item = currentBankAmortization.find(d => d.id_detalle === idDetalle);
    if (!item) return window.Swal.fire('Atención', 'No se encontró la información del pago.', 'info');

    const banco = mobileBancosData.find(b => b.id_transaccion === currentBankId);
    const bankName = (banco?.nombre_banco || 'BANCO').toUpperCase();

    // Obtener info formateada
    const monto = item.valor || 0; // Changed from monto_pagado to valor based on common schema
    const cuotaN = item.cuota || '-';
    const fechaP = item.fecha_pagado ? new Date(item.fecha_pagado + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '---'; // Changed from fecha_pago to fecha_pagado

    const container = document.getElementById('lite-pago-detalle-container-bancos');
    if (!container) return;

    // Procesar URL de imagen (con lógica de Google y Supabase previa)
    let url = item.fotografia || '';
    let finalUrl = url.trim();
    const isGoogle = finalUrl.includes('googleusercontent.com') || finalUrl.includes('drive.google.com');

    if (isGoogle) {
        if (finalUrl.includes('/d/$')) finalUrl = finalUrl.replace('/d/$', '/d/');
    } else {
        const isAbsolute = finalUrl.startsWith('http') || finalUrl.startsWith('//');
        const isSupabaseUrl = finalUrl.includes('.supabase.co/storage/v1/object/public/');
        if (!isAbsolute && !isSupabaseUrl && finalUrl !== '') {
            try {
                const supabase = window.getSupabaseClient();
                const { data } = supabase.storage.from('inkacorp').getPublicUrl(finalUrl);
                if (data && data.publicUrl) finalUrl = data.publicUrl;
            } catch (e) {
                console.error('[ProofViewer] Error resolving Supabase path:', e);
            }
        }
    }

    container.innerHTML = `
        <div class="receipt-card-mobile animate__animated animate__fadeIn">
            <div class="receipt-luxury-header">
                <div style="font-size: 0.7rem; color: #94a3b8; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 0.5rem;">Comprobante Digital (Bancos)</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: #1e293b; margin-bottom: 0.25rem;">${bankName}</div>
                <div style="color: #64748b; font-size: 0.85rem; font-weight: 500;">TRANSACCIÓN: ${currentBankId}</div>
            </div>

            <div class="receipt-amount-section">
                <div style="font-size: 0.8rem; color: #166534; font-weight: 600; margin-bottom: 0.25rem;">VALOR PAGADO</div>
                <div style="font-size: 2.2rem; font-weight: 900; color: #10b981;">$${Number(monto).toFixed(2)}</div>
                <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.5rem; text-transform: lowercase;">registrado en sistema</div>
            </div>

            <div class="receipt-info-list" style="border-bottom: 1px solid #f1f5f9; padding-bottom: 1.5rem; margin-bottom: 1.5rem;">
                <div class="receipt-info-item">
                    <span style="color: #94a3b8;">Fecha de Pago</span>
                    <span style="font-weight: 600; color: #1e293b;">${fechaP}</span>
                </div>
                <div class="receipt-info-item">
                    <span style="color: #94a3b8;">Cuota Número</span>
                    <span style="font-weight: 600; color: #1e293b;">#${cuotaN}</span>
                </div>
            </div>

            ${finalUrl ? `
                <div class="receipt-image-container">
                    <span style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.8rem; display: block; text-align: center;">EVIDENCIA ADJUNTA</span>
                    <div class="receipt-image-wrapper">
                        <img src="${finalUrl}" onclick="window.open('${finalUrl}', '_blank')" alt="Evidencia">
                        <div class="receipt-image-overlay">Toca para ampliar</div>
                    </div>
                    
                    ${isGoogle ? `
                        <a href="${finalUrl}" target="_blank" class="lite-viewer-external-btn">
                            <i class="fas fa-external-link-alt"></i> Ver en Navegador
                        </a>
                    ` : ''}
                </div>
            ` : ''}

            <div style="text-align: center; margin-top: 30px; border-top: 1px solid #f1f5f9; padding-top: 15px; margin-bottom: 20px;">
                <p style="font-size: 0.7rem; color: #cbd5e1;">UUID: ${item.id_detalle}</p>
                <div style="font-size: 0.75rem; font-weight: 700; color: #94a3b8; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <img src="../img/icon-192.png" style="height: 14px; opacity: 0.3;" onerror="this.style.display='none'">
                    INKA CORP SISTEMAS
                </div>
            </div>

            <button class="lite-btn-action success" onclick="closeLiteComprobante()" style="margin-top: 0.5rem; width: 100%; height: 50px; border-radius: 25px; font-weight: 700;">
                <i class="fas fa-check"></i> ENTENDIDO
            </button>
        </div>
    `;

    document.getElementById('modal-comprobante-lite').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeLiteComprobante() {
    document.getElementById('modal-comprobante-lite').classList.remove('active');
    document.body.style.overflow = ''; // Restore body scroll
    const container = document.getElementById('lite-pago-detalle-container-bancos');
    if (container) container.innerHTML = ''; // Clear content when closing
}

function openLitePago(idDetalle) {
    const cuota = currentBankAmortization.find(c => c.id_detalle === idDetalle);
    const banco = mobileBancosData.find(b => b.id_transaccion === currentBankId);
    if (!cuota || !banco) return;

    const theme = getBankTheme(banco.nombre_banco);
    const styles = `
        --bank-bg: ${theme.bg};
        --bank-primary: ${theme.primary};
        --bank-light: ${theme.light};
        --bank-glow: ${theme.glow};
        --bank-border: ${theme.border};
        --bank-pill-text: ${theme.textOnPill};
    `;

    const modal = document.getElementById('modal-pago-lite');
    const modalContent = modal.querySelector('.modal-content');
    modalContent.setAttribute('style', styles);

    document.getElementById('lite-pago-id-detalle').value = idDetalle;
    document.getElementById('lite-pago-cuota').textContent = cuota.cuota;

    // Asignar valor sugerido al input editable
    document.getElementById('lite-pago-valor-inputs').value = parseFloat(cuota.valor || 0);

    document.getElementById('lite-pago-fecha').value = new Date().toISOString().split('T')[0];

    clearLitePagoPreview();

    modal.classList.add('active');
}

function closeLitePago() {
    document.getElementById('modal-pago-lite').classList.remove('active');
}

function handleLiteImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        return window.Swal.fire('Error', 'La imagen no debe pesar más de 5MB', 'warning');
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const placeholder = document.getElementById('lite-pago-placeholder');
        const container = document.getElementById('lite-pago-preview-container');
        const img = document.getElementById('lite-pago-preview');

        if (img) {
            img.src = e.target.result;
            container.classList.remove('hidden');
            placeholder.style.display = 'none'; // Desaparece el área punteada
        }
    };
    reader.readAsDataURL(file);
}

function clearLitePagoPreview() {
    const placeholder = document.getElementById('lite-pago-placeholder');
    const container = document.getElementById('lite-pago-preview-container');
    const img = document.getElementById('lite-pago-preview');
    const input = document.getElementById('lite-pago-input');

    if (img) img.src = '';
    if (input) input.value = '';
    if (container) container.classList.add('hidden');
    if (placeholder) {
        placeholder.style.display = 'flex';
        placeholder.classList.remove('hidden');
    }
}

/**
 * Comprime una imagen a WebP con calidad optimizada
 */
async function compressImage(dataUrl, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            // Mantener proporciones pero limitar tamaño máximo si es necesario
            let width = img.width;
            let height = img.height;
            const maxDimension = 1200;

            if (width > height && width > maxDimension) {
                height *= maxDimension / width;
                width = maxDimension;
            } else if (height > maxDimension) {
                width *= maxDimension / height;
                height = maxDimension;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Error al comprimir imagen'));
            }, 'image/webp', quality);
        };
        img.onerror = () => reject(new Error('Error al cargar imagen para compresión'));
        img.src = dataUrl;
    });
}

async function handleMobilePayment(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-lite-guardar');
    const idDetalle = document.getElementById('lite-pago-id-detalle').value;
    const fecha = document.getElementById('lite-pago-fecha').value;
    const valorManual = document.getElementById('lite-pago-valor-inputs').value;
    const previewImg = document.getElementById('lite-pago-preview');

    if (!previewImg.src || previewImg.src.includes('data:image/gif') || previewImg.src === '' || previewImg.src.endsWith('bancos.html')) {
        return window.Swal.fire('Espera', 'Por favor sube una foto del comprobante', 'warning');
    }

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        const supabase = window.getSupabaseClient();

        // 1. Comprimir y convertir a WebP (Calidad 80%)
        const compressedBlob = await compressImage(previewImg.src, 0.8);
        const fileName = `bancos_pagos/pago_mobile_${idDetalle}_${Date.now()}.webp`;

        const { error: uploadError } = await supabase.storage
            .from('inkacorp')
            .upload(fileName, compressedBlob, {
                contentType: 'image/webp',
                upsert: true
            });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
            .from('inkacorp')
            .getPublicUrl(fileName);

        // 2. Actualizar en ic_situacion_bancaria_detalle
        const { error: updateError } = await supabase
            .from('ic_situacion_bancaria_detalle')
            .update({
                estado: 'PAGADO',
                fecha_pagado: fecha,
                fotografia: publicUrlData.publicUrl,
                valor: parseFloat(valorManual)
            })
            .eq('id_detalle', idDetalle);

        if (updateError) throw updateError;

        await window.Swal.fire('¡Éxito!', 'Pago registrado correctamente', 'success');

        closeLitePago();

        await fetchBancosMobile();

        if (currentBankId) {
            showAmortizationLite(currentBankId);
        }

    } catch (error) {
        console.error('Error en pago móvil:', error);
        window.Swal.fire('Error', error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Guardar Pago';
    }
}

// Global exposure
window.initBancosModule = initBancosModule;
window.handleMobilePayment = handleMobilePayment;
window.handleLiteImageSelect = handleLiteImageSelect;
window.openLitePago = openLitePago;
window.closeAmortizationLite = closeAmortizationLite;
window.closeLitePago = closeLitePago;
window.showLiteComprobante = showLiteComprobante;
window.closeLiteComprobante = closeLiteComprobante;
window.clearLitePagoPreview = clearLitePagoPreview;
window.showAmortizationLite = showAmortizationLite;
