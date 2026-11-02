// Preloaded before server.js by the accuracy proof, so it can never reach a real database.
const Module = require('module');
const path = require('path');

const dbPath = path.resolve(__dirname, '../../server/db.js');
const stub = new Module(dbPath);
stub.exports = {
  initDatabase: async () => true,
  pool: { query: async () => [{ affectedRows: 0 }] },
};
stub.loaded = true;
require.cache[dbPath] = stub;
