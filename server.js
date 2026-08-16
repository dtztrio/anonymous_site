require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const apiRoutes = require('./routes/api');
const { initDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  helmet({
    contentSecurityPolicy: false, // relaxed so the Tailwind CDN script can load
  })
);
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limits: protect against abuse of link creation and message spam
const createLinkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many link creation attempts. Please try again later.' },
});

const sendMessageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You are sending messages too quickly. Please slow down.' },
});

app.use('/api/create-link', createLinkLimiter);
app.use('/api/send-message', sendMessageLimiter);
app.use('/api', apiRoutes);

// Pretty URL for the public messaging page: /send/<id>
app.get('/send/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'send.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Anon Messenger running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Failed to connect to the database:', err.message);
    process.exit(1);
  });
