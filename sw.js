/**
 * INKA CORP - Service Worker
 * PWA Offline Support
 */

const CACHE_NAME = 'inkacorp-v1';
const STATIC_CACHE = 'inkacorp-static-v1';

// Archivos esenciales para cachear
const ESSENTIAL_FILES = [
    '/',
    '/index.html',
    '/login.html',
    '/movil.html',
    '/css/styles.css',
    '/css/creditos.css',
    '/css/polizas.css',
    '/css/socios.css',
    '/css/solicitud_credito.css',
    '/css/simulador.css',
    '/js/config.js',
    '/js/auth.js',
    '/js/app.js',
    '/js/image-utils.js',
    '/manifest.json',
    '/img/icon-192.png',
    '/img/icon-512.png'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker...');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] Caching essential files...');
                return cache.addAll(ESSENTIAL_FILES);
            })
            .catch((error) => {
                console.error('[SW] Failed to cache:', error);
            })
    );
    self.skipWaiting();
});

// Activación - limpiar caches antiguos
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== STATIC_CACHE && name !== CACHE_NAME)
                    .map((name) => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        })
    );
    self.clients.claim();
});

// Estrategia: Network First, fallback to Cache
self.addEventListener('fetch', (event) => {
    // Ignorar requests que no sean GET
    if (event.request.method !== 'GET') return;

    // Ignorar requests a CDNs externos (Supabase, FontAwesome, etc.)
    const url = new URL(event.request.url);
    if (url.origin !== location.origin) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Si la respuesta es válida, guardar en cache
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Si falla la red, intentar desde cache
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Si no está en cache y es una página HTML, mostrar offline page
                    if (event.request.headers.get('accept')?.includes('text/html')) {
                        return caches.match('/index.html');
                    }
                    return new Response('Offline', { status: 503 });
                });
            })
    );
});

// Escuchar mensajes del cliente
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
