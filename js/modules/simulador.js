/**
 * INKA CORP - Módulo Simulador de Créditos y Pólizas
 * Cálculo de amortización y generación de documentos PDF
 */

// ==========================================
// ESTADO DEL MÓDULO
// ==========================================
let currentSimulationType = 'credito'; // 'credito' o 'poliza'
let simulationData = null;
let amortizacionData = [];

// ==========================================
// INICIALIZACIÓN
// ==========================================
function initSimuladorModule() {
    console.log('📊 Inicializando módulo Simulador...');
    setupSimuladorListeners();
    setDefaultDates();
    updateFormForType('credito');
}

// ==========================================
// CONFIGURACIÓN INICIAL
// ==========================================
function setDefaultDates() {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];

    const fechaDesembolso = document.getElementById('sim-fecha-desembolso');
    const fechaInicio = document.getElementById('sim-fecha-inicio');

    if (fechaDesembolso) fechaDesembolso.value = dateStr;
    if (fechaInicio) fechaInicio.value = dateStr;
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupSimuladorListeners() {
    // Toggle de tipo
    const toggleCredito = document.getElementById('toggle-credito');
    const togglePoliza = document.getElementById('toggle-poliza');

    if (toggleCredito) {
        toggleCredito.addEventListener('click', () => switchType('credito'));
    }
    if (togglePoliza) {
        togglePoliza.addEventListener('click', () => switchType('poliza'));
    }

    // Botón calcular
    const btnCalcular = document.getElementById('btn-calcular');
    if (btnCalcular) {
        btnCalcular.addEventListener('click', calcularSimulacion);
    }

    // Botón limpiar
    const btnLimpiar = document.getElementById('btn-limpiar');
    if (btnLimpiar) {
        btnLimpiar.addEventListener('click', limpiarSimulador);
    }

    // Botón generar PDF
    const btnPDF = document.getElementById('btn-generar-pdf');
    if (btnPDF) {
        btnPDF.addEventListener('click', generarPDFSimulacion);
    }
}

// ==========================================
// CAMBIO DE TIPO DE SIMULACIÓN
// ==========================================
function switchType(tipo) {
    currentSimulationType = tipo;
    updateFormForType(tipo);

    // Actualizar toggles
    document.getElementById('toggle-credito').classList.toggle('active', tipo === 'credito');
    document.getElementById('toggle-poliza').classList.toggle('active', tipo === 'poliza');

    // Ocultar resultados anteriores
    document.getElementById('simulador-resultados').classList.add('hidden');
}

function updateFormForType(tipo) {
    const isCredito = tipo === 'credito';

    // Actualizar título del form
    const formTitle = document.getElementById('form-title');
    if (formTitle) {
        formTitle.textContent = isCredito ? 'Datos del Crédito' : 'Datos de la Póliza';
    }

    // Actualizar labels
    const labelCapital = document.getElementById('label-capital');
    if (labelCapital) {
        labelCapital.textContent = isCredito ? 'Capital Solicitado ($)' : 'Valor de Inversión ($)';
    }

    const labelInteres = document.getElementById('label-interes');
    if (labelInteres) {
        labelInteres.textContent = isCredito ? 'Tasa de Interés Mensual (%)' : 'Tasa de Interés Anual (%)';
    }

    // Mostrar/ocultar campos específicos
    document.querySelectorAll('.credito-field').forEach(el => {
        el.classList.toggle('hidden', !isCredito);
    });

    document.querySelectorAll('.poliza-field').forEach(el => {
        el.classList.toggle('hidden', isCredito);
    });

    // Actualizar valor por defecto del interés
    const inputInteres = document.getElementById('sim-interes');
    if (inputInteres) {
        inputInteres.value = isCredito ? '2' : '10';
    }
}

// ==========================================
// CÁLCULO DE SIMULACIÓN
// ==========================================
function calcularSimulacion() {
    if (currentSimulationType === 'credito') {
        calcularCredito();
    } else {
        calcularPoliza();
    }
}

