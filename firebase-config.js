/* =======================================================
   CONFIGURAÇÃO DO FIREBASE — ARQUIVO ÚNICO E COMPARTILHADO
   =======================================================
   Antes este mesmo bloco estava copiado em 4 arquivos (login.js,
   dashboard.js, checkout.js, admin.js) com valores incompletos/errados
   (ex: apiKey e appId cortados pela metade). Isso é o motivo mais
   provável de nada estar salvando/carregando do banco.

   COMO CORRIGIR:
   1. Vá em https://console.firebase.google.com
   2. Abra seu projeto > ⚙️ Configurações do projeto
   3. Em "Seus apps", copie o objeto "firebaseConfig" INTEIRO
   4. Cole substituindo o objeto abaixo (todos os campos, sem cortar)
*/
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
apiKey: "AIzaSyCezUCRAdCWvBmagW8VTZT7DbYA3-VJAms",
  authDomain: "newfity-f6025.firebaseapp.com",
  projectId: "newfity-f6025",
  storageBucket: "newfity-f6025.firebasestorage.app",
  messagingSenderId: "594359654359",
  appId: "1:594359654359:web:d507bee90c8d18db8c9d92",
  measurementId: "G-0ET0TXDKHF"
};

// Checagem simples para avisar claramente quando alguém esquecer de
// colar a config real, em vez de dar um erro confuso do Firebase lá na
// frente (era o que acontecia antes).
function configEhValida(cfg) {
  return !!(
    cfg.apiKey && cfg.apiKey.length > 20 && !cfg.apiKey.includes('COLE_AQUI') &&
    cfg.projectId && !cfg.projectId.includes('SEU-PROJETO') &&
    cfg.appId && cfg.appId.startsWith('1:') && cfg.appId.split(':').length >= 3
  );
}

export let app = null;
export let db = null;

if (configEhValida(firebaseConfig)) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  } catch (e) {
    console.error("Erro ao inicializar o Firebase:", e);
  }
} else {
  console.warn(
    "Firebase não configurado: edite o arquivo firebase-config.js com os dados reais do seu projeto (veja o comentário no topo do arquivo)."
  );
}
