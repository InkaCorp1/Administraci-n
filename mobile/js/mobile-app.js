/**
 * Núcleo de la Aplicación Móvil - Manejo de Rutas y Módulos
 */

document.addEventListener('DOMContentLoaded', () => {
    initMobileApp();
});

async function initMobileApp() {
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
        document.querySelector('.main-content').innerHTML = `
            <div style="padding: 2rem; text-align: center;">
                <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: var(--error); margin-bottom: 1rem; display: block;"></i>
                <h3 style="margin-bottom: 0.5rem;">Módulo en mantenimiento</h3>
                <p style="color: #666; font-size: 0.9rem;">El módulo <strong>${view}</strong> está siendo optimizado para dispositivos móviles.</p>
                <button onclick="loadMobileView('desembolsos')" style="margin-top: 1.5rem; background: var(--primary); color: white; border: none; padding: 0.8rem 1.5rem; border-radius: 10px;">
                    Volver al Inicio
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

// Ayudante para volver a Escritorio
function goToDesktopModule(module) {
    sessionStorage.setItem('forceDesktop', 'true');
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

/**
 * LÃ³gica del botÃ³n "Volver Arriba"
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
