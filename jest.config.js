const SINGLETHREADED =
  process.env.SINGLETHREADED === "1" || process.env.SINGLETHREADED === "true";
/** @type {import('jest').Config} */
const options = {
  transform: {
    "^.+\\.ts": "@swc/jest",
  },
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  collectCoverageFrom: ["src/**/*.{ts,js}"],
  testTimeout: 60000,
  setupFilesAfterEnv: ["./setup-jest.js"],
  moduleNameMapper: {
    "^axios$": require.resolve("axios"),
  },
};

if (SINGLETHREADED) {
  /** setting value to undfined throws */
  options.maxWorkers = 1;
}

module.exports = options;
