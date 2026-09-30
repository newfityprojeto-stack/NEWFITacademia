import { firebaseConfig, app, db } from "./firebase-config.js";
import { escapeHtml, formatarValidade, planoEstaVencido, PLACEHOLDER_THUMB } from "./utils.js";
import { isEmailAdmin } from "./admin-emails.js";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

// A lista de e-mails com acesso admin agora mora em admin-emails.js —
// é o MESMO arquivo que o login.js usa para decidir se manda a pessoa
// pro admin.html ou pro dashboard.html depois do login. Edite lá.
//
// IMPORTANTE — ISSO SOZINHO NÃO PROTEGE SEU BANCO DE DADOS:
// essa checagem de e-mail é só para decidir o que MOSTRAR na tela.
// Qualquer pessoa que souber a configuração pública do seu projeto
// Firebase (que já fica exposta no código do site) consegue chamar o
// Firestore diretamente, sem passar por essa tela. A proteção de
// verdade tem que estar nas Regras de Segurança do Firestore
// (Firebase Console > Firestore Database > Regras). Veja o arquivo
// firestore.rules incluído junto com esta correção e publique-o lá.

let auth = null;
if (app) {
  try {
    auth = getAuth(app);
  } catch (e) {
    console.error("Erro ao iniciar o Auth:", e);
  }
}

// Os planos não têm mais uma aba própria de cadastro — são os mesmos 3
// planos fixos mostrados no site (index.html e dashboard.html). O que
// cada compra "tem" como plano é justamente o que a pessoa escolheu no
// checkout (campo planoEscolhido); aqui o admin só confirma isso ou
// troca, e a validade é sempre 30 dias a partir de hoje.
const PLANOS_PADRAO = [
  { id: 'basico', nome: 'Básico', duracaoDias: 30 },
  { id: 'premium', nome: 'Premium', duracaoDias: 30 },
  { id: 'vip', nome: 'VIP', duracaoDias: 30 }
];

function encontrarPlanoPorNome(nome){
  if (!nome) return null;
  const alvo = String(nome).trim().toLowerCase();
  return PLANOS_PADRAO.find(p => p.nome.toLowerCase() === alvo) || null;
}

/* ---------- TELAS: LOGIN x PAINEL ---------- */
const telaLoginAdmin = document.getElementById('telaLoginAdmin');
const painelAdmin = document.getElementById('painelAdmin');
const btnSairAdmin = document.getElementById('btnSairAdmin');
const formLoginAdmin = document.getElementById('formLoginAdmin');
const btnEntrarAdmin = document.getElementById('btnEntrarAdmin');
const msgLoginAdmin = document.getElementById('msgLoginAdmin');

let painelIniciado = false;
let papelAtual = null; // 'master' | 'funcionario'

function mostrarTelaLogin(mensagemErro){
  telaLoginAdmin.style.display = 'flex';
  painelAdmin.style.display = 'none';
  btnSairAdmin.style.display = 'none';
  papelAtual = null;
  if (mensagemErro){
    msgLoginAdmin.textContent = mensagemErro;
    msgLoginAdmin.className = 'form-msg show erro';
  }
}

function mostrarPainel(){
  telaLoginAdmin.style.display = 'none';
  painelAdmin.style.display = 'block';
  btnSairAdmin.style.display = 'inline-block';

  // A aba "Funcionários" só aparece pra quem está em EMAILS_ADMIN.
  // Um funcionário logado nunca vê nem consegue abrir essa aba.
  const abaBtnFuncionarios = document.getElementById('abaBtnFuncionarios');
  if (abaBtnFuncionarios){
    abaBtnFuncionarios.style.display = (papelAtual === 'master') ? 'inline-block' : 'none';
  }

  if (!painelIniciado){
    painelIniciado = true;
    iniciarPainel();
  }
}

if (auth) {
  onAuthStateChanged(auth, async (user) => {
    if (!user){
      mostrarTelaLogin();
      return;
    }

    if (isEmailAdmin(user.email)){
      papelAtual = 'master';
      mostrarPainel();
      return;
    }

    // Não é o admin master — checa se é um funcionário cadastrado
    // (a lista de funcionários fica no Firestore, criada pela própria
    // aba "Funcionários"; ver funcionarios_newfity/{uid}).
    try {
      const snapFuncionario = db ? await getDoc(doc(db, 'funcionarios_newfity', user.uid)) : null;
      if (snapFuncionario && snapFuncionario.exists()){
        papelAtual = 'funcionario';
        mostrarPainel();
        return;
      }
    } catch (err) {
      console.error('Erro ao checar acesso de funcionário:', err);
    }

    // logado, mas não é admin nem funcionário autorizado
    await signOut(auth);
    mostrarTelaLogin('Essa conta não tem permissão de acesso ao painel.');
  });
} else {
  mostrarTelaLogin('Firebase não configurado. Edite o arquivo firebase-config.js.');
}

