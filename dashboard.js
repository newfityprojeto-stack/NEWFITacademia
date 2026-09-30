import { app, db } from "./firebase-config.js";
import { escapeHtml, formatarValidade, PLACEHOLDER_THUMB } from "./utils.js";
import { descobrirPapel } from "./admin-emails.js";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection, getDocs, doc, getDoc, setDoc
} from "firebase/firestore";

let auth = null;
if (app) {
  try {
    auth = getAuth(app);
  } catch (e) {
    console.error("Erro ao iniciar o Auth:", e);
  }
}

const videoGrid = document.getElementById('videoGrid');
const userEmailEl = document.getElementById('userEmail');
let todosVideos = [];
let categoriaAtual = 'TODOS';
let usuarioAtual = null; // { uid, email }
let perfilDados = { nome: '', numero: '' };
let planoAtualNome = '';

/* ---------- PROTEÇÃO DA ROTA ---------- */
if (auth) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    // admin master OU funcionário -> painel administrativo
    const papel = await descobrirPapel(db, user);
    if (papel !== 'aluno') {
      window.location.href = 'admin.html';
      return;
    }

    usuarioAtual = user;
    userEmailEl.textContent = user.email;

    const inicial = (user.email || '?').charAt(0).toUpperCase();
    document.getElementById('perfilAvatarInicial').textContent = inicial;
    document.getElementById('perfilAvatarGrande').textContent = inicial;

    carregarVideos();
    carregarPerfil();
    carregarHistorico();
  });
} else {
  videoGrid.innerHTML = '<div class="estado-vazio">Firebase não configurado.</div>';
}

/* ---------- SAIR ---------- */
document.getElementById('btnSair').addEventListener('click', async () => {
  if (!auth) return;
  await signOut(auth);
  window.location.href = 'login.html';
});

/* ---------- ABAS: TREINOS / CONTINUAR ASSISTINDO / PLANOS ---------- */
function mostrarAba(idAba){
  document.querySelectorAll('.dash-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === idAba);
  });
  document.querySelectorAll('.dash-tab-conteudo').forEach(c => {
    c.classList.toggle('active', c.id === idAba);
  });
  if (idAba === 'tabPlanos') marcarPlanoAtualNaAba();
}

document.querySelectorAll('.dash-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => mostrarAba(btn.dataset.tab));
});

// "Planos" não tem mais botão na barra de abas — é acessado só pelo
// botão do header (fica ao lado do Perfil).
function irParaAbaPlanos(){
  mostrarAba('tabPlanos');
}

document.getElementById('btnPlanosHeader').addEventListener('click', irParaAbaPlanos);

/* ---------- CARREGAR VÍDEOS DO FIRESTORE ---------- */
async function carregarVideos(){
  videoGrid.innerHTML = '<div class="estado-loading">Carregando vídeos...</div>';
  try {
    const snap = await getDocs(collection(db, 'videos_newfity'));
    todosVideos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderizarVideos();
  } catch (err) {
    console.error('Erro ao carregar vídeos:', err);
    videoGrid.innerHTML = '<div class="estado-vazio">Não foi possível carregar os vídeos.</div>';
  }
}

/* ---------- FILTRO DE CATEGORIA ---------- */
document.getElementById('filtros').addEventListener('click', (e) => {
  const btn = e.target.closest('.filtro-btn');
  if (!btn) return;
  document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  categoriaAtual = btn.dataset.cat;
  renderizarVideos();
});

// SEGURANÇA: os campos de um vídeo (título, categoria, thumbnail, duração)
// agora passam por escapeHtml() antes de entrar em innerHTML. Isso evita um
// vídeo cadastrado com dados maliciosos rodar código dentro da página de
// todo mundo que abrir o dashboard.
function cardVideoHtml(v){
  const id = escapeHtml(v.id);
  const titulo = escapeHtml(v.titulo || 'Sem título');
  const categoria = escapeHtml(v.categoria || '');
  const thumb = escapeHtml(v.thumbnail || PLACEHOLDER_THUMB);
  const duracao = escapeHtml(v.duracao || '');
  return `
    <div class="video-card" data-id="${id}">
      <div class="video-thumb-wrap">
        <img src="${thumb}" alt="${titulo}" loading="lazy">
        <div class="video-play-icon">&#9658;</div>
        ${duracao ? `<div class="video-duration">${duracao}</div>` : ''}
      </div>
      <div class="video-info">
        <div class="video-title">${titulo}</div>
        <div class="video-cat">${categoria}</div>
      </div>
    </div>
  `;
}

