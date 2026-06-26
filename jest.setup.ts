import { resetNetInfoMock } from "@/__mocks__/@react-native-community/netinfo";
import { resetFileSystemMock } from "@/__mocks__/expo-file-system";
import { resetSecureStoreMock } from "@/__mocks__/expo-secure-store";
import { resetMockDatabase } from "@/__mocks__/expo-sqlite";
import { resetDbCache } from "@/lib/db";

// Reset database before each test to ensure clean state
beforeEach(() => {
  resetDbCache();
  resetMockDatabase();
  resetSecureStoreMock();
  resetFileSystemMock();
  resetNetInfoMock();
});
