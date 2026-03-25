// Κύπρος Live — Service Worker
// Caches shell for offline use; fetches fresh data when online

const CACHE_NAME = 'kipros-v1';
const DATA_CACHE = 'kipros-data-v1';

const SHELL_FILES = [
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'
];

// Install: cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME && k !== DATA_CACHE)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
//  - Eurostat/API calls → network first, fall back to cache
//  - Everything else    → cache first, fall back to network
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // API / data requests: network first
  if (url.includes('eurostat') || url.includes('fuel-prices') || url.includes('fonts.g')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(DATA_CACHE).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Shell: cache first
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});

// Background sync: refresh data cache every 4 hours
self.addEventListener('periodicsync', event => {
  if (event.tag === 'refresh-data') {
    event.waitUntil(refreshDataCache());
  }
});

async function refreshDataCache() {
  const cache = await caches.open(DATA_CACHE);
  // Pre-warm key Eurostat endpoints
  const endpoints = [
    'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_manr?geo=CY&coicop=CP00&unit=RCH_A&lang=EN&format=JSON',
    'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/une_rt_m?geo=CY&age=TOTAL&sex=T&s_adj=SA&unit=PC_ACT&lang=EN&format=JSON'
  ];
  await Promise.allSettled(endpoints.map(url =>
    fetch(url).then(r => r.ok && cache.put(url, r)).catch(() => {})
  ));
}
