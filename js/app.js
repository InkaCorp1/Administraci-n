/**
 * INKA CORP - Aplicación Principal
 * Maneja la navegación, carga de módulos y estado global
 */

// ==========================================
// ESTADO GLOBAL
// ==========================================
let currentUser = null;
let currentViewName = null;
const viewCache = new Map();

/**
 * Obtiene el usuario actual de forma segura
 * @returns {object|null} Usuario actual o null si no hay sesión
 */
function getCurrentUser() {
    return currentUser || window.currentUser || null;
}

// Exponer globalmente
window.getCurrentUser = getCurrentUser;

// ==========================================
// SISTEMA DE CACHÉ PERSISTENTE (localStorage)
// Caché que sobrevive al cierre del navegador
// Solo se limpia al cerrar sesión
// ==========================================
const CACHE_KEY = 'inkacorp_cache_v2';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos para considerar "fresco"
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 horas máximo antes de forzar actualización

// Tipos de datos que se cachean
const CACHE_TYPES = [
    'socios',
    'creditos',
    'solicitudes',
    'precancelaciones',
    'polizas',
    'ahorros',
    'pagos',
    'amortizaciones'
];

// Listeners para notificar a vistas cuando el caché se actualiza
const cacheUpdateListeners = new Map();

function ensureCacheShape(cache) {
    const safe = cache && typeof cache === 'object' ? cache : {};

    // Arrays de datos
    for (const type of CACHE_TYPES) {
        if (!Array.isArray(safe[type])) safe[type] = [];
    }

    // lastUpdate por tipo
    if (!safe.lastUpdate || typeof safe.lastUpdate !== 'object') safe.lastUpdate = {};
    for (const type of CACHE_TYPES) {
        if (typeof safe.lastUpdate[type] !== 'number') safe.lastUpdate[type] = 0;
    }

    // Metadata del caché
    if (typeof safe.createdAt !== 'number') safe.createdAt = Date.now();
    if (typeof safe.version !== 'number') safe.version = 2;

    return safe;
}

// Inicializar caché desde localStorage
function initCache() {
    try {
        const stored = localStorage.getItem(CACHE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Verificar si el caché no es demasiado viejo
            if (parsed.createdAt && (Date.now() - parsed.createdAt) > CACHE_MAX_AGE) {
                console.log('⚠ Caché expirado (>24h), reiniciando...');
                window.dataCache = ensureCacheShape(null);
            } else {
                window.dataCache = ensureCacheShape(parsed);
                console.log('✓ Caché cargado desde localStorage');
            }
        } else {
            window.dataCache = ensureCacheShape(null);
        }
    } catch (e) {
        console.warn('Error cargando caché:', e);
        window.dataCache = ensureCacheShape(null);
    }
}

// Guardar caché en localStorage (persistente)
function saveCache() {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(window.dataCache));
    } catch (e) {
        console.warn('No se pudo guardar caché en localStorage:', e);
        // Si localStorage está lleno, limpiar datos antiguos
        if (e.name === 'QuotaExceededError') {
            clearOldCacheData();
        }
    }
}

// Limpiar datos antiguos si localStorage está lleno
function clearOldCacheData() {
    try {
        // Mantener solo los datos más recientes
        if (window.dataCache) {
            for (const type of CACHE_TYPES) {
                if (window.dataCache[type] && window.dataCache[type].length > 500) {
                    window.dataCache[type] = window.dataCache[type].slice(0, 500);
                }
            }
            localStorage.setItem(CACHE_KEY, JSON.stringify(window.dataCache));
        }
    } catch (e) {
        console.error('Error limpiando caché antiguo:', e);
    }
}

// Limpiar caché completamente (solo al cerrar sesión)
function clearCache() {
    window.dataCache = ensureCacheShape(null);
    localStorage.removeItem(CACHE_KEY);
    // Limpiar también sessionStorage por si acaso
    sessionStorage.removeItem('inkacorp_cache');
    console.log('✓ Caché limpiado completamente');
}

// Exponer globalmente
window.clearCache = clearCache;
window.saveCacheToDisk = saveCache;
window.saveCache = saveCache;

// Verificar si el caché es válido (fresco)
window.isCacheValid = function (type) {
    if (!window.dataCache) initCache();
    const lastUpdate = window.dataCache.lastUpdate[type] || 0;
    return Date.now() - lastUpdate < CACHE_DURATION;
};

// Verificar si hay datos en caché (aunque no estén frescos)
window.hasCacheData = function (type) {
    if (!window.dataCache) initCache();
    return window.dataCache[type] && window.dataCache[type].length > 0;
};

// Obtener datos del caché
window.getCacheData = function (type) {
    if (!window.dataCache) initCache();
    return window.dataCache[type] || [];
};

// Establecer datos en caché
window.setCacheData = function (type, data) {
    if (!window.dataCache) initCache();
    window.dataCache[type] = data;
    window.dataCache.lastUpdate[type] = Date.now();
    saveCache();
    // Notificar a listeners
    notifyCacheUpdate(type, data);
};

// Registrar listener para actualizaciones de caché
window.onCacheUpdate = function (type, callback) {
    if (!cacheUpdateListeners.has(type)) {
        cacheUpdateListeners.set(type, []);
    }
    cacheUpdateListeners.get(type).push(callback);
};

// Remover listener
window.offCacheUpdate = function (type, callback) {
    if (cacheUpdateListeners.has(type)) {
        const listeners = cacheUpdateListeners.get(type);
        const index = listeners.indexOf(callback);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    }
};

// Notificar a listeners cuando el caché se actualiza
function notifyCacheUpdate(type, data) {
    if (cacheUpdateListeners.has(type)) {
        cacheUpdateListeners.get(type).forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                console.error('Error en listener de caché:', e);
            }
        });
    }
}

