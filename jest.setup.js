/**
 * Copyright (c) Whales Corp. 
 * All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Polyfill Buffer for Node.js environment (similar to karma.setup.js)
const { Buffer } = require('buffer');
global.Buffer = Buffer;

// Extend default timeout for network operations and blockchain interactions
jest.setTimeout(60000);

// Setup fetch polyfill if needed
require('isomorphic-fetch');

// Global test utilities could be added here
global.testUtils = {
  // Add any common test utilities here
};

// Mock console methods in test environment to reduce noise (optional)
// Uncomment if you want to suppress console output during tests
// const originalError = console.error;
// beforeAll(() => {
//   console.error = (...args) => {
//     if (args[0]?.includes?.('Warning:')) {
//       return;
//     }
//     originalError.call(console, ...args);
//   };
// });

// Setup process.env defaults for testing
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

