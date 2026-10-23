/** Only T-29 component/UI tests: older node:test suites keep running under tsx. */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/*.ui.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/'],
  clearMocks: true,
};
