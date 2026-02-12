/**
 * INKA CORP - Módulo de Agenda y Notas
 * Maneja el calendario semanal y las notas por hora
 */

let currentWeekStart = new Date();
// Ajustar al lunes de la semana actual
const day = currentWeekStart.getDay();
const diff = currentWeekStart.getDate() - day + (day === 0 ? -6 : 1);
currentWeekStart.setDate(diff);
currentWeekStart.setHours(0, 0, 0, 0);

/**
 * Abre el modal de agenda
 */
function openAgendaModal(e) {
    if (e) e.preventDefault();
    const modal = document.getElementById('agenda-modal');
    modal.classList.add('active');
    renderAgenda();
}

/**
 * Cierra el modal de agenda
 */
function closeAgendaModal() {
    const modal = document.getElementById('agenda-modal');
    modal.classList.remove('active');
}

/**
 * Navega a la semana anterior
 */
function prevWeek() {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    renderAgenda();
}

/**
 * Navega a la siguiente semana
 */
function nextWeek() {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    renderAgenda();
}

/**
 * Renderiza la agenda completa
 */
function renderAgenda() {
    const grid = document.getElementById('agenda-grid');
    const monthYearTitle = document.getElementById('agenda-month-year');
    
    if (!grid) return;

    // Resetear recordatorios temporales antes de procesar
    window.tempReminders = {};

    // Actualizar título de mes/año
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    monthYearTitle.textContent = `${months[currentWeekStart.getMonth()]} ${currentWeekStart.getFullYear()}`;

    // Limpiar grid y recargar recordatorios recurrentes si es necesario
    processRecurrentReminders();

    grid.innerHTML = '';

    // 1. Renderizar headers (Esquina + Días)
    const emptyHeader = document.createElement('div');
    emptyHeader.className = 'agenda-header-cell time-header';
    grid.appendChild(emptyHeader);

    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const tempDate = new Date(currentWeekStart);

    for (let i = 0; i < 7; i++) {
        const header = document.createElement('div');
        header.className = 'agenda-header-cell';
        
        const dayName = document.createElement('span');
        dayName.className = 'agenda-day-name';
        dayName.textContent = days[i];
        
        const dayNumber = document.createElement('span');
        dayNumber.className = 'agenda-day-number';
        dayNumber.textContent = tempDate.getDate();
        
        header.appendChild(dayName);
        header.appendChild(dayNumber);
        
        // Resaltar hoy
        const hoy = new Date();
        if (tempDate.toDateString() === hoy.toDateString()) {
            header.style.background = '#dcfce7';
            dayNumber.style.color = '#0B4E32';
        }

        grid.appendChild(header);
        tempDate.setDate(tempDate.getDate() + 1);
    }

    // 2. Renderizar filas de horas (7am a 10pm)
    for (let hour = 7; hour <= 22; hour++) {
        // Celda de hora
        const timeCell = document.createElement('div');
        timeCell.className = 'agenda-time-cell';
        timeCell.textContent = `${hour}:00`;
        grid.appendChild(timeCell);

        // Celdas de días para esa hora
        for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
            const cellDate = new Date(currentWeekStart);
            cellDate.setDate(cellDate.getDate() + dayIdx);
            const dateStr = cellDate.toISOString().split('T')[0];
            const cellId = `${dateStr}-${hour}`;

            const cell = document.createElement('div');
            cell.className = 'agenda-cell';
            cell.dataset.date = dateStr;
            cell.dataset.hour = hour;
            cell.dataset.id = cellId;

            // Cargar notas del storage
            renderNotesInCell(cell, cellId);

            cell.onclick = () => addNoteToCell(cellId, dateStr, hour);
            
            grid.appendChild(cell);
        }
    }
}

/**
 * Renderiza las notas existentes en una celda
 */
function renderNotesInCell(cell, cellId) {
    cell.innerHTML = '';
    const notes = getAgendaNotes(cellId);
    
    notes.forEach((note, index) => {
        const noteEl = document.createElement('div');
        noteEl.className = `agenda-note ${note.type === 'reminder' ? 'is-reminder' : ''}`;
        noteEl.textContent = (note.type === 'reminder' ? '🔔 ' : '') + note.text;
        noteEl.title = note.text;
        noteEl.onclick = (e) => {
            e.stopPropagation();
            editOrDeleteNote(cellId, index);
        };
        cell.appendChild(noteEl);
    });
}

/**
 * Agrega una nota o recordatorio a una celda específica
 */
