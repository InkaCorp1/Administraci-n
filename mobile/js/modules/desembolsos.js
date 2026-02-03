/**
 * Módulo de Desembolsos - Versión Móvil Modular
 */

let creditosData = [];

async function initDesembolsosModule() {
    await loadDesembolsosPendientes();
}

async function loadDesembolsosPendientes() {
    const container = document.getElementById('desembolsos-container');
    const countBadge = document.getElementById('desembolsos-count');
    if (!container) return;

    try {
        const supabase = window.getSupabaseClient();
        const { data: creditosPendientes, error } = await supabase
            .from('ic_creditos')
            .select(`
                id_credito,
                codigo_credito,
                capital,
                plazo,
                cuota_con_ahorro,
                tasa_interes_mensual,
                garante,
                created_at,
                id_socio
            `)
            .eq('estado_credito', 'PENDIENTE')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!creditosPendientes || creditosPendientes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle"></i>
                    <h3>Sin desembolsos pendientes</h3>
                    <p>No hay créditos pendientes de desembolso en este momento.</p>
                </div>
            `;
            if (countBadge) countBadge.textContent = '0';
            return;
        }

        const socioIds = [...new Set(creditosPendientes.map(c => c.id_socio))];
        const { data: socios } = await supabase
            .from('ic_socios')
            .select('idsocio, nombre, cedula, whatsapp')
            .in('idsocio', socioIds);

        creditosPendientes.forEach(credito => {
            credito.socio = socios?.find(s => s.idsocio === credito.id_socio) || {};
        });

        creditosData = creditosPendientes;
        if (countBadge) countBadge.textContent = creditosPendientes.length;

        container.innerHTML = creditosPendientes.map(credito => {
            const socio = credito.socio || {};
            const nombreCompleto = socio.nombre || 'Sin nombre';
            const capitalFormatted = parseFloat(credito.capital).toLocaleString('es-EC', { minimumFractionDigits: 2 });
            const cuotaFormatted = parseFloat(credito.cuota_con_ahorro).toLocaleString('es-EC', { minimumFractionDigits: 2 });

            return `
                <div class="desembolso-card" data-id="${credito.id_credito}">
                    <div class="desembolso-header">
                        <div class="desembolso-socio">
                            <div class="desembolso-nombre">${nombreCompleto}</div>
                            <div class="desembolso-cedula">${socio.cedula || '-'} | ${credito.codigo_credito}</div>
                        </div>
                        <div class="desembolso-monto">
                            <div class="desembolso-monto-valor">$${capitalFormatted}</div>
                            <div class="desembolso-monto-label">Capital</div>
                        </div>
                    </div>
                    <div class="desembolso-info">
                        <div class="desembolso-info-item">
                            <span class="desembolso-info-label">Plazo</span>
                            <span class="desembolso-info-value">${credito.plazo} meses</span>
                        </div>
                        <div class="desembolso-info-item">
                            <span class="desembolso-info-label">Cuota</span>
                            <span class="desembolso-info-value">$${cuotaFormatted}</span>
                        </div>
                        <div class="desembolso-info-item">
                            <span class="desembolso-info-label">Tasa</span>
                            <span class="desembolso-info-value">${credito.tasa_interes_mensual}%</span>
                        </div>
                        <div class="desembolso-info-item">
                            <span class="desembolso-info-label">Garante</span>
                            <span class="desembolso-info-value">${credito.garante ? 'Sí' : 'No'}</span>
                        </div>
                    </div>
                    <div class="desembolso-actions">
                        <button class="desembolso-btn desembolso-btn-docs" onclick="openDocsModal('${credito.id_credito}')">
                            <i class="fas fa-file-pdf"></i> Documentos
                        </button>
                        <button class="desembolso-btn desembolso-btn-action" onclick="desembolsarCredito('${credito.id_credito}')">
                            <i class="fas fa-cloud-upload-alt"></i> Desembolsar
                        </button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading desembolsos:', error);
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Error al cargar</h3>
                    <p>No se pudieron cargar los desembolsos. Intenta de nuevo.</p>
                </div>
            `;
        }
    }
}

async function desembolsarCredito(idCredito) {
    // Aquí puedes implementar el modal para subir el comprobante 
    // o redirigir a la vista de detalle.
    Swal.fire({
        title: '¿Realizar desembolso?',
        text: "Se procesará la solicitud de crédito.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#0B4E32',
        confirmButtonText: 'Sí, continuar'
    }).then((result) => {
        if (result.isConfirmed) {
            // Ejemplo de redirección a la versión PC para completar gestión compleja 
            // o podrías abrir un modal móvil aquí mismo.
            goToDesktopModule('creditos');
        }
    });
}

