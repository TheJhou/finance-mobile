import * as LocalAuthentication from "expo-local-authentication";
import {
  authenticateWithBiometrics,
  BIOMETRIC_LOCK_GRACE_MS,
  isAutoLockSuppressed,
  onBiometricEnabledChange,
  resumeAutoLock,
  setBiometricEnabled,
  shouldLockAfterBackground,
  suspendAutoLockFor,
  withoutAutoLock,
} from "@/lib/biometric";

const authenticateAsync = LocalAuthentication.authenticateAsync as jest.Mock;

// Tempo base à frente do relógio real: o módulo guarda instantes e só avança
let base = 0;
beforeEach(() => {
  base = Date.now() + 60_000;
});

afterEach(() => {
  jest.useRealTimers();
  resumeAutoLock();
});

describe("shouldLockAfterBackground", () => {
  const now = 1_000_000;

  it("não bloqueia se o app não foi para segundo plano", () => {
    expect(shouldLockAfterBackground(null, now)).toBe(false);
  });

  it("pede a digital ao voltar de segundo plano (biometria ativada = sempre pede)", () => {
    expect(shouldLockAfterBackground(now - 5_000, now)).toBe(true);
    expect(shouldLockAfterBackground(now - 10 * 60_000, now)).toBe(true);
  });

  it("ignora piscadas de segundo plano abaixo da folga mínima", () => {
    expect(shouldLockAfterBackground(now - (BIOMETRIC_LOCK_GRACE_MS - 1), now)).toBe(false);
  });

  it("não pede quando a saída foi um fluxo externo do próprio app", () => {
    expect(shouldLockAfterBackground(now - 60_000, now, true)).toBe(false);
  });
});

describe("withoutAutoLock", () => {
  it("suprime o bloqueio durante o fluxo e por alguns segundos depois", async () => {
    jest.useFakeTimers({ now: base });
    let suppressedDuring = false;

    await withoutAutoLock(async () => {
      suppressedDuring = isAutoLockSuppressed();
    });

    expect(suppressedDuring).toBe(true);
    expect(isAutoLockSuppressed()).toBe(true);
    jest.setSystemTime(base + 5_000);
    expect(isAutoLockSuppressed()).toBe(false);
  });

  it("libera a supressão mesmo se o fluxo falhar", async () => {
    jest.useFakeTimers({ now: base });
    await expect(withoutAutoLock(async () => { throw new Error("cancelado"); })).rejects.toThrow("cancelado");

    jest.setSystemTime(base + 5_000);
    expect(isAutoLockSuppressed()).toBe(false);
  });
});

describe("suspendAutoLockFor / resumeAutoLock", () => {
  it("mantém a supressão pela janela pedida e encerra quando o fluxo termina", () => {
    jest.useFakeTimers({ now: base });
    suspendAutoLockFor(5 * 60_000);

    jest.setSystemTime(base + 4 * 60_000);
    expect(isAutoLockSuppressed()).toBe(true);

    resumeAutoLock();
    jest.setSystemTime(base + 4 * 60_000 + 5_000);
    expect(isAutoLockSuppressed()).toBe(false);
  });
});

describe("authenticateWithBiometrics", () => {
  it("o próprio prompt não dispara novo bloqueio na volta (aparelhos em que ele é tela do sistema)", async () => {
    let suppressedDuringPrompt = false;
    authenticateAsync.mockImplementationOnce(async () => {
      suppressedDuringPrompt = isAutoLockSuppressed();
      return { success: true };
    });

    expect(await authenticateWithBiometrics()).toEqual({ success: true });
    expect(suppressedDuringPrompt).toBe(true);
  });

  it("devolve o código do erro para a tela decidir se tenta de novo", async () => {
    authenticateAsync.mockResolvedValueOnce({ success: false, error: "system_cancel" });

    const result = await authenticateWithBiometrics();

    expect(result).toMatchObject({ success: false, code: "system_cancel" });
    expect(result.error).toMatch(/interrompida/);
  });

  it("app_cancel tem mensagem própria (antes caía em 'Falha na autenticação')", async () => {
    authenticateAsync.mockResolvedValueOnce({ success: false, error: "app_cancel" });
    expect((await authenticateWithBiometrics()).error).toBe("Autenticação interrompida");
  });
});

describe("onBiometricEnabledChange", () => {
  it("avisa quando a biometria é ligada ou desligada", async () => {
    const listener = jest.fn();
    const unsubscribe = onBiometricEnabledChange(listener);

    await setBiometricEnabled(true);
    await setBiometricEnabled(false);
    unsubscribe();
    await setBiometricEnabled(true);

    expect(listener.mock.calls).toEqual([[true], [false]]);
  });
});