// ==========================================
// CÁLCULO DE CRÉDITO
// ==========================================
function calcularCredito() {
    // Obtener valores del formulario
    const capital = parseFloat(document.getElementById('sim-capital').value);
    const interesMensual = parseFloat(document.getElementById('sim-interes').value) / 100;
    const plazo = parseInt(document.getElementById('sim-plazo').value);
    const fechaDesembolso = new Date(document.getElementById('sim-fecha-desembolso').value);
    const diaPago = parseInt(document.getElementById('sim-dia-pago').value);

    // Validaciones
    if (isNaN(capital) || capital <= 0) {
        showToast('Por favor ingrese un capital válido', 'error');
        return;
    }

    if (isNaN(fechaDesembolso.getTime())) {
        showToast('Por favor ingrese una fecha de desembolso válida', 'error');
        return;
    }

    // 1. Calcular gastos administrativos
    let gastosAdministrativos;
    if (capital < 5000) {
        gastosAdministrativos = capital * 0.038; // 3.8%
    } else if (capital < 20000) {
        gastosAdministrativos = capital * 0.023; // 2.3%
    } else {
        gastosAdministrativos = capital * 0.018; // 1.8%
    }

    const capitalBase = capital;

    // 2. Calcular fecha base
    const fechaBase = new Date(fechaDesembolso.getTime());
    if (fechaDesembolso.getDate() <= diaPago + 2) {
        fechaBase.setDate(diaPago);
    } else {
        fechaBase.setMonth(fechaBase.getMonth() + 1);
        fechaBase.setDate(diaPago);
    }

    // Fecha de fin de crédito
    const finCredito = new Date(fechaBase.getTime());
    finCredito.setMonth(finCredito.getMonth() + plazo);

    // Días totales
    const unDiaEnMs = 1000 * 60 * 60 * 24;
    const diasTotales = Math.round((finCredito.getTime() - fechaDesembolso.getTime()) / unDiaEnMs);

    // Fecha del primer pago
    const fechaPrimerPago = new Date(fechaBase.getTime());
    fechaPrimerPago.setMonth(fechaPrimerPago.getMonth() + 1);

    // 3. Generar fechas de pago
    const fechasPago = [];
    for (let i = 0; i < plazo; i++) {
        const fechaPago = new Date(fechaPrimerPago.getTime());
        fechaPago.setMonth(fechaPrimerPago.getMonth() + i);
        fechasPago.push(fechaPago);
    }

    // 4. Calcular interés total
    const tasaAnual = interesMensual * 12;
    const tasaDiaria = tasaAnual / 365;
    const interesTotal = capitalBase * tasaDiaria * diasTotales;

    // 5. Total a pagar
    const totalAPagar = capitalBase + interesTotal + gastosAdministrativos;

    // 6. Cuota mensual base
    const cuotaCalculada = totalAPagar / plazo;
    const cuotaBase = Math.ceil(cuotaCalculada);

    // 7. Ahorro programado
    const ahorroProgramadoTotal = (capitalBase + interesTotal) * 0.10;
    const ahorroPorCuota = Math.ceil(ahorroProgramadoTotal / plazo);
    const cuotaConAhorro = cuotaBase + ahorroPorCuota;

    // 8. Generar tabla de amortización
    const amortizacion = [];
    let saldoCapital = capitalBase;
    let fechaAnterior = fechaDesembolso;
    let totalCapitalPagado = 0;
    let totalInteresPagado = 0;
    let totalAhorroPagado = 0;
    let totalCuotasPagadas = 0;

    const sumOfDigits = plazo * (plazo + 1) / 2;
    const gastosPorCuota = gastosAdministrativos / plazo;
    let interesAcumulado = 0;

    for (let i = 0; i < plazo; i++) {
        const fechaVencimiento = fechasPago[i];
        const diasPeriodo = Math.ceil((fechaVencimiento - fechaAnterior) / unDiaEnMs);

        let interesDelMes = (sumOfDigits > 0) ? interesTotal * ((plazo - i) / sumOfDigits) : 0;
        let capitalPeriodo = cuotaBase - interesDelMes - gastosPorCuota;
        let cuotaDeEsteMes = cuotaBase;

        if (i === plazo - 1) {
            capitalPeriodo = saldoCapital;
            const interesRestante = interesTotal - interesAcumulado;
            const gastosRestante = gastosAdministrativos - (gastosPorCuota * (plazo - 1));
            cuotaDeEsteMes = capitalPeriodo + interesRestante + gastosRestante;
        }

        const pagoGastos = (i === plazo - 1) ? (gastosAdministrativos - (gastosPorCuota * (plazo - 1))) : gastosPorCuota;
        interesDelMes = cuotaDeEsteMes - capitalPeriodo - pagoGastos;

        saldoCapital -= capitalPeriodo;
        if (saldoCapital < 0.01) saldoCapital = 0;

        interesAcumulado += interesDelMes;
        totalCapitalPagado += capitalPeriodo;
        totalInteresPagado += interesDelMes;
        totalAhorroPagado += ahorroPorCuota;
        totalCuotasPagadas += cuotaDeEsteMes + ahorroPorCuota;

        amortizacion.push({
            numero: i + 1,
            fechaVencimiento: fechaVencimiento,
            dias: diasPeriodo,
            capital: capitalPeriodo,
            interes: interesDelMes,
            gastos: pagoGastos,
            cuotaBase: cuotaDeEsteMes,
            ahorro: ahorroPorCuota,
            cuotaTotal: cuotaDeEsteMes + ahorroPorCuota,
            saldoCapital: saldoCapital
        });

        fechaAnterior = fechaVencimiento;
    }

    // Guardar datos
    simulationData = {
        tipo: 'credito',
        nombre: document.getElementById('sim-nombre').value || 'Cliente',
        capital: capital,
        gastosAdmin: gastosAdministrativos,
        capitalFinanciado: capitalBase,
        interesTotal: interesTotal,
        diasTotales: diasTotales,
        ahorroTotal: ahorroPorCuota * plazo,
        cuotaBase: cuotaBase,
        cuotaConAhorro: cuotaConAhorro,
        totalPagar: totalCuotasPagadas,
        plazo: plazo,
        tasaInteresMensual: interesMensual * 100,
        fechaDesembolso: fechaDesembolso,
        fechaPrimerPago: fechaPrimerPago,
        fechaFinCredito: finCredito,
        totales: {
            capital: totalCapitalPagado,
            interes: totalInteresPagado,
            ahorro: totalAhorroPagado,
            cuotas: totalCuotasPagadas
        }
    };

    amortizacionData = amortizacion;

    // Mostrar resultados
    mostrarResultadosCredito();
}

