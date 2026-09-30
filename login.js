import { app, db } from "./firebase-config.js";
import { paginaInicialDe } from "./admin-emails.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

let auth = null;
if (app) {
  try {
    auth = getAuth(app);
  } catch (e) {
    console.error("Erro ao iniciar o Auth:", e);
  }
}

// Trava usada no cadastro: ao criar a conta o Firebase já deixa o usuário
// logado, e o onAuthStateChanged abaixo redirecionava NA HORA — podendo
// cortar a gravação do nome/número no Firestore no meio. Enquanto essa
// trava estiver ligada, o redirecionamento automático fica de fora.
let criandoConta = false;

/* ---------- SE JÁ ESTIVER LOGADO, VAI DIRETO PRO DASHBOARD (OU ADMIN) ---------- */
// BUG CORRIGIDO: antes essa tela mandava QUALQUER pessoa logada direto
// pro dashboard.html de aluno — inclusive a conta do admin, que por
// causa disso nunca chegava no painel administrativo passando por aqui.
if (auth) {
  onAuthStateChanged(auth, async (user) => {
    if (user && !criandoConta) {
      // admin master e funcionários -> admin.html | alunos -> dashboard.html
      window.location.href = await paginaInicialDe(db, user);
    }
  });
}

/* ---------- ALTERNAR ENTRE AS TELAS ---------- */
const screenLogin = document.getElementById('screenLogin');
const screenCriar = document.getElementById('screenCriar');

function irPara(tela){
  screenLogin.classList.remove('active');
  screenCriar.classList.remove('active');
  tela.classList.add('active');
}

document.getElementById('irParaCriar').addEventListener('click', (e) => {
  e.preventDefault();
  irPara(screenCriar);
});
document.getElementById('irParaLogin').addEventListener('click', (e) => {
  e.preventDefault();
  irPara(screenLogin);
});

/* ---------- MENSAGENS DE ERRO TRADUZIDAS ---------- */
function traduzirErro(codigo){
  const mapa = {
    'auth/invalid-email': 'E-mail inválido.',
    'auth/user-not-found': 'Nenhuma conta encontrada com esse e-mail.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/email-already-in-use': 'Esse e-mail já está cadastrado.',
    'auth/weak-password': 'A senha precisa ter no mínimo 6 caracteres.',
    'auth/missing-password': 'Informe sua senha.',
    'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
    'auth/network-request-failed': 'Sem conexão. Verifique sua internet e tente de novo.'
  };
  return mapa[codigo] || 'Ocorreu um erro. Tente novamente.';
}

function mostrarMsg(el, texto, tipo){
  el.textContent = texto;
  el.className = 'form-msg show ' + tipo;
}

/* ---------- TELA 1: LOGIN ---------- */
const formLogin = document.getElementById('formLogin');
const btnEntrar = document.getElementById('btnEntrar');
const msgLogin = document.getElementById('msgLogin');
const lembrarDeMim = document.getElementById('lembrarDeMim');

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgLogin.className = 'form-msg';

  const email = document.getElementById('loginEmail').value.trim();
  const senha = document.getElementById('loginSenha').value;

  if (!email || !senha){
    mostrarMsg(msgLogin, 'Preencha e-mail e senha.', 'erro');
    return;
  }
  if (!auth){
    mostrarMsg(msgLogin, 'Firebase não configurado. Veja firebase-config.js.', 'erro');
    return;
  }

  btnEntrar.disabled = true;
  btnEntrar.textContent = 'ENTRANDO...';

  try {
    // "Lembrar de mim" marcado -> mantém logado mesmo após fechar o navegador.
    // Desmarcado -> a sessão dura só até a aba/navegador ser fechado.
    const persistencia = lembrarDeMim.checked ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistencia);

    const cred = await signInWithEmailAndPassword(auth, email, senha);
    window.location.href = await paginaInicialDe(db, cred.user);
  } catch (err) {
    mostrarMsg(msgLogin, traduzirErro(err.code), 'erro');
  } finally {
    btnEntrar.disabled = false;
    btnEntrar.textContent = 'ENTRAR';
  }
});