// Forzar actualización del caché (botón sincronizar)
async function forceRefreshCache() {
    console.log('⟳ Forzando actualización del caché...');
    if (!window.dataCache) initCache();
    window.dataCache = ensureCacheShape(window.dataCache);
    for (const type of CACHE_TYPES) {
        window.dataCache.lastUpdate[type] = 0;
    }
    await refreshCacheInBackground();
    return true;
}
window.forceRefreshCache = forceRefreshCache;

// Cargar datos en segundo plano
async function refreshCacheInBackground() {
    try {
        const supabase = window.getSupabaseClient();
        if (!supabase) return;

        if (!window.dataCache) initCache();
        window.dataCache = ensureCacheShape(window.dataCache);

        const [sociosRes, creditosRes, solicitudesRes, precancelacionesRes, polizasRes] = await Promise.all([
            supabase
                .from('ic_socios')
                .select(`
                    *,
                    creditos:ic_creditos!id_socio (
                        id_credito,
                        estado_credito,
                        capital
                    )
                `)
                .order('nombre', { ascending: true }),
            supabase
                .from('ic_creditos')
                .select(`
                    *,
                    socio:ic_socios!id_socio (
                        idsocio,
                        nombre,
                        cedula,
                        whatsapp,
                        paisresidencia
                    )
                `)
                .order('created_at', { ascending: false }),
            supabase
                .from('ic_solicitud_de_credito')
                .select('*')
                .order('solicitudid', { ascending: false }),
            supabase
                .from('ic_creditos_precancelacion')
                .select(`
                    *,
                    credito:ic_creditos!id_credito (
                        id_credito,
                        codigo_credito,
                        capital,
                        socio:ic_socios!id_socio (
                            idsocio,
                            nombre,
                            cedula
                        )
                    )
                `)
                .order('fecha_precancelacion', { ascending: false }),
            supabase
                .from('ic_polizas')
                .select(`
                    *,
                    socio:ic_socios!id_socio (
                        idsocio,
                        nombre,
                        cedula,
                        whatsapp
                    )
                `)
                .order('created_at', { ascending: false })
        ]);

        if (!sociosRes.error && sociosRes.data) {
            window.dataCache.socios = sociosRes.data;
            window.dataCache.lastUpdate.socios = Date.now();
            notifyCacheUpdate('socios', sociosRes.data);
        } else if (sociosRes.error) {
            console.warn('No se pudo refrescar socios en caché:', sociosRes.error);
        }

        if (!creditosRes.error && creditosRes.data) {
            window.dataCache.creditos = creditosRes.data;
            window.dataCache.lastUpdate.creditos = Date.now();
            notifyCacheUpdate('creditos', creditosRes.data);
        } else if (creditosRes.error) {
            console.warn('No se pudo refrescar créditos en caché:', creditosRes.error);
        }

        if (!solicitudesRes.error && solicitudesRes.data) {
            window.dataCache.solicitudes = solicitudesRes.data;
            window.dataCache.lastUpdate.solicitudes = Date.now();
            notifyCacheUpdate('solicitudes', solicitudesRes.data);
        } else if (solicitudesRes.error) {
            console.warn('No se pudo refrescar solicitudes en caché:', solicitudesRes.error);
        }

        if (!precancelacionesRes.error && precancelacionesRes.data) {
            window.dataCache.precancelaciones = precancelacionesRes.data;
            window.dataCache.lastUpdate.precancelaciones = Date.now();
            notifyCacheUpdate('precancelaciones', precancelacionesRes.data);
        } else if (precancelacionesRes.error) {
            console.warn('No se pudo refrescar precancelaciones en caché:', precancelacionesRes.error);
        }

        if (!polizasRes.error && polizasRes.data) {
            window.dataCache.polizas = polizasRes.data;
            window.dataCache.lastUpdate.polizas = Date.now();
            notifyCacheUpdate('polizas', polizasRes.data);
        } else if (polizasRes.error) {
            console.warn('No se pudo refrescar pólizas en caché:', polizasRes.error);
        }

        // Guardar en localStorage (persistente)
        saveCache();
        console.log('✓ Caché actualizado en segundo plano');

    } catch (error) {
        console.error('Error actualizando caché:', error);
    }
}

// Iniciar actualización periódica del caché
function startCacheRefresh() {
    // Inicializar caché desde localStorage
    initCache();

    window.dataCache = ensureCacheShape(window.dataCache);

    // Siempre refrescar en segundo plano al iniciar (pero los datos de caché ya están disponibles)
    console.log('⟳ Iniciando actualización de caché en segundo plano...');
    refreshCacheInBackground();

    // Refrescar cada 5 minutos
    setInterval(refreshCacheInBackground, CACHE_DURATION);
}

// ==========================================
// ELEMENTOS DEL DOM
// ==========================================
let sidebar, mainContent, logoutBtn;
let userNameDisplay, userRoleDisplay, userAvatarDisplay;
let appLoader, appLoaderText;
let loaderCount = 0;

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();
    await initApp();
});

