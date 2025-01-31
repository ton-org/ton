/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ["/node_modules/","/dist/"],
  testTimeout: 60000,
  moduleNameMapper: {
    '^axios$': require.resolve('axios'),
  }
};