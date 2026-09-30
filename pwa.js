/* =======================================================
   PWA — registra o service worker e mostra o aviso "Instalar app"
   =======================================================
   - Android/Chrome: botão "INSTALAR" que abre a janela oficial de instalação.
   - iPhone/iPad: o iOS não permite instalar por botão, então o aviso ensina
     o caminho (Compartilhar > Adicionar à Tela de Início).
   O aviso só aparece em index, login e dashboard, some se o app já estiver
   instalado e, se a pessoa fechar no ✕, não volta por 7 dias.
*/
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('Service worker não registrado:', err);
      });
    });
  }

  var jaInstalado =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (jaInstalado) return;

  var pagina = (location.pathname.split('/').pop() || 'index').replace('.html', '');
  if (['index', 'login', 'dashboard'].indexOf(pagina) === -1) return;

  var CHAVE = 'newfit_pwa_dispensado';
  var SETE_DIAS = 7 * 24 * 60 * 60 * 1000;

  function foiDispensado() {
    try {
      var t = Number(localStorage.getItem(CHAVE) || 0);
      return t && Date.now() - t < SETE_DIAS;
    } catch (e) { return false; }
  }
  function dispensar() {
    try { localStorage.setItem(CHAVE, String(Date.now())); } catch (e) {}
  }

  var aviso = null;
  var eventoInstalar = null;

  function injetarEstilo() {
    if (document.getElementById('pwaEstilo')) return;
    var st = document.createElement('style');
    st.id = 'pwaEstilo';
    st.textContent =
      '.pwa-aviso{position:fixed;left:14px;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));' +
      'z-index:1500;max-width:460px;margin:0 auto;display:flex;align-items:center;gap:12px;' +
      'background:#121212;border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:12px 14px;' +
      'box-shadow:0 18px 40px rgba(0,0,0,0.6);font-family:Montserrat,system-ui,sans-serif;color:#FFFFFF;}' +
      '.pwa-aviso img{width:40px;height:40px;border-radius:9px;flex-shrink:0;}' +
      '.pwa-aviso span{flex:1;font-size:12.5px;line-height:1.4;color:#FFFFFF;}' +
      '.pwa-aviso span b{display:block;color:#FFFFFF;font-size:13px;}' +
      '.pwa-aviso .pwa-instalar{border:none;cursor:pointer;font-family:inherit;font-weight:800;font-size:11px;' +
      'letter-spacing:1px;text-transform:uppercase;color:#fff;padding:10px 16px;border-radius:8px;' +
      'background:linear-gradient(90deg,#6A0DFF 0%,#512DAB 100%);}' +
      '.pwa-aviso .pwa-fechar{border:none;background:transparent;color:#FFFFFF;font-size:20px;cursor:pointer;' +
      'line-height:1;padding:4px 6px;font-family:inherit;}';
    document.head.appendChild(st);
  }

  function mostrar(modo) {
    if (aviso || foiDispensado()) return;
    injetarEstilo();

    aviso = document.createElement('div');
    aviso.className = 'pwa-aviso';
    aviso.setAttribute('role', 'dialog');
    aviso.setAttribute('aria-label', 'Instalar o app NewFit');

    var texto = modo === 'ios'
      ? '<span><b>Instale o app da NewFit</b>Toque em <b style="display:inline">Compartilhar</b> e depois em “Adicionar à Tela de Início”.</span>'
      : '<span><b>Instale o app da NewFit</b>Acesse seus treinos direto da tela inicial.</span>';

    aviso.innerHTML =
      '<img src="icons/icon-192.png" alt="">' + texto +
      (modo === 'ios' ? '' : '<button type="button" class="pwa-instalar">Instalar</button>') +
      '<button type="button" class="pwa-fechar" aria-label="Fechar">&times;</button>';

    document.body.appendChild(aviso);

    aviso.querySelector('.pwa-fechar').addEventListener('click', function () {
      dispensar();
      remover();
    });

    var btn = aviso.querySelector('.pwa-instalar');
    if (btn) {
      btn.addEventListener('click', function () {
        if (!eventoInstalar) return;
        eventoInstalar.prompt();
        eventoInstalar.userChoice.then(function () {
          eventoInstalar = null;
          remover();
        });
      });
    }
  }

  function remover() {
    if (aviso && aviso.parentNode) aviso.parentNode.removeChild(aviso);
    aviso = null;
  }

  // Android / Chrome / Edge
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    eventoInstalar = e;
    mostrar('android');
  });
  window.addEventListener('appinstalled', remover);

  // iPhone / iPad (Safari não dispara beforeinstallprompt)
  var ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ehIOS) {
    window.addEventListener('load', function () {
      setTimeout(function () { mostrar('ios'); }, 2500);
    });
  }
})();