async function initApp() {
    // Verificar sesión
    const { isAuthenticated, user } = await checkSession();

    if (!isAuthenticated) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = user;
    // Exponer currentUser globalmente para acceso desde otros módulos
    window.currentUser = user;

    // Cachear elementos del DOM
    sidebar = document.getElementById('sidebar');
    mainContent = document.getElementById('main-content');
    logoutBtn = document.getElementById('logout-btn');
    userNameDisplay = document.getElementById('user-name');
    userRoleDisplay = document.getElementById('user-role');
    userAvatarDisplay = document.getElementById('user-avatar');
    appLoader = document.getElementById('app-loader');
    appLoaderText = document.getElementById('app-loader-text');

    // Actualizar UI con datos del usuario
    updateUI();

    // Configurar event listeners
    setupEventListeners();

    // Iniciar caché en segundo plano
    startCacheRefresh();

    // Cargar vista inicial - verificar si hay hash en la URL
    const hash = window.location.hash.replace('#', '');
    const validViews = ['dashboard', 'socios', 'solicitud_credito', 'creditos', 'precancelaciones', 'ahorros', 'polizas', 'simulador'];
    const initialView = (hash && validViews.includes(hash)) ? hash : 'dashboard';

    await loadView(initialView);

    // Actualizar navegación activa si hay hash
    if (hash && validViews.includes(hash)) {
        const navItems = document.querySelectorAll('.nav-item[data-view]');
        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.view === hash);
        });
    }
}

function updateUI() {
    if (currentUser) {
        if (userNameDisplay) userNameDisplay.textContent = currentUser.nombre || 'Usuario';
        if (userRoleDisplay) userRoleDisplay.textContent = currentUser.rol || 'usuario';
        if (userAvatarDisplay) {
            // Mostrar iniciales del nombre
            const initials = (currentUser.nombre || 'U').split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .substring(0, 2);
            userAvatarDisplay.textContent = initials;
        }
    }

    // Aplicar visibilidad de módulos según rol
    applyModuleVisibility();
}

function applyModuleVisibility() {
    const navItems = document.querySelectorAll('.nav-item[data-module]');
    navItems.forEach(item => {
        const module = item.dataset.module;
        const requiresAdmin = item.dataset.requiresAdmin === 'true';

        // Si requiere admin y el usuario no es admin, ocultar
        if (requiresAdmin && !isAdmin()) {
            item.style.display = 'none';
        } else {
            item.style.display = '';
        }
    });
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupEventListeners() {
    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await logout();
        });
    }



    // Navegación
    const navItems = document.querySelectorAll('.nav-item[data-view]');
    navItems.forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            await loadView(view);

            // Actualizar estado activo
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Cerrar sidebar al seleccionar vista
            closeSidebar();
        });
    });

    // Toggle Sidebar
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }
}

// ==========================================
// SIDEBAR TOGGLE
// ==========================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const toggle = document.getElementById('sidebar-toggle');

    if (sidebar.classList.contains('collapsed')) {
        // Abrir sidebar
        sidebar.classList.remove('collapsed');
        overlay?.classList.add('active');
        toggle?.classList.add('hidden');
    } else {
        closeSidebar();
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const toggle = document.getElementById('sidebar-toggle');

    sidebar?.classList.add('collapsed');
    overlay?.classList.remove('active');
    toggle?.classList.remove('hidden');
}

// Exponer funciones globalmente
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;



// ==========================================
// LOADER (Deshabilitado para carga instantánea con caché)
// ==========================================
let loaderDisabled = true; // Deshabilitar loader global por defecto

function showAppLoader(message = 'Cargando...') {
    if (loaderDisabled || !appLoader) return;
    if (appLoaderText) appLoaderText.textContent = message;
    appLoader.classList.remove('hidden');
}

function hideAppLoader() {
    if (!appLoader) return;
    appLoader.classList.add('hidden');
}

function beginLoading(message = 'Cargando...') {
    // No mostrar loader si está deshabilitado (carga instantánea)
    if (loaderDisabled) return;
    loaderCount += 1;
    showAppLoader(message);
}

function endLoading() {
    if (loaderDisabled) return;
    loaderCount = Math.max(0, loaderCount - 1);
    if (loaderCount === 0) hideAppLoader();
}

// Habilitar loader temporalmente para operaciones específicas
function enableLoader() {
    loaderDisabled = false;
}

function disableLoader() {
    loaderDisabled = true;
    hideAppLoader();
}

// ==========================================
// SCREEN LOCKER (Pantalla de carga inicial PWA)
// ==========================================
let screenLockerRemoved = false;

function hideScreenLocker() {
    if (screenLockerRemoved) return;

    const screenLocker = document.getElementById('app-screen-locker');
    const appLayout = document.getElementById('app-layout');

    if (screenLocker) {
        screenLocker.classList.add('hiding');
        setTimeout(() => {
            screenLocker.remove();
        }, 500);
    }

    if (appLayout) {
        appLayout.style.display = '';
    }

    screenLockerRemoved = true;
    console.log('✓ Screen locker ocultado, app visible');
}

// Exponer globalmente
window.hideScreenLocker = hideScreenLocker;

async function withLoader(message, fn) {
    // Temporalmente habilitar loader para operaciones largas explícitas
    const wasDisabled = loaderDisabled;
    loaderDisabled = false;
    beginLoading(message);
    try {
        return await fn();
    } finally {
        endLoading();
        loaderDisabled = wasDisabled;
    }
}

// ==========================================
// SISTEMA DE ALERTAS PERSONALIZADAS
// ==========================================
function createAlertContainer() {
    let container = document.getElementById('custom-alert-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'custom-alert-container';
        container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; max-width: 400px;';
        document.body.appendChild(container);
    }
    return container;
}

