/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ["/node_modules/","/dist/"],
  testTimeout: 60000,
  moduleNameMapper: {
    '^axios$': require.resolve('axios'),
  }
};