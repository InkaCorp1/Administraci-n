// Variable global para el cliente de Supabase (prevenir redeclaración)
if (typeof supabaseClient === 'undefined') {
    var supabaseClient;
}

/**
 * Inicializa el cliente de Supabase. Si ya está inicializado, lo devuelve.
 * Usa las constantes globales SUPABASE_URL y SUPABASE_ANON_KEY de config.js.
 */
function initSupabase() {
    if (supabaseClient) {
        return supabaseClient;
    }
    if (typeof supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined' && typeof SUPABASE_ANON_KEY !== 'undefined') {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return supabaseClient;
    }
    console.error('Supabase no está listo. Asegúrate de que config.js se carga antes que auth.js y que define SUPABASE_URL y SUPABASE_ANON_KEY.');
    return null;
}

/**
 * Devuelve la instancia del cliente de Supabase, inicializándola si es necesario.
 */
function getSupabaseClient() {
    if (!supabaseClient) {
        return initSupabase();
    }
    return supabaseClient;
}

/**
 * Verifica la sesión de usuario actual.
 * @returns {Promise<{isAuthenticated: boolean, user: object|null}>}
 */
async function checkSession() {
    const sb = getSupabaseClient();
    if (!sb) return { isAuthenticated: false, user: null };

    try {
        const { data: { session }, error } = await sb.auth.getSession();

        if (error) {
            console.error('Error al obtener la sesión:', error);
            // Si hay un error de firma de token o similar, limpiar y salir
            if (error.message.includes('signature') || error.status === 400) {
                localStorage.clear();
                sessionStorage.clear();
                window.location.href = 'login.html';
            }
            return { isAuthenticated: false, user: null };
        }

        if (!session) {
            return { isAuthenticated: false, user: null };
        }


        // Hay una sesión, ahora verificamos el perfil en nuestra tabla de usuarios
        const { data: userProfile, error: profileError } = await sb
            .from('ic_users') // Cambiado de ic_usuarios a ic_users
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (profileError || !userProfile) {
            console.warn('Usuario autenticado pero sin perfil en la base de datos.');
            // Opcional: cerrar sesión si se requiere perfil sí o sí
            // await sb.auth.signOut();
            // return { isAuthenticated: false, user: null };
            return { isAuthenticated: true, user: session.user }; // O permitir acceso parcial
        }

        // Combinar datos de auth y perfil
        const fullUser = {
            ...session.user,
            ...userProfile
        };

        return { isAuthenticated: true, user: fullUser };
    } catch (error) {
        console.error('Error inesperado en checkSession:', error);
        return { isAuthenticated: false, user: null };
    }
}


/**
 * Cierra la sesión del usuario y redirige al login.
 */
async function logout() {
    const sb = getSupabaseClient();
    const { error } = await sb.auth.signOut();
    if (error) {
        console.error('Error al cerrar sesión:', error);
    }
    // Limpiar caché al cerrar sesión
    if (typeof window.clearCache === 'function') {
        window.clearCache();
    }
    // Redirigir siempre al login después de intentar cerrar sesión
    window.location.href = 'login.html';
}

/**
 * Obtiene el usuario actual (si está autenticado).
 * Primero intenta obtener de window.currentUser (establecido por app.js)
 * Si no existe, intenta obtener de la sesión de Supabase
 */
async function getCurrentUser() {
    // Primero intentar obtener del estado global
    if (window.currentUser && window.currentUser.id) {
        return window.currentUser;
    }
    
    // Si no está en estado global, verificar sesión
    const sb = getSupabaseClient();
    if (!sb) return null;
    
    try {
        const { data: { session } } = await sb.auth.getSession();
        if (session && session.user) {
            return session.user;
        }
    } catch (e) {
        console.error('Error obteniendo usuario actual:', e);
    }
    
    return null;
}

/**
 * Protege una ruta verificando la sesión actual.
 * @param {string} redirectPath - Ruta a la que redireccionar si no hay sesión.
 */
async function protectRoute(redirectPath = 'login.html') {
    const { isAuthenticated } = await checkSession();
    if (!isAuthenticated) {
        window.location.href = redirectPath;
    }
}

// Exponer funciones globalmente
window.getSupabaseClient = getSupabaseClient;
window.initSupabase = initSupabase;
window.checkSession = checkSession;
window.logout = logout;
window.protectRoute = protectRoute;
window.getCurrentUser = getCurrentUser;

