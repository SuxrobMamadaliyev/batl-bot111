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

// Webhook endpoint for Telegram
const WEBHOOK_PATH = '/webhook';
let bot; // will be set after initialization

// Use Render's PORT or default to 10000 for Render
const PORT = process.env.PORT || 10000;

// Check if running on Render
const IS_RENDER = process.env.RENDER === 'true';

// Webhook endpoint - defined at app level
app.post(WEBHOOK_PATH, (req, res) => {
  if (!bot) {
    console.log('Bot not initialized yet, skipping update');
    return res.sendStatus(200);
  }
  try {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook xatosi:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Async function to initialize bot and set up webhook
async function initializeBot() {
  try {
    // Initialize bot
    console.log('🤖 Botni ishga tushirish...');
    const { bot: botInstance } = require('./main');
    bot = botInstance;
    
    console.log('✅ Bot muvaffaqiyatli yuklandi');

    // Use Render's external URL for webhook if available
    const baseUrl = process.env.RENDER_EXTERNAL_URL;
    
    if (baseUrl && IS_RENDER) {
      const fullWebhookUrl = `${baseUrl.replace(/\/$/, '')}${WEBHOOK_PATH}`;
      
      try {
        console.log(`🌐 Webhook o'rnatilmoqda: ${fullWebhookUrl}`);
        // Set webhook for the bot
        await bot.setWebHook(fullWebhookUrl);
        console.log(`✅ Webhook muvaffaqiyatli o'rnatildi`);
        console.log('🤖 Bot webhook orqali ishga tushirildi');
      } catch (webhookError) {
        console.error('❌ Webhook o\'rnatishda xatolik:', webhookError.message);
        console.log('❌ Webhook o\'rnatib bo\'lmadi, polling rejimida ishga tushirilmoqda...');
        bot.startPolling();
      }
    } else {
      console.log('ℹ️ Webhook URL topilmadi yoki Render muhitida emas. Polling rejimida ishga tushirilmoqda...');
      bot.startPolling();
    }
    
    console.log(`🤖 ${new Date().toLocaleString()} - Bot muvaffaqiyatli ishga tushdi`);
    
  } catch (err) {
    console.error('❌ Botni ishga tushirishda xatolik:', err);
    console.error('Xatolik tafsilotlari:', err.stack);
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
