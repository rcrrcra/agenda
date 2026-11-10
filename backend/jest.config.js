module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testRegex: "test/.*\\.e2e\\.ts$",
  testTimeout: 180000,
  transform: { "^.+\\.ts$": ["ts-jest", { diagnostics: false, isolatedModules: true }] },
};
