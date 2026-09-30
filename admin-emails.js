import { doc, getDoc } from "firebase/firestore";

// Lista de e-mails com acesso de administrador.
// Mantenha esta lista IGUAL à que está em firestore.rules (função isAdmin).
export const EMAILS_ADMIN = [
  "newfity@gmail.com" // <-- TROQUE por um Gmail real com acesso admin
];

export const EMAILS_ADMIN_LOWER = EMAILS_ADMIN.map(e => e.toLowerCase());

export function isEmailAdmin(email){
  return !!email && EMAILS_ADMIN_LOWER.includes(email.toLowerCase());
}

/* Descobre o papel da conta logada:
   'master' (está em EMAILS_ADMIN), 'funcionario' (tem doc em
   funcionarios_newfity/{uid}) ou 'aluno'. É a MESMA checagem que o
   admin.js faz — antes, login.js e dashboard.js só olhavam a lista de
   e-mails e por isso mandavam todo funcionário pro dashboard de aluno. */
export async function descobrirPapel(db, user){
  if (!user) return null;
  if (isEmailAdmin(user.email)) return 'master';
  if (!db) return 'aluno';
  try {
    const snap = await getDoc(doc(db, 'funcionarios_newfity', user.uid));
    if (snap.exists()) return 'funcionario';
  } catch (err) {
    console.error('Erro ao checar se é funcionário:', err);
  }
  return 'aluno';
}

export async function paginaInicialDe(db, user){
  const papel = await descobrirPapel(db, user);
  return papel === 'aluno' ? 'dashboard.html' : 'admin.html';
}