function renderizarVideos(){
  const lista = categoriaAtual === 'TODOS'
    ? todosVideos
    : todosVideos.filter(v => (v.categoria || '').toUpperCase() === categoriaAtual);

  if (lista.length === 0){
    videoGrid.innerHTML = '<div class="estado-vazio">Nenhum vídeo nesta categoria.</div>';
    return;
  }

  videoGrid.innerHTML = lista.map(cardVideoHtml).join('');

  videoGrid.querySelectorAll('.video-card').forEach(card => {
    card.addEventListener('click', () => {
      const video = lista.find(v => v.id === card.dataset.id);
      if (video) abrirPlayer(video);
    });
  });
}

/* ---------- CONTINUAR ASSISTINDO ---------- */
const historicoGrid = document.getElementById('historicoGrid');
let historicoVideos = [];

async function carregarHistorico(){
  if (!db || !usuarioAtual) return;
  try {
    const ref = doc(db, 'historico_newfity', usuarioAtual.uid);
    const snap = await getDoc(ref);
    historicoVideos = (snap.exists() && Array.isArray(snap.data().videos)) ? snap.data().videos : [];
    renderizarHistorico();
  } catch (err) {
    console.warn('Não foi possível carregar o histórico:', err);
  }
}

function renderizarHistorico(){
  if (historicoVideos.length === 0){
    historicoGrid.innerHTML = '<div class="estado-vazio">Você ainda não assistiu nenhum vídeo.</div>';
    return;
  }
  historicoGrid.innerHTML = historicoVideos.map(cardVideoHtml).join('');

  historicoGrid.querySelectorAll('.video-card').forEach(card => {
    card.addEventListener('click', async () => {
      const salvo = historicoVideos.find(v => v.id === card.dataset.id);
      if (!salvo) return;
      const video = await resolverVideo(salvo);
      if (!video || !video.youtubeLink){
        // o admin apagou esse vídeo: avisa e tira do histórico
        alert('Este vídeo não está mais disponível.');
        removerDoHistorico(salvo.id);
        return;
      }
      abrirPlayer(video);
    });
  });
}

// BUG CORRIGIDO: o histórico guardava só título/thumbnail/categoria/duração,
// sem o link do YouTube — por isso clicar num vídeo em "Continuar assistindo"
// dava "link inválido". Agora o link também é salvo, e para os itens antigos
// (que já estão no banco sem link) buscamos o vídeo completo pelo id.
async function resolverVideo(salvo){
  let completo = todosVideos.find(v => v.id === salvo.id);
  if (!completo && db){
    try {
      const snap = await getDoc(doc(db, 'videos_newfity', salvo.id));
      if (!snap.exists()) return null; // vídeo foi apagado pelo admin
      completo = { id: snap.id, ...snap.data() };
    } catch (err) {
      console.warn('Não foi possível buscar o vídeo:', err);
      return salvo.youtubeLink ? salvo : null;
    }
  }
  return { ...salvo, ...(completo || {}) };
}

async function removerDoHistorico(id){
  historicoVideos = historicoVideos.filter(v => v.id !== id);
  renderizarHistorico();
  if (!db || !usuarioAtual) return;
  try {
    await setDoc(doc(db, 'historico_newfity', usuarioAtual.uid), { videos: historicoVideos });
  } catch (err) {
    console.warn('Não foi possível atualizar o histórico:', err);
  }
}

async function salvarNoHistorico(video){
  if (!db || !usuarioAtual) return;
  try {
    const entrada = {
      id: video.id,
      titulo: video.titulo || '',
      thumbnail: video.thumbnail || '',
      categoria: video.categoria || '',
      duracao: video.duracao || '',
      youtubeLink: video.youtubeLink || ''
    };
    // tira o vídeo se ele já estava na lista, coloca no topo, mantém só os 10 mais recentes
    const novaLista = [entrada, ...historicoVideos.filter(v => v.id !== video.id)].slice(0, 10);
    historicoVideos = novaLista;
    await setDoc(doc(db, 'historico_newfity', usuarioAtual.uid), { videos: novaLista });
    renderizarHistorico();
  } catch (err) {
    console.warn('Não foi possível salvar no histórico:', err);
  }
}

/* ---------- PERFIL + PLANO ATUAL ---------- */
// ANTES: o "plano atual" vinha de uma busca em compras_newfity (o
// histórico de checkout), então se o admin trocasse o plano do aluno
// na aba "Usuários" do painel, o dashboard do aluno continuava
// mostrando o plano antigo — as duas fontes ficavam dessincronizadas.
// Agora o plano (e a validade) vêm direto do cadastro do próprio
// usuário, que é o mesmo campo que o admin edita.
let planoExpiraEm = null;

