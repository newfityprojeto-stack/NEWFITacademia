/* =======================================================
   VÍDEO DA SEÇÃO "AULAS" (index.html)
   =======================================================
   - toca sozinho, em loop, assim que a pessoa chega nessa parte da página
   - pausa quando ela sai dali (economiza dados) e volta a tocar quando ela volta
   - começa SEM SOM: os navegadores só deixam tocar sozinho se estiver
     mudo. A pessoa liga o som no ícone de alto-falante do player.

   Para trocar o vídeo, mude só o código em VIDEO_ID
   (é o final do link: youtu.be/CÓDIGO).
*/
(function () {
  var VIDEO_ID = 'eIvP8ZkO-i0';

  var alvo = document.getElementById('videoAulaPlayer');
  if (!alvo) return;

  var player = null;
  var pronto = false;
  var visivel = false;

  function aplicar() {
    if (!pronto) return;
    if (visivel) player.playVideo();
    else player.pauseVideo();
  }

  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('videoAulaPlayer', {
      videoId: VIDEO_ID,
      playerVars: {
        autoplay: 0,
        mute: 1,
        loop: 1,
        playlist: VIDEO_ID, // necessário para o loop funcionar com 1 vídeo só
        controls: 1,
        rel: 0,
        playsinline: 1,     // no iPhone toca dentro da página, sem abrir tela cheia
        modestbranding: 1
      },
      events: {
        onReady: function (e) {
          e.target.mute();
          pronto = true;
          aplicar();
        }
      }
    });
  };

  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);

  var caixa = alvo.parentNode;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entradas) {
      visivel = entradas[0].isIntersecting;
      aplicar();
    }, { threshold: 0.4 }).observe(caixa);
  } else {
    visivel = true;
  }
})();
