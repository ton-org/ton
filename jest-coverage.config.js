const mainConfig = require("./jest.config");
/** @type {import('jest').Config} */
const config = {
  ...mainConfig,
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageReporters: ["lcov", "html"],
  collectCoverageFrom: ["src/**/*.{ts,js}"],
};

module.exports = config;