async function carregarPerfil(){
  if (!db || !usuarioAtual) return;
  try {
    const snap = await getDoc(doc(db, 'usuarios_newfity', usuarioAtual.uid));
    if (snap.exists()){
      const dados = snap.data();
      perfilDados.nome = dados.nome || '';
      perfilDados.numero = dados.numero || '';
      planoAtualNome = dados.planoNome || '';
      planoExpiraEm = dados.planoExpiraEm || null;
    }
  } catch (err) {
    console.warn('Não foi possível carregar o perfil:', err);
  }
}

function marcarPlanoAtualNaAba(){
  document.querySelectorAll('.plano-card').forEach(card => {
    card.classList.remove('plano-atual');
    const tagExistente = card.querySelector('.plano-atual-tag');
    if (tagExistente) tagExistente.remove();

    if (planoAtualNome && card.dataset.plano === planoAtualNome){
      card.classList.add('plano-atual');
      const tag = document.createElement('div');
      tag.className = 'plano-atual-tag';
      tag.textContent = 'SEU PLANO ATUAL';
      card.prepend(tag);
    }
  });
}

/* ---------- MODAL PERFIL ---------- */
const modalPerfil = document.getElementById('modalPerfil');

document.getElementById('btnAbrirPerfil').addEventListener('click', async () => {
  document.getElementById('perfilNome').textContent = perfilDados.nome || usuarioAtual.email;
  document.getElementById('perfilGmail').textContent = usuarioAtual.email;
  document.getElementById('perfilNumero').textContent = perfilDados.numero || 'Número não informado';

  const planoEl = document.getElementById('perfilPlanoNome');
  planoEl.textContent = planoAtualNome || 'Nenhum plano contratado ainda';

  const validadeEl = document.getElementById('perfilPlanoValidade');
  if (validadeEl){
    validadeEl.textContent = planoAtualNome ? formatarValidade(planoExpiraEm) : '';
  }

  marcarPlanoAtualNaAba();

  modalPerfil.classList.add('active');
  document.body.style.overflow = 'hidden';
});

function fecharPerfil(){
  modalPerfil.classList.remove('active');
  document.body.style.overflow = '';
}

document.getElementById('fecharPerfil').addEventListener('click', fecharPerfil);
modalPerfil.addEventListener('click', (e) => {
  if (e.target === modalPerfil) fecharPerfil();
});

document.getElementById('btnVerPlanosPerfil').addEventListener('click', () => {
  fecharPerfil();
  irParaAbaPlanos();
});

/* ---------- MODAL PLAYER ---------- */
const modalPlayer = document.getElementById('modalPlayer');
const playerIframe = document.getElementById('playerIframe');
const playerTitulo = document.getElementById('playerTitulo');
const playerCategoria = document.getElementById('playerCategoria');

// Aceita links do YouTube (watch, youtu.be, embed, shorts, live). Qualquer
// outro endereço, ou um link sem ID válido, volta vazio e o player mostra o
// aviso de "link inválido" em vez de abrir um quadro em branco.
function getEmbedUrl(link){
  if (!link) return '';
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^(www|m)\./, '');
    if (!['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) return '';

    const partes = url.pathname.split('/').filter(Boolean);
    let id = '';
    if (host === 'youtu.be'){
      id = partes[0] || '';
    } else if (url.searchParams.get('v')){
      id = url.searchParams.get('v');
    } else if (['embed', 'shorts', 'live', 'v'].includes(partes[0])){
      id = partes[1] || '';
    }
    if (!/^[\w-]{6,20}$/.test(id)) return '';

    if (partes[0] === 'embed'){
      url.searchParams.set('autoplay', '1');
      return `https://www.youtube.com/embed/${id}?${url.searchParams.toString()}`;
    }
    return `https://www.youtube.com/embed/${id}?autoplay=1`;
  } catch (e) {
    return '';
  }
}

function abrirPlayer(video){
  const embedUrl = getEmbedUrl(video.youtubeLink);
  if (!embedUrl){
    alert('Este vídeo tem um link inválido e não pode ser reproduzido.');
    return;
  }
  playerIframe.src = embedUrl;
  playerTitulo.textContent = video.titulo || '';
  playerCategoria.textContent = video.categoria || '';
  modalPlayer.classList.add('active');
  document.body.style.overflow = 'hidden';
  salvarNoHistorico(video);
}

function fecharPlayer(){
  modalPlayer.classList.remove('active');
  playerIframe.src = '';
  document.body.style.overflow = '';
}

document.getElementById('modalClose').addEventListener('click', fecharPlayer);
modalPlayer.addEventListener('click', (e) => {
  if (e.target === modalPlayer) fecharPlayer();
});