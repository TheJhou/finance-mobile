import { resetMockDatabase } from "@/__mocks__/expo-sqlite";
import { resetDbCache } from "@/lib/db";

// Reset database before each test to ensure clean state
beforeEach(() => {
  resetDbCache();
  resetMockDatabase();
});
