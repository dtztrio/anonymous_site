# Whisper — Anonymous Messaging via Telegram

A minimal, self-hostable anonymous messaging app. Anyone can generate a
personal link; anything sent to that link is relayed to their own Telegram
bot. No accounts, no central inbox — you own your bot and your data.

## How it works

```
Owner                          Your Server                     Telegram
  |  1. Enters bot token +          |                              |
  |     chat ID on landing page     |                              |
  |--------------------------------> |  2. Verifies token (getMe)  |
  |                                  |----------------------------->|
  |                                  |  3. Sends test message       |
  |                                  |----------------------------->|
  |                                  |  4. Encrypts token, stores   |
  |                                  |     row keyed by a random id |
  |  5. Gets back /send/<id>         |                              |
  |<--------------------------------  |                              |

Anonymous sender                 Your Server                     Telegram
  |  1. Opens /send/<id>            |                              |
  |  2. Types message, submits      |                              |
  |--------------------------------> |  3. Looks up <id>, decrypts |
  |                                  |     token, relays message    |
  |                                  |----------------------------->|
  |  4. Sees "Message sent"          |                              |
  |<--------------------------------  |     (owner gets it on       |
  |                                  |      Telegram)               |
```

The sender's IP, device info, and any identifying data are never stored or
forwarded — only the message text reaches the owner.

## Stack

- **Backend:** Node.js + Express
- **Storage:** SQLite (via `better-sqlite3`) — a single file, zero setup
- **Frontend:** Static HTML/CSS/JS + Tailwind CSS (CDN), no build step
- **Delivery:** Telegram Bot API (`sendMessage`)

## Project structure

```
anon-messenger/
├── server.js              # Express app, rate limiting, routing
├── routes/api.js          # /api/create-link, /api/send-message, /api/link-info/:id
├── db/database.js         # SQLite schema + connection
├── utils/crypto.js        # AES-256-GCM encrypt/decrypt for bot tokens
├── public/
│   ├── index.html         # Landing page / link generator
│   ├── send.html          # Public anonymous message form
│   ├── css/style.css      # Small custom styles (animations)
│   └── js/
│       ├── landing.js     # Landing page logic
│       └── send.js        # Send page logic
├── .env.example
└── package.json
```

## 1. Create your Telegram bot (per user, 2 minutes)

Every person who wants their own link needs their own bot — this is what
lets each link deliver privately to a different inbox.

1. Open Telegram, search for **@BotFather**, and start a chat.
2. Send `/newbot` and follow the prompts (choose a name and a unique
   username ending in `bot`).
3. BotFather replies with a **bot token** that looks like
   `123456789:AAExampleTokenxxxxxxxxxxxxxxxxxxxx`. Copy it.
4. Search for **@userinfobot**, start a chat with it — it replies with your
   numeric **Chat ID**.
5. Open the bot you just created and press **Start**. This step is required
   — Telegram bots can't message a user until that user has started a
   conversation with them.
6. Paste the bot token and chat ID into the Whisper landing page.

## 2. Local setup

```bash
git clone <your-repo-url> anon-messenger
cd anon-messenger
npm install
cp .env.example .env
```

Generate an encryption key and put it in `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output into `ENCRYPTION_KEY=` in `.env`. Set `BASE_URL` to
`http://localhost:3000` for local dev.

Run it:

```bash
npm run dev      # with nodemon (auto-restart)
# or
npm start
```

Visit `http://localhost:3000`.

## 3. Environment variables

| Variable         | Description                                                        |
|-------------------|---------------------------------------------------------------------|
| `PORT`            | Port to listen on (default `3000`)                                 |
| `BASE_URL`        | Public URL used to build shareable links, no trailing slash        |
| `ENCRYPTION_KEY`  | 64-char hex string (32 bytes) used to encrypt bot tokens at rest   |

**Never commit `.env` or `db/app.db` to version control** — both contain
secrets. A `.gitignore` covering these is recommended (see below).

## 4. Security notes

- Bot tokens are encrypted with **AES-256-GCM** before being written to
  SQLite; the raw token is never stored in plaintext and is only decrypted
  in memory at the moment a message needs to be relayed.
- Link IDs are generated with `nanoid` (cryptographically random, URL-safe).
- Rate limiting is applied to both link creation (10/hour/IP) and message
  sending (5/min/IP) to deter abuse.
- No sender metadata (IP, user agent, cookies) is logged or stored.
- For production, put this behind HTTPS (required for Telegram webhook
  scenarios and generally for handling secrets in transit) — most platforms
  below provide this automatically.
- Consider adding a CAPTCHA (e.g. Cloudflare Turnstile) on the send form if
  you expect public traffic and want extra spam protection.

## 5. Deployment

### Option A: Render / Railway / Fly.io (recommended for this stack)

These platforms support long-running Node processes and persistent disks,
which `better-sqlite3` needs.

1. Push this repo to GitHub.
2. Create a new **Web Service** and point it at the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add environment variables (`BASE_URL`, `ENCRYPTION_KEY`) in the
   platform's dashboard.
5. Attach a persistent volume/disk mounted so `db/app.db` survives restarts
   (e.g. Render's "Disks" feature, mounted at `/opt/render/project/src/db`).

### Option B: A VPS (DigitalOcean, Hetzner, EC2, etc.)

```bash
git clone <repo> && cd anon-messenger
npm install --production
cp .env.example .env   # fill in values
npm install -g pm2
pm2 start server.js --name whisper
pm2 save
```

Put Nginx or Caddy in front for HTTPS and reverse proxying to port 3000.

### Option C: Vercel / Netlify (serverless)

Serverless functions are stateless and don't persist a local SQLite file
between invocations, so this path needs one change: swap `better-sqlite3`
for a hosted database (e.g. **Turso** — SQLite-compatible over the network,
or **MongoDB Atlas** free tier). The route logic in `routes/api.js` stays
almost identical; only `db/database.js` changes to use an async client
instead of `better-sqlite3`'s synchronous API. Each route in `routes/api.js`
would move to its own file under `api/` (Vercel) or `netlify/functions/`
(Netlify) following each platform's function signature.

## 6. Extending this MVP

- **Reply threads:** store a hash of each sent message so the owner can
  reply from Telegram and have it routed back (would need a Telegram
  webhook and a way to re-identify the anonymous sender's session, which
  trades off some anonymity — think carefully before adding this).
- **Link management dashboard:** let owners log in (e.g. via Telegram Login
  Widget) to see message counts, rotate their bot token, or delete their
  link.
- **Multiple links per owner:** the schema already supports one row per
  link; add an `owner_id` column if you want to group several links under
  one account.
- **Abuse reporting:** add a "block sender" mechanism — tricky while
  staying anonymous, but IP-based temporary blocks (without persistent
  logging) are one option.

## .gitignore (suggested)

```
node_modules/
.env
db/app.db
db/app.db-*
```
