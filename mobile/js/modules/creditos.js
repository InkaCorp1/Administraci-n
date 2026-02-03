/**
 * Módulo de Créditos - Versión Móvil Modular
 */

let liteCreditosData = [];

async function initCreditosModule() {
    await fetchLiteCreditos();
    
    // Exponer funciones necesarias al scope global para los onclick de los templates
    window.showLiteCreditDetails = showLiteCreditDetails;
    window.showCreditoAmortization = showCreditoAmortization;
    window.handleQuickCreditPayment = handleQuickCreditPayment;
    window.closeAmortizationLite = () => {
        if (typeof closeLiteModal === 'function') closeLiteModal('modal-amortizacion-credito');
    };
    window.filterLiteCreditos = filterLiteCreditos;
    window.closeLiteSearch = closeLiteSearch;
}

async function fetchLiteCreditos() {
    try {
        const supabase = window.getSupabaseClient();
        const { data, error } = await supabase
            .from('ic_creditos')
            .select(`
                id_credito, 
                codigo_credito, 
                capital, 
                estado_credito, 
                fecha_desembolso,
                fecha_primer_pago,
                plazo,
                cuotas_pagadas,
                cuota_con_ahorro,
                socio:ic_socios!id_socio (
                    nombre,
                    cedula,
                    whatsapp
                )
            `)
            .order('fecha_desembolso', { ascending: false });

        if (error) throw error;

        // Lógica de Ordenamiento Priorizado (Igual que PC)
        const estadoPriority = {
            'MOROSO': 1,
            'ACTIVO': 2,
            'PAUSADO': 3,
            'PRECANCELADO': 4,
            'CANCELADO': 5,
            'PENDIENTE': 6
        };

        const sortedData = data.sort((a, b) => {
            const aEstadoPrio = estadoPriority[a.estado_credito] || 99;
            const bEstadoPrio = estadoPriority[b.estado_credito] || 99;
            if (aEstadoPrio !== bEstadoPrio) return aEstadoPrio - bEstadoPrio;

            const getNextPayment = (c) => {
                if (!c.fecha_primer_pago) return new Date(8640000000000000);
                const baseDate = new Date(c.fecha_primer_pago);
                baseDate.setMonth(baseDate.getMonth() + (c.cuotas_pagadas || 0));
                return baseDate;
            };

            return getNextPayment(a) - getNextPayment(b);
        });

        liteCreditosData = sortedData;
        renderLiteCreditos(sortedData);

        // Sincronizar estados morosos automáticamente en segundo plano para no bloquear UI
        sincronizarEstadosMorososLite(liteCreditosData).catch(e => console.error('[Sync Error]', e));

    } catch (error) {
        console.error('Error fetching lite creditos:', error);
        const list = document.getElementById('lite-creditos-list');
        if (list) list.innerHTML = '<p style="text-align:center; padding: 2rem;">Error al cargar créditos.</p>';
    }
}

function renderLiteCreditos(creditos) {
    const container = document.getElementById('lite-creditos-list');
    if (!container) return;
    
    if (!creditos || creditos.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 2rem; color: var(--text-muted);">No se encontraron créditos.</p>';
        return;
    }

    const grouped = {};
    const statesOrder = ['MOROSO', 'ACTIVO', 'PAUSADO', 'PRECANCELADO', 'CANCELADO', 'PENDIENTE'];
    
    creditos.forEach(c => {
        const estado = c.estado_credito || 'PENDIENTE';
        if (!grouped[estado]) grouped[estado] = [];
        grouped[estado].push(c);
    });

    const estadoConfig = {
        'ACTIVO': { icon: 'fa-check-circle', color: '#10B981', label: 'ACTIVOS', bgColor: 'rgba(16, 185, 129, 0.15)' },
        'MOROSO': { icon: 'fa-exclamation-triangle', color: '#EF4444', label: 'EN MORA', bgColor: 'rgba(239, 68, 68, 0.15)' },
        'PAUSADO': { icon: 'fa-pause-circle', color: '#F59E0B', label: 'PAUSADOS', bgColor: 'rgba(245, 158, 11, 0.15)' },
        'PRECANCELADO': { icon: 'fa-calendar-check', color: '#3B82F6', label: 'PRECANCELADOS', bgColor: 'rgba(59, 130, 246, 0.15)' },
        'CANCELADO': { icon: 'fa-flag-checkered', color: '#6B7280', label: 'CANCELADOS', bgColor: 'rgba(107, 114, 128, 0.15)' },
        'PENDIENTE': { icon: 'fa-clock', color: '#8B5CF6', label: 'PENDIENTES', bgColor: 'rgba(139, 92, 246, 0.15)' }
    };

    let html = '';
    
    statesOrder.forEach(estado => {
        const list = grouped[estado];
        if (list && list.length > 0) {
            const config = estadoConfig[estado] || { icon: 'fa-folder', color: '#9CA3AF', label: estado, bgColor: 'rgba(156, 163, 175, 0.15)' };
            
            const listHtml = list.map(c => `
                <div class="lite-credit-card" onclick="showLiteCreditDetails('${c.id_credito}')">
                    <div class="lite-credit-header">
                        <div class="lite-credit-code">
                            <i class="fas fa-file-invoice-dollar" style="color: var(--gold);"></i>
                            <span>${c.codigo_credito}</span>
                        </div>
                        <div style="text-align: right;">
                            <div class="lite-credit-amount">$${parseFloat(c.capital).toLocaleString('es-EC', { minimumFractionDigits: 2 })}</div>
                            <div style="font-size: 0.85rem; color: var(--success); font-weight: 700;">
                                <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 400;">Cuota:</span> 
                                $${parseFloat(c.cuota_con_ahorro || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>
                    <div style="margin-bottom: 0.5rem;">
                        <div style="font-weight: 700; color: var(--text-primary); font-size: 0.9rem;">${c.socio?.nombre || 'Socio No Encontrado'}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">${c.socio?.cedula || '---'}</div>
                    </div>
                    <div class="lite-credit-status" style="justify-content: space-between; width: 100%;">
                         <span class="lite-status-badge badge-${c.estado_credito?.toLowerCase()}">${c.estado_credito}</span>
                         <button class="lite-btn-pay-inline" onclick="event.stopPropagation(); window.handleQuickCreditPayment('${c.id_credito}', this)">
                            <i class="fas fa-dollar-sign"></i> Pagar
                         </button>
                    </div>
                    <div class="lite-credit-footer">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-calendar-alt"></i>
                            <span>${c.fecha_desembolso ? new Date(c.fecha_desembolso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</span>
                        </div>
                        <div style="margin-left: auto; font-weight: 700; color: var(--primary);">
                            <i class="fas fa-layer-group" style="font-size: 0.7rem; opacity: 0.6;"></i>
                            ${c.cuotas_pagadas || 0}/${c.plazo || 0}
                        </div>
                    </div>
                </div>
            `).join('');

            html += `
                <div class="lite-status-group" data-estado="${estado}">
                    <div class="lite-section-header" style="--section-color: ${config.color}; --section-bg: ${config.bgColor};">
                        <div class="lite-header-info">
                            <i class="fas ${config.icon}"></i>
                            <span class="title">${config.label}</span>
                            <span class="count">${list.length}</span>
                        </div>
                        <button class="lite-search-trigger" onclick="toggleLiteSearch(event, this)">
                            <i class="fas fa-search"></i>
                        </button>
                        <div class="lite-header-search-box">
                            <input type="text" placeholder="Buscar en todos..." 
                                   oninput="filterLiteCreditos(this.value)"
                                   onfocus="this.select()">
                            <button class="lite-search-close" onclick="closeLiteSearch(event, this)">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                    <div class="lite-cards-container">
                        ${listHtml}
                    </div>
                </div>
            `;
        }
    });

    container.innerHTML = html;

    // Configurar Observer para detectar cuando el header se queda "pegado" (sticky)
    // Esto permite mostrar la lupa solo cuando está en el tope
    const scrollContainer = document.querySelector('.main-content');
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                // Al estar a top: 0px y usar rootMargin -1px, si el header está en el tope (y=0),
                // su ratio será < 1 porque 1px quedará fuera del área de observación.
                // Esto hace que la lupa aparezca por defecto sin scrollear.
                const isAtTop = entry.boundingClientRect.top <= (entry.rootBounds?.top || 0) + 10;
                const isStuck = isAtTop && entry.intersectionRatio < 1;
                
                if (entry.target.classList.contains('is-stuck') !== isStuck) {
                    entry.target.classList.toggle('is-stuck', isStuck);
                }
            });
        },
        { 
            root: scrollContainer,
            threshold: [1.0],
            rootMargin: '-1px 0px 0px 0px' 
        }
    );

    document.querySelectorAll('.lite-section-header').forEach(header => {
        observer.observe(header);
    });
}