/* ---------- ESQUECI MINHA SENHA ---------- */
document.getElementById('esqueciSenha').addEventListener('click', async (e) => {
  e.preventDefault();
  msgLogin.className = 'form-msg';

  const email = document.getElementById('loginEmail').value.trim();

  if (!email){
    mostrarMsg(msgLogin, 'Digite seu e-mail no campo acima antes de clicar em "Esqueci minha senha".', 'erro');
    return;
  }
  if (!auth){
    mostrarMsg(msgLogin, 'Firebase não configurado. Veja firebase-config.js.', 'erro');
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    mostrarMsg(msgLogin, 'Enviamos um e-mail para ' + email + ' com o link de redefinição de senha.', 'sucesso');
  } catch (err) {
    mostrarMsg(msgLogin, traduzirErro(err.code), 'erro');
  }
});

/* ---------- TELA 2: CRIAR CONTA ---------- */
const formCriar = document.getElementById('formCriar');
const btnCriar = document.getElementById('btnCriar');
const msgCriar = document.getElementById('msgCriar');

function limparErrosCriar(){
  ['criarNome','criarGmail','criarNumero','criarSenha','criarConfirmarSenha'].forEach(id => {
    document.getElementById(id).closest('.form-group').classList.remove('invalid');
  });
}

formCriar.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgCriar.className = 'form-msg';
  limparErrosCriar();

  const nome = document.getElementById('criarNome').value.trim();
  const gmail = document.getElementById('criarGmail').value.trim();
  const numero = document.getElementById('criarNumero').value.trim();
  const senha = document.getElementById('criarSenha').value;
  const confirmarSenha = document.getElementById('criarConfirmarSenha').value;

  let valido = true;

  if (nome.length < 3){
    document.getElementById('criarNome').closest('.form-group').classList.add('invalid');
    valido = false;
  }
  const gmailRegex = /^[^\s@]+@(gmail\.com)$/i;
  if (!gmailRegex.test(gmail)){
    document.getElementById('criarGmail').closest('.form-group').classList.add('invalid');
    valido = false;
  }
  if (numero.replace(/\D/g,'').length < 10){
    document.getElementById('criarNumero').closest('.form-group').classList.add('invalid');
    valido = false;
  }
  if (senha.length < 6){
    document.getElementById('criarSenha').closest('.form-group').classList.add('invalid');
    valido = false;
  }
  if (confirmarSenha !== senha || !confirmarSenha){
    document.getElementById('criarConfirmarSenha').closest('.form-group').classList.add('invalid');
    valido = false;
  }

  if (!valido){
    mostrarMsg(msgCriar, 'Verifique os campos destacados.', 'erro');
    return;
  }

  if (!auth || !db){
    mostrarMsg(msgCriar, 'Firebase não configurado. Veja firebase-config.js.', 'erro');
    return;
  }

  btnCriar.disabled = true;
  btnCriar.textContent = 'CRIANDO...';

  criandoConta = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, gmail, senha);

    // salva os dados extras (nome e número) vinculados ao uid do usuário
    try {
      await setDoc(doc(db, 'usuarios_newfity', cred.user.uid), {
        nome,
        gmail,
        numero,
        data: serverTimestamp()
      });
    } catch (errSalvar) {
      console.error('Conta criada, mas não foi possível salvar o cadastro:', errSalvar);
      mostrarMsg(msgCriar, 'Conta criada, mas não foi possível salvar todos os seus dados. Redirecionando...', 'erro');
      setTimeout(() => window.location.href = 'dashboard.html', 2500);
      return;
    }

    mostrarMsg(msgCriar, 'Conta criada com sucesso! Redirecionando...', 'sucesso');
    setTimeout(() => window.location.href = 'dashboard.html', 900);
  } catch (err) {
    criandoConta = false;
    mostrarMsg(msgCriar, traduzirErro(err.code), 'erro');
  } finally {
    btnCriar.disabled = false;
    btnCriar.textContent = 'CRIAR CONTA';
  }
});