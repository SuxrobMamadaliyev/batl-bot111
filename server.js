require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

// Do NOT require the bot here to avoid crashing before binding the port.

const app = express();
app.use(express.json());

// Basic health and root endpoints for Render
app.get('/', (req, res) => {
  res.send('Bot server is running');
});

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

// Optionally serve a static index.html if present (non-fatal if missing)
const indexPath = path.join(__dirname, 'index.html');
app.get('/index.html', (req, res, next) => {
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    next();
  }
});

// Webhook endpoint for Telegram (handler will be attached after bot is initialized)
const WEBHOOK_PATH = '/webhook';
let bot; // will be set after initialization

// Use Render's PORT or default to 3000 for local development
const PORT = process.env.PORT || 3000;

// Check if running on Render
const IS_RENDER = process.env.RENDER === 'true';
// Async function to initialize bot and set up webhook
async function initializeBot() {
  try {
    // Initialize bot
    const { bot: botInstance } = require('./main');
    bot = botInstance;

    // Use Render's external URL for webhook if available
    const baseUrl = process.env.RENDER_EXTERNAL_URL;
    if (baseUrl) {
      const fullWebhookUrl = `${baseUrl.replace(/\/$/, '')}${WEBHOOK_PATH}`;
      
      // Set webhook for the bot
      await bot.setWebHook(fullWebhookUrl);
      console.log(`Webhook set to: ${fullWebhookUrl}`);
      
      // Add webhook endpoint
      app.post(WEBHOOK_PATH, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
      });
    } else {
      console.log('No RENDER_EXTERNAL_URL provided. Running in polling mode.');
      // Start polling if no webhook URL is provided
      bot.startPolling();
    }
  } catch (err) {
    console.error('Failed to initialize bot:', err);
    process.exit(1);
  }
}

// Start the server
const server = app.listen(PORT, '0.0.0.0', () => {
  const host = server.address().address;
  const port = server.address().port;
  console.log(`Server is running on http://${host}:${port}`);
  
  if (IS_RENDER) {
    console.log('Running on Render environment');
    console.log(`External URL: ${process.env.RENDER_EXTERNAL_URL}`);
  }
  
  // Initialize the bot after server starts
  initializeBot();

  // Bot initialization is now handled in the initializeBot function
});