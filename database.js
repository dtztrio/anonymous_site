const { createClient } = require('@libsql/client');

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  throw new Error(
    'TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in .env. ' +
    'See README.md → "Database setup (Turso)" for how to get these.'
  );
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Creates the table on first run; safe to call on every boot.
async function initDb() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS links (
      id TEXT PRIMARY KEY,
      bot_token_encrypted TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      display_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      message_count INTEGER NOT NULL DEFAULT 0
    );
  `);
}

module.exports = { client, initDb };