function filterLiteCreditos(term) {
    const search = term.toLowerCase();
    const activeSearchHeader = document.querySelector('.lite-section-header.searching');
    const activeGroup = activeSearchHeader?.closest('.lite-status-group');
    
    // Búsqueda global (se aplica a todos los grupos)
    document.querySelectorAll('.lite-status-group').forEach(group => {
        let hasVisibleCards = false;
        
        group.querySelectorAll('.lite-credit-card').forEach(card => {
            const text = card.textContent.toLowerCase();
            const matches = search.length === 0 || text.includes(search);
            card.style.display = matches ? 'block' : 'none';
            if (matches) hasVisibleCards = true;
        });

        // Visibilidad del Grupo: 
        // Si hay búsqueda: mostrar solo si tiene coincidencias (o es el grupo del buscador)
        // Si NO hay búsqueda: pero el buscador está abierto, mostrar todos los grupos
        if (activeSearchHeader) {
            if (search.length === 0) {
                group.style.display = 'block';
            } else {
                group.style.display = (hasVisibleCards || group === activeGroup) ? 'block' : 'none';
            }
        } else {
            // Estado normal (sin buscador)
            group.style.display = 'block';
        }

        // Visibilidad del Header:
        // Si el buscador está abierto, solo se muestra el header del buscador activo
        const header = group.querySelector('.lite-section-header');
        if (activeSearchHeader) {
            header.style.display = (header === activeSearchHeader) ? 'flex' : 'none';
        } else {
            header.style.display = 'flex';
        }
    });
}

function toggleLiteSearch(event, btn) {
    event.stopPropagation();
    const header = btn.closest('.lite-section-header');
    const scrollContainer = document.querySelector('.main-content');
    
    // Modo Inmersivo de BÃºsqueda
    document.body.classList.add('searching-mode');
    header.classList.add('searching');
    if (scrollContainer) {
        scrollContainer.classList.add('searching-active');
        scrollContainer.scrollTop = 0; // Volvemos al inicio para ver resultados desde arriba
    }
    
    filterLiteCreditos('');

    const input = header.querySelector('input');
    setTimeout(() => input.focus(), 100);
}

function closeLiteSearch(event, btn) {
    event.stopPropagation();
    const header = btn.closest('.lite-section-header');
    const scrollContainer = document.querySelector('.main-content');

    document.body.classList.remove('searching-mode');
    header.classList.remove('searching');
    if (scrollContainer) scrollContainer.classList.remove('searching-active');
    
    // Restauramos visibilidad completa
    document.querySelectorAll('.lite-status-group').forEach(g => {
        g.style.display = 'block';
        g.querySelector('.lite-section-header').style.display = 'flex';
        g.querySelectorAll('.lite-credit-card').forEach(card => card.style.display = 'block');
    });

    const input = header.querySelector('input');
    input.value = '';
    filterLiteCreditos('');
}