function createModalContainer() {
    let container = document.getElementById('custom-modal-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'custom-modal-container';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * Muestra una notificación toast
 * @param {string} message - Mensaje a mostrar
 * @param {string} type - Tipo: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duración en ms (default 4000)
 */
function showToast(message, type = 'info', duration = 4000) {
    const container = createAlertContainer();

    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-times-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };

    const colors = {
        success: { bg: '#10b981', border: '#059669' },
        error: { bg: '#ef4444', border: '#dc2626' },
        warning: { bg: '#f59e0b', border: '#d97706' },
        info: { bg: '#3b82f6', border: '#2563eb' }
    };

    const color = colors[type] || colors.info;
    const icon = icons[type] || icons.info;

    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.style.cssText = 'background: ' + color.bg + '; border-left: 4px solid ' + color.border + '; color: white; padding: 1rem 1.25rem; border-radius: 0.5rem; box-shadow: 0 10px 25px rgba(0,0,0,0.2); display: flex; align-items: center; gap: 0.75rem; animation: slideInRight 0.3s ease; font-size: 0.9rem;';

    toast.innerHTML = '<i class="' + icon + '" style="font-size: 1.25rem;"></i>' +
        '<span style="flex: 1;">' + message + '</span>' +
        '<button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; cursor: pointer; padding: 0; opacity: 0.7;"><i class="fas fa-times"></i></button>';

    container.appendChild(toast);

    // Auto-remove
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Muestra un alert modal personalizado (reemplazo de alert())
 * @param {string} message - Mensaje a mostrar
 * @param {string} title - Título opcional
 * @param {string} type - Tipo: 'success', 'error', 'warning', 'info'
 */
function showAlert(message, title = '', type = 'info') {
    return new Promise(resolve => {
        const container = createModalContainer();

        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-times-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };

        const color = colors[type] || colors.info;
        const icon = icons[type] || icons.info;
        const displayTitle = title || (type === 'error' ? 'Error' : type === 'warning' ? 'Atención' : type === 'success' ? '¡Éxito!' : 'Información');

        const modal = document.createElement('div');
        modal.className = 'custom-alert-modal';
        modal.style.cssText = 'position: fixed; inset: 0; z-index: 10001; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); animation: fadeIn 0.2s ease;';

        modal.innerHTML = '<div style="background: white; border-radius: 1rem; padding: 2rem; max-width: 400px; width: 90%; text-align: center; box-shadow: 0 25px 50px rgba(0,0,0,0.25); animation: scaleIn 0.2s ease;">' +
            '<div style="width: 60px; height: 60px; border-radius: 50%; background: ' + color + '20; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">' +
            '<i class="' + icon + '" style="font-size: 1.75rem; color: ' + color + ';"></i>' +
            '</div>' +
            '<h3 style="color: #1e293b; font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">' + displayTitle + '</h3>' +
            '<p style="color: #64748b; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.5rem;">' + message + '</p>' +
            '<button class="custom-alert-btn" style="background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; border: none; padding: 0.75rem 2rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; font-size: 0.95rem; box-shadow: 0 4px 12px rgba(11, 78, 50, 0.3);">Aceptar</button>' +
            '</div>';

        const closeModal = () => {
            modal.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => {
                modal.remove();
                resolve();
            }, 200);
        };

        modal.querySelector('.custom-alert-btn').onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };

        container.appendChild(modal);
        modal.querySelector('.custom-alert-btn').focus();
    });
}

/**
 * Muestra un confirm modal personalizado (reemplazo de confirm())
 * @param {string} message - Mensaje a mostrar
 * @param {string} title - Título opcional
 * @param {object} options - Opciones adicionales
 */
function showConfirm(message, title = '¿Confirmar acción?', options = {}) {
    return new Promise(resolve => {
        const container = createModalContainer();

        const confirmText = options.confirmText || 'Confirmar';
        const cancelText = options.cancelText || 'Cancelar';
        const type = options.type || 'warning';

        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-times-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-question-circle',
            danger: 'fas fa-exclamation-circle'
        };

        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6',
            danger: '#ef4444'
        };

        const color = colors[type] || colors.warning;
        const icon = icons[type] || icons.warning;

        const modal = document.createElement('div');
        modal.className = 'custom-confirm-modal';
        modal.style.cssText = 'position: fixed; inset: 0; z-index: 10001; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); animation: fadeIn 0.2s ease;';

        modal.innerHTML = '<div style="background: white; border-radius: 1rem; padding: 2rem; max-width: 420px; width: 90%; text-align: center; box-shadow: 0 25px 50px rgba(0,0,0,0.25); animation: scaleIn 0.2s ease;">' +
            '<div style="width: 60px; height: 60px; border-radius: 50%; background: ' + color + '20; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">' +
            '<i class="' + icon + '" style="font-size: 1.75rem; color: ' + color + ';"></i>' +
            '</div>' +
            '<h3 style="color: #1e293b; font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">' + title + '</h3>' +
            '<p style="color: #64748b; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.5rem;">' + message + '</p>' +
            '<div style="display: flex; gap: 0.75rem; justify-content: center;">' +
            '<button class="custom-cancel-btn" style="background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; font-size: 0.95rem;">' + cancelText + '</button>' +
            '<button class="custom-confirm-btn" style="background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; font-size: 0.95rem; box-shadow: 0 4px 12px rgba(11, 78, 50, 0.3);">' + confirmText + '</button>' +
            '</div>' +
            '</div>';

        const closeModal = (result) => {
            modal.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => {
                modal.remove();
                resolve(result);
            }, 200);
        };

        modal.querySelector('.custom-confirm-btn').onclick = () => closeModal(true);
        modal.querySelector('.custom-cancel-btn').onclick = () => closeModal(false);

        container.appendChild(modal);
        modal.querySelector('.custom-confirm-btn').focus();
    });
}

// Exponer globalmente
window.showToast = showToast;
window.showAlert = showAlert;
window.showConfirm = showConfirm;
window.enableLoader = enableLoader;
window.disableLoader = disableLoader;

