const CACHE_NAME = 'administracion-inka-corp-v1';

// Recursos que queremos cachear (Rutas relativas para máxima compatibilidad)
const urlsToCache = [
  './',
  './index.html',
  './administrador.html',
  './manifest.json',
  './favicon.ico',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Instalación del service worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache de Inka Corp abierto');
        // Usamos cache.addAll para asegurar que todos los archivos críticos se guarden
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activación del service worker: Limpia versiones antiguas de caché
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          return cacheName !== CACHE_NAME;
        }).map(cacheName => {
          console.log('Borrando caché antigua:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Responder a las peticiones de red
self.addEventListener('fetch', event => {
  // 1. Ignorar peticiones que no son http o https (como extensiones o esquemas chrome)
  if (!event.request.url.startsWith('http')) {
    return;
  }
  
  // 2. Ignorar peticiones a Google Apps Script (la base de datos) 
  // para que siempre traiga datos frescos de la red
  if (event.request.url.includes('script.google.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Si está en caché, devolver la respuesta cacheada
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Si no está en caché, intentar traerlo de la red
        return fetch(event.request)
          .then(response => {
            // No cachear respuestas inválidas o de otros dominios (excepto recursos propios)
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clonar la respuesta para guardarla en caché y seguir sirviéndola
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          })
          .catch(() => {
            // Si la red falla y es una navegación, mostrar la página principal
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
      })
  );
});