function showLiteCreditDetails(id) {
    const c = liteCreditosData.find(item => item.id_credito === id);
    if (!c) return;

    document.getElementById('lite-det-codigo').textContent = c.codigo_credito;
    document.getElementById('lite-det-socio').textContent = c.socio?.nombre || 'Socio No Encontrado';

    const cuotasPagadas = c.cuotas_pagadas || 0;
    const plazo = c.plazo || 1;
    const pct = Math.round((cuotasPagadas / plazo) * 100);

    document.getElementById('lite-det-cuotas').textContent = `${cuotasPagadas}/${plazo} cuotas`;
    document.getElementById('lite-det-pct').textContent = `${pct}%`;
    document.getElementById('lite-progreso-bar').style.width = `${pct}%`;

    document.getElementById('lite-det-cuota').textContent = `$${parseFloat(c.cuota_con_ahorro || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}`;
    document.getElementById('lite-det-capital').textContent = `$${parseFloat(c.capital || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}`;

    const estadoEl = document.getElementById('lite-det-estado');
    if (estadoEl) {
        estadoEl.textContent = c.estado_credito;
        estadoEl.className = `lite-det-status badge-${c.estado_credito?.toLowerCase()}`;
    }

    // Nuevos campos
    const fechaDes = c.fecha_desembolso ? new Date(c.fecha_desembolso).toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }) : '---';
    document.getElementById('lite-det-fecha-val').textContent = fechaDes;

    // Calcular próximo vencimiento
    if (c.fecha_primer_pago) {
        const nextDate = new Date(c.fecha_primer_pago);
        nextDate.setMonth(nextDate.getMonth() + (c.cuotas_pagadas || 0));
        document.getElementById('lite-det-vencimiento').textContent = nextDate.toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });
    } else {
        document.getElementById('lite-det-vencimiento').textContent = 'No definido';
    }

    // Botón WhatsApp (Especial para Morosos)
    const btnWhatsapp = document.getElementById('btn-whatsapp-socio');
    if (btnWhatsapp) {
        if (c.estado_credito === 'MOROSO' && c.socio?.whatsapp) {
            btnWhatsapp.style.display = 'flex';
            btnWhatsapp.onclick = () => {
                // Cálculo de días de mora
                const nextDate = new Date(c.fecha_primer_pago);
                nextDate.setMonth(nextDate.getMonth() + (c.cuotas_pagadas || 0));
                const today = new Date();
                const diffTime = Math.abs(today - nextDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                let persuasividad = "";
                if (diffDays <= 5) {
                    persuasividad = "un pequeño retraso";
                } else if (diffDays <= 10) {
                    persuasividad = "un retraso considerable";
                } else {
                    persuasividad = "un retraso crítico";
                }

                const msg = encodeURIComponent(
                    `*INKA CORP - NOTIFICACIÓN DE PAGO*\n\n` +
                    `Hola *${c.socio.nombre}*, esperamos que te encuentres bien.\n\n` +
                    `Te escribimos para informarte que tu crédito *${c.codigo_credito}* presenta ${persuasividad} de *${diffDays} días* (vencía el ${nextDate.toLocaleDateString('es-EC')}).\n\n` +
                    `Entendemos que pueden surgir imprevistos, por lo que te invitamos a cancelar tu cuota de *$${parseFloat(c.cuota_con_ahorro).toFixed(2)}* lo antes posible para evitar recargos adicionales por mora.\n\n` +
                    `Agradecemos de antemano tu compromiso para ponerte al día y mantener tu historial impecable.\n\n` +
                    `¿A qué hora podrías realizar el depósito hoy?`
                );
                const phone = String(c.socio.whatsapp).replace(/^0/, '');
                window.open(`https://wa.me/593${phone}?text=${msg}`, '_blank');
            };
        } else {
            btnWhatsapp.style.display = 'none';
        }
    }

    document.getElementById('lite-det-fecha').textContent = `Desembolso: ${c.fecha_desembolso ? new Date(c.fecha_desembolso).toLocaleDateString('es-EC') : '--/--/----'}`;

    // Botón Pagar en Modal
    const btnPagar = document.getElementById('btn-pagar-credito');
    if (btnPagar) {
        if (c.estado_credito !== 'CANCELADO') {
            btnPagar.style.display = 'flex';
            btnPagar.onclick = () => window.handleQuickCreditPayment(id, btnPagar);
        } else {
            btnPagar.style.display = 'none';
        }
    }

    window.currentCreditoId = id;
    if (typeof openLiteModal === 'function') openLiteModal('credito-lite-modal');
}

let currentPaymentCuotas = []; 
let currentSelectedReceiptFile = null;

/**
 * Abre el modal de pago completo para móvil
 */
