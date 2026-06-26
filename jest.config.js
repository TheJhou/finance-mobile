/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>"],
  modulePaths: ["<rootDir>"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^expo-sqlite$": "<rootDir>/__mocks__/expo-sqlite.ts",
    "^expo-secure-store$": "<rootDir>/__mocks__/expo-secure-store.ts",
    "^expo-crypto$": "<rootDir>/__mocks__/expo-crypto.ts",
    "^expo-file-system$": "<rootDir>/__mocks__/expo-file-system.ts",
    "^@react-native-community/netinfo$": "<rootDir>/__mocks__/@react-native-community/netinfo.ts",
    "^react-native$": "<rootDir>/__mocks__/react-native.ts",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json",
        diagnostics: { ignoreCodes: [2571, 2322, 2345] },
      },
    ],
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
};