formLoginAdmin.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgLoginAdmin.className = 'form-msg';

  const email = document.getElementById('adminEmail').value.trim();
  const senha = document.getElementById('adminSenha').value;

  if (!email || !senha){
    msgLoginAdmin.textContent = 'Preencha Gmail e senha.';
    msgLoginAdmin.className = 'form-msg show erro';
    return;
  }
  if (!auth){
    msgLoginAdmin.textContent = 'Firebase não configurado.';
    msgLoginAdmin.className = 'form-msg show erro';
    return;
  }

  btnEntrarAdmin.disabled = true;
  btnEntrarAdmin.textContent = 'ENTRANDO...';

  try {
    await signInWithEmailAndPassword(auth, email, senha);
    // o onAuthStateChanged acima cuida de checar se é admin e mostrar o painel
  } catch (err) {
    const mapaErros = {
      'auth/invalid-email': 'Gmail inválido.',
      'auth/user-not-found': 'Conta não encontrada.',
      'auth/wrong-password': 'Senha incorreta.',
      'auth/invalid-credential': 'Gmail ou senha incorretos.',
      'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.'
    };
    msgLoginAdmin.textContent = mapaErros[err.code] || 'Erro ao entrar. Tente novamente.';
    msgLoginAdmin.className = 'form-msg show erro';
  } finally {
    btnEntrarAdmin.disabled = false;
    btnEntrarAdmin.textContent = 'ENTRAR';
  }
});

btnSairAdmin.addEventListener('click', async () => {
  if (auth) await signOut(auth);
});