async function addNoteToCell(cellId, date, hour) {
    const { value: formValues } = await Swal.fire({
        title: 'Nuevo Evento',
        customClass: {
            container: 'agenda-swal-container',
            popup: 'agenda-swal-custom',
            title: 'agenda-swal-title',
            confirmButton: 'btn-agenda-save',
            cancelButton: 'btn-agenda-cancel'
        },
        html: `
            <div class="reminder-form">
                <div class="agenda-form-group">
                    <label>Tipo de evento</label>
                    <select id="event-type" class="agenda-input-styled">
                        <option value="note">Nota Simple</option>
                        <option value="reminder">Recordatorio 🔔</option>
                    </select>
                </div>
                
                <div class="agenda-form-group">
                    <label>Contenido</label>
                    <textarea id="event-text" class="agenda-input-styled" placeholder="¿Qué tienes pendiente?" rows="4"></textarea>
                </div>

                <div id="reminder-options" style="display: none; flex-direction: column; gap: 1rem;">
                    <div class="agenda-form-group">
                        <label>Frecuencia de repetición</label>
                        <select id="reminder-freq" class="agenda-input-styled">
                            <option value="once">Solo una vez</option>
                            <option value="daily">Diariamente</option>
                            <option value="weekly">Semanalmente</option>
                            <option value="monthly">Mensualmente</option>
                        </select>
                    </div>
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonColor: '#0B4E32',
        confirmButtonText: 'Guardar Evento',
        cancelButtonText: 'Cancelar',
        didOpen: () => {
            const typeSelect = document.getElementById('event-type');
            const reminderOpts = document.getElementById('reminder-options');
            typeSelect.onchange = () => {
                reminderOpts.style.display = typeSelect.value === 'reminder' ? 'flex' : 'none';
            };
        },
        preConfirm: () => {
            return {
                type: document.getElementById('event-type').value,
                text: document.getElementById('event-text').value,
                freq: document.getElementById('reminder-freq').value
            }
        }
    });

    if (formValues && formValues.text) {
        const notes = getAgendaNotes(cellId);
        notes.push({ 
            type: formValues.type,
            text: formValues.text, 
            freq: formValues.freq,
            date: date,
            hour: hour,
            createdAt: new Date().getTime() 
        });
        saveAgendaNotes(cellId, notes);
        renderAgenda();
    }
}

/**
 * Procesa recordatorios recurrentes para que aparezcan en las fechas futuras
 */
function processRecurrentReminders() {
    const allData = JSON.parse(localStorage.getItem('inka_agenda_notes') || '{}');
    const newEntries = {};
    const hoy = new Date();
    hoy.setHours(0,0,0,0);

    // Iterar sobre todas las celdas guardadas
    Object.keys(allData).forEach(cellId => {
        const notes = allData[cellId];
        notes.forEach(note => {
            if (note.type === 'reminder' && note.freq !== 'once') {
                const startDate = new Date(note.date + 'T12:00:00'); // Evitar problemas de TZ
                
                // Solo propagamos hacia adelante si estamos visualizando la semana actual o futura
                // Para simplificar, calculamos si este recordatorio debería estar en la semana que estamos viendo
                const viewStart = new Date(currentWeekStart);
                const viewEnd = new Date(currentWeekStart);
                viewEnd.setDate(viewEnd.getDate() + 7);

                if (startDate < viewEnd) {
                    for (let i = 0; i < 7; i++) {
                        const checkDate = new Date(currentWeekStart);
                        checkDate.setDate(checkDate.getDate() + i);
                        checkDate.setHours(12,0,0,0);

                        if (checkDate >= startDate) {
                            let shouldShow = false;
                            if (note.freq === 'daily') shouldShow = true;
                            if (note.freq === 'weekly' && checkDate.getDay() === startDate.getDay()) shouldShow = true;
                            if (note.freq === 'monthly' && checkDate.getDate() === startDate.getDate()) shouldShow = true;

                            if (shouldShow) {
                                const targetDateStr = checkDate.toISOString().split('T')[0];
                                const targetCellId = `${targetDateStr}-${note.hour}`;
                                
                                // Si no es la celda original, la agregamos al render temporal
                                if (targetCellId !== cellId) {
                                    if (!window.tempReminders) window.tempReminders = {};
                                    if (!window.tempReminders[targetCellId]) window.tempReminders[targetCellId] = [];
                                    
                                    // Verificar que no esté ya agregada para evitar duplicados en el render
                                    const exists = window.tempReminders[targetCellId].some(r => r.text === note.text && r.hour === note.hour);
                                    if (!exists) {
                                        window.tempReminders[targetCellId].push({...note, isRecurrentInstance: true});
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
    });
}

function getAgendaNotes(cellId) {
    const allNotes = JSON.parse(localStorage.getItem('inka_agenda_notes') || '{}');
    let cellNotes = allNotes[cellId] || [];
    
    // Combinar con recurrentes temporales
    if (window.tempReminders && window.tempReminders[cellId]) {
        // Filtrar para no duplicar si el usuario ya guardó algo manualmente en esa celda exacta
        const manualTexts = cellNotes.map(n => n.text);
        const recurrentToAdd = window.tempReminders[cellId].filter(r => !manualTexts.includes(r.text));
        return [...cellNotes, ...recurrentToAdd];
    }
    
    return cellNotes;
}

/**
 * Edita o elimina una nota existente
 */
async function editOrDeleteNote(cellId, index) {
    const notes = getAgendaNotes(cellId);
    const note = notes[index];

    if (note.isRecurrentInstance) {
        Swal.fire({
            icon: 'info',
            title: 'Recordatorio Recurrente',
            text: 'Para editar o eliminar este recordatorio, debes hacerlo desde su fecha original de creación.',
            confirmButtonColor: '#0B4E32'
        });
        return;
    }

    const { value: action } = await Swal.fire({
        title: 'Editar Nota',
        input: 'textarea',
        inputValue: note.text,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonColor: '#0B4E32',
        denyButtonColor: '#d33',
        confirmButtonText: 'Guardar',
        denyButtonText: 'Eliminar',
        cancelButtonText: 'Cerrar'
    });

    if (action === undefined) return; // Cancelado

    // Eliminar
    if (Swal.isVisible() && document.activeElement.classList.contains('swal2-deny')) {
        notes.splice(index, 1);
        saveAgendaNotes(cellId, notes);
        renderAgenda();
        return;
    }

    // Guardar (Si no fue borrado, SweetAlert devuelve el texto del input en 'value')
    if (typeof action === 'string') {
        notes[index].text = action;
        saveAgendaNotes(cellId, notes);
        renderAgenda();
    }
}

// Interceptar el botón de Deny para manejar el borrado
// Nota: SweetAlertfire devuelve un objeto con isConfirmed, isDenied, etc.
// Vamos a refinar la función editOrDeleteNote para usar los resultados correctamente.

async function editOrDeleteNote(cellId, index) {
    const notes = getAgendaNotes(cellId);
    const note = notes[index];

    const result = await Swal.fire({
        title: 'Gestionar Evento',
        customClass: {
            popup: 'agenda-swal-custom',
            title: 'agenda-swal-title'
        },
        html: `
            <div class="reminder-form">
                <div class="agenda-form-group">
                    <label>Contenido del evento</label>
                    <textarea id="event-text" class="agenda-input-styled" rows="4">${note.text}</textarea>
                </div>
                ${note.type === 'reminder' ? `
                <div class="agenda-form-group">
                    <label>Frecuencia (Informativo)</label>
                    <input class="agenda-input-styled" value="${note.freq}" disabled>
                </div>` : ''}
            </div>
        `,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonColor: '#0B4E32',
        denyButtonColor: '#d33',
        confirmButtonText: 'Guardar Cambios',
        denyButtonText: 'Eliminar',
        cancelButtonText: 'Cerrar',
        preConfirm: () => {
            return document.getElementById('event-text').value;
        }
    });

    if (result.isConfirmed) {
        if (result.value) {
            notes[index].text = result.value;
            saveAgendaNotes(cellId, notes);
            renderAgenda();
        }
    } else if (result.isDenied) {
        notes.splice(index, 1);
        saveAgendaNotes(cellId, notes);
        renderAgenda();
    }
}

/**
 * Obtiene las notas de localStorage
 */
function getAgendaNotes(cellId) {
    const allNotes = JSON.parse(localStorage.getItem('inka_agenda_notes') || '{}');
    return allNotes[cellId] || [];
}

/**
 * Guarda las notas en localStorage
 */
function saveAgendaNotes(cellId, notes) {
    const allNotes = JSON.parse(localStorage.getItem('inka_agenda_notes') || '{}');
    if (notes.length === 0) {
        delete allNotes[cellId];
    } else {
        allNotes[cellId] = notes;
    }
    localStorage.setItem('inka_agenda_notes', JSON.stringify(allNotes));
}

// Inicializar listeners de navegación
document.addEventListener('DOMContentLoaded', () => {
    const prevBtn = document.getElementById('prev-week');
    const nextBtn = document.getElementById('next-week');
    
    if (prevBtn) prevBtn.onclick = prevWeek;
    if (nextBtn) nextBtn.onclick = nextWeek;

    // Cerrar modal al hacer click fuera del card
    const modal = document.getElementById('agenda-modal');
    if (modal) {
        modal.onclick = (e) => {
            if (e.target === modal) closeAgendaModal();
        };
    }
});

// Exponer funciones globalmente
window.openAgendaModal = openAgendaModal;
window.closeAgendaModal = closeAgendaModal;
