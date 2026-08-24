const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data.sqlite');
const isNew = !fs.existsSync(DB_PATH);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Always run schema (CREATE TABLE IF NOT EXISTS is idempotent)
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

if (isNew) {
  console.log('[db] New database created at', DB_PATH);
} else {
  console.log('[db] Using existing database at', DB_PATH);
}

module.exports = db;
