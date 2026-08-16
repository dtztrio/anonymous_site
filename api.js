const express = require('express');
const { nanoid } = require('nanoid');
const { client: db } = require('../db/database');
const { encrypt, decrypt } = require('../utils/crypto');

const router = express.Router();

const BRAND_NAME = 'DTZ TRIO';
const TELEGRAM_TOKEN_REGEX = /^\d{6,}:[A-Za-z0-9_-]{30,}$/;
const CHAT_ID_REGEX = /^-?\d{5,}$/;

function baseUrl(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}

// Escapes text for Telegram's HTML parse_mode so a message can never
// break out of the <blockquote> or inject markup.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * POST /api/create-link
 * body: { botToken, chatId, displayName? }
 * Validates the bot token + chat id against the real Telegram API,
 * then stores the (encrypted) token and returns a shareable link.
 */
router.post('/create-link', async (req, res) => {
  try {
    const { botToken, chatId, displayName } = req.body || {};

    if (!botToken || !chatId) {
      return res.status(400).json({ error: 'botToken and chatId are required.' });
    }
    if (!TELEGRAM_TOKEN_REGEX.test(botToken.trim())) {
      return res.status(400).json({ error: 'That doesn\'t look like a valid Telegram bot token.' });
    }
    if (!CHAT_ID_REGEX.test(String(chatId).trim())) {
      return res.status(400).json({ error: 'That doesn\'t look like a valid Telegram chat ID.' });
    }

    const token = botToken.trim();
    const chat = String(chatId).trim();

    // 1. Verify the bot token is real
    const meResp = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meData = await meResp.json();
    if (!meData.ok) {
      return res.status(400).json({ error: 'Telegram rejected this bot token. Double-check it from BotFather.' });
    }

    // 2. Verify the bot can actually message this chat id
    //    (the user must have pressed "Start" on the bot at least once)
    const testResp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        parse_mode: 'HTML',
        text: `✅ Your anonymous messaging link is now connected via <b>${BRAND_NAME}</b>. You'll receive messages here.`,
      }),
    });
    const testData = await testResp.json();
    if (!testData.ok) {
      return res.status(400).json({
        error:
          'Could not message that chat ID. Make sure you\'ve sent /start to your bot from that Telegram account first.',
      });
    }

    // 3. Persist (token encrypted at rest)
    let id = nanoid(10);
    // guard against the astronomically unlikely collision
    const existing = await db.execute({ sql: 'SELECT 1 FROM links WHERE id = ?', args: [id] });
    if (existing.rows.length > 0) id = nanoid(12);

    await db.execute({
      sql: `INSERT INTO links (id, bot_token_encrypted, chat_id, display_name) VALUES (?, ?, ?, ?)`,
      args: [id, encrypt(token), chat, (displayName || '').trim().slice(0, 60) || null],
    });

    return res.json({
      id,
      link: `${baseUrl(req)}/send/${id}`,
      botUsername: meData.result.username,
    });
  } catch (err) {
    console.error('create-link error:', err);
    return res.status(500).json({ error: 'Something went wrong creating your link. Please try again.' });
  }
});

/**
 * GET /api/link-info/:id
 * Lets the public send page confirm a link exists before rendering the form.
 */
router.get('/link-info/:id', async (req, res) => {
  const result = await db.execute({
    sql: 'SELECT id, display_name FROM links WHERE id = ?',
    args: [req.params.id],
  });
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: 'This link does not exist or has been removed.' });
  return res.json({ id: row.id, displayName: row.display_name });
});

/**
 * POST /api/send-message
 * body: { id, message }
 * Looks up the link, decrypts the owner's bot token, and relays the
 * anonymous message via Telegram.
 */
router.post('/send-message', async (req, res) => {
  try {
    const { id, message } = req.body || {};

    if (!id || !message || !message.trim()) {
      return res.status(400).json({ error: 'A message is required.' });
    }
    const trimmed = message.trim().slice(0, 2000);

    const result = await db.execute({ sql: 'SELECT * FROM links WHERE id = ?', args: [id] });
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ error: 'This link is invalid or no longer active.' });
    }

    const token = decrypt(row.bot_token_encrypted);

    const formattedText =
      `<b>📬 New Anonymous Message</b>\n\n` +
      `<blockquote>${escapeHtml(trimmed)}</blockquote>\n\n` +
      `<i>Delivered privately via ${BRAND_NAME}</i>`;

    let tgResp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: row.chat_id,
        parse_mode: 'HTML',
        text: formattedText,
      }),
    });
    let tgData = await tgResp.json();

    // Fall back to a plain, unformatted message if HTML parsing ever fails
    // (e.g. an unusual character sequence Telegram rejects) so delivery
    // never silently breaks for the sender.
    if (!tgData.ok) {
      tgResp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: row.chat_id,
          text: `📬 New Anonymous Message:\n\n"${trimmed}"\n\n— via ${BRAND_NAME}`,
        }),
      });
      tgData = await tgResp.json();
    }

    if (!tgData.ok) {
      console.error('Telegram delivery failed:', tgData);
      return res.status(502).json({ error: 'Could not deliver your message right now. Please try again later.' });
    }

    await db.execute({ sql: 'UPDATE links SET message_count = message_count + 1 WHERE id = ?', args: [id] });

    return res.json({ success: true });
  } catch (err) {
    console.error('send-message error:', err);
    return res.status(500).json({ error: 'Something went wrong sending your message.' });
  }
});

module.exports = router;
