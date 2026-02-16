/**
 * Módulo de Aportes Móvil (Versión Lite Optimizada)
 */

let liteAportesData = [];

async function initAportesModule() {
    console.log("Iniciando Módulo Aportes Lite...");
    await fetchAportesMobile();
}

// Exponer globalmente
window.initAportesModule = initAportesModule;
window.openLiteNuevoAporte = openLiteNuevoAporte;

/**
 * Obtiene los aportes de Supabase filtrados para el usuario actual
 */
async function fetchAportesMobile() {
    const listContainer = document.getElementById("lite-aportes-list");
    const totalDisplay = document.getElementById("lite-total-aportes");
    const ultimoDisplay = document.getElementById("lite-ultimo-pago");

    try {
        const supabase = window.getSupabaseClient();
        if (!supabase) return;

        const user = window.currentUser;
        if (!user) return;

        // Consultar aportes del socio logueado (usando cedula como vínculo)
        const { data, error } = await supabase
            .from("ic_socios_aportes")
            .select("*")
            .eq("cedula", user.cedula)
            .order("fecha_aporte", { ascending: false });

        if (error) throw error;

        liteAportesData = data || [];
        renderLiteAportes(liteAportesData);

        // Calcular totales
        const total = liteAportesData.reduce((sum, item) => sum + parseFloat(item.monto || 0), 0);
        if (totalDisplay) totalDisplay.textContent = `$${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

        if (liteAportesData.length > 0 && ultimoDisplay) {
            const ultimaFecha = new Date(liteAportesData[0].fecha_aporte);
            ultimoDisplay.textContent = `${ultimaFecha.getDate()}/${ultimaFecha.getMonth() + 1}`;
        }

    } catch (err) {
        console.error("Error al cargar aportes móvil:", err);
        if (listContainer) {
            listContainer.innerHTML = `<div style="padding: 2rem; text-align: center; color: #ef4444;">Error al cargar datos</div>`;
        }
    }
}

/**
 * Renderiza la lista de aportes en formato pequeño
 */
function renderLiteAportes(data) {
    const container = document.getElementById("lite-aportes-list");
    if (!container) return;

    if (data.length === 0) {
        container.innerHTML = `
            <div style="padding: 3rem 1rem; text-align: center; color: #64748b;">
                <i class="fas fa-history" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                <p>No tienes aportes registrados</p>
            </div>
        `;
        return;
    }

    container.innerHTML = data.map(item => {
        const fecha = new Date(item.fecha_aporte);
        const dia = fecha.getDate();
        const mes = fecha.toLocaleString("es-ES", { month: "short" }).toUpperCase().replace(".", "");

        return `
            <div class="lite-aporte-item" style="display: flex; align-items: center; padding: 1.25rem; border-bottom: 1px solid #f8fafc; gap: 1rem;">
                <div class="date-badge" style="background: #f1f5f9; min-width: 45px; height: 45px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1;">
                    <span style="font-size: 0.65rem; font-weight: 700; color: #64748b;">${mes}</span>
                    <span style="font-size: 1.1rem; font-weight: 800; color: #1e293b;">${dia}</span>
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 700; color: #1e293b; font-size: 0.95rem;">${item.concepto || "Aporte Semanal"}</div>
                    <div style="font-size: 0.8rem; color: #64748b;">${item.modalidad_pago || "Efectivo"}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 800; color: #047857; font-size: 1.05rem;">+$${parseFloat(item.monto).toFixed(2)}</div>
                    <div style="font-size: 0.7rem; color: #94a3b8;">${item.estado || "Completado"}</div>
                </div>
            </div>
        `;
    }).join("");
}

/**
 * Abre el formulario para registrar un nuevo aporte (usando Swal)
 */
async function openLiteNuevoAporte() {
    const { value: formValues } = await Swal.fire({
        title: "Nuevo Aporte",
        customClass: {
            popup: "lite-swal-popup",
            title: "lite-swal-title",
            confirmButton: "lite-swal-confirm"
        },
        html: `
            <div style="text-align: left; display: flex; flex-direction: column; gap: 1rem; padding: 0.5rem 0;">
                <div>
                    <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase;">Monto del Aporte</label>
                    <input id="lite-monto" type="number" step="0.01" class="swal2-input" style="margin: 0; width: 100%; border-radius: 12px; border: 2px solid #e2e8f0;" placeholder="0.00">
                </div>
                <div>
                    <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase;">Modalidad</label>
                    <select id="lite-modalidad" class="swal2-input" style="margin: 0; width: 100%; border-radius: 12px; border: 2px solid #e2e8f0;">
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="TRANSFERENCIA">Transferencia</option>
                        <option value="DEPOSITO">Depósito</option>
                    </select>
                </div>
                <div>
                    <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #64748b; margin-bottom: 0.5rem; text-transform: uppercase;">Concepto (Opcional)</label>
                    <input id="lite-concepto" type="text" class="swal2-input" style="margin: 0; width: 100%; border-radius: 12px; border: 2px solid #e2e8f0;" placeholder="Ej: Aporte semana 1">
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: "Registrar Pago",
        confirmButtonColor: "#047857",
        cancelButtonText: "Cancelar",
        preConfirm: () => {
            const monto = document.getElementById("lite-monto").value;
            if (!monto || parseFloat(monto) <= 0) {
                Swal.showValidationMessage("Ingresa un monto válido");
                return false;
            }
            return {
                monto: parseFloat(monto),
                modalidad: document.getElementById("lite-modalidad").value,
                concepto: document.getElementById("lite-concepto").value || "Aporte Semanal"
            }
        }
    });

    if (formValues) {
        saveLiteAporte(formValues);
    }
}

/**
 * Guarda el aporte en Supabase
 */
async function saveLiteAporte(data) {
    try {
        Swal.fire({
            title: "Procesando...",
            didOpen: () => Swal.showLoading(),
            allowOutsideClick: false
        });

        const supabase = window.getSupabaseClient();
        const user = window.currentUser;

        const nuevoAporte = {
            cedula: user.cedula,
            idsocio: user.idsocio, // Asumiendo que existe en el objeto user
            nombre_socio: user.nombre,
            monto: data.monto,
            fecha_aporte: new Date().toISOString().split("T")[0],
            modalidad_pago: data.modalidad,
            concepto: data.concepto,
            estado: "Pendiente",
            created_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from("ic_socios_aportes")
            .insert([nuevoAporte]);

        if (error) throw error;

        await Swal.fire({
            icon: "success",
            title: "¡Registrado!",
            text: "Tu aporte ha sido enviado para verificación.",
            confirmButtonColor: "#047857"
        });

        fetchAportesMobile(); // Recargar lista

    } catch (err) {
        console.error("Error al guardar aporte:", err);
        Swal.fire("Error", "No se pudo registrar el aporte", "error");
    }
}
