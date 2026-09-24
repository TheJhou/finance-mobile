import { isValidPassword } from "@/lib/password-rules";

// Mesma regra do backend (routes/auth.ts): 8+ caracteres, 1 letra e 1 número
describe("isValidPassword", () => {
  it.each([
    ["abc12345", true],
    ["Senha2026", true],
    ["abc1234", false], // 7 caracteres: o app aceitava (mínimo 6) e o backend recusava
    ["abcdefgh", false], // sem número
    ["12345678", false], // sem letra
  ])("%s → %s", (password, expected) => {
    expect(isValidPassword(password)).toBe(expected);
  });
});
