// Mock mínimo de expo-local-authentication para testes unitários

export enum AuthenticationType {
  FINGERPRINT = 1,
  FACIAL_RECOGNITION = 2,
  IRIS = 3,
}

export const hasHardwareAsync = jest.fn(async () => true);
export const isEnrolledAsync = jest.fn(async () => true);
export const supportedAuthenticationTypesAsync = jest.fn(async () => [AuthenticationType.FINGERPRINT]);
export const authenticateAsync = jest.fn(async (): Promise<{ success: boolean; error?: string }> => ({ success: true }));
export const cancelAuthenticate = jest.fn(async () => {});
