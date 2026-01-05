const CACHE_NAME = 'administracion-inka-corp-v1';
// Recursos que queremos cachear
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Instalación del service worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activación del service worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      );
    }).then(() => self.clients.claim())
  );
});

// Responder a las peticiones de red
self.addEventListener('fetch', event => {
  // Ignorar peticiones que no son http o https
  if (!event.request.url.startsWith('http')) {
    return;
  }
  
  // Ignorar peticiones a la API de Google o recursos externos
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
        
        // Si no está en caché, hacer la petición a la red
        return fetch(event.request)
          .then(response => {
            // Si la respuesta no es válida, simplemente devolverla
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clonar la respuesta porque se consume al leerla
            const responseToCache = response.clone();
            
            // Intentar guardar en caché solo URLs válidas
            if (event.request.url.startsWith('http')) {
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
            }
            
            return response;
          })
          .catch(() => {
            // Si hay un error en la red, intentar devolver la página de inicio
            return caches.match('/index.html');
          });
      })
  );
});