// ==========================================
// CÁLCULO DE PÓLIZA
// ==========================================
function calcularPoliza() {
    const valorInversion = parseFloat(document.getElementById('sim-capital').value);
    const interesAnual = parseFloat(document.getElementById('sim-interes').value) / 100;
    const plazo = parseInt(document.getElementById('sim-plazo').value);
    const fechaInicio = new Date(document.getElementById('sim-fecha-inicio').value);

    // Validaciones
    if (isNaN(valorInversion) || valorInversion <= 0) {
        showToast('Por favor ingrese un valor de inversión válido', 'error');
        return;
    }

    if (isNaN(fechaInicio.getTime())) {
        showToast('Por favor ingrese una fecha de inicio válida', 'error');
        return;
    }

    // Calcular fecha de vencimiento
    const fechaVencimiento = new Date(fechaInicio.getTime());
    fechaVencimiento.setMonth(fechaVencimiento.getMonth() + plazo);

    // Calcular interés generado
    const interesMensual = interesAnual / 12;
    const interesGenerado = valorInversion * interesMensual * plazo;
    const valorFinal = valorInversion + interesGenerado;

    // Generar tabla de proyección mensual
    const proyeccion = [];
    let valorAcumulado = valorInversion;

    for (let i = 1; i <= plazo; i++) {
        const fechaMes = new Date(fechaInicio.getTime());
        fechaMes.setMonth(fechaMes.getMonth() + i);

        const interesDelMes = valorInversion * interesMensual;
        valorAcumulado += interesDelMes;

        proyeccion.push({
            numero: i,
            fecha: fechaMes,
            inversionInicial: valorInversion,
            interesMes: interesDelMes,
            interesAcumulado: interesDelMes * i,
            valorTotal: valorInversion + (interesDelMes * i)
        });
    }

    // Guardar datos
    simulationData = {
        tipo: 'poliza',
        nombre: document.getElementById('sim-nombre').value || 'Inversionista',
        valorInversion: valorInversion,
        interesAnual: interesAnual * 100,
        interesMensual: interesMensual * 100,
        interesGenerado: interesGenerado,
        valorFinal: valorFinal,
        plazo: plazo,
        fechaInicio: fechaInicio,
        fechaVencimiento: fechaVencimiento
    };

    amortizacionData = proyeccion;

    // Mostrar resultados
    mostrarResultadosPoliza();
}

// ==========================================
// MOSTRAR RESULTADOS
// ==========================================
function mostrarResultadosCredito() {
    // Mostrar sección de resultados
    document.getElementById('simulador-resultados').classList.remove('hidden');

    // Actualizar visibilidad de elementos
    document.querySelectorAll('.credito-only').forEach(el => el.classList.remove('hidden'));
    document.querySelectorAll('.poliza-only').forEach(el => el.classList.add('hidden'));

    // Actualizar títulos
    document.getElementById('resumen-title').textContent = 'Resumen del Crédito';
    document.getElementById('res-label-capital').textContent = 'Capital Solicitado';
    document.getElementById('res-label-interes-total').textContent = 'Total Intereses + Gastos Administrativos';
    document.getElementById('res-label-cuota-total').textContent = 'Cuota Mensual';
    document.getElementById('res-label-total').textContent = 'Total Neto a Pagar';
    document.getElementById('tabla-title').textContent = 'Tabla de Amortización';

    // Calcular Total Neto (cuota base * plazo, sin ahorro porque se devuelve)
    const totalNetoAPagar = simulationData.cuotaBase * simulationData.plazo;

    // Costo del crédito = Total Neto - Capital (incluye intereses + gastos administrativos)
    const costoCredito = totalNetoAPagar - simulationData.capital;

    // Llenar valores del resumen
    document.getElementById('res-capital').textContent = formatMoney(simulationData.capital);
    document.getElementById('res-intereses').textContent = formatMoney(costoCredito);
    document.getElementById('res-ahorro').textContent = formatMoney(simulationData.ahorroTotal);
    document.getElementById('res-cuota-total').textContent = formatMoney(simulationData.cuotaConAhorro);
    document.getElementById('res-total').textContent = formatMoney(totalNetoAPagar);
    document.getElementById('nota-ahorro-monto').textContent = formatMoney(simulationData.ahorroTotal);

    // Renderizar tabla
    renderTablaCredito();

    // Scroll a resultados
    document.getElementById('simulador-resultados').scrollIntoView({ behavior: 'smooth' });
}

