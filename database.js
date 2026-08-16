const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'app.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id TEXT PRIMARY KEY,
    bot_token_encrypted TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    message_count INTEGER NOT NULL DEFAULT 0
  );
`);

module.exports = db;
