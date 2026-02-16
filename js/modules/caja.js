/**
 * INKA CORP - Módulo Caja
 * Utilidades de exportación y helpers del módulo
 */

async function generateCajaProposalPDF() {
    try {
        const jspdfRef = window.jspdf;
        if (!jspdfRef || !jspdfRef.jsPDF) {
            window.showAlert?.('No se encontró la librería de PDF en esta vista.', 'Error', 'error');
            return;
        }

        const { jsPDF } = jspdfRef;
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 48;
        const contentWidth = pageWidth - margin * 2;
        let y = 56;

        const formatDate = (dateObj) => dateObj.toLocaleDateString('es-EC', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        const normalizeText = (text) => (text || '').replace(/\s+/g, ' ').trim();

        async function loadImageAsDataUrl(src) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        resolve(canvas.toDataURL('image/png'));
                    } catch (error) {
                        reject(error);
                    }
                };
                img.onerror = () => reject(new Error('No se pudo cargar logo LP Solutions.'));
                img.src = src;
            });
        }

        const logoPath = 'img/LPpng/lpsolutionsblack.png';
        let logoDataUrl = null;
        try {
            logoDataUrl = await loadImageAsDataUrl(logoPath);
        } catch (error) {
            console.warn('[CAJA PDF] No se pudo incrustar el logo:', error);
        }

        doc.setFillColor(11, 78, 50);
        doc.rect(0, 0, pageWidth, 34, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(11, 78, 50);
        doc.setFontSize(18);
        doc.text('Propuesta de Implementación - Módulo Caja', margin, y);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(10);
        doc.text(`Fecha: ${formatDate(new Date())}`, margin, y + 20);

        if (logoDataUrl) {
            const logoW = 130;
            const logoH = 42;
            doc.addImage(logoDataUrl, 'PNG', pageWidth - margin - logoW, y - 10, logoW, logoH);
        }

        y += 44;

        const introText = [
            'Distinguido Sr. José Nishve, Gerente General Inka Corp,',
            '',
            'Por medio de este documento presento de forma formal y estructurada la propuesta del nuevo módulo de Caja, '
            + 'orientado al control integral de movimientos de ingresos y egresos dentro del sistema de INKA CORP.',
            '',
            'Este nuevo módulo se plantea para fortalecer la trazabilidad, el control operativo por usuario, '
            + 'la gestión de transferencias internas con evidencia fotográfica y la conciliación diaria de saldos.',
            '',
            'A continuación se detalla el análisis funcional, las reglas de negocio y la ruta de implementación tentativa.'
        ];

        doc.setFont('times', 'normal');
        doc.setFontSize(11.3);
        doc.setTextColor(40, 40, 40);

        introText.forEach((line) => {
            const wrapped = doc.splitTextToSize(line, contentWidth);
            wrapped.forEach((wrappedLine) => {
                if (y > pageHeight - 70) {
                    doc.addPage();
                    y = 56;
                }
                doc.text(wrappedLine, margin, y);
                y += 16;
            });
        });

        y += 10;

        const cards = Array.from(document.querySelectorAll('.caja-card'));

        cards.forEach((card) => {
            const titleEl = card.querySelector('h2');
            const title = normalizeText(titleEl?.textContent || 'Sección');
            const table = card.querySelector('table.caja-table');
            if (!table) return;

            if (y > pageHeight - 140) {
                doc.addPage();
                y = 56;
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(11, 78, 50);
            doc.text(title, margin, y);
            y += 10;

            const head = Array.from(table.querySelectorAll('thead th')).map((th) => normalizeText(th.textContent));
            const body = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
                Array.from(tr.querySelectorAll('td')).map((td) => normalizeText(td.textContent))
            );

            doc.autoTable({
                startY: y + 6,
                head: [head],
                body,
                margin: { left: margin, right: margin },
                theme: 'grid',
                styles: {
                    font: 'helvetica',
                    fontSize: 8.5,
                    cellPadding: 4,
                    textColor: [51, 65, 85],
                    lineColor: [203, 213, 225],
                    lineWidth: 0.4,
                    overflow: 'linebreak'
                },
                headStyles: {
                    fillColor: [11, 78, 50],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold'
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252]
                }
            });

            y = doc.lastAutoTable.finalY + 14;
        });

        if (y > pageHeight - 170) {
            doc.addPage();
            y = 56;
        }

        doc.setDrawColor(11, 78, 50);
        doc.setLineWidth(0.8);
        doc.line(margin, y, pageWidth - margin, y);
        y += 22;

        doc.setFont('times', 'normal');
        doc.setFontSize(11.5);
        doc.setTextColor(45, 45, 45);

        const closing = [
            'Este es el nuevo módulo que se planea implementar para los movimientos y control de caja de INKA CORP.',
            'Si necesita algún cambio, hágamelo saber.',
            '',
            'Atentamente,',
            'Luis Pinta',
            'Software Developer',
            'LP SOLUTIONS.'
        ];

        closing.forEach((line) => {
            const wrapped = doc.splitTextToSize(line, contentWidth);
            wrapped.forEach((wrappedLine) => {
                if (y > pageHeight - 60) {
                    doc.addPage();
                    y = 56;
                }
                doc.text(wrappedLine, margin, y);
                y += 16;
            });
        });

        const totalPages = doc.getNumberOfPages();
        for (let page = 1; page <= totalPages; page++) {
            doc.setPage(page);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(100, 116, 139);
            doc.text('INKA CORP · Propuesta Módulo Caja', margin, pageHeight - 20);
            doc.text(`Página ${page} de ${totalPages}`, pageWidth - margin - 70, pageHeight - 20);
        }

        doc.save('Propuesta_Modulo_Caja_INKA_CORP_Luis_Pinta.pdf');
        window.showToast?.('PDF generado correctamente', 'success');
    } catch (error) {
        console.error('[CAJA PDF] Error generando PDF:', error);
        window.showAlert?.('No se pudo generar el PDF: ' + (error.message || error), 'Error', 'error');
    }
}

function initCajaModule() {
    return true;
}

window.generateCajaProposalPDF = generateCajaProposalPDF;
window.initCajaModule = initCajaModule;