window.openPaymentModalMobile = async function(detalleId, btn) {
    if (btn) btn.classList.add('btn-loading');
    
    try {
        const supabase = window.getSupabaseClient();
        const id = window.currentCreditoId;
        const c = liteCreditosData.find(item => item.id_credito === id);
        if (!c) return;

        // Cargar cuota inicial
        const { data: cuota, error } = await supabase
            .from('ic_creditos_amortizacion')
            .select('*')
            .eq('id_detalle', detalleId)
            .single();

        if (error) throw error;

        // Obtener consecutivas
        currentPaymentCuotas = await getConsecutiveUnpaidInstallmentsLite(id, detalleId);

        // Llenar datos básicos
        document.getElementById('pago-lite-credito-codigo').textContent = `COD: ${c.codigo_credito}`;
        document.getElementById('pago-lite-socio-nombre').textContent = c.socio?.nombre || 'Socio';
        
        // Poblar select de cuotas
        const select = document.getElementById('pago-lite-cuotas-select');
        select.innerHTML = currentPaymentCuotas.map((_, idx) => {
            const count = idx + 1;
            const endNum = currentPaymentCuotas[0].numero_cuota + idx;
            const total = currentPaymentCuotas.slice(0, count).reduce((sum, item) => sum + parseFloat(item.cuota_total), 0);
            
            if (count === 1) {
                return `<option value="${count}">Cuota #${currentPaymentCuotas[0].numero_cuota} ($${total.toFixed(2)})</option>`;
            } else {
                return `<option value="${count}">${count} Cuotas - Hasta #${endNum} ($${total.toFixed(2)})</option>`;
            }
        }).join('');

        // Reset inputs
        const fechaInput = document.getElementById('pago-lite-fecha');
        // Fecha actual en formato YYYY-MM-DD para Ecuador
        const now = new Date();
        const offset = -5; // Ecuador UTC-5
        const ecDate = new Date(now.getTime() + (offset * 3600000));
        fechaInput.value = now.toISOString().split('T')[0];
        
        document.getElementById('pago-lite-referencia').value = '';
        const refInput = document.getElementById('pago-lite-referencia');
        if (refInput) {
            refInput.readOnly = false;
            refInput.style.background = "";
        }
        window.clearLiteReceipt();

        // Handlers
        select.onchange = updateMoraYTotalLite;
        fechaInput.onchange = updateMoraYTotalLite;
        
        const montoInput = document.getElementById('pago-lite-monto-personalizado');
        montoInput.oninput = updateMoraYTotalLite;
        montoInput.onblur = () => {
            const isConvenio = document.getElementById('pago-lite-convenio-toggle').checked;
            if (isConvenio) {
                const count = parseInt(select.value) || 1;
                const cuotasSeleccionadas = currentPaymentCuotas.slice(0, count);
                const montoBase = cuotasSeleccionadas.reduce((sum, c) => sum + parseFloat(c.cuota_total), 0);
                const valorActual = parseFloat(montoInput.value) || 0;

                if (valorActual < (montoBase - 0.01)) {
                    Swal.fire({
                        title: 'Monto fuera de rango',
                        text: `No puedes cobrar un monto menor a la cuota base ($${montoBase.toFixed(2)}).`,
                        icon: 'warning',
                        confirmButtonText: 'Aceptar',
                        confirmButtonColor: '#0B4E32',
                        target: document.getElementById('modal-registro-pago-credito')
                    }).then(() => {
                        montoInput.value = montoBase.toFixed(2);
                        updateMoraYTotalLite();
                    });
                }
            }
        };

        document.getElementById('pago-lite-convenio-toggle').onchange = handleConvenioToggleLite;
        document.getElementById('pago-lite-file-input').onchange = (e) => handleLiteReceiptSelect(e.target);
        document.getElementById('btn-lite-confirmar-pago').onclick = confirmarPagoLite;

        // Reset convenio
        const convenioToggle = document.getElementById('pago-lite-convenio-toggle');
        convenioToggle.checked = false;
        document.getElementById('pago-lite-monto-personalizado-container').style.display = 'none';

        // Primera actualización de totales
        updateMoraYTotalLite();

        if (typeof openLiteModal === 'function') openLiteModal('modal-registro-pago-credito');

    } catch (error) {
        console.error('Error opening payment modal:', error);
        if (window.Swal) Swal.fire('Error', 'No se pudieron cargar los datos del pago', 'error');
    } finally {
        if (btn) btn.classList.remove('btn-loading');
    }
}

/**
 * Actualiza los cálculos de mora y totales en tiempo real
 */
function updateMoraYTotalLite() {
    const count = parseInt(document.getElementById('pago-lite-cuotas-select').value) || 1;
    const fechaPago = document.getElementById('pago-lite-fecha').value;
    
    const cuotasSeleccionadas = currentPaymentCuotas.slice(0, count);
    const montoBase = cuotasSeleccionadas.reduce((sum, c) => sum + parseFloat(c.cuota_total), 0);
    
    // Cálculo de mora (usando lógica simplificada para móvil)
    let totalMora = 0;
    let totalDiasMora = 0;
    
    cuotasSeleccionadas.forEach(cuota => {
        const moraInfo = calcularMoraLite(cuota.fecha_vencimiento, fechaPago);
        if (moraInfo.estaEnMora) {
            totalMora += moraInfo.montoMora;
            totalDiasMora += moraInfo.diasMora;
        }
    });

    // Actualizar UI
    document.getElementById('pago-lite-monto-base').textContent = `$${montoBase.toFixed(2)}`;
    const moraRow = document.getElementById('pago-lite-mora-row');
    if (totalMora > 0) {
        moraRow.style.display = 'flex';
        document.getElementById('pago-lite-dias-mora').textContent = totalDiasMora;
        document.getElementById('pago-lite-monto-mora').textContent = `$${totalMora.toFixed(2)}`;
    } else {
        moraRow.style.display = 'none';
    }

    const totalFinal = montoBase + totalMora;
    document.getElementById('pago-lite-total-final').textContent = `$${totalFinal.toFixed(2)}`;

    // Manejo de Convenio dinámico (Móvil)
    const isConvenio = document.getElementById('pago-lite-convenio-toggle').checked;
    const hintContainer = document.getElementById('pago-lite-min-hint');
    const hintValue = document.getElementById('pago-lite-min-valor');
    const noteInput = document.getElementById('pago-lite-referencia');
    const montoInput = document.getElementById('pago-lite-monto-personalizado');

    if (isConvenio) {
        if (hintContainer) hintContainer.style.display = 'block';
        if (hintValue) hintValue.textContent = `$${montoBase.toFixed(2)}`;
        
        let montoPagar = parseFloat(montoInput.value) || 0;
        
        // Solo forzar el valor base automáticamente si el usuario NO está escribiendo en este campo
        // Esto permite que el usuario borre y escriba libremente, pero ajusta si cambia cuotas.
        if (document.activeElement !== montoInput) {
            if (montoPagar < (montoBase - 0.01)) {
                montoPagar = montoBase;
                montoInput.value = montoBase.toFixed(2);
            }
        }
        
        const descuentMora = totalFinal - montoPagar;
        
        if (noteInput) {
            noteInput.value = `[CONVENIO DE PAGO] Orig: $${totalFinal.toFixed(2)} | Cobrado: $${montoPagar.toFixed(2)} | Desc. Mora: $${descuentMora.toFixed(2)}`.trim();
        }
    } else {
        if (hintContainer) hintContainer.style.display = 'none';
        if (montoInput) montoInput.value = totalFinal.toFixed(2);
    }
}