function iniciarPainel(){

  /* ---------- ABAS ---------- */
  const abaBotoes = document.querySelectorAll('.aba-btn');
  const abaConteudos = document.querySelectorAll('.aba-conteudo');

  abaBotoes.forEach(btn => {
    btn.addEventListener('click', () => {
      abaBotoes.forEach(b => b.classList.remove('active'));
      abaConteudos.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.aba).classList.add('active');

      if (btn.dataset.aba === 'abaCompras') {
        carregarCompras();
      }
      if (btn.dataset.aba === 'abaUsuarios') {
        carregarUsuarios();
      }
      if (btn.dataset.aba === 'abaFuncionarios' && papelAtual === 'master') {
        carregarFuncionarios();
      }
    });
  });

  /* ---------- CADASTRAR / EDITAR VÍDEO ---------- */
  const formVideo = document.getElementById('formVideo');
  const btnSalvarVideo = document.getElementById('btnSalvarVideo');
  const btnCancelarEdicao = document.getElementById('btnCancelarEdicao');
  const msgVideo = document.getElementById('msgVideo');
  const tituloFormVideo = document.getElementById('tituloFormVideo');
  const vIdInput = document.getElementById('vId');

  function mostrarMsg(el, texto, tipo){
    el.textContent = texto;
    el.className = 'form-msg show ' + tipo;
  }

  function entrarModoEdicao(video){
    vIdInput.value = video.id;
    document.getElementById('vTitulo').value = video.titulo || '';
    document.getElementById('vCategoria').value = video.categoria || 'MUSCULAÇÃO';
    document.getElementById('vThumb').value = video.thumbnail || '';
    document.getElementById('vLink').value = video.youtubeLink || '';
    document.getElementById('vDuracao').value = video.duracao || '';

    tituloFormVideo.textContent = 'Editar vídeo';
    btnSalvarVideo.textContent = 'SALVAR EDIÇÃO';
    btnCancelarEdicao.style.display = 'inline-block';
    formVideo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function sairModoEdicao(){
    vIdInput.value = '';
    formVideo.reset();
    tituloFormVideo.textContent = 'Cadastrar vídeo';
    btnSalvarVideo.textContent = 'SALVAR VÍDEO';
    btnCancelarEdicao.style.display = 'none';
  }

  btnCancelarEdicao.addEventListener('click', sairModoEdicao);

  formVideo.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgVideo.className = 'form-msg';

    const editandoId = vIdInput.value;
    const titulo = document.getElementById('vTitulo').value.trim();
    const categoria = document.getElementById('vCategoria').value;
    const thumbnail = document.getElementById('vThumb').value.trim();
    const youtubeLink = document.getElementById('vLink').value.trim();
    const duracao = document.getElementById('vDuracao').value.trim();

    if (!titulo || !thumbnail || !youtubeLink || !duracao){
      mostrarMsg(msgVideo, 'Preencha todos os campos.', 'erro');
      return;
    }

    if (!db){
      mostrarMsg(msgVideo, 'Firebase não configurado.', 'erro');
      return;
    }

    btnSalvarVideo.disabled = true;
    btnSalvarVideo.textContent = editandoId ? 'SALVANDO EDIÇÃO...' : 'SALVANDO...';

    const dadosVideo = { titulo, categoria, thumbnail, youtubeLink, duracao };

    try {
      if (editandoId){
        await updateDoc(doc(db, 'videos_newfity', editandoId), dadosVideo);
        mostrarMsg(msgVideo, 'Vídeo atualizado com sucesso!', 'sucesso');
      } else {
        await addDoc(collection(db, 'videos_newfity'), dadosVideo);
        mostrarMsg(msgVideo, 'Vídeo cadastrado com sucesso!', 'sucesso');
      }
      sairModoEdicao();
      videosCarregados = false;
      carregarVideos();
    } catch (err) {
      console.error('Erro ao salvar vídeo:', err);
      mostrarMsg(msgVideo, 'Erro ao salvar. Tente novamente.', 'erro');
    } finally {
      btnSalvarVideo.disabled = false;
      btnSalvarVideo.textContent = editandoId ? 'SALVAR EDIÇÃO' : 'SALVAR VÍDEO';
    }
  });

  /* ---------- LISTAR / EDITAR / EXCLUIR VÍDEOS ---------- */
  const videosTbody = document.getElementById('videosTbody');
  let videosCarregados = false;
  let videosCache = [];

  async function carregarVideos(){
    if (videosCarregados) return;
    if (!db){
      videosTbody.innerHTML = '<tr><td colspan="5" class="tabela-vazio">Firebase não configurado.</td></tr>';
      return;
    }

    videosTbody.innerHTML = '<tr><td colspan="5" class="tabela-loading">Carregando...</td></tr>';

    try {
      const snap = await getDocs(collection(db, 'videos_newfity'));
      videosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (videosCache.length === 0){
        videosTbody.innerHTML = '<tr><td colspan="5" class="tabela-vazio">Nenhum vídeo cadastrado.</td></tr>';
        videosCarregados = true;
        return;
      }

      renderizarVideos();
      videosCarregados = true;
    } catch (err) {
      console.error('Erro ao carregar vídeos:', err);
      videosTbody.innerHTML = '<tr><td colspan="5" class="tabela-vazio">Não foi possível carregar os vídeos.</td></tr>';
    }
  }

  // SEGURANÇA: todo campo vindo do Firestore passa por escapeHtml()
  // antes de entrar em innerHTML — veja utils.js para o motivo.
  function renderizarVideos(){
    videosTbody.innerHTML = videosCache.map(v => `
      <tr data-id="${escapeHtml(v.id)}">
        <td><img class="tabela-thumb" src="${escapeHtml(v.thumbnail || PLACEHOLDER_THUMB)}" alt=""></td>
        <td>${escapeHtml(v.titulo || '-')}</td>
        <td>${escapeHtml(v.categoria || '-')}</td>
        <td>${escapeHtml(v.duracao || '-')}</td>
        <td>
          <button type="button" class="btn-editar" data-id="${escapeHtml(v.id)}">EDITAR</button>
          <button type="button" class="btn-excluir" data-id="${escapeHtml(v.id)}">EXCLUIR</button>
        </td>
      </tr>
    `).join('');

    videosTbody.querySelectorAll('.btn-editar').forEach(btn => {
      btn.addEventListener('click', () => {
        const video = videosCache.find(v => v.id === btn.dataset.id);
        if (video) entrarModoEdicao(video);
      });
    });

    videosTbody.querySelectorAll('.btn-excluir').forEach(btn => {
      btn.addEventListener('click', () => excluirVideo(btn));
    });
  }

  async function excluirVideo(btn){
    const id = btn.dataset.id;
    const linha = btn.closest('tr');
    const titulo = linha.children[1].textContent;

    const confirmar = confirm(`Excluir o vídeo "${titulo}"? Essa ação não pode ser desfeita.`);
    if (!confirmar) return;

    btn.disabled = true;
    btn.textContent = 'EXCLUINDO...';

    try {
      await deleteDoc(doc(db, 'videos_newfity', id));
      videosCache = videosCache.filter(v => v.id !== id);
      linha.remove();
      if (videosTbody.children.length === 0){
        videosTbody.innerHTML = '<tr><td colspan="5" class="tabela-vazio">Nenhum vídeo cadastrado.</td></tr>';
      }
      // se o vídeo excluído estava sendo editado, sai do modo edição
      if (vIdInput.value === id) sairModoEdicao();
    } catch (err) {
      console.error('Erro ao excluir vídeo:', err);
      btn.disabled = false;
      btn.textContent = 'EXCLUIR';
      alert('Não foi possível excluir. Tente novamente.');
    }
  }

  // carrega a lista de vídeos já na primeira exibição da aba (que já vem ativa)
  carregarVideos();

  /* ---------- COMPRAS (leads do checkout) ---------- */
  const comprasTbody = document.getElementById('comprasTbody');
  let comprasCarregadas = false;
  let comprasCache = [];

  async function carregarCompras(){
    if (comprasCarregadas) return;
    if (!db){
      comprasTbody.innerHTML = '<tr><td colspan="9" class="tabela-vazio">Firebase não configurado.</td></tr>';
      return;
    }

    comprasTbody.innerHTML = '<tr><td colspan="9" class="tabela-loading">Carregando...</td></tr>';

    try {
      const snap = await getDocs(collection(db, 'compras_newfity'));
      comprasCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // ordena pela data mais recente, quando disponível
      comprasCache.sort((a, b) => {
        const ta = a.data && a.data.toDate ? a.data.toDate().getTime() : 0;
        const tb = b.data && b.data.toDate ? b.data.toDate().getTime() : 0;
        return tb - ta;
      });

      if (comprasCache.length === 0){
        comprasTbody.innerHTML = '<tr><td colspan="9" class="tabela-vazio">Nenhuma compra encontrada.</td></tr>';
        comprasCarregadas = true;
        return;
      }

      renderizarCompras();
      comprasCarregadas = true;
    } catch (err) {
      console.error('Erro ao carregar compras:', err);
      comprasTbody.innerHTML = '<tr><td colspan="9" class="tabela-vazio">Não foi possível carregar as compras.</td></tr>';
    }
  }

  // SEGURANÇA: esses dados vêm do formulário PÚBLICO de checkout —
  // qualquer visitante do site preenche isso, então cada campo tem
  // que ser escapado antes de virar HTML (ver utils.js).
  function renderizarCompras(){
    const opcoesPlano = ['<option value="">Sem plano</option>']
      .concat(PLANOS_PADRAO.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nome)}</option>`))
      .join('');

    comprasTbody.innerHTML = comprasCache.map(c => {
      const dataFormatada = (c.data && c.data.toDate)
        ? c.data.toDate().toLocaleString('pt-BR')
        : '-';
      // "Plano" mostra o plano já confirmado/atribuído pelo admin quando
      // existir; senão cai pro que a própria pessoa escolheu no checkout.
      const nomePlanoExibido = c.planoNome || c.planoEscolhido || '-';
      const validadeTexto = c.planoNome ? formatarValidade(c.planoExpiraEm) : '-';
      const vencido = c.planoNome && planoEstaVencido(c.planoExpiraEm);
      return `
        <tr data-id="${escapeHtml(c.id)}">
          <td>${escapeHtml(c.nome || '-')}</td>
          <td>${escapeHtml(c.gmail || '-')}</td>
          <td>${escapeHtml(c.numero || '-')}</td>
          <td>${escapeHtml(c.idade ?? '-')}</td>
          <td>${escapeHtml(nomePlanoExibido)}</td>
          <td${vencido ? ' style="color:#ff6767;font-weight:700;"' : ''}>${escapeHtml(validadeTexto)}</td>
          <td>${escapeHtml(c.respostaQuiz || c.respostaTreino || '-')}</td>
          <td>${escapeHtml(dataFormatada)}</td>
          <td>
            <select class="select-plano" data-id="${escapeHtml(c.id)}">${opcoesPlano}</select>
            <button type="button" class="btn-editar" data-acao="trocar-plano-compra" data-id="${escapeHtml(c.id)}">TROCAR</button>
          </td>
        </tr>
      `;
    }).join('');

    // marca no <select> o plano já atribuído por um admin; se ainda não
    // foi atribuído, pré-seleciona o plano que a própria pessoa escolheu
    // no checkout (planoEscolhido), pra já vir com o valor certo.
    comprasTbody.querySelectorAll('.select-plano').forEach(sel => {
      const compra = comprasCache.find(c => c.id === sel.dataset.id);
      if (!compra) return;
      if (compra.planoId){
        sel.value = compra.planoId;
      } else {
        const planoDoCheckout = encontrarPlanoPorNome(compra.planoEscolhido);
        if (planoDoCheckout) sel.value = planoDoCheckout.id;
      }
    });

    comprasTbody.querySelectorAll('[data-acao="trocar-plano-compra"]').forEach(btn => {
      btn.addEventListener('click', () => trocarPlanoCompra(btn));
    });
  }

  async function trocarPlanoCompra(btn){
    const id = btn.dataset.id;
    const linha = btn.closest('tr');
    const select = linha.querySelector('.select-plano');
    const planoId = select.value;

    btn.disabled = true;
    const textoOriginal = btn.textContent;
    btn.textContent = 'SALVANDO...';

    try {
      if (!planoId){
        await updateDoc(doc(db, 'compras_newfity', id), {
          planoId: null, planoNome: null, planoInicio: null, planoExpiraEm: null
        });
      } else {
        const plano = PLANOS_PADRAO.find(p => p.id === planoId);
        if (!plano) throw new Error('Plano não encontrado.');
        const inicio = new Date();
        // a validade é calculada automaticamente: hoje + duração do plano (em dias)
        const expira = new Date(inicio.getTime() + Number(plano.duracaoDias) * 24 * 60 * 60 * 1000);
        await updateDoc(doc(db, 'compras_newfity', id), {
          planoId: plano.id,
          planoNome: plano.nome,
          planoInicio: inicio,
          planoExpiraEm: expira
        });
      }
      comprasCarregadas = false;
      carregarCompras();
    } catch (err) {
      console.error('Erro ao trocar plano da compra:', err);
      alert('Não foi possível trocar o plano. Tente novamente.');
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  }

  /* ---------- CRIAR USUÁRIO ---------- */
  const formUsuario = document.getElementById('formUsuario');
  const btnCriarUsuario = document.getElementById('btnCriarUsuario');
  const msgUsuario = document.getElementById('msgUsuario');

  function limparErrosUsuario(){
    ['uNome','uGmail','uNumero','uSenha'].forEach(id => {
      document.getElementById(id).closest('.form-group').classList.remove('invalid');
    });
  }

  formUsuario.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgUsuario.className = 'form-msg';
    limparErrosUsuario();

    const nome = document.getElementById('uNome').value.trim();
    const gmail = document.getElementById('uGmail').value.trim();
    const numero = document.getElementById('uNumero').value.trim();
    const senha = document.getElementById('uSenha').value;

    let valido = true;
    if (nome.length < 3){ document.getElementById('uNome').closest('.form-group').classList.add('invalid'); valido = false; }
    const gmailRegex = /^[^\s@]+@(gmail\.com)$/i;
    if (!gmailRegex.test(gmail)){ document.getElementById('uGmail').closest('.form-group').classList.add('invalid'); valido = false; }
    if (numero.replace(/\D/g,'').length < 10){ document.getElementById('uNumero').closest('.form-group').classList.add('invalid'); valido = false; }
    if (senha.length < 6){ document.getElementById('uSenha').closest('.form-group').classList.add('invalid'); valido = false; }

    if (!valido){
      mostrarMsg(msgUsuario, 'Verifique os campos destacados.', 'erro');
      return;
    }

    if (!db){
      mostrarMsg(msgUsuario, 'Firebase não configurado.', 'erro');
      return;
    }

    btnCriarUsuario.disabled = true;
    btnCriarUsuario.textContent = 'CRIANDO...';

    // BUG/RISCO CORRIGIDO: antes, criar um usuário novo trocava a sessão
    // ativa do navegador para a conta recém-criada (é assim que o
    // Firebase Auth funciona), e o código "consertava" isso deslogando
    // e logando de volta com o e-mail/senha do admin GUARDADOS EM
    // MEMÓRIA. Isso significava manter a senha do admin em texto puro
    // dentro do JavaScript da página enquanto o painel estivesse aberto.
    // Agora criamos o aluno num "app" Firebase paralelo e descartável,
    // então a sessão do admin no app principal nunca é afetada — sem
    // precisar guardar nenhuma senha em lugar nenhum.
    const appTemporario = initializeApp(firebaseConfig, 'admin-cria-usuario-' + Date.now());
    const authTemporario = getAuth(appTemporario);

    try {
      const cred = await createUserWithEmailAndPassword(authTemporario, gmail, senha);

      // salva os dados do aluno no Firestore, vinculados ao uid da conta criada
      await setDoc(doc(db, 'usuarios_newfity', cred.user.uid), {
        nome, gmail, numero, data: new Date()
      });

      mostrarMsg(msgUsuario, 'Usuário criado com sucesso!', 'sucesso');
      formUsuario.reset();
      usuariosCarregados = false;
      if (document.getElementById('abaUsuarios').classList.contains('active')){
        carregarUsuarios();
      }
    } catch (err) {
      console.error('Erro ao criar usuário:', err);
      const mapaErros = {
        'auth/email-already-in-use': 'Esse Gmail já está cadastrado.',
        'auth/invalid-email': 'Gmail inválido.',
        'auth/weak-password': 'A senha precisa ter no mínimo 6 caracteres.'
      };
      mostrarMsg(msgUsuario, mapaErros[err.code] || 'Erro ao criar usuário. Tente novamente.', 'erro');
    } finally {
      await deleteApp(appTemporario);
      btnCriarUsuario.disabled = false;
      btnCriarUsuario.textContent = 'CRIAR USUÁRIO';
    }
  });

  /* ---------- LISTAR / EXCLUIR USUÁRIOS + PLANO/VALIDADE ---------- */
  const usuariosTbody = document.getElementById('usuariosTbody');
  let usuariosCarregados = false;

  async function carregarUsuarios(){
    if (usuariosCarregados) return;
    if (!db){
      usuariosTbody.innerHTML = '<tr><td colspan="7" class="tabela-vazio">Firebase não configurado.</td></tr>';
      return;
    }

    usuariosTbody.innerHTML = '<tr><td colspan="7" class="tabela-loading">Carregando...</td></tr>';

    try {
      const snap = await getDocs(collection(db, 'usuarios_newfity'));
      const usuarios = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      usuarios.sort((a, b) => {
        const ta = a.data && a.data.toDate ? a.data.toDate().getTime() : (a.data ? new Date(a.data).getTime() : 0);
        const tb = b.data && b.data.toDate ? b.data.toDate().getTime() : (b.data ? new Date(b.data).getTime() : 0);
        return tb - ta;
      });

      if (usuarios.length === 0){
        usuariosTbody.innerHTML = '<tr><td colspan="7" class="tabela-vazio">Nenhum usuário cadastrado.</td></tr>';
        usuariosCarregados = true;
        return;
      }

      renderizarUsuarios(usuarios);
      usuariosCarregados = true;
    } catch (err) {
      console.error('Erro ao carregar usuários:', err);
      usuariosTbody.innerHTML = '<tr><td colspan="7" class="tabela-vazio">Não foi possível carregar os usuários.</td></tr>';
    }
  }

  function renderizarUsuarios(usuarios){
    const opcoesPlano = ['<option value="">Sem plano</option>']
      .concat(PLANOS_PADRAO.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nome)}</option>`))
      .join('');

    usuariosTbody.innerHTML = usuarios.map(u => {
      const dataFormatada = (u.data && u.data.toDate)
        ? u.data.toDate().toLocaleString('pt-BR')
        : (u.data ? new Date(u.data).toLocaleString('pt-BR') : '-');
      const validadeTexto = u.planoNome ? formatarValidade(u.planoExpiraEm) : '-';
      const vencido = u.planoNome && planoEstaVencido(u.planoExpiraEm);
      return `
        <tr data-id="${escapeHtml(u.id)}">
          <td>${escapeHtml(u.nome || '-')}</td>
          <td>${escapeHtml(u.gmail || '-')}</td>
          <td>${escapeHtml(u.numero || '-')}</td>
          <td>${escapeHtml(u.planoNome || 'Sem plano')}</td>
          <td${vencido ? ' style="color:#ff6767;font-weight:700;"' : ''}>${escapeHtml(validadeTexto)}</td>
          <td>${escapeHtml(dataFormatada)}</td>
          <td>
            <select class="select-plano" data-id="${escapeHtml(u.id)}">${opcoesPlano}</select>
            <button type="button" class="btn-editar" data-acao="trocar-plano" data-id="${escapeHtml(u.id)}">TROCAR</button>
            <button type="button" class="btn-excluir" data-id="${escapeHtml(u.id)}">EXCLUIR</button>
          </td>
        </tr>
      `;
    }).join('');

    // marca no <select> o plano que o usuário já tem hoje
    usuariosTbody.querySelectorAll('.select-plano').forEach(sel => {
      const usuario = usuarios.find(u => u.id === sel.dataset.id);
      if (usuario && usuario.planoId) sel.value = usuario.planoId;
    });

    usuariosTbody.querySelectorAll('[data-acao="trocar-plano"]').forEach(btn => {
      btn.addEventListener('click', () => trocarPlanoUsuario(btn));
    });
    usuariosTbody.querySelectorAll('.btn-excluir').forEach(btn => {
      btn.addEventListener('click', () => excluirUsuario(btn));
    });
  }

  async function trocarPlanoUsuario(btn){
    const id = btn.dataset.id;
    const linha = btn.closest('tr');
    const select = linha.querySelector('.select-plano');
    const planoId = select.value;

    btn.disabled = true;
    const textoOriginal = btn.textContent;
    btn.textContent = 'SALVANDO...';

    try {
      if (!planoId){
        // "Sem plano" selecionado: remove o plano do usuário
        await updateDoc(doc(db, 'usuarios_newfity', id), {
          planoId: null, planoNome: null, planoInicio: null, planoExpiraEm: null
        });
      } else {
        const plano = PLANOS_PADRAO.find(p => p.id === planoId);
        if (!plano) throw new Error('Plano não encontrado.');
        const inicio = new Date();
        // a validade é calculada automaticamente: hoje + duração do plano (em dias)
        const expira = new Date(inicio.getTime() + Number(plano.duracaoDias) * 24 * 60 * 60 * 1000);
        await updateDoc(doc(db, 'usuarios_newfity', id), {
          planoId: plano.id,
          planoNome: plano.nome,
          planoInicio: inicio,
          planoExpiraEm: expira
        });
      }
      usuariosCarregados = false;
      carregarUsuarios();
    } catch (err) {
      console.error('Erro ao trocar plano do usuário:', err);
      alert('Não foi possível trocar o plano. Tente novamente.');
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  }

  async function excluirUsuario(btn){
    const id = btn.dataset.id;
    const linha = btn.closest('tr');
    const nome = linha.children[0].textContent;

    const confirmar = confirm(`Excluir o cadastro de "${nome}"? Essa ação não pode ser desfeita.`);
    if (!confirmar) return;

    btn.disabled = true;
    btn.textContent = 'EXCLUINDO...';

    try {
      await deleteDoc(doc(db, 'usuarios_newfity', id));
      linha.remove();
      if (usuariosTbody.children.length === 0){
        usuariosTbody.innerHTML = '<tr><td colspan="7" class="tabela-vazio">Nenhum usuário cadastrado.</td></tr>';
      }
    } catch (err) {
      console.error('Erro ao excluir usuário:', err);
      btn.disabled = false;
      btn.textContent = 'EXCLUIR';
      alert('Não foi possível excluir. Tente novamente.');
    }
  }

  /* ---------- FUNCIONÁRIOS (só quem está em EMAILS_ADMIN vê/mexe aqui) ---------- */
  const formFuncionario = document.getElementById('formFuncionario');
  const btnCriarFuncionario = document.getElementById('btnCriarFuncionario');
  const msgFuncionario = document.getElementById('msgFuncionario');
  const funcionariosTbody = document.getElementById('funcionariosTbody');
  let funcionariosCarregados = false;

  formFuncionario.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgFuncionario.className = 'form-msg';

    if (papelAtual !== 'master'){
      mostrarMsg(msgFuncionario, 'Só o admin master pode criar funcionários.', 'erro');
      return;
    }

    const nome = document.getElementById('fNome').value.trim();
    const gmail = document.getElementById('fGmail').value.trim();
    const numero = document.getElementById('fNumero').value.trim();
    const senha = document.getElementById('fSenha').value;

    const gmailRegex = /^[^\s@]+@(gmail\.com)$/i;
    let valido = true;
    if (nome.length < 3) valido = false;
    if (!gmailRegex.test(gmail)) valido = false;
    if (numero.replace(/\D/g,'').length < 10) valido = false;
    if (senha.length < 6) valido = false;

    if (!valido){
      mostrarMsg(msgFuncionario, 'Verifique os campos preenchidos (Gmail precisa ser @gmail.com e a senha ter 6+ caracteres).', 'erro');
      return;
    }
    if (!db){
      mostrarMsg(msgFuncionario, 'Firebase não configurado.', 'erro');
      return;
    }

    btnCriarFuncionario.disabled = true;
    btnCriarFuncionario.textContent = 'CRIANDO...';

    // Mesma técnica usada em "Criar usuário": app Firebase temporário
    // pra não trocar a sessão do admin que está logado agora.
    const appTemporario = initializeApp(firebaseConfig, 'admin-cria-funcionario-' + Date.now());
    const authTemporario = getAuth(appTemporario);

    try {
      const cred = await createUserWithEmailAndPassword(authTemporario, gmail, senha);

      await setDoc(doc(db, 'funcionarios_newfity', cred.user.uid), {
        nome, gmail, numero, data: new Date()
      });

      mostrarMsg(msgFuncionario, 'Funcionário criado com sucesso!', 'sucesso');
      formFuncionario.reset();
      funcionariosCarregados = false;
      if (document.getElementById('abaFuncionarios').classList.contains('active')){
        carregarFuncionarios();
      }
    } catch (err) {
      console.error('Erro ao criar funcionário:', err);
      const mapaErros = {
        'auth/email-already-in-use': 'Esse Gmail já está cadastrado.',
        'auth/invalid-email': 'Gmail inválido.',
        'auth/weak-password': 'A senha precisa ter no mínimo 6 caracteres.'
      };
      mostrarMsg(msgFuncionario, mapaErros[err.code] || 'Erro ao criar funcionário. Tente novamente.', 'erro');
    } finally {
      await deleteApp(appTemporario);
      btnCriarFuncionario.disabled = false;
      btnCriarFuncionario.textContent = 'CRIAR FUNCIONÁRIO';
    }
  });

  async function carregarFuncionarios(){
    if (papelAtual !== 'master') return; // reforço extra além do CSS/rules
    if (funcionariosCarregados) return;
    if (!db){
      funcionariosTbody.innerHTML = '<tr><td colspan="5" class="tabela-vazio">Firebase não configurado.</td></tr>';
      return;
    }

    funcionariosTbody.innerHTML = '<tr><td colspan="5" class="tabela-loading">Carregando...</td></tr>';

    try {
      const snap = await getDocs(collection(db, 'funcionarios_newfity'));
      const funcionarios = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      funcionarios.sort((a, b) => {
        const ta = a.data && a.data.toDate ? a.data.toDate().getTime() : 0;
        const tb = b.data && b.data.toDate ? b.data.toDate().getTime() : 0;
        return tb - ta;
      });

      if (funcionarios.length === 0){
        funcionariosTbody.innerHTML = '<tr><td colspan="5" class="tabela-vazio">Nenhum funcionário cadastrado.</td></tr>';
        funcionariosCarregados = true;
        return;
      }

      funcionariosTbody.innerHTML = funcionarios.map(f => {
        const dataFormatada = (f.data && f.data.toDate) ? f.data.toDate().toLocaleString('pt-BR') : '-';
        return `
          <tr data-id="${escapeHtml(f.id)}">
            <td>${escapeHtml(f.nome || '-')}</td>
            <td>${escapeHtml(f.gmail || '-')}</td>
            <td>${escapeHtml(f.numero || '-')}</td>
            <td>${escapeHtml(dataFormatada)}</td>
            <td><button type="button" class="btn-excluir" data-id="${escapeHtml(f.id)}">EXCLUIR</button></td>
          </tr>
        `;
      }).join('');

      funcionariosTbody.querySelectorAll('.btn-excluir').forEach(btn => {
        btn.addEventListener('click', () => excluirFuncionario(btn));
      });
      funcionariosCarregados = true;
    } catch (err) {
      console.error('Erro ao carregar funcionários:', err);
      funcionariosTbody.innerHTML = '<tr><td colspan="5" class="tabela-vazio">Não foi possível carregar os funcionários.</td></tr>';
    }
  }

  async function excluirFuncionario(btn){
    const id = btn.dataset.id;
    const linha = btn.closest('tr');
    const nome = linha.children[0].textContent;

    const confirmar = confirm(`Remover o acesso de "${nome}" ao painel? Essa ação não pode ser desfeita.`);
    if (!confirmar) return;

    btn.disabled = true;
    btn.textContent = 'EXCLUINDO...';

    try {
      await deleteDoc(doc(db, 'funcionarios_newfity', id));
      linha.remove();
      if (funcionariosTbody.children.length === 0){
        funcionariosTbody.innerHTML = '<tr><td colspan="5" class="tabela-vazio">Nenhum funcionário cadastrado.</td></tr>';
      }
    } catch (err) {
      console.error('Erro ao excluir funcionário:', err);
      btn.disabled = false;
      btn.textContent = 'EXCLUIR';
      alert('Não foi possível excluir. Tente novamente.');
    }
  }


} // fim de iniciarPainel()