/* =======================================================
   UTILITÁRIOS COMPARTILHADOS
   =======================================================
   escapeHtml(): impede um ataque de XSS (Cross-Site Scripting).

   O PROBLEMA que isso corrige: o formulário de checkout é público —
   qualquer visitante pode digitar o que quiser no campo "Nome", por
   exemplo `<img src=x onerror="...">`. Esse texto ia direto para o
   Firestore e depois era jogado sem tratamento dentro de innerHTML na
   tabela de compras do painel admin. Ou seja, um visitante malicioso
   conseguiria rodar JavaScript dentro da tela do administrador só
   preenchendo o formulário do site. Por isso todo texto vindo do banco
   agora passa por essa função antes de entrar em innerHTML.
*/
export function escapeHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

/* =======================================================
   formatarValidade(): transforma a data de expiração de um plano
   (Timestamp do Firestore, Date ou string) num texto tipo
   "Vence em 12 dia(s)" / "Venceu há 3 dia(s)" / "Sem plano".
   Usado no painel admin (aba Usuários) e no dashboard do aluno.
*/
export function formatarValidade(planoExpiraEm){
  if (!planoExpiraEm) return 'Sem plano';
  const expira = planoExpiraEm.toDate ? planoExpiraEm.toDate() : new Date(planoExpiraEm);
  const hoje = new Date();
  const diffDias = Math.ceil((expira.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDias < 0) return `Venceu há ${Math.abs(diffDias)} dia(s)`;
  if (diffDias === 0) return 'Vence hoje';
  return `Vence em ${diffDias} dia(s)`;
}

export function planoEstaVencido(planoExpiraEm){
  if (!planoExpiraEm) return false;
  const expira = planoExpiraEm.toDate ? planoExpiraEm.toDate() : new Date(planoExpiraEm);
  return expira.getTime() < Date.now();
}

/* =======================================================
   Miniatura padrão (cinza escuro) usada quando um vídeo não tem
   thumbnail. Antes apontava para "placeholder-logo.png", um arquivo
   que não existe no projeto (imagem quebrada).
*/
export const PLACEHOLDER_THUMB =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='320' height='180' fill='%231A1A1A'/%3E%3C/svg%3E";
