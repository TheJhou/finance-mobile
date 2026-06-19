import { resetMockDatabase } from "@/__mocks__/expo-sqlite";
import { resetDbCache } from "@/lib/db";

// Reset modules and mock database before each test to ensure clean state
beforeEach(() => {
  jest.resetModules();
  resetDbCache();
  resetMockDatabase();
});