function mostrarResultadosPoliza() {
    // Mostrar sección de resultados
    document.getElementById('simulador-resultados').classList.remove('hidden');

    // Actualizar visibilidad de elementos
    document.querySelectorAll('.credito-only').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.poliza-only').forEach(el => el.classList.remove('hidden'));

    // Actualizar títulos
    document.getElementById('resumen-title').textContent = 'Resumen de la Póliza';
    document.getElementById('res-label-capital').textContent = 'Valor de Inversión';
    document.getElementById('res-label-interes-total').textContent = 'Interés Generado';
    document.getElementById('res-label-cuota-total').textContent = 'Tasa Anual';
    document.getElementById('res-label-total').textContent = 'Plazo';
    document.getElementById('tabla-title').textContent = 'Proyección de Rendimientos';

    // Llenar valores del resumen
    document.getElementById('res-capital').textContent = formatMoney(simulationData.valorInversion);
    document.getElementById('res-intereses').textContent = formatMoney(simulationData.interesGenerado);
    document.getElementById('res-cuota-total').textContent = simulationData.interesAnual.toFixed(2) + '%';
    document.getElementById('res-total').textContent = simulationData.plazo + ' meses';
    document.getElementById('res-vencimiento').textContent = formatDate(simulationData.fechaVencimiento);
    document.getElementById('res-valor-final').textContent = formatMoney(simulationData.valorFinal);

    // Renderizar tabla
    renderTablaPoliza();

    // Scroll a resultados
    document.getElementById('simulador-resultados').scrollIntoView({ behavior: 'smooth' });
}

// ==========================================
// RENDERIZAR TABLAS
// ==========================================
function renderTablaCredito() {
    const header = document.getElementById('tabla-header');
    const body = document.getElementById('tabla-body');
    const footer = document.getElementById('tabla-footer');

    // Header
    header.innerHTML = `
        <tr>
            <th class="text-center">#</th>
            <th>Fecha</th>
            <th class="text-right">Días</th>
            <th class="text-right">Capital</th>
            <th class="text-right">Interés</th>
            <th class="text-right hide-mobile">Gastos</th>
            <th class="text-right">Cuota Base</th>
            <th class="text-right text-gold">Ahorro</th>
            <th class="text-right text-primary">Total</th>
            <th class="text-right hide-mobile">Saldo</th>
        </tr>
    `;

    // Body
    body.innerHTML = amortizacionData.map(cuota => `
        <tr>
            <td class="text-center">${cuota.numero}</td>
            <td>${formatDate(cuota.fechaVencimiento)}</td>
            <td class="text-right">${cuota.dias}</td>
            <td class="text-right">${formatMoney(cuota.capital)}</td>
            <td class="text-right">${formatMoney(cuota.interes)}</td>
            <td class="text-right hide-mobile">${formatMoney(cuota.gastos)}</td>
            <td class="text-right">${formatMoney(cuota.cuotaBase)}</td>
            <td class="text-right text-gold">${formatMoney(cuota.ahorro)}</td>
            <td class="text-right text-primary">${formatMoney(cuota.cuotaTotal)}</td>
            <td class="text-right hide-mobile">${formatMoney(cuota.saldoCapital)}</td>
        </tr>
    `).join('');

    // Footer
    footer.innerHTML = `
        <tr>
            <td colspan="3" class="text-right"><strong>TOTALES:</strong></td>
            <td class="text-right">${formatMoney(simulationData.totales.capital)}</td>
            <td class="text-right">${formatMoney(simulationData.totales.interes)}</td>
            <td class="text-right hide-mobile">${formatMoney(simulationData.gastosAdmin)}</td>
            <td class="text-right">${formatMoney(simulationData.totales.capital + simulationData.totales.interes + simulationData.gastosAdmin)}</td>
            <td class="text-right text-gold">${formatMoney(simulationData.totales.ahorro)}</td>
            <td class="text-right text-primary">${formatMoney(simulationData.totales.cuotas)}</td>
            <td class="text-right hide-mobile">$0.00</td>
        </tr>
    `;
}