// ==========================================
// CARGA DE VISTAS
// ==========================================
async function loadView(viewName) {
    try {
        // Si es la misma vista, no recargar
        if (currentViewName === viewName) return;

        // Limpiar sticky headers de créditos si existe
        if (typeof cleanupStickyHeaders === 'function') {
            cleanupStickyHeaders();
        }

        beginLoading('Cargando módulo...');

        // Cargar HTML de la vista
        const response = await fetch(`views/${viewName}.html`);
        if (!response.ok) throw new Error(`Vista "${viewName}" no encontrada`);
        const html = await response.text();

        // Insertar en el contenedor principal
        if (mainContent) {
            mainContent.innerHTML = html;
        }

        // Inicializar módulo según la vista
        switch (viewName) {
            case 'dashboard':
                initDashboardView();
                break;
            case 'socios':
                if (typeof initSociosModule === 'function') {
                    await initSociosModule();
                }
                break;
            case 'solicitud_credito':
                if (typeof initSolicitudCreditoModule === 'function') {
                    await initSolicitudCreditoModule();
                }
                break;
            case 'creditos':
                if (typeof initCreditosModule === 'function') {
                    await initCreditosModule();
                }
                break;
            case 'precancelaciones':
                if (typeof initPrecancelacionesModule === 'function') {
                    await initPrecancelacionesModule();
                }
                break;
            case 'ahorros':
                if (typeof initAhorrosModule === 'function') {
                    await initAhorrosModule();
                }
                break;
            case 'polizas':
                if (typeof initPolizasModule === 'function') {
                    await initPolizasModule();
                }
                break;
            case 'simulador':
                if (typeof initSimuladorModule === 'function') {
                    await initSimuladorModule();
                }
                break;
        }

        currentViewName = viewName;
        endLoading();

    } catch (error) {
        endLoading();
        console.error('Error loading view:', error);
        if (mainContent) {
            mainContent.innerHTML = `
                <div class="content-wrapper">
                    <div class="error-container" style="text-align: center; padding: 3rem;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: var(--error); margin-bottom: 1rem;"></i>
                        <h2 style="color: var(--white); margin-bottom: 0.5rem;">Error al cargar el módulo</h2>
                        <p style="color: var(--gray-400);">${error.message}</p>
                        <button class="btn btn-primary mt-4" onclick="loadView('dashboard')">
                            <i class="fas fa-home"></i> Volver al inicio
                        </button>
                    </div>
                </div>
            `;
        }
    }
}

// ==========================================
// DASHBOARD VIEW
// ==========================================
function initDashboardView() {
    console.log('Inicializando Dashboard...');

    // Ocultar screen locker y mostrar app-layout (solo en la primera carga)
    hideScreenLocker();
    // Event listeners para las cards de módulos
    const moduleCards = document.querySelectorAll('.module-card[data-view]');
    moduleCards.forEach(card => {
        card.addEventListener('click', async () => {
            const view = card.dataset.view;
            await loadView(view);

            // Actualizar navegación activa
            const navItems = document.querySelectorAll('.nav-item[data-view]');
            navItems.forEach(item => {
                item.classList.toggle('active', item.dataset.view === view);
            });
        });
    });

    // Actualizar saludo
    updateDashboardGreeting();

    // Cargar estadísticas
    loadDashboardStats();
}

// Actualizar saludo del dashboard
function updateDashboardGreeting() {
    const hour = new Date().getHours();
    let greeting = 'Buenos días';

    if (hour >= 12 && hour < 18) {
        greeting = 'Buenas tardes';
    } else if (hour >= 18 || hour < 6) {
        greeting = 'Buenas noches';
    }

    const userName = currentUser?.nombre?.split(' ')[0] || 'Usuario';
    const greetingEl = document.getElementById('dashboard-greeting');
    if (greetingEl) {
        greetingEl.innerHTML = `${greeting}, <span class="text-gold">${userName}</span>`;
    }
}

