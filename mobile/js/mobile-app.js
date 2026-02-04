/**
 * Núcleo de la Aplicación Móvil - Manejo de Rutas y Módulos
 */

document.addEventListener('DOMContentLoaded', () => {
    initMobileApp();
});

async function initMobileApp() {
    // Bloqueo total desde JS si se intenta cargar en PC/Pantalla Grande
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isLargeScreen = window.innerWidth > 850;

    if (!isMobileUA && isLargeScreen) {
        console.log('[MOBILE-APP] Bloqueando carga de Móvil en PC...');
        window.location.replace('../');
        return;
    }

    console.log(`%c INKA CORP MOBILE - VERSION: ${window.APP_VERSION || 'v1.0'} `, 'background: #047857; color: #fff; font-weight: bold;');

    // 1. Inicializar Supabase y SesiÃ³n
    initSupabase();
    const { isAuthenticated, user } = await checkSession();
    if (!isAuthenticated) {
        window.location.href = '../login.html';
        return;
    }

    // Exponer localmente y globalmente
    window.currentUser = user;

    // 2. Saludo de usuario
    try {
        if (user) {
            const greetingName = document.querySelector('.greeting-name');
            if (greetingName) {
                const displayName = user.nombre || user.user_metadata?.full_name || 'Usuario';
                greetingName.textContent = displayName.split(' ')[0];
            }
        }
    } catch (err) {
        console.warn('Error setting greeting:', err);
    }

    // 3. Manejar vista inicial
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    const initialView = viewParam || 'desembolsos';

    await loadMobileView(initialView, false);

    // 4. Ocultar Splash Screen
    const splash = document.getElementById('splash-screen');
    if (splash) {
        splash.classList.add('fade-out');
        setTimeout(() => splash.remove(), 500);
    }
}

// Mapa de módulos cargados para evitar duplicidad
const loadedModules = new Set();

// Navegación a versión de escritorio
function goToDesktopModule(module) {
    sessionStorage.setItem('forceDesktop', 'true');
    window.location.href = `../views/${module}.html`;
}

async function loadMobileView(view, pushState = true) {
    // Si la vista es la base (index o vacÃ­a), redirigir a desembolsos
    if (!view || view === 'index') view = 'desembolsos';

    // Actualizar URL
    if (pushState) {
        const url = view === 'desembolsos' ? './' : `./?view=${view}`;
        history.pushState({ view: view }, '', url);
    }

    // Actualizar UI de NavegaciÃ³n
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.id === `nav-${view}`) item.classList.add('active');
    });

    // Controlar visibilidad del botón de reportes en el header
    const reportBtn = document.getElementById('report-btn-mobile');
    if (reportBtn) {
        if (view === 'creditos') {
            reportBtn.style.display = 'flex';
            reportBtn.onclick = () => {
                if (typeof window.openMobileExportModal === 'function') {
                    window.openMobileExportModal();
                }
            };
        } else if (view === 'bancos') {
            reportBtn.style.display = 'flex';
            reportBtn.onclick = () => {
                if (typeof window.generateMonthlyPaymentsReport === 'function') {
                    window.generateMonthlyPaymentsReport();
                } else {
                    console.error('generateMonthlyPaymentsReport function not found');
                    if (window.Swal) window.Swal.fire('Error', 'Función de reporte no disponible', 'error');
                }
            };
        } else {
            reportBtn.style.display = 'none';
        }
    }

    // 1. Cargar Template HTML
    try {
        const response = await fetch(`views/${view}.html`);
        if (response.ok) {
            const html = await response.text();

            // Validar que no sea el index.html principal (PC)
            if (html.includes('<title>INKA CORP - Dashboard</title>')) {
                throw new Error('Vista no encontrada (redirección detectada)');
            }

            document.querySelector('.main-content').innerHTML = html;
        } else {
            throw new Error('Error al cargar la vista');
        }
    } catch (e) {
        console.error(`Error en módulo ${view}:`, e);
        const title = view === 'socios' ? 'Módulo en Construcción' : 'Módulo en mantenimiento';
        const description = view === 'socios'
            ? 'El módulo de <strong>Socios</strong> está siendo desarrollado para la versión móvil.'
            : `El módulo <strong>${view}</strong> está siendo optimizado para dispositivos móviles.`;

        document.querySelector('.main-content').innerHTML = `
            <div style="padding: 2rem; text-align: center; margin-top: 2rem;">
                <i class="fas fa-tools" style="font-size: 4rem; color: #3b82f6; margin-bottom: 1.5rem; display: block;"></i>
                <h3 style="margin-bottom: 0.5rem; color: #1e293b;">${title}</h3>
                <p style="color: #64748b; font-size: 1rem; line-height: 1.5;">${description}</p>
                <button onclick="loadMobileView('desembolsos')" style="margin-top: 2rem; background: #047857; color: white; border: none; padding: 1rem 2rem; border-radius: 12px; font-weight: 600; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                    <i class="fas fa-home" style="margin-right: 0.5rem;"></i> Volver al Inicio
                </button>
            </div>
        `;
    }

    // 2. Cargar Recursos del Módulo (CSS/JS)
    await loadModuleResources(view);

    // 3. Ejecutar función de carga del módulo
    const loaderName = `init${view.charAt(0).toUpperCase() + view.slice(1)}Module`;
    if (typeof window[loaderName] === 'function') {
        window[loaderName]();
    } else {
        // Intentar fallback al nombre antiguo si existe
        const oldLoaderName = `load${view.charAt(0).toUpperCase() + view.slice(1)}View`;
        if (typeof window[oldLoaderName] === 'function') {
            window[oldLoaderName]();
        }
    }
}

