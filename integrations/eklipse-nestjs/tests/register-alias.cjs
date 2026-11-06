// Resolve only the three external application boundaries in this isolated test harness.
const Module = require('node:module');
const path = require('node:path');
const original = Module._resolveFilename;
const names = {
  '@common/infrastructure/services': 'base-source.js',
  '@common/presentation/decorators': 'decorators.js',
  '@authorities/facturacion': 'authorities.js',
};
Module._resolveFilename = function (request, ...args) {
  return original.call(this, names[request]
    ? path.join(__dirname, '../build/tests/stubs', names[request]) : request, ...args);
};