// Cargar estadísticas del dashboard
async function loadDashboardStats() {
    console.log('Cargando estadísticas del dashboard...');

    try {
        const supabase = window.getSupabaseClient();
        if (!supabase) {
            console.error('Supabase client no disponible');
            return;
        }

        // Cargar socios
        const { data: socios, error: errorSocios } = await supabase
            .from('ic_socios')
            .select('idsocio');

        if (errorSocios) {
            console.error('Error cargando socios:', errorSocios);
        } else {
            const totalSocios = socios?.length || 0;
            const elSocios = document.getElementById('dash-total-socios');
            if (elSocios) elSocios.textContent = totalSocios;

            console.log('Total socios:', totalSocios);
        }

        // Cargar créditos
        const { data: creditos, error: errorCreditos } = await supabase
            .from('ic_creditos')
            .select('id_credito, capital, estado_credito');

        if (errorCreditos) {
            console.error('Error cargando créditos:', errorCreditos);
        } else if (creditos) {
            console.log('Créditos cargados:', creditos.length);

            const activos = creditos.filter(c => c.estado_credito === 'ACTIVO');
            const morosos = creditos.filter(c => c.estado_credito === 'MOROSO');
            const totalActivos = activos.length + morosos.length;

            // Créditos activos
            const elActivos = document.getElementById('dash-creditos-activos');
            if (elActivos) elActivos.textContent = totalActivos;

            // Porcentaje de mora
            const porcentajeMora = totalActivos > 0
                ? Math.round((morosos.length / totalActivos) * 100)
                : 0;
            const elMora = document.getElementById('dash-porcentaje-mora');
            if (elMora) elMora.textContent = `${porcentajeMora}%`;

            // Cartera total
            const cartera = creditos
                .filter(c => c.estado_credito === 'ACTIVO' || c.estado_credito === 'MOROSO')
                .reduce((sum, c) => sum + parseFloat(c.capital || 0), 0);

            const carteraFormatted = '$' + cartera.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const elCartera = document.getElementById('dash-cartera-total');
            if (elCartera) elCartera.textContent = carteraFormatted;

            console.log('Stats: activos=', totalActivos, 'mora=', porcentajeMora + '%', 'cartera=', cartera);
        }

        // Cargar próximos vencimientos
        await loadSociosMorosos();

        // Cargar desembolsos pendientes
        await loadDesembolsosPendientes();

    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

// Cargar socios morosos para el dashboard (con caché)
async function loadSociosMorosos() {
    const container = document.getElementById('socios-morosos-list');
    const countBadge = document.getElementById('morosos-count');
    if (!container) return;

    // Verificar si hay caché válido de morosos
    const CACHE_KEY = 'morosos';
    const cacheIsValid = window.isCacheValid && window.isCacheValid(CACHE_KEY) && window.dataCache?.morosos?.length;

    // Si hay caché válido, renderizar inmediatamente
    if (cacheIsValid) {
        console.log('📦 Cargando morosos desde caché');
        renderMorososDashboard(window.dataCache.morosos, container, countBadge);

        // Actualizar en segundo plano
        setTimeout(() => {
            fetchMorososFromDB(container, countBadge, true);
        }, 100);
        return;
    }

    // Si no hay caché, cargar desde DB
    await fetchMorososFromDB(container, countBadge, false);
}

// Función para obtener morosos desde la base de datos
async function fetchMorososFromDB(container, countBadge, isBackgroundUpdate) {
    try {
        const supabase = window.getSupabaseClient();

        // Obtener cuotas vencidas con información del crédito y socio
        const { data: cuotasVencidas, error } = await supabase
            .from('ic_creditos_amortizacion')
            .select(`
                numero_cuota,
                fecha_vencimiento,
                cuota_total,
                estado_cuota,
                credito:ic_creditos!id_credito (
                    id_credito,
                    capital,
                    estado_credito,
                    socio:ic_socios!id_socio (
                        idsocio,
                        nombre,
                        cedula,
                        paisresidencia
                    )
                )
            `)
            .eq('estado_cuota', 'VENCIDO')
            .order('fecha_vencimiento', { ascending: true });

        if (error) {
            console.error('Error en query morosos:', error);
            throw error;
        }

        if (!cuotasVencidas || cuotasVencidas.length === 0) {
            // Guardar en caché que no hay morosos
            if (window.dataCache) {
                window.dataCache.morosos = [];
                if (!window.dataCache.lastUpdate) window.dataCache.lastUpdate = {};
                window.dataCache.lastUpdate.morosos = Date.now();
                if (window.saveCacheToDisk) window.saveCacheToDisk();
            }

            if (!isBackgroundUpdate) {
                container.innerHTML = `
                    <div class="activity-empty">
                        <i class="fas fa-check-circle" style="color: #34d399;"></i>
                        <p>No hay socios en mora</p>
                    </div>
                `;
                if (countBadge) countBadge.textContent = '0';
            }
            return;
        }

        // Agrupar por socio y calcular el total vencido y días de mora
        const morososMap = new Map();
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        cuotasVencidas.forEach(cuota => {
            if (!cuota.credito || !cuota.credito.socio) return;

            // Excluir créditos PAUSADOS - no cuentan como mora
            if (cuota.credito.estado_credito === 'PAUSADO') return;

            const socioId = cuota.credito.socio.idsocio;
            const fechaVencimiento = parseDate(cuota.fecha_vencimiento);
            const diasVencido = Math.floor((hoy - fechaVencimiento) / (1000 * 60 * 60 * 24));

            if (morososMap.has(socioId)) {
                const moroso = morososMap.get(socioId);
                moroso.montoVencido += parseFloat(cuota.cuota_total);
                moroso.cuotasVencidas++;
                if (diasVencido > moroso.diasMora) {
                    moroso.diasMora = diasVencido;
                }
            } else {
                morososMap.set(socioId, {
                    socioId: socioId,
                    nombre: cuota.credito.socio.nombre,
                    cedula: cuota.credito.socio.cedula,
                    pais: cuota.credito.socio.paisresidencia || 'desconocido',
                    montoVencido: parseFloat(cuota.cuota_total),
                    cuotasVencidas: 1,
                    diasMora: diasVencido > 0 ? diasVencido : 0,
                    creditoId: cuota.credito.id_credito
                });
            }
        });

        // Convertir a array y ordenar por días de mora (más antiguo primero)
        const morosos = Array.from(morososMap.values())
            .sort((a, b) => b.diasMora - a.diasMora);

        // Guardar en caché
        if (window.dataCache) {
            window.dataCache.morosos = morosos;
            if (!window.dataCache.lastUpdate) window.dataCache.lastUpdate = {};
            window.dataCache.lastUpdate.morosos = Date.now();
            if (window.saveCacheToDisk) window.saveCacheToDisk();
            if (isBackgroundUpdate) {
                console.log('✓ Caché de morosos actualizado en segundo plano');
            }
        }

        // Renderizar
        renderMorososDashboard(morosos, container, countBadge);

    } catch (error) {
        console.error('Error cargando socios morosos:', error);
        if (!isBackgroundUpdate) {
            container.innerHTML = `
                <div class="activity-empty">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error al cargar datos</p>
                </div>
            `;
        }
    }
}

// Cargar desembolsos pendientes para el dashboard
async function loadDesembolsosPendientes() {
    const section = document.getElementById('desembolsos-pendientes-section');
    const container = document.getElementById('desembolsos-pendientes-list');
    const countBadge = document.getElementById('desembolsos-count');

    if (!container || !section) return;

    try {
        const supabase = window.getSupabaseClient();

        // Obtener créditos en estado PENDIENTE (colocados pero no desembolsados)
        const { data: creditosPendientes, error } = await supabase
            .from('ic_creditos')
            .select(`
                id_credito,
                codigo_credito,
                capital,
                plazo,
                cuota_con_ahorro,
                tasa_interes_mensual,
                fecha_desembolso,
                garante,
                created_at,
                id_socio
            `)
            .eq('estado_credito', 'PENDIENTE')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error cargando desembolsos pendientes:', error);
            return;
        }

        // Mostrar u ocultar sección según haya datos
        if (!creditosPendientes || creditosPendientes.length === 0) {
            section.classList.add('hidden');
            return;
        }

        // Cargar datos de socios relacionados
        const socioIds = [...new Set(creditosPendientes.map(c => c.id_socio))];
        const { data: socios } = await supabase
            .from('ic_socios')
            .select('idsocio, nombre, cedula, whatsapp')
            .in('idsocio', socioIds);

        // Mapear socios a créditos
        creditosPendientes.forEach(credito => {
            credito.socio = socios?.find(s => s.idsocio === credito.id_socio) || {};
        });

        section.classList.remove('hidden');
        if (countBadge) countBadge.textContent = creditosPendientes.length;

        // Renderizar cards de desembolsos
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
                        <button class="desembolso-btn desembolso-btn-docs" onclick="abrirModalDocumentosCredito('${credito.id_credito}')">
                            <i class="fas fa-file-pdf"></i> Documentos
                        </button>
                        <button class="desembolso-btn desembolso-btn-desembolsar" onclick="desembolsarCredito('${credito.id_credito}')">
                            <i class="fas fa-money-bill-wave"></i> Desembolsar
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        console.log('✅ Desembolsos pendientes:', creditosPendientes.length);

    } catch (error) {
        console.error('Error loading desembolsos pendientes:', error);
    }
}

// Función para renderizar morosos en el dashboard
function renderMorososDashboard(morosos, container, countBadge) {
    if (!morosos || morosos.length === 0) {
        container.innerHTML = `
            <div class="activity-empty">
                <i class="fas fa-check-circle" style="color: #34d399;"></i>
                <p>No hay socios en mora</p>
            </div>
        `;
        if (countBadge) countBadge.textContent = '0';
        return;
    }

    if (countBadge) countBadge.textContent = morosos.length;

    // Actualizar el indicador de cantidad en mora en las stats
    const cantidadMoraEl = document.getElementById('dash-cantidad-mora');
    if (cantidadMoraEl) {
        cantidadMoraEl.textContent = morosos.length;
    }

    // Función para obtener iniciales
    const getInitials = (nombre) => {
        if (!nombre) return '??';
        const parts = nombre.trim().split(' ').filter(p => p.length > 0);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return parts[0] ? parts[0].substring(0, 2).toUpperCase() : '??';
    };

    // Función para obtener color dinámico basado en días de mora
    const getMoraColor = (dias) => {
        const maxDias = 90;
        const porcentaje = Math.min(dias / maxDias, 1);
        const r = Math.round(255 - (porcentaje * 55));
        const g = Math.round(180 - (porcentaje * 150));
        const b = Math.round(100 - (porcentaje * 70));
        return `rgb(${r}, ${g}, ${b})`;
    };

    // Función para obtener bandera de país
    const getPaisFlag = (pais) => {
        if (!pais) return '';
        const paisLower = pais.toLowerCase();
        const flags = {
            'ecuador': 'https://flagcdn.com/w20/ec.png',
            'colombia': 'https://flagcdn.com/w20/co.png',
            'peru': 'https://flagcdn.com/w20/pe.png',
            'perú': 'https://flagcdn.com/w20/pe.png',
            'venezuela': 'https://flagcdn.com/w20/ve.png',
            'estados unidos': 'https://flagcdn.com/w20/us.png',
            'usa': 'https://flagcdn.com/w20/us.png',
            'españa': 'https://flagcdn.com/w20/es.png',
            'mexico': 'https://flagcdn.com/w20/mx.png',
            'méxico': 'https://flagcdn.com/w20/mx.png'
        };
        return flags[paisLower] || '';
    };

    // Agrupar morosos por país
    const morososPorPais = {};
    morosos.forEach(moroso => {
        const pais = (moroso.pais || 'Sin país').toUpperCase();
        if (!morososPorPais[pais]) {
            morososPorPais[pais] = [];
        }
        morososPorPais[pais].push(moroso);
    });

    // Ordenar países por el socio con más días de mora
    const paisesOrdenados = Object.keys(morososPorPais).sort((a, b) => {
        const maxDiasA = Math.max(...morososPorPais[a].map(m => m.diasMora));
        const maxDiasB = Math.max(...morososPorPais[b].map(m => m.diasMora));
        return maxDiasB - maxDiasA;
    });

    // Renderizar lista de morosos agrupados por país
    let html = '';
    paisesOrdenados.forEach(pais => {
        const morosDelPais = morososPorPais[pais];
        const flagUrl = getPaisFlag(pais);
        const flagImg = flagUrl ? `<img src="${flagUrl}" alt="" class="pais-flag-mini">` : '';

        html += `
            <div class="morosos-pais-group">
                <div class="morosos-pais-header">
                    ${flagImg}
                    <span class="pais-nombre">${pais}</span>
                    <span class="pais-count">${morosDelPais.length}</span>
                </div>
                ${morosDelPais.slice(0, 5).map(moroso => {
            const moraColor = getMoraColor(moroso.diasMora);

            return `
                        <div class="moroso-item" data-socio-id="${moroso.socioId}" onclick="navigateToSocio('${moroso.socioId}')" style="border-left: 3px solid ${moraColor};">
                            <div class="moroso-avatar" style="background: linear-gradient(135deg, ${moraColor} 0%, rgba(220,38,38,0.8) 100%);">${getInitials(moroso.nombre)}</div>
                            <div class="moroso-info">
                                <div class="moroso-nombre">${moroso.nombre}</div>
                                <div class="moroso-credito">${moroso.cuotasVencidas} cuota${moroso.cuotasVencidas > 1 ? 's' : ''} vencida${moroso.cuotasVencidas > 1 ? 's' : ''}</div>
                            </div>
                            <div class="moroso-stats">
                                <div class="moroso-monto">$${moroso.montoVencido.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</div>
                                <div class="moroso-dias" style="background: ${moraColor}; color: white;">
                                    ${moroso.diasMora} día${moroso.diasMora !== 1 ? 's' : ''}
                                </div>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    });

    container.innerHTML = html;
}

// Navegar a un socio específico desde el dashboard
function navigateToSocio(socioId) {
    loadView('socios');
    sessionStorage.setItem('showSocioDetails', socioId);
}

// Cargar próximos vencimientos (legacy - mantenido por compatibilidad)
async function loadProximosVencimientos() {
    const container = document.getElementById('proximos-vencimientos');
    if (!container) return;

    try {
        const supabase = window.getSupabaseClient();
        const en7dias = toISODate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

        const { data: cuotas } = await supabase
            .from('ic_creditos_amortizacion')
            .select(`
                *,
                credito:ic_creditos!id_credito (
                    codigo_credito,
                    socio:ic_socios!id_socio (nombre)
                )
            `)
            .in('estado_cuota', ['PENDIENTE', 'VENCIDO'])
            .lte('fecha_vencimiento', en7dias)
            .order('fecha_vencimiento', { ascending: true })
            .limit(5);

        if (!cuotas || cuotas.length === 0) {
            container.innerHTML = `
                <div class="activity-empty">
                    <i class="fas fa-calendar-check"></i>
                    <p>No hay vencimientos próximos</p>
                </div>
            `;
            return;
        }

        container.innerHTML = cuotas.map(cuota => {
            const fechaVenc = parseDate(cuota.fecha_vencimiento);
            const hoyDate = new Date();
            const diasDiff = Math.ceil((fechaVenc - hoyDate) / (1000 * 60 * 60 * 24));
            let iconClass = 'warning';
            let fechaText = '';

            if (diasDiff < 0) {
                iconClass = 'danger';
                fechaText = `Vencido hace ${Math.abs(diasDiff)} días`;
            } else if (diasDiff === 0) {
                iconClass = 'danger';
                fechaText = 'Vence hoy';
            } else if (diasDiff <= 3) {
                iconClass = 'warning';
                fechaText = `Vence en ${diasDiff} días`;
            } else {
                iconClass = 'success';
                fechaText = fechaVenc.toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
            }

            return `
                <div class="activity-item">
                    <div class="activity-icon ${iconClass}">
                        <i class="fas fa-calendar-day"></i>
                    </div>
                    <div class="activity-content">
                        <div class="activity-title">${cuota.credito?.codigo_credito || 'N/A'} - Cuota #${cuota.numero_cuota}</div>
                        <div class="activity-subtitle">${cuota.credito?.socio?.nombre || 'Sin nombre'}</div>
                    </div>
                    <div class="activity-date">
                        <div style="font-weight: 600; color: var(--${iconClass === 'danger' ? 'error-light' : iconClass === 'warning' ? 'warning-light' : 'success-light'});">
                            $${parseFloat(cuota.cuota_total).toFixed(2)}
                        </div>
                        <div>${fechaText}</div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading vencimientos:', error);
        container.innerHTML = `
            <div class="activity-empty">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error al cargar vencimientos</p>
            </div>
        `;
    }
}

// ==========================================
// UTILIDADES
// ==========================================
function formatMoney(value) {
    const num = Number(value || 0);
    return num.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Parsea una fecha asegurando que los strings YYYY-MM-DD se interpreten en la zona horaria de Ecuador
 * @param {string|Date} dateInput 
 * @returns {Date|null}
 */
function parseDate(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return dateInput;
    try {
        if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
            // Forzamos medianoche en Ecuador (UTC-5)
            return new Date(dateInput + 'T00:00:00-05:00');
        }
        const d = new Date(dateInput);
        return isNaN(d.getTime()) ? null : d;
    } catch (e) {
        return null;
    }
}

/**
 * Formatea una fecha a la zona horaria de Ecuador (America/Guayaquil)
 * @param {string|Date} dateString Fecha a formatear
 * @param {object} options Opciones adicionales de Intl.DateTimeFormat
 * @returns {string} Fecha formateada
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
        return '-';
    }
}

/**
 * Formatea fecha y hora a la zona horaria de Ecuador
 */
function formatDateTime(dateString, options = {}) {
    if (!dateString) return '-';
    try {
        const date = parseDate(dateString);
        if (!date) return '-';

        const defaultOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Guayaquil'
        };
        return date.toLocaleString('es-EC', { ...defaultOptions, ...options });
    } catch (e) {
        return '-';
    }
}

/**
 * Convierte un objeto Date o string a formato ISO (YYYY-MM-DD) ajustado a Ecuador
 */
function toISODate(dateInput) {
    try {
        const date = dateInput ? new Date(dateInput) : new Date();
        if (isNaN(date.getTime())) return null;
        // en-CA devuelve formato YYYY-MM-DD
        return date.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
    } catch (e) {
        console.error('Error in toISODate:', e);
        return null;
    }
}

/**
 * Obtiene la fecha actual en formato ISO (YYYY-MM-DD) ajustada a Ecuador
 */
function todayISODate() {
    return toISODate(new Date());
}

function showInlineMessage(element, message, type = 'info') {
    if (!element) return;
    if (!message) {
        element.style.display = 'none';
        element.textContent = '';
        element.className = 'inline-message';
        return;
    }
    element.textContent = message;
    element.className = `inline-message ${type}`;
    element.style.display = 'block';
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
