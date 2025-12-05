const SINGLETHREADED =
    process.env.SINGLETHREADED === "1" || process.env.SINGLETHREADED === "true";
/**
 * @type {import("jest").Config}
 */
const config = {
    transform: {
        "^.+\\.ts": "@swc/jest",
    },
    testEnvironment: "node",
    testPathIgnorePatterns: ["/node_modules/", "/dist/"],
    collectCoverageFrom: ["src/**/*.{ts,js}"],
    testTimeout: 60000,
    setupFilesAfterEnv: ["./setup-jest.ts"],
    moduleNameMapper: {
        "^axios$": require.resolve("axios"),
    },
};

if (SINGLETHREADED) {
    /** setting value to undfined throws */
    config.maxWorkers = 1;
}

module.exports = config;