async function loadModuleResources(moduleName) {
    if (loadedModules.has(moduleName)) return;

    // Intentar cargar CSS del mÃ³dulo
    const cssPath = `css/modules/${moduleName}.css`;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssPath;
    document.head.appendChild(link);

    // Intentar cargar JS del mÃ³dulo
    const jsPath = `js/modules/${moduleName}.js`;
    await new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = jsPath;
        script.onload = resolve;
        script.onerror = () => {
            console.error(`Error al cargar el mÃ³dulo JS: ${jsPath}`);
            resolve(); // Continuar aunque falle para no bloquear
        };
        document.body.appendChild(script);
    });

    loadedModules.add(moduleName);
}

// Navegación mediante Historial (Botón Atrás)
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.view) {
        loadMobileView(e.state.view, false);
    }
});

// Ayudante para volver a Escritorio (Desactivado por seguridad de UI)
function goToDesktopModule(module) {
    // Si es móvil, no permitimos ir a la versión de PC "fea"
    const isSmallScreen = window.innerWidth <= 850;
    if (isSmallScreen) {
        console.warn('Bloqueado acceso a vista PC desde móvil');
        loadMobileView('desembolsos');
        return;
    }
    window.location.href = `../views/${module}.html`;
}

/**
 * Muestra/Oculta el menú de acciones rápidas
 */
function toggleQuickMenu() {
    const overlay = document.getElementById('quick-menu-overlay');
    if (overlay) {
        overlay.classList.toggle('active');

        // Efecto haptics si está disponible
        if (overlay.classList.contains('active') && window.navigator.vibrate) {
            window.navigator.vibrate(10);
        }
    }
}

/**
 * Control de Modales Inmersivos
 */
function openLiteModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Bloquear scroll del fondo

        // Haptics al abrir
        if (window.navigator.vibrate) window.navigator.vibrate(5);
    }
}

function closeLiteModal(modalId = 'credito-lite-modal') {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = ''; // Restaurar scroll
    }
}

/** * Parsea una fecha asegurando que los strings YYYY-MM-DD se interpreten en la zona horaria de Ecuador
 */
function parseDate(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return dateInput;

    try {
        let dateStr = String(dateInput).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
            const onlyDate = dateStr.substring(0, 10);
            // Forzamos medianoche en Ecuador (UTC-5)
            return new Date(onlyDate + 'T00:00:00-05:00');
        }
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
    } catch (e) {
        console.error('Error parsing date:', e);
        return null;
    }
}

/**
 * Formatea una fecha a la zona horaria de Ecuador
 */
function formatDate(dateString, options = {}) {
    if (!dateString) return '-';
    try {
        const date = parseDate(dateString);
        if (!date) return '-';

        const defaultOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: 'America/Guayaquil'
        };
        return date.toLocaleDateString('es-EC', { ...defaultOptions, ...options });
    } catch (e) {
        console.error('Error formatting date:', e);
        return '-';
    }
}

// Exponer globalmente
window.parseDate = parseDate;
window.formatDate = formatDate;

/** * LÃ³gica del botÃ³n "Volver Arriba"
 */
function scrollToTop() {
    const container = document.querySelector('.main-content');
    if (container) {
        container.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
}

// Inicializar listener de scroll para el botón flotante
document.addEventListener('DOMContentLoaded', () => {
    const scrollBtn = document.getElementById('scroll-to-top');
    const scrollContainer = document.querySelector('.main-content');

    if (scrollContainer && scrollBtn) {
        scrollContainer.addEventListener('scroll', () => {
            if (scrollContainer.scrollTop > 300) {
                scrollBtn.classList.add('visible');
            } else {
                scrollBtn.classList.remove('visible');
            }
        });
    }
});
