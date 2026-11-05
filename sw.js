// オフラインで動くよう、アプリ本体をキャッシュする。ファイルを変えたら VERSION を上げる
const VERSION = 'stacklog-v2';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/app-store.js',
  './js/calc.js',
  './js/chart.js',
  './js/db.js',
  './js/exam.js',
  './js/fields.js',
  './js/i18n.js',
  './js/images.js',
  './js/keyboard.js',
  './js/nav.js',
  './js/record-form.js',
  './js/store.js',
  './js/subject.js',
  './js/todo-form.js',
  './js/ui.js',
  './js/views/list.js',
  './js/views/record.js',
  './js/views/session.js',
  './js/views/settings.js',
  './js/views/shelf.js',
  './js/views/todos.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// ネットワークを優先し、つながらないときはキャッシュを使う
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // 正常に取得できた自サイトのファイルだけを保存する（エラーページは残さない）
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