/**
 * Maneja el toggle de Convenio de Pago
 */
async function handleConvenioToggleLite() {
    const toggle = document.getElementById('pago-lite-convenio-toggle');
    const container = document.getElementById('pago-lite-monto-personalizado-container');
    const inputMonto = document.getElementById('pago-lite-monto-personalizado');
    const refInput = document.getElementById('pago-lite-referencia');

    if (toggle.checked) {
        if (window.Swal) {
            const result = await Swal.fire({
                title: '¿Activar Convenio?',
                text: 'Se permitirá un monto inferior. La nota se generará automáticamente.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí',
                cancelButtonText: 'No',
                confirmButtonColor: '#0B4E32',
                target: document.getElementById('modal-registro-pago-credito') // Forzar que salga sobre el modal
            });

            if (result.isConfirmed) {
                container.style.display = 'block';
                if (refInput) {
                    refInput.readOnly = true;
                    refInput.style.background = "#f1f5f9";
                }
                updateMoraYTotalLite();
                setTimeout(() => inputMonto.focus(), 300);
            } else {
                toggle.checked = false;
                container.style.display = 'none';
            }
        }
    } else {
        container.style.display = 'none';
        if (refInput) {
            refInput.readOnly = false;
            refInput.value = "";
            refInput.style.background = "";
        }
    }
}

/**
 * Maneja la selección de foto/archivo
 */
function handleLiteReceiptSelect(input) {
    const file = input.files[0];
    if (!file) return;

    // Quitar error visual si existía
    const uploadZone = document.getElementById('pago-lite-upload-container');
    if (uploadZone) {
        uploadZone.style.borderColor = '';
        uploadZone.style.backgroundColor = '';
    }

    if (!file.type.startsWith('image/')) {
        if (window.Swal) Swal.fire('Error', 'Por favor selecciona una imagen', 'warning');
        return;
    }

    currentSelectedReceiptFile = file;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('pago-lite-preview');
        preview.src = e.target.result;
        preview.style.display = 'block';
        document.getElementById('pago-lite-upload-placeholder').style.display = 'none';
        document.getElementById('pago-lite-remove-file').style.display = 'block';
    };
    reader.readAsDataURL(file);
}

window.clearLiteReceipt = function() {
    currentSelectedReceiptFile = null;
    document.getElementById('pago-lite-file-input').value = '';
    document.getElementById('pago-lite-preview').style.display = 'none';
    document.getElementById('pago-lite-upload-placeholder').style.display = 'block';
    document.getElementById('pago-lite-remove-file').style.display = 'none';
}

/**
 * Procesa el pago final en Supabase
 */
