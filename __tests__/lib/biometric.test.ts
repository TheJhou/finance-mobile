import {
  BIOMETRIC_LOCK_GRACE_MS,
  onBiometricEnabledChange,
  setBiometricEnabled,
  shouldLockAfterBackground,
} from "@/lib/biometric";

describe("shouldLockAfterBackground", () => {
  const now = 1_000_000;

  it("não bloqueia se o app não foi para segundo plano", () => {
    expect(shouldLockAfterBackground(null, now)).toBe(false);
  });

  it("não bloqueia em saídas rápidas (câmera, seletor de arquivo, compra)", () => {
    expect(shouldLockAfterBackground(now - 10_000, now)).toBe(false);
  });

  it("bloqueia ao passar da tolerância", () => {
    expect(shouldLockAfterBackground(now - BIOMETRIC_LOCK_GRACE_MS, now)).toBe(true);
    expect(shouldLockAfterBackground(now - 10 * 60_000, now)).toBe(true);
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
