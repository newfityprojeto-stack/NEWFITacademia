/* =======================================================
   SCRIPT PRINCIPAL (index.html)
   Responsável só pelo menu mobile — o resto do site é estático.
   ======================================================= */

const menuToggle = document.getElementById('menuToggle');
const navList = document.getElementById('navList');

if (menuToggle && navList) {
  // Abre/fecha o menu ao tocar no ☰
  menuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    navList.classList.toggle('open');
  });

  // Fecha o menu ao clicar em qualquer link (navegação por âncora)
  navList.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navList.classList.remove('open');
    });
  });

  // Fecha o menu ao tocar fora dele
  document.addEventListener('click', (e) => {
    if (navList.classList.contains('open') && !navList.contains(e.target)) {
      navList.classList.remove('open');
    }
  });

  // Fecha o menu se a tela for redimensionada para desktop (tablet girando)
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      navList.classList.remove('open');
    }
  });
}
