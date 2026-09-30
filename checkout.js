import { app, db } from "./firebase-config.js";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { collection, addDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";

let auth = null;
if (app) {
  try {
    auth = getAuth(app);
  } catch (e) {
    console.error("Erro ao iniciar o Auth:", e);
  }
}

/* ---------- ESTADO GLOBAL ---------- */
let respostaQuiz = null; // "sim" ou "nao"

// Pega o plano escolhido pela URL (?plano=Premium), vindo da landing page
const params = new URLSearchParams(window.location.search);
const planoSelecionado = params.get('plano') || 'Seja Membro';
// "Seja Membro" aparece sozinho (sem o "Plano:" na frente); os outros continuam "Plano: X"
const textoTag = planoSelecionado.trim().toLowerCase() === 'seja membro'
  ? 'Seja Membro'
  : 'Plano: ' + planoSelecionado;
document.getElementById('planoTagQuiz').textContent = textoTag;
document.getElementById('planoTagForm').textContent = textoTag;

/* ---------- CONTROLE DE ETAPAS (STOPS) ---------- */
const stepQuiz = document.getElementById('stepQuiz');
const stepForm = document.getElementById('stepForm');
const successScreen = document.getElementById('successScreen');

function irParaEtapa(etapaAtual, etapaProxima){
  etapaAtual.style.display = 'none';
  etapaProxima.style.display = 'flex';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- ETAPA 1: PERGUNTA ---------- */
const quizSimBtn = document.getElementById('quizSim');
const quizNaoBtn = document.getElementById('quizNao');

function selecionarResposta(resposta){
  respostaQuiz = resposta;
  irParaEtapa(stepQuiz, stepForm);
}

quizSimBtn.addEventListener('click', () => selecionarResposta('sim'));
quizNaoBtn.addEventListener('click', () => selecionarResposta('nao'));

/* Botão "Voltar" na etapa 2 retorna para a pergunta */
document.getElementById('btnVoltarQuiz').addEventListener('click', () => {
  irParaEtapa(stepForm, stepQuiz);
});

/* ---------- ETAPA 2: FORMULÁRIO ---------- */
const formCompra = document.getElementById('formCompra');
const btnFinalizar = document.getElementById('btnFinalizar');
const toast = document.getElementById('toast');

function limparErros(){
  ['grpNome','grpGmail','grpNumero','grpIdade','grpSenha','grpConfirmar'].forEach(id => {
    document.getElementById(id).classList.remove('invalid');
  });
}

function showToast(msg){
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function validarForm(){
  limparErros();
  let valido = true;

  const nome = document.getElementById('inpNome').value.trim();
  const gmail = document.getElementById('inpGmail').value.trim();
  const numero = document.getElementById('inpNumero').value.trim();
  const idade = document.getElementById('inpIdade').value.trim();
  const senha = document.getElementById('inpSenha').value;
  const confirmar = document.getElementById('inpConfirmar').value;

  if (nome.length < 3){
    document.getElementById('grpNome').classList.add('invalid');
    valido = false;
  }
  const gmailRegex = /^[^\s@]+@(gmail\.com)$/i;
  if (!gmailRegex.test(gmail)){
    document.getElementById('grpGmail').classList.add('invalid');
    valido = false;
  }
  if (numero.replace(/\D/g,'').length < 10){
    document.getElementById('grpNumero').classList.add('invalid');
    valido = false;
  }
  if (!idade || Number(idade) < 1 || Number(idade) > 120){
    document.getElementById('grpIdade').classList.add('invalid');
    valido = false;
  }

  if (senha.length < 6){
    document.getElementById('grpSenha').classList.add('invalid');
    valido = false;
  }
  if (!confirmar || confirmar !== senha){
    document.getElementById('grpConfirmar').classList.add('invalid');
    valido = false;
  }

  return { valido, nome, gmail, numero, idade, senha };
}

formCompra.addEventListener('submit', async (e) => {
  e.preventDefault();

  const { valido, nome, gmail, numero, idade, senha } = validarForm();

  if (!valido){
    showToast('Preencha todos os campos corretamente.');
    return;
  }

  // BUG CORRIGIDO: antes, se o Firebase não estivesse configurado, o
  // código só dava um "console.warn" e MESMO ASSIM mostrava a tela de
  // "Compra realizada com sucesso!" — ou seja, o cliente achava que
  // tinha se matriculado, mas nada era salvo em lugar nenhum. Agora,
  // se o banco não estiver disponível, mostramos um erro de verdade e
  // não deixamos a pessoa acreditar que deu certo.
  if (!db || !auth){
    showToast('Não foi possível enviar seus dados agora. Tente novamente em instantes.');
    console.error('Firebase não configurado — veja firebase-config.js. Dados não enviados:', { nome, gmail, numero, idade });
    return;
  }

  btnFinalizar.disabled = true;
  btnFinalizar.textContent = 'ENVIANDO...';

  const dados = {
    nome,
    gmail,
    numero,
    idade: Number(idade),
    planoEscolhido: planoSelecionado,
    respostaQuiz,
    data: null
  };

  let contaJaExistia = false;

  try {
    // 1) cria o login do aluno (Gmail + a senha que ele escolheu).
    //    A senha vai só para o Firebase Authentication — nunca para o banco.
    try {
      const cred = await createUserWithEmailAndPassword(auth, gmail, senha);
      try {
        await setDoc(doc(db, 'usuarios_newfity', cred.user.uid), {
          nome,
          gmail,
          numero,
          data: serverTimestamp()
        });
      } catch (errPerfil) {
        console.error('Conta criada, mas não foi possível salvar o cadastro:', errPerfil);
      }
    } catch (errConta) {
      // e-mail que já tem conta (ex.: aluno trocando de plano): segue e só
      // registra a matrícula, sem mexer no login que já existe.
      if (errConta.code === 'auth/email-already-in-use') {
        contaJaExistia = true;
      } else {
        throw errConta;
      }
    }

    // 2) registra a matrícula (aparece na aba Compras do painel adm)
    await addDoc(collection(db, "compras_newfity"), {
      ...dados,
      data: serverTimestamp()
    });

    document.getElementById('successMsg').textContent = contaJaExistia
      ? 'Recebemos seus dados, vamos te chamar no WhatsApp! Esse e-mail já tinha conta: entre com o seu e-mail e a sua senha de sempre.'
      : 'Recebemos seus dados, vamos te chamar no WhatsApp! Sua conta foi criada: é só entrar com o seu e-mail e a senha que você escolheu.';

    // ETAPA 3: esconde o formulário e mostra a confirmação final
    stepForm.style.display = 'none';
    successScreen.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    console.error("Erro ao salvar:", err);
    showToast(err.code === 'auth/network-request-failed'
      ? 'Sem conexão. Verifique sua internet e tente de novo.'
      : 'Erro ao enviar. Tente novamente.');
  } finally {
    btnFinalizar.disabled = false;
    btnFinalizar.textContent = 'FINALIZAR MATRICULAR';
  }
});
