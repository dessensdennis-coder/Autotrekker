/* Service worker: alles offline beschikbaar maken (cache-first). */
const CACHE = 'klas76-v7';

const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/storage.js',
  'js/models.js',
  'js/confetti.js',
  'js/setup.js',
  'js/reunion.js',
  'js/backup.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'vendor/face-api.js',
  'vendor/tesseract.min.js',
  'vendor/tesseract-worker.min.js',
  'vendor/tesseract-core/tesseract-core-simd-lstm.wasm',
  'vendor/tesseract-core/tesseract-core-simd-lstm.wasm.js',
  'vendor/tesseract-core/tesseract-core-simd-lstm.js',
  'vendor/tesseract-core/tesseract-core-lstm.wasm',
  'vendor/tesseract-core/tesseract-core-lstm.wasm.js',
  'vendor/tesseract-core/tesseract-core-lstm.js',
  'vendor/tessdata/eng.traineddata.gz',
  'vendor/tfjs-wasm/tfjs-backend-wasm.wasm',
  'vendor/tfjs-wasm/tfjs-backend-wasm-simd.wasm',
  'vendor/tfjs-wasm/tfjs-backend-wasm-threaded-simd.wasm',
  'vendor/models/ssd_mobilenetv1_model-weights_manifest.json',
  'vendor/models/ssd_mobilenetv1_model.bin',
  'vendor/models/face_landmark_68_model-weights_manifest.json',
  'vendor/models/face_landmark_68_model.bin',
  'vendor/models/face_recognition_model-weights_manifest.json',
  'vendor/models/face_recognition_model.bin',
  'vendor/models/tiny_face_detector_model-weights_manifest.json',
  'vendor/models/tiny_face_detector_model.bin',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // per bestand cachen zodat één misser niet de hele installatie sloopt
    await Promise.all(ASSETS.map(u =>
      cache.add(u).catch(err => console.warn('SW cache miss', u, err))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      // offline en niet in cache: geef desnoods de index terug voor navigaties
      if (req.mode === 'navigate') return caches.match('index.html');
      throw err;
    }
  })());
});
