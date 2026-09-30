/* =======================================================
   SERVICE WORKER — NewFit Academia
   =======================================================
   O que faz:
   - guarda a "casca" do site (páginas, CSS, ícones) para o app abrir rápido;
   - se o celular estiver sem internet, mostra a página offline.html;
   - NÃO mexe em nada que vem de outro site (Firebase, YouTube, fontes):
     login, banco de dados e vídeos sempre vão direto pra rede.

   Para forçar todo mundo a receber uma versão nova dos arquivos,
   troque o número em VERSAO (ex.: v2).
*/
const VERSAO = 'v2';
const CACHE = 'newfit-' + VERSAO;

const CASCA = [
  './',
  'index.html',
  'login.html',
  'offline.html',
  'style.css',
  'login.css',
  'script.js',
  'pwa.js',
  'video-aula.js',
  'manifest.webmanifest',
  'NEWFIT_LOGO_1.svg',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // se algum arquivo faltar, os outros continuam sendo guardados
      Promise.all(CASCA.map((url) => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves.filter((k) => k.startsWith('newfit-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase, YouTube, fontes: direto da rede

  // Páginas, JS e CSS: tenta a rede primeiro (sempre a versão mais nova);
  // sem internet, usa o que está guardado.
  if (req.mode === 'navigate' || /\.(?:js|css|html|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true }).then((guardado) => {
            if (guardado) return guardado;
            if (req.mode === 'navigate') return caches.match('offline.html');
            return Response.error();
          })
        )
    );
    return;
  }

  // Imagens e outros arquivos: usa o guardado e atualiza por trás
  event.respondWith(
    caches.match(req).then((guardado) => {
      const rede = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => guardado);
      return guardado || rede;
    })
  );
});