async function confirmarPagoLite() {
    const btn = document.getElementById('btn-lite-confirmar-pago');
    const originalContent = btn.innerHTML;
    
    try {
        const count = parseInt(document.getElementById('pago-lite-cuotas-select').value);
        const fechaPago = document.getElementById('pago-lite-fecha').value;
        const metodo = document.getElementById('pago-lite-metodo').value;
        const inputNota = document.getElementById('pago-lite-referencia');
        const referenciaOriginal = inputNota.value;
        const idCredito = window.currentCreditoId;
        
        const isConvenio = document.getElementById('pago-lite-convenio-toggle').checked;
        const montoInput = document.getElementById(isConvenio ? 'pago-lite-monto-personalizado' : 'pago-lite-total-final'); // Referencia visual
        const montoVal = parseFloat(document.getElementById('pago-lite-monto-personalizado').value);

        // Limpiar errores previos
        const fields = [
            { id: 'pago-lite-fecha', type: 'input' },
            { id: 'pago-lite-metodo', type: 'input' },
            { id: 'pago-lite-referencia', type: 'input' },
            { id: 'pago-lite-upload-container', type: 'container' }
        ];
        if (isConvenio) fields.push({ id: 'pago-lite-monto-personalizado', type: 'input' });

        fields.forEach(f => {
            const el = document.getElementById(f.id);
            if (el) el.style.border = '';
        });

        let hasError = false;
        if (!fechaPago) { document.getElementById('pago-lite-fecha').style.border = '2px solid #ef4444'; hasError = true; }
        if (!metodo) { document.getElementById('pago-lite-metodo').style.border = '2px solid #ef4444'; hasError = true; }
        if (!document.getElementById('pago-lite-referencia').value) { document.getElementById('pago-lite-referencia').style.border = '2px solid #ef4444'; hasError = true; }
        if (isConvenio && (isNaN(montoVal) || montoVal <= 0)) { 
            document.getElementById('pago-lite-monto-personalizado').style.border = '2px solid #ef4444'; 
            hasError = true; 
        }

        if (!currentSelectedReceiptFile) {
            const uploadZone = document.getElementById('pago-lite-upload-container');
            if (uploadZone) {
                uploadZone.style.border = '2px solid #ef4444';
                uploadZone.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
                uploadZone.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.2)';
            }
            hasError = true;
        } else {
            const uploadZone = document.getElementById('pago-lite-upload-container');
            if (uploadZone) {
                uploadZone.style.border = '';
                uploadZone.style.borderColor = '';
                uploadZone.style.backgroundColor = '';
                uploadZone.style.boxShadow = '';
            }
        }

        if (hasError) {
            if (window.Swal) Swal.fire({
                title: 'Campos Requeridos',
                text: 'Por favor complete todos los campos resaltados en rojo y suba el comprobante.',
                icon: 'warning',
                target: document.getElementById('modal-registro-pago-credito')
            });
            return;
        }

        // Validación de monto base en convenio
        const cuotasSeleccionadas = currentPaymentCuotas.slice(0, count);
        const montoBaseTotal = cuotasSeleccionadas.reduce((sum, c) => sum + parseFloat(c.cuota_total), 0);

        if (isConvenio) {
            if (montoVal < montoBaseTotal) {
                if (window.Swal) {
                    await Swal.fire({
                        title: 'Monto Insuficiente',
                        text: `No puedes cobrar un monto menor a la cuota base ($${montoBaseTotal.toFixed(2)}).`,
                        icon: 'warning',
                        confirmButtonText: 'Aceptar',
                        confirmButtonColor: '#0B4E32',
                        target: document.getElementById('modal-registro-pago-credito')
                    });
                    document.getElementById('pago-lite-monto-personalizado').value = montoBaseTotal.toFixed(2);
                    updateMoraYTotalLite();
                }
                return;
            }
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando Pago...';

        const supabase = window.getSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();

        // 1. Comprimir y subir imagen
        let finalFile = currentSelectedReceiptFile;
        if (typeof compressImage === 'function') {
            const result = await compressImage(currentSelectedReceiptFile);
            finalFile = result.blob;
        }

        const fileName = `${idCredito}_${Date.now()}.webp`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('inkacorp')
            .upload(`comprobantes/${fileName}`, finalFile, {
                contentType: 'image/webp'
            });

        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage.from('inkacorp').getPublicUrl(`comprobantes/${fileName}`);

        // 2. Registrar cuota por cuota
        const cuotasAPagar = currentPaymentCuotas.slice(0, count);
        const montoBaseCalculado = cuotasAPagar.reduce((sum, c) => sum + parseFloat(c.cuota_total || 0), 0);
        const excedenteConvenio = isConvenio ? (montoVal - montoBaseCalculado) : 0;
        
        // Calcular total original para las observaciones del convenio
        let totalOriginal = 0;
        cuotasAPagar.forEach(c => {
            const m = calcularMoraLite(c.fecha_vencimiento, fechaPago);
            totalOriginal += (parseFloat(c.cuota_total || 0) + m.montoMora);
        });

        for (let i = 0; i < cuotasAPagar.length; i++) {
            const cuota = cuotasAPagar[i];
            const moraInfo = calcularMoraLite(cuota.fecha_vencimiento, fechaPago);
            const cuotaBaseVal = parseFloat(cuota.cuota_total || 0);
            const montoOriginalCuota = cuotaBaseVal + moraInfo.montoMora;
            
            let montoARegistrar;
            let obsCuota = moraInfo.estaEnMora ? `Mora: $${moraInfo.montoMora.toFixed(2)} (${moraInfo.diasMora} días)` : 'Pago a tiempo';

            if (isConvenio) {
                // El excedente sobre la base se atribuye todo a la primera cuota registrada
                montoARegistrar = (i === 0) ? (cuotaBaseVal + excedenteConvenio) : cuotaBaseVal;
                
                const descuento = totalOriginal - montoVal;
                obsCuota = `[CONVENIO DE PAGO] Orig. Total: $${totalOriginal.toFixed(2)} | Pagado: $${montoVal.toFixed(2)} | Descto: $${descuento.toFixed(2)}. ${obsCuota}`;
            } else {
                montoARegistrar = montoOriginalCuota;
            }

            // Evitar registros de monto 0 o negativo que violen el check de DB
            if (montoARegistrar <= 0) {
                console.warn(`[Mobile] Saltando registro de cuota #${cuota.numero_cuota} por monto <= 0`);
                continue;
            }

            const { error: errorPago } = await supabase
                .from('ic_creditos_pagos')
                .insert({
                    id_detalle: cuota.id_detalle,
                    id_credito: idCredito,
                    fecha_pago: fechaPago,
                    monto_pagado: montoARegistrar,
                    metodo_pago: metodo,
                    referencia_pago: isConvenio ? 'CONVENIO' : referenciaOriginal,
                    observaciones: obsCuota,
                    comprobante_url: publicUrl,
                    cobrado_por: window.currentUser?.id || null
                });

            if (errorPago) throw errorPago;
        }

        if (window.Swal) {
            await Swal.fire({
                icon: 'success',
                title: 'Pago Registrado',
                text: `${count} cuota(s) procesada(s) exitosamente.`,
                timer: 2000
            });
        }

        closeLiteModal('modal-registro-pago-credito');
        closeLiteModal('modal-amortizacion-credito');
        closeLiteModal('credito-lite-modal');
        
        // Recargar datos
        await fetchLiteCreditos();

    } catch (error) {
        console.error('Error procesando pago:', error);
        if (window.Swal) Swal.fire('Error', error.message || 'No se pudo registrar el pago', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

/**
 * Helpers lógicos (Copiados de la versión PC para independencia)
 */
async function getConsecutiveUnpaidInstallmentsLite(creditoId, startDetalleId) {
    const supabase = window.getSupabaseClient();
    const { data: allCuotas } = await supabase
        .from('ic_creditos_amortizacion')
        .select('*')
        .eq('id_credito', creditoId)
        .order('numero_cuota', { ascending: true });

    if (!allCuotas) return [];
    const startIndex = allCuotas.findIndex(c => c.id_detalle === startDetalleId);
    if (startIndex === -1) return [];

    const consecutive = [];
    for (let i = startIndex; i < allCuotas.length; i++) {
        if (allCuotas[i].estado_cuota === 'PENDIENTE' || allCuotas[i].estado_cuota === 'VENCIDO') {
            consecutive.push(allCuotas[i]);
        } else {
            break;
        }
    }
    return consecutive;
}

function calcularMoraLite(fechaVencimiento, fechaPagoStr) {
    if (!fechaVencimiento) return { diasMora: 0, montoMora: 0, estaEnMora: false };
    
    // Normalizar fechas a mediodía para evitar problemas de timezone
    const fVenc = new Date(fechaVencimiento + 'T12:00:00');
    const fPago = new Date(fechaPagoStr + 'T12:00:00');
    
    const diffTime = fPago.getTime() - fVenc.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return { diasMora: 0, montoMora: 0, estaEnMora: false };
    
    return {
        diasMora: diffDays,
        montoMora: diffDays * 2, // $2 por día de mora
        estaEnMora: true
    };
}

/**
 * Muestra el modal informativo de confirmación de pago
 */
window.showConfirmacionPagoCredito = function(valor) {
    // Ya no usamos el informativo, usamos el PRO
    // Pero necesitamos el detalleId. Si viene de la tabla, lo tenemos.
    // Si viene del botón rápido, buscamos la próxima cuota.
    alert('Buscando próxima cuota para pago...');
}

/**
 * Maneja el inicio del proceso de pago (Abriría el modal de pago de créditos)
 */
async function handleQuickCreditPayment(id, btn) {
    const c = liteCreditosData.find(item => item.id_credito === id);
    if (!c) return;

    if (btn) btn.classList.add('btn-loading');

    try {
        const supabase = window.getSupabaseClient();
        const { data: cuotas } = await supabase
            .from('ic_creditos_amortizacion')
            .select('id_detalle')
            .eq('id_credito', id)
            .in('estado_cuota', ['PENDIENTE', 'VENCIDO'])
            .order('numero_cuota', { ascending: true })
            .limit(1);

        if (cuotas && cuotas.length > 0) {
            window.openPaymentModalMobile(cuotas[0].id_detalle);
        } else {
            if (window.Swal) Swal.fire('Info', 'Este crédito no tiene cuotas pendientes', 'info');
        }
    } catch (e) {
        console.error(e);
    } finally {
        if (btn) btn.classList.remove('btn-loading');
    }
}

/**
 * Muestra el plan de pagos (amortización) del crédito actual
 */
async function showCreditoAmortization() {
    const id = window.currentCreditoId;
    if (!id) {
        console.warn('showCreditoAmortization: No hay ID de crédito seleccionado');
        return;
    }

    const c = liteCreditosData.find(item => item.id_credito === id);
    if (!c) {
        console.error('showCreditoAmortization: Crédito no encontrado en caché local');
        return;
    }

    // Configurar cabecera del modal
    const codigoEl = document.getElementById('lite-amort-codigo');
    const socioEl = document.getElementById('lite-amort-socio');
    if (codigoEl) codigoEl.textContent = c.codigo_credito;
    if (socioEl) socioEl.textContent = c.socio?.nombre || 'Socio';

    const tbody = document.getElementById('lite-amortization-credito-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem;"><i class="fas fa-spinner fa-spin"></i> Cargando plan...</td></tr>';

    if (typeof openLiteModal === 'function') openLiteModal('modal-amortizacion-credito');

    try {
        const supabase = window.getSupabaseClient();
        const { data, error } = await supabase
            .from('ic_creditos_amortizacion')
            .select('*')
            .eq('id_credito', id)
            .order('numero_cuota', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem;">No se encontró el plan de pagos.</td></tr>';
            return;
        }

        let nextToPayFound = false;

        tbody.innerHTML = data.map(cuota => {
            const isPaid = cuota.estado_cuota === 'PAGADO';
            const fecha = cuota.fecha_vencimiento ? new Date(cuota.fecha_vencimiento + 'T12:00:00') : null;
            const fechaTxt = fecha ? fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '---';
            
            let actionHtml = '';
            if (!isPaid && !nextToPayFound) {
                // Esta es la primera cuota no pagada (la siguiente a pagar)
                actionHtml = `<button class="lite-btn-pay" onclick="window.openPaymentModalMobile('${cuota.id_detalle}', this)"><i class="fas fa-dollar-sign"></i></button>`;
                nextToPayFound = true;
            } else if (isPaid) {
                // Cuota pagada: Botón de ojo para ver recibo
                actionHtml = `<button class="lite-btn-view" onclick="window.showReceiptDetailMobile('${cuota.id_detalle}')" style="background: rgba(16, 185, 129, 0.1); color: #10b981; border: none; width: 32px; height: 32px; border-radius: 8px; cursor: pointer;"><i class="fas fa-eye"></i></button>`;
            }

            return `
                <tr class="${isPaid ? 'lite-row-paid' : ''}">
                    <td style="font-weight:700">${cuota.numero_cuota}</td>
                    <td>${fechaTxt}</td>
                    <td style="text-align: center;">
                        ${isPaid ? 
                            '<span class="lite-status-pill pill-pagado">PAGADO</span>' : 
                            '<span class="lite-status-pill pill-pendiente">PENDIENTE</span>'}
                    </td>
                    <td style="text-align: right;">
                        ${actionHtml}
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('Error fetching amortization:', error);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 2rem; color: var(--error);">Error: ${error.message}</td></tr>`;
    }
}

/**
 * Muestra el detalle del recibo en móviles
 */
async function showReceiptDetailMobile(detalleId) {
    if (typeof openLiteModal === 'function') openLiteModal('modal-pago-detalle-mobile');
    
    const container = document.getElementById('lite-pago-detalle-container');
    if (!container) return;

    container.innerHTML = `
        <div style="text-align: center; padding: 3rem;">
            <div class="lite-spinner"></div>
            <p style="margin-top:1rem; color: #64748b; font-size: 0.9rem;">Obteniendo recibo...</p>
        </div>
    `;

    try {
        const supabase = window.getSupabaseClient();
        const { data: pago, error } = await supabase
            .from('ic_creditos_pagos')
            .select(`
                *,
                cobrador:ic_users!cobrado_por ( id, nombre ),
                amortizacion:ic_creditos_amortizacion (
                    id_detalle,
                    numero_cuota,
                    credito:ic_creditos (
                        codigo_credito,
                        socio:ic_socios (
                            nombre
                        )
                    )
                )
            `)
            .eq('id_detalle', detalleId)
            .maybeSingle();

        if (error) throw error;
        if (!pago) {
            container.innerHTML = '<div style="text-align:center; padding: 2rem; color: #64748b;">No se encontró el registro del pago.</div>';
            return;
        }

        const infoSocio = pago.amortizacion?.credito?.socio?.nombre || 'Socio';
        const infoCredito = pago.amortizacion?.credito?.codigo_credito || '---';
        const infoCobrador = pago.cobrador?.nombre || 'Admin (Sync)';

        container.innerHTML = `
            <div class="receipt-card-mobile">
                <!-- Estilo de Tira de Pago / Recibo -->
                <div class="receipt-luxury-header" style="text-align: center; border-bottom: 2px dashed #e2e8f0; padding-bottom: 1.5rem; margin-bottom: 1.5rem;">
                    <div style="font-size: 0.7rem; color: #94a3b8; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 0.5rem;">Comprobante Digital</div>
                    <div style="font-size: 1.1rem; font-weight: 800; color: #1e293b; margin-bottom: 0.25rem;">${infoCredito}</div>
                    <div style="color: #64748b; font-size: 0.85rem; font-weight: 500;">${infoSocio}</div>
                </div>

                <div class="receipt-amount-section" style="text-align: center; margin-bottom: 2rem; background: #f0fdf4; border-radius: 16px; padding: 1.5rem;">
                    <div style="font-size: 0.8rem; color: #166534; font-weight: 600; margin-bottom: 0.25rem;">VALOR PAGADO</div>
                    <div style="font-size: 2.2rem; font-weight: 900; color: #10b981;">$${pago.monto_pagado.toFixed(2)}</div>
                    <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.5rem; text-transform: lowercase;">vía ${pago.metodo_pago}</div>
                </div>

                <div class="receipt-info-list" style="display: flex; flex-direction: column; gap: 0.85rem;">
                    <div class="receipt-info-item" style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                        <span style="color: #94a3b8;">Recibido por</span>
                        <span style="font-weight: 600; color: #1e293b;">${infoCobrador}</span>
                    </div>
                    <div class="receipt-info-item" style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                        <span style="color: #94a3b8;">Fecha</span>
                        <span style="font-weight: 600; color: #1e293b;">${pago.fecha_pago}</span>
                    </div>
                    <div class="receipt-info-item" style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                        <span style="color: #94a3b8;">Cuota Número</span>
                        <span style="font-weight: 600; color: #1e293b;">#${pago.amortizacion?.numero_cuota || '-'}</span>
                    </div>
                    ${pago.referencia_pago ? `
                    <div class="receipt-info-item" style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                        <span style="color: #94a3b8;">Referencia</span>
                        <span style="font-weight: 600; color: #1e293b;">${pago.referencia_pago}</span>
                    </div>` : ''}
                    
                    ${pago.observaciones ? `
                    <div style="margin-top: 0.5rem; padding: 0.75rem; background: #f8fafc; border-radius: 8px; font-size: 0.85rem; color: #64748b; line-height: 1.4; border-left: 3px solid #cbd5e1;">
                        <strong>Nota:</strong> ${pago.observaciones}
                    </div>` : ''}
                </div>

                ${pago.comprobante_url ? `
                <div class="receipt-image-container" style="margin-top: 2rem; border-top: 1px solid #f1f5f9; padding-top: 1.5rem;">
                    <span style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.8rem; display: block; text-align: center;">EVIDENCIA ADJUNTA</span>
                    <div style="position: relative; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                        <img src="${pago.comprobante_url}" style="width: 100%; display: block;" onclick="window.open('${pago.comprobante_url}', '_blank')">
                        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.5); color: white; padding: 8px; font-size: 0.7rem; text-align: center;">Toca para ampliar</div>
                    </div>
                </div>` : ''}

                <div style="text-align: center; margin-top: 30px; border-top: 1px solid #f1f5f9; padding-top: 15px; margin-bottom: 20px;">
                    <p style="font-size: 0.7rem; color: #cbd5e1;">ID Pago: ${pago.id_pago}</p>
                    <div style="font-size: 0.75rem; font-weight: 700; color: #94a3b8; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <img src="../img/icon-192.png" style="height: 14px; opacity: 0.3;" onerror="this.style.display='none'">
                        INKA CORP SISTEMAS
                    </div>
                </div>
                
                <button class="lite-btn-action success" onclick="closeLiteModal('modal-pago-detalle-mobile')" style="margin-top: 1rem; width: 100%; height: 50px; border-radius: 25px; font-weight: 700;">
                    <i class="fas fa-check"></i> ENTENDIDO
                </button>
            </div>
        `;
    } catch (err) {
        console.error('Error loading receipt mobile:', err);
        container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--error);">Error al cargar recibo.</div>`;
    }
}

// Exponer funciones globales
window.showCreditoAmortization = showCreditoAmortization;
window.showReceiptDetailMobile = showReceiptDetailMobile;

/**
 * sincronizarEstadosMorososLite
 * Identifica créditos vencidos y actualiza su estado a MOROSO en segundo plano.
 */
async function sincronizarEstadosMorososLite(creditos) {
    const hoy = new Date();
    // Normalizar hoy a medianoche para comparación justa por días
    hoy.setHours(0, 0, 0, 0);

    const idsParaActualizar = [];

    creditos.forEach(c => {
        // Ignorar estados finales o ya morosos
        const ignorar = ['CANCELADO', 'PRECANCELADO', 'PAUSADO', 'MOROSO'];
        if (ignorar.includes(c.estado_credito)) return;

        if (!c.fecha_primer_pago) return;

        // Calcular próxima fecha de pago
        const fechaBase = new Date(c.fecha_primer_pago + 'T00:00:00'); // Forzar hora local/Ecuador aproximada
        fechaBase.setMonth(fechaBase.getMonth() + (c.cuotas_pagadas || 0));
        
        // Si la fecha de vencimiento es menor a hoy (ya pasó)
        if (fechaBase < hoy) {
            idsParaActualizar.push(c.id_credito);
            c.estado_credito = 'MOROSO'; // Actualización local inmediata
        }
    });

    if (idsParaActualizar.length > 0) {
        console.log(`[Sync Lite] Detectados ${idsParaActualizar.length} créditos vencidos. Actualizando...`);
        try {
            const supabase = window.getSupabaseClient();
            const { error } = await supabase
                .from('ic_creditos')
                .update({ 
                    estado_credito: 'MOROSO',
                    updated_at: new Date().toISOString()
                })
                .in('id_credito', idsParaActualizar);

            if (error) throw error;
        } catch (err) {
            console.error('[Sync Lite] Error:', err);
        }
    }
}
