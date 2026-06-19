import { resetMockDatabase } from "@/__mocks__/expo-sqlite";

// Reset modules and mock database before each test to ensure clean state
beforeEach(() => {
  jest.resetModules();
  resetMockDatabase();
});