function renderTablaPoliza() {
    const header = document.getElementById('tabla-header');
    const body = document.getElementById('tabla-body');
    const footer = document.getElementById('tabla-footer');

    // Header
    header.innerHTML = `
        <tr>
            <th class="text-center">Mes</th>
            <th>Fecha</th>
            <th class="text-right">Inversión</th>
            <th class="text-right">Interés Mes</th>
            <th class="text-right">Interés Acum.</th>
            <th class="text-right text-primary">Valor Total</th>
        </tr>
    `;

    // Body
    body.innerHTML = amortizacionData.map(mes => `
        <tr>
            <td class="text-center">${mes.numero}</td>
            <td>${formatDate(mes.fecha)}</td>
            <td class="text-right">${formatMoney(mes.inversionInicial)}</td>
            <td class="text-right">${formatMoney(mes.interesMes)}</td>
            <td class="text-right text-gold">${formatMoney(mes.interesAcumulado)}</td>
            <td class="text-right text-primary">${formatMoney(mes.valorTotal)}</td>
        </tr>
    `).join('');

    // Footer
    footer.innerHTML = `
        <tr>
            <td colspan="3" class="text-right"><strong>AL VENCIMIENTO:</strong></td>
            <td class="text-right">-</td>
            <td class="text-right text-gold">${formatMoney(simulationData.interesGenerado)}</td>
            <td class="text-right text-primary">${formatMoney(simulationData.valorFinal)}</td>
        </tr>
    `;
}

