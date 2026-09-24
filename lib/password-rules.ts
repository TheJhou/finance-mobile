// Regra de senha do backend (routes/auth.ts: mínimo 8 caracteres, 1 letra e 1 número).
// Centralizada aqui para as telas de cadastro e troca de senha não divergirem dela.

export const PASSWORD_HINT = "Mínimo 8 caracteres, com letra e número";

export const PASSWORD_RULE_MESSAGE = "A senha deve ter no mínimo 8 caracteres, com pelo menos 1 letra e 1 número";

export function isValidPassword(password: string): boolean {
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}