// ==========================================
// GENERACIÓN DE PDF
// ==========================================
async function generarPDFSimulacion() {
    if (!simulationData || amortizacionData.length === 0) {
        showToast('Primero debe calcular la simulación', 'error');
        return;
    }

    // Mostrar loading
    const btnPDF = document.getElementById('btn-generar-pdf');
    const originalText = btnPDF.innerHTML;
    btnPDF.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
    btnPDF.disabled = true;

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        let y = margin;

        // Colores INKA CORP
        const primaryColor = [11, 78, 50]; // #0B4E32
        const goldColor = [242, 187, 58]; // #F2BB3A
        const grayColor = [100, 116, 139];
        const darkGray = [51, 65, 85];

        // Fecha actual formateada
        const fechaHoy = new Date();
        const opcionesFecha = { year: 'numeric', month: 'long', day: 'numeric' };
        const fechaFormateada = fechaHoy.toLocaleDateString('es-EC', opcionesFecha);

        // Calcular Total Neto (cuota base * plazo, sin incluir ahorro porque se devuelve)
        const totalNetoAPagar = simulationData.cuotaBase * simulationData.plazo;

        // ==========================================
        // PÁGINA 1: CARTA FORMAL CON CONDICIONES
        // ==========================================

        // Header corporativo
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, 45, 'F');

        // Línea decorativa superior
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, pageWidth, 3, 'F');

        // Logo INKA CORP (texto estilizado)
        doc.setTextColor(...primaryColor);
        doc.setFontSize(26);
        doc.setFont('helvetica', 'bold');
        doc.text('INKA CORP', margin, 20);

        // Subtítulo
        doc.setFontSize(10);
        doc.setTextColor(...goldColor);
        doc.setFont('helvetica', 'normal');
        doc.text('Cooperativa de Ahorro y Credito', margin, 27);

        // Fecha en la esquina
        doc.setTextColor(...grayColor);
        doc.setFontSize(9);
        doc.text(fechaFormateada, pageWidth - margin, 20, { align: 'right' });

        // Línea divisoria dorada
        doc.setDrawColor(...goldColor);
        doc.setLineWidth(1);
        doc.line(margin, 35, pageWidth - margin, 35);

        y = 50;

        // Título del documento
        doc.setTextColor(...primaryColor);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        const titulo = simulationData.tipo === 'credito'
            ? 'SIMULACION DE CREDITO'
            : 'SIMULACION DE POLIZA DE INVERSION';
        doc.text(titulo, pageWidth / 2, y, { align: 'center' });

        y += 10;

        // Aviso de simulación
        doc.setFillColor(254, 243, 199);
        doc.roundedRect(margin, y, pageWidth - 2 * margin, 10, 2, 2, 'F');
        doc.setTextColor(146, 64, 14);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('DOCUMENTO INFORMATIVO - Los valores son referenciales y pueden variar', pageWidth / 2, y + 6.5, { align: 'center' });

        y += 18;

        // Saludo formal
        doc.setTextColor(...darkGray);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text('Estimado/a Socio/a ' + simulationData.nombre + ':', margin, y);

        y += 10;

        // Párrafo introductorio
        doc.setFontSize(10);
        const intro = simulationData.tipo === 'credito'
            ? 'Por medio de la presente, le hacemos llegar la simulacion de su credito con las siguientes condiciones:'
            : 'Por medio de la presente, le hacemos llegar la proyeccion de su poliza de inversion:';
        doc.text(intro, margin, y);

        y += 12;

        if (simulationData.tipo === 'credito') {
            // ==========================================
            // RESUMEN DEL CRÉDITO (sin gastos admin en detalle)
            // ==========================================
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(margin, y, pageWidth - 2 * margin, 55, 3, 3, 'F');
            doc.setDrawColor(...primaryColor);
            doc.roundedRect(margin, y, pageWidth - 2 * margin, 55, 3, 3, 'S');

            y += 8;
            doc.setTextColor(...primaryColor);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('DETALLE DEL CREDITO', margin + 5, y);

            y += 8;
            const col1X = margin + 5;
            const col2X = pageWidth / 2 + 5;

            doc.setFontSize(9);
            doc.setTextColor(...grayColor);
            doc.setFont('helvetica', 'normal');

            // Columna 1
            doc.text('Capital Solicitado:', col1X, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text(formatMoney(simulationData.capital), col1X + 40, y);

            // Columna 2
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Tasa de Interes:', col2X, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text(simulationData.tasaInteresMensual.toFixed(2) + '% mensual', col2X + 30, y);

            y += 7;

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Plazo:', col1X, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text(simulationData.plazo + ' meses', col1X + 40, y);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Cuota Mensual (inc. ahorro):', col2X, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text(formatMoney(simulationData.cuotaConAhorro), col2X + 42, y);

            y += 7;

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Ahorro Programado/Cuota:', col1X, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...goldColor);
            doc.text(formatMoney(simulationData.ahorroTotal / simulationData.plazo), col1X + 48, y);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.text('Total Intereses + Gastos:', col2X, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text(formatMoney(totalNetoAPagar - simulationData.capital), col2X + 42, y);

            y += 10;

            // Cálculo del total bruto (capital + intereses + gastos + ahorro)
            const totalBruto = totalNetoAPagar + simulationData.ahorroTotal;

            // Recuadro de totales con desglose
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(...primaryColor);
            doc.roundedRect(margin + 5, y, pageWidth - 2 * margin - 10, 32, 3, 3, 'FD');

            // Línea 1: Total a Pagar (Capital + Intereses + Ahorro)
            doc.setTextColor(...grayColor);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text('TOTAL A PAGAR (Capital + Intereses + Ahorro):', margin + 10, y + 7);
            doc.setTextColor(...primaryColor);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text(formatMoney(totalBruto), pageWidth - margin - 15, y + 7, { align: 'right' });

            // Línea 2: (-) Ahorro Programado (se devuelve)
            doc.setTextColor(16, 185, 129); // Verde
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text('(-) Ahorro Programado (se devuelve al socio):', margin + 10, y + 15);
            doc.setFont('helvetica', 'bold');
            doc.text('- ' + formatMoney(simulationData.ahorroTotal), pageWidth - margin - 15, y + 15, { align: 'right' });

            // Línea divisoria
            doc.setDrawColor(...goldColor);
            doc.setLineWidth(0.5);
            doc.line(margin + 10, y + 19, pageWidth - margin - 10, y + 19);

            // Línea 3: TOTAL NETO A CANCELAR DEL CRÉDITO
            doc.setFillColor(...primaryColor);
            doc.roundedRect(margin + 8, y + 21, pageWidth - 2 * margin - 16, 9, 2, 2, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text('TOTAL NETO A CANCELAR DEL CREDITO:', margin + 12, y + 27);
            doc.setTextColor(...goldColor);
            doc.setFontSize(10);
            doc.text(formatMoney(totalNetoAPagar), pageWidth - margin - 17, y + 27, { align: 'right' });

            y += 42;

            // Nota sobre Ahorro Programado (amigable y clara)
            doc.setTextColor(...grayColor);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.text('* Todo credito incluye un Ahorro Programado obligatorio, pensando en el bienestar del socio.', margin, y);
            y += 4;

            // Solo mencionar que puede usarse para la última cuota si el ahorro >= cuota
            if (simulationData.ahorroTotal >= simulationData.cuotaConAhorro) {
                doc.text('  Este ahorro se devuelve integramente al finalizar el credito, o puede usarse para pagar', margin, y);
                y += 4;
                doc.text('  la ultima cuota. El valor total del ahorro programado de este credito sera de ' + formatMoney(simulationData.ahorroTotal) + '.', margin, y);
            } else {
                doc.text('  Este ahorro se devuelve integramente al socio al finalizar el credito.', margin, y);
                y += 4;
                doc.text('  El valor total del ahorro programado de este credito sera de ' + formatMoney(simulationData.ahorroTotal) + '.', margin, y);
            }

            y += 10;

            // ==========================================
            // CONDICIONES GENERALES (simplificadas)
            // ==========================================
            doc.setTextColor(...primaryColor);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('CONDICIONES GENERALES', margin, y);

            doc.setDrawColor(...goldColor);
            doc.setLineWidth(0.5);
            y += 2;
            doc.line(margin, y, margin + 45, y);

            y += 6;

            doc.setTextColor(...darkGray);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');

            // Calcular gastos admin mensuales (dividido entre plazo para que parezca más barato)
            let tasaGastosTotal = 0;
            if (simulationData.capital < 5000) {
                tasaGastosTotal = 3.8;
            } else if (simulationData.capital < 20000) {
                tasaGastosTotal = 2.3;
            } else {
                tasaGastosTotal = 1.8;
            }
            const tasaGastosMensual = (tasaGastosTotal / simulationData.plazo).toFixed(2);

            const condiciones = [
                '- Gastos administrativos: ' + tasaGastosMensual + '% mensual sobre el capital.',
                '- Ahorro programado: se devuelve al socio al finalizar el credito.',
                '- Pagos mensuales en la fecha acordada.',
                '- Precancelacion disponible a partir del 3er mes.',
                '- Renovacion del credito disponible en cualquier momento.'
            ];

            condiciones.forEach(linea => {
                doc.text(linea, margin, y);
                y += 4;
            });

            y += 6;

            // ==========================================
            // FIRMA Y CIERRE (al final de condiciones)
            // ==========================================
            doc.setTextColor(...darkGray);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text('Quedamos a su disposicion para cualquier consulta.', margin, y);

            y += 8;
            doc.text('Atentamente,', margin, y);

            y += 10;
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text('INKA CORP', margin, y);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.setFontSize(8);
            y += 4;
            doc.text('Departamento de Creditos', margin, y);

        } else {
            // ==========================================
            // RESUMEN DE PÓLIZA
            // ==========================================
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(margin, y, pageWidth - 2 * margin, 45, 3, 3, 'F');
            doc.setDrawColor(...primaryColor);
            doc.roundedRect(margin, y, pageWidth - 2 * margin, 45, 3, 3, 'S');

            y += 8;
            doc.setTextColor(...primaryColor);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('DETALLE DE LA INVERSION', margin + 5, y);

            y += 10;

            const detallesPoliza = [
                ['Valor de Inversion:', formatMoney(simulationData.valorInversion)],
                ['Tasa de Interes Anual:', simulationData.interesAnual.toFixed(2) + '%'],
                ['Plazo:', simulationData.plazo + ' meses'],
                ['Interes Generado:', formatMoney(simulationData.interesGenerado)],
                ['Valor al Vencimiento:', formatMoney(simulationData.valorFinal)],
                ['Fecha de Vencimiento:', formatDate(simulationData.fechaVencimiento)]
            ];

            doc.setFontSize(10);
            detallesPoliza.forEach(([label, value]) => {
                doc.setTextColor(...grayColor);
                doc.setFont('helvetica', 'normal');
                doc.text(label, margin + 5, y);
                doc.setTextColor(...primaryColor);
                doc.setFont('helvetica', 'bold');
                doc.text(value, margin + 60, y);
                y += 6;
            });

            y += 10;

            // Cierre póliza
            doc.setTextColor(...darkGray);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text('Quedamos a su disposicion para cualquier consulta.', margin, y);

            y += 8;
            doc.text('Atentamente,', margin, y);

            y += 10;
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...primaryColor);
            doc.text('INKA CORP', margin, y);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...grayColor);
            doc.setFontSize(8);
            y += 4;
            doc.text('Departamento de Inversiones', margin, y);
        }

        // Footer página 1
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(7);
        doc.text('Pagina 1 de 2', pageWidth / 2, pageHeight - 10, { align: 'center' });

        // ==========================================
        // PÁGINA 2: TABLA DE AMORTIZACIÓN
        // ==========================================
        doc.addPage();
        y = margin;

        // Header página 2
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, pageWidth, 25, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('INKA CORP', margin, 15);

        doc.setTextColor(...goldColor);
        doc.setFontSize(12);
        const tituloTabla = simulationData.tipo === 'credito'
            ? 'TABLA DE AMORTIZACION'
            : 'PROYECCION DE RENDIMIENTOS';
        doc.text(tituloTabla, pageWidth - margin, 15, { align: 'right' });

        y = 35;

        // Info del socio
        doc.setTextColor(...grayColor);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('Socio: ' + simulationData.nombre, margin, y);
        doc.text('Fecha: ' + fechaFormateada, pageWidth - margin, y, { align: 'right' });

        y += 10;

        // Headers de la tabla (sin Gastos)
        const tableStartX = margin;
        const colWidths = simulationData.tipo === 'credito'
            ? [12, 28, 25, 25, 25, 28, 27]  // Sin columna Gastos
            : [15, 30, 35, 30, 35, 35];

        const headers = simulationData.tipo === 'credito'
            ? ['#', 'Fecha', 'Capital', 'Interes', 'Ahorro', 'Cuota', 'Saldo']  // Sin Gastos
            : ['Mes', 'Fecha', 'Inversion', 'Int. Mes', 'Int. Acum.', 'Valor Total'];

        // Header de tabla
        doc.setFillColor(...primaryColor);
        doc.rect(tableStartX, y, pageWidth - 2 * margin, 8, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');

        let x = tableStartX + 2;
        headers.forEach((header, i) => {
            doc.text(header, x, y + 5.5);
            x += colWidths[i];
        });

        y += 10;

        // Filas de la tabla
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');

        amortizacionData.forEach((row, index) => {
            // Verificar si necesitamos nueva página
            if (y > pageHeight - 30) {
                doc.addPage();
                y = margin;

                // Repetir header de tabla
                doc.setFillColor(...primaryColor);
                doc.rect(tableStartX, y, pageWidth - 2 * margin, 8, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                x = tableStartX + 2;
                headers.forEach((header, i) => {
                    doc.text(header, x, y + 5.5);
                    x += colWidths[i];
                });
                y += 10;
            }

            // Alternar color de fondo
            if (index % 2 === 0) {
                doc.setFillColor(248, 250, 252);
                doc.rect(tableStartX, y - 3, pageWidth - 2 * margin, 6, 'F');
            }

            doc.setTextColor(51, 65, 85);
            doc.setFont('helvetica', 'normal');
            x = tableStartX + 2;

            if (simulationData.tipo === 'credito') {
                const cells = [
                    row.numero.toString(),
                    formatDateShort(row.fechaVencimiento),
                    formatMoney(row.capital),
                    formatMoney(row.interes),
                    formatMoney(row.ahorro),
                    formatMoney(row.cuotaTotal),
                    formatMoney(row.saldoCapital)
                ];
                cells.forEach((cell, i) => {
                    doc.text(cell, x, y);
                    x += colWidths[i];
                });
            } else {
                const cells = [
                    row.numero.toString(),
                    formatDateShort(row.fecha),
                    formatMoney(row.inversionInicial),
                    formatMoney(row.interesMes),
                    formatMoney(row.interesAcumulado),
                    formatMoney(row.valorTotal)
                ];
                cells.forEach((cell, i) => {
                    doc.text(cell, x, y);
                    x += colWidths[i];
                });
            }

            y += 6;
        });

        // Fila de totales
        y += 2;
        doc.setFillColor(...goldColor);
        doc.rect(tableStartX, y, pageWidth - 2 * margin, 8, 'F');
        doc.setTextColor(...primaryColor);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');

        if (simulationData.tipo === 'credito') {
            x = tableStartX + 2;
            doc.text('TOTALES', x, y + 5.5);
            x += colWidths[0] + colWidths[1];
            doc.text(formatMoney(simulationData.totales.capital), x, y + 5.5);
            x += colWidths[2];
            doc.text(formatMoney(simulationData.totales.interes), x, y + 5.5);
            x += colWidths[3];
            doc.text(formatMoney(simulationData.totales.ahorro), x, y + 5.5);
            x += colWidths[4];
            doc.text(formatMoney(simulationData.totales.cuotas), x, y + 5.5);
            x += colWidths[5];
            doc.text('$0.00', x, y + 5.5);
        }

        y += 15;

        // Nota del ahorro programado (para créditos)
        if (simulationData.tipo === 'credito') {
            doc.setFillColor(236, 253, 245);
            doc.roundedRect(margin, y, pageWidth - 2 * margin, 25, 3, 3, 'F');
            doc.setDrawColor(16, 185, 129);
            doc.roundedRect(margin, y, pageWidth - 2 * margin, 25, 3, 3, 'S');

            doc.setTextColor(5, 150, 105);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text('AHORRO PROGRAMADO: ' + formatMoney(simulationData.ahorroTotal), margin + 5, y + 8);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(4, 120, 87);
            doc.text('Este monto sera devuelto integramente al socio al cancelar el credito.', margin + 5, y + 15);
            doc.text('Puede utilizarse para pagar la ultima cuota del credito.', margin + 5, y + 21);
        }

        // Footer página 2
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text('INKA CORP - Documento de Simulacion', margin, pageHeight - 10);
        doc.text('Pagina 2 de 2', pageWidth / 2, pageHeight - 10, { align: 'center' });
        doc.text('No constituye contrato', pageWidth - margin, pageHeight - 10, { align: 'right' });

        // Guardar PDF
        const fileName = simulationData.tipo === 'credito'
            ? `Simulacion_Credito_${simulationData.nombre.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
            : `Simulacion_Poliza_${simulationData.nombre.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

        doc.save(fileName);
        showToast('PDF generado exitosamente', 'success');

    } catch (error) {
        console.error('Error generando PDF:', error);
        showToast('Error al generar el PDF', 'error');
    } finally {
        btnPDF.innerHTML = originalText;
        btnPDF.disabled = false;
    }
}

// ==========================================
// UTILIDADES
// ==========================================
function formatMoney(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '$0.00';
    return '$' + parseFloat(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function limpiarSimulador() {
    document.getElementById('sim-nombre').value = '';
    document.getElementById('sim-capital').value = '10000';
    document.getElementById('sim-interes').value = currentSimulationType === 'credito' ? '2' : '10';
    document.getElementById('sim-plazo').value = '12';
    setDefaultDates();

    document.getElementById('simulador-resultados').classList.add('hidden');
    simulationData = null;
    amortizacionData = [];
}

function showToast(message, type = 'info') {
    // Usar toast global si existe
    if (typeof window.showGlobalToast === 'function') {
        window.showGlobalToast(message, type);
        return;
    }

    // Fallback con alert
    if (type === 'error') {
        alert('Error: ' + message);
    } else {
        console.log(message);
    }
}

// ==========================================
// INICIALIZACIÓN AUTOMÁTICA
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // El sistema INKA CORP inicializa mediante app.js
});

// Exportar para uso global
window.initSimuladorModule = initSimuladorModule;
