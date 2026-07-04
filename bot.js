const TelegramBot = require('node-telegram-bot-api');

require('dotenv').config();

const {
  connectDB,
  loadAllData,
  saveUser: dbSaveUser,
  deleteUser: dbDeleteUser,
  saveBattle: dbSaveBattle,
  deleteBattle: dbDeleteBattle,
  savePaidBattle: dbSavePaidBattle,
  deletePaidBattle: dbDeletePaidBattle,
} = require('./db');

// Bot tokenini environment variable orqali olish
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('BOT_TOKEN environment variable is not set!');
  process.exit(1);
}

// Adminlarni o'qib olish
const ADMINS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];

// Botni ishga tushirish
const bot = new TelegramBot(TOKEN, { 
  polling: false, // Polling ni o'chirib qo'yamiz, chunki webhook ishlatamiz
  webHook: false,  // Webhook ni o'zimiz sozlaymiz
  onlyFirstMatch: true
});

// Help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpText = `🤖 *Battle Bot Yordam* \n\n` +
    `🎮 *Yangi jang* - /battle - Yangi jang boshlash\n` +
    `📊 *Statistika* - /mystats - Shaxsiy statistika\n` +
    `🏆 *Reyting* - /top - Eng yaxshi o'yinchilar\n` +
    `ℹ️ *Yordam* - /help - Yordam olish\n\n` +
    `Botdan to'liq foydalanish uchun guruhga qo'shing va /battle buyrug'i orqali jang boshlang!`;
  
  bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
});

// Webhook sozlamalari (asl node-telegram-bot-api metodini saqlab qolamiz)
const _originalSetWebHook = bot.setWebHook.bind(bot);
bot.setWebHook = async (url) => {
  try {
    console.log(`🌐 Webhook o'rnatilmoqda: ${url}`);
    
    // Avvalgi webhook'ni o'chirish
    await bot.deleteWebHook();
    
    // Telegram API orqali yangi webhook'ni o'rnatish
    const webhookUrl = `https://api.telegram.org/bot${TOKEN}/setWebhook?url=${encodeURIComponent(url)}&drop_pending_updates=true`;
    const response = await fetch(webhookUrl);
    const result = await response.json();
    
    if (result.ok) {
      console.log('✅ Webhook muvaffaqiyatli o\'rnatildi');
      return result;
    } else {
      throw new Error(result.description || 'Noma\'lum xatolik yuz berdi');
    }
  } catch (error) {
    console.error('❌ Webhook o\'rnatishda xatolik:', error.message);
    throw error;
  }
};

// Polling rejimida ishlatish uchun (asl startPolling metodini chaqiramiz, cheksiz rekursiya bo'lmasligi uchun)
const _originalStartPolling = bot.startPolling.bind(bot);
bot.startPolling = () => {
  console.log('🔄 Bot polling rejimida ishga tushirilmoqda...');
  _originalStartPolling({ restart: true, polling: { params: { drop_pending_updates: true } } })
    .then(() => console.log('🤖 Bot polling rejimida muvaffaqiyatli ishga tushirildi'))
    .catch(err => console.error('❌ Polling rejimida xatolik:', err));
};

// Export the bot instance
// MongoDB'ga ulanish va mavjud ma'lumotlarni xotiraga yuklash.
// server.js botni webhook/polling rejimida ishga tushirishdan OLDIN shu funksiyani chaqiradi,
// shunda eski foydalanuvchi/battle ma'lumotlari yo'qolmaydi.
async function initDB() {
  await connectDB();
  await loadAllData({ users, battles, paidBattles });
}

module.exports = { bot, initDB };

// Private guruh linklarini boshqarish uchun funksiya
async function handlePrivateGroupLink(chatId, channelLink) {
    try {
        // Check if it's a private group link
        if (channelLink.includes('+') || channelLink.includes('joinchat/')) {
            await bot.sendMessage(chatId, 
                '👥 <b>Yopiq guruh ID sini yuboring:</b>\n\n' +
                '1. Guruhga kiring\n' +
                '2. Guruh nomini bosing\n' +
                '3. "ID" ni tanlang va nusxalang\n' +
                '4. Shu yerga yuboring\n\n' +
                'Misol: <code>-1001234567890</code>\n\n' +
                '❌ Bekor qilish: /cancel', 
                { parse_mode: 'HTML' }
            );
            return { isPrivate: true };
        }
        return { isPrivate: false };
    } catch (error) {
        console.error('Error handling private group link:', error);
        await bot.sendMessage(chatId, '❌ Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
        return { isPrivate: false, error: true };
    }
}

// Ma'lumotlar bazasi (xotirada + MongoDB bilan sinxron)
const users = new Map();
const battles = new Map();
const battlePosts = new Map(); // Battle post message ID lari
// Admin chat IDs (not usernames)
const admins = ADMINS.length > 0 ? ADMINS : [];

// Map'lar uchun avtomatik MongoDB sinxronizatsiyasi.
// Har safar .set() chaqirilganda ma'lumot MongoDB'ga ham yoziladi,
// .delete() chaqirilganda esa MongoDB'dan ham o'chiriladi.
// Shu tufayli kod ichidagi mavjud users.set(...)/battles.set(...) chaqiruvlarini
// birma-bir o'zgartirishga hojat qolmaydi.
function attachPersistence(map, saveFn, deleteFn) {
  const originalSet = map.set.bind(map);
  const originalDelete = map.delete.bind(map);

  map.set = (key, value) => {
    const result = originalSet(key, value);
    Promise.resolve(saveFn(key, value)).catch(err =>
      console.error('❌ MongoDB saqlash xatosi:', err.message)
    );
    return result;
  };

  map.delete = (key) => {
    const result = originalDelete(key);
    Promise.resolve(deleteFn(key)).catch(err =>
      console.error('❌ MongoDB o\'chirish xatosi:', err.message)
    );
    return result;
  };

  return map;
}

// Emoji reaksiyalari
const reactions = ['❤️', '👍', '💋', '🔥', '⚡️', '😍', '🎉', '✨', '💎', '⭐️'];

// Pullik battle narxi (so'mda)
const PAID_BATTLE_PRICE = process.env.PAID_BATTLE_PRICE ? parseInt(process.env.PAID_BATTLE_PRICE) : 5000; // 5000 so'm standart qiymat

// Pullik battlelar ro'yxati
const paidBattles = new Map(); // Format: { battleId: { userId, channelId, messageId, price, participants: [] } }

// Map'larni MongoDB bilan bog'lash (yuqoridagi attachPersistence funksiyasi orqali)
attachPersistence(users, dbSaveUser, dbDeleteUser);
attachPersistence(battles, dbSaveBattle, dbDeleteBattle);
attachPersistence(paidBattles, dbSavePaidBattle, dbDeletePaidBattle);

// 10 ta stiker ID (MUHIM: O'z stikerlaringizni qo'ying!)
// Stiker ID larini olish uchun: botga istalgan stikerni yuboring, console da ID ko'rinadi
const stickerIds = [
  'CAACAgIAAxkBAAEMxYZnCqR5wqYAA1fG5JkvW6r3yHJqQAACAQACMwlkJXlJAA',
  'CAACAgIAAxkBAAEMxYZnCqR5wqYAA1fG5JkvW6r3yHJqQAACAgACMwlkJXlJBB',
  'CAACAgIAAxkBAAEMxYZnCqR5wqYAA1fG5JkvW6r3yHJqQAADAwACMwlkJXlJCC',
  'CAACAgIAAxkBAAEMxYZnCqR5wqYAA1fG5JkvW6r3yHJqQAAEBAACMwlkJXlJDD',
  'CAACAgIAAxkBAAEMxYZnCqR5wqYAA1fG5JkvW6r3yHJqQAAFFAACMwlkJXlJEE',
  'CAACAgIAAxkBAAEMxYZnCqR5wqYAA1fG5JkvW6r3yHJqQAAGBgACMwlkJXlJFF',
  'CAACAgIAAxkBAAEMxYZnCqR5wqYAA1fG5JkvW6r3yHJqQAAHBwACMwlkJXlJGG',
  'CAACAgIAAxkBAAEMxYZnCqR5wqYAA1fG5JkvW6r3yHJqQAAICAACMwlkJXlJHH',
  'CAACAgIAAxkBAAEMxYZnCqR5wqYAA1fG5JkvW6r3yHJqQAAJCQACMwlkJXlJII',
  'CAACAgIAAxkBAAEMxYZnCqR5wqYAA1fG5JkvW6r3yHJqQAAKCgACMwlkJXlJJJ'
];

// Bot nomi va versiyasi
const BOT_NAME = 'BattleForge';
const BOT_VERSION = '1.0.0';

// Asosiy menyu tugmalari
const mainKeyboard = {
  keyboard: [
    [{ text: '🛠 Battle Yaratish' }, { text: '⚔️ Battlelar' }],
    [{ text: '📲 Kabinet' }, { text: '📊 Statistika' }],
    [{ text: '📋 Ma\'lumotlar' }, { text: '📞 Admin' }],
  ],
  resize_keyboard: true
};

// Battle turlari
const battleTypeKeyboard = {
  keyboard: [
    [{ text: '❤️ Reaksiya Battle' }],
    [{ text: 'Ovoz Battle' }],
    [{ text: '🎮 Oddiy Battle' }],  // Oddiy Battle o'chirib qo'yildi
    [{ text: '🔙 Orqaga' }]
  ],
  resize_keyboard: true
};

// Star battle uchun foydalanuvchilarning ovozlari
const starVotes = new Map(); // Format: { battleId: { userId: { username, name } } }
const userVoted = new Map(); // Format: { userId: { battleId: true } }

// Star battle yaratish
async function createStarBattle(chatId, userId, channelLink) {
  const battleId = Date.now();
  
  // Kanal nomini olish va tozalash
  let targetChatId = channelLink.trim();
  
  // Bot usernameni o'zgartiring!
  const botUsername = 'GetStars_zs_Bot'; // O'z bot usernamengizni qo'ying (without @)
  
  // Kanal ID sini tekshirish va tozalash
  if (targetChatId.startsWith('https://t.me/')) {
    targetChatId = '@' + targetChatId.split('/').pop();
  } else if (!targetChatId.startsWith('@')) {
    targetChatId = '@' + targetChatId;
  }
  
  // Kanal ID sini tekshirish
  if (!targetChatId) {
    return { 
      success: false, 
      error: 'Kanal topilmadi. Iltimos, kanal usernameni to\'g\'ri kiriting.' 
    };
  }
  
  const battle = {
    id: battleId,
    type: 'star',
    createdBy: userId,
    channelId: targetChatId,
    status: 'waiting_post',
    createdAt: new Date(),
    participants: {},
    votes: 0,
    title: '⭐ Star Battle'
  };
  
  battles.set(battleId, battle);
  starVotes.set(battleId, {});
  
  // Foydalanuvchidan post yuborishini so'rash
  await bot.sendMessage(chatId, `✅ Star battle yaratildi! Endi kanalga yoki guruhga yubormoqchi bo'lgan postingizni menga yuboring.`);
  
  return { success: true, battleId };
}

// Star battle uchun post yuborish
async function sendStarBattlePost(battleId, chatId, messageId) {
  const battle = battles.get(battleId);
  if (!battle) return false;
  
  try {
    // Postni kanalga yuborish
    const message = await bot.forwardMessage(battle.channelId, chatId, messageId);
    
    // Inline keyboard qo'shamiz
    const voteKeyboard = {
      inline_keyboard: [
        [{ text: '⭐️ Qatnashish', callback_data: `star_vote_${battleId}` }]
      ]
    };
    
    // Postga tugma qo'shamiz
    await bot.editMessageReplyMarkup(
      { inline_keyboard: voteKeyboard.inline_keyboard },
      { 
        chat_id: message.chat.id, 
        message_id: message.message_id 
      }
    );
    
    // Battle statusini yangilaymiz
    battle.status = 'active';
    battle.postMessageId = message.message_id;
    battle.postChatId = message.chat.id;
    
    await bot.sendMessage(chatId, `✅ Star battle muvaffaqiyatli yuborildi!\n\nKanal: ${battle.channelId}\n\nFoydalanuvchilar "⭐️ Qatnashish" tugmasi orqali qatnashishlari mumkin.`);
    
    return true;
  } catch (error) {
    console.error('Error sending star battle post:', error);
    await bot.sendMessage(chatId, `❌ Xatolik yuz berdi. Iltimos, botni kanalga admin qiling va yana urinib ko'ring.`);
    return false;
  }
}

// Star battle uchun ovoz qo'shish
async function addStarVote(battleId, userId, username, firstName) {
  const userKey = `${userId}_${battleId}`;
  
  // Foydalanuvchi avval ovoz bergani tekshiriladi
  if (userVoted.get(userKey)) {
    return { success: false, error: 'Siz allaqachon ovoz bergansiz!' };
  }
  
  const battle = battles.get(battleId);
  if (!battle) {
    return { success: false, error: 'Battle topilmadi!' };
  }
  
  // Foydalanuvchidan xabar so'raymiz
  await bot.sendMessage(userId, 'Iltimos, o\'z xabaringizni yuboring (matn, rasm, video, audio, yoki hujjat):');
  
  // Foydalanuvchi javobini kutilayotgan holat
  const waitForMessage = new Promise((resolve) => {
    const messageHandler = async (msg) => {
      if (msg.from.id === userId) {
        bot.removeListener('message', messageHandler);
        
        // Xabarni saqlaymiz
        const userMessage = {
          text: msg.text || '',
          photo: msg.photo ? msg.photo[msg.photo.length - 1].file_id : null,
          video: msg.video ? msg.video.file_id : null,
          audio: msg.audio ? msg.audio.file_id : null,
          document: msg.document ? msg.document.file_id : null
        };
        
        // Kanal linkini so'raymiz
        await bot.sendMessage(userId, 'Endi kanal yoki guruh linkini yuboring (masalan: @channel_username yoki https://t.me/channel_username):');
        
        // Kanal linkini kutilamiz
        const waitForLink = new Promise((resolveLink) => {
          const linkHandler = async (linkMsg) => {
            if (linkMsg.from.id === userId) {
              bot.removeListener('message', linkHandler);
              const channelLink = linkMsg.text.trim();
              resolveLink(channelLink);
            }
          };
          bot.on('message', linkHandler);
          
          // 5 daqiqadan keyin timeout
          setTimeout(() => {
            bot.removeListener('message', linkHandler);
            resolveLink(null);
          }, 5 * 60 * 1000);
        });
        
        const channelLink = await waitForLink;
        if (!channelLink) {
          await bot.sendMessage(userId, 'Vaqt tugadi! Qaytadan urinib ko\'ring.');
          resolve({ success: false, error: 'Vaqt tugadi' });
          return;
        }
        
        // Kanal linkini tekshirib olamiz
        const chat = await bot.getChat(channelLink).catch(() => null);
        if (!chat) {
          await bot.sendMessage(userId, 'Noto\'g\'ri kanal yoki guruh linki yuborildi!');
          resolve({ success: false, error: 'Noto\'g\'ri kanal linki' });
          return;
        }
        
        // Bot adminligini tekshiramiz
        try {
          const chatMember = await bot.getChatMember(chat.id, bot.token.split(':')[0]);
          if (!chatMember || !['administrator', 'creator'].includes(chatMember.status)) {
            await bot.sendMessage(userId, `Bot ${chat.title} kanalida admin emas! Iltimos, avval botni admin qiling.`);
            resolve({ success: false, error: 'Bot admin emas' });
            return;
          }
        } catch (error) {
          console.error('Error checking admin status:', error);
          await bot.sendMessage(userId, 'Kanalda xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
          resolve({ success: false, error: 'Kanalda xatolik' });
          return;
        }
        
        // Ovoz qo'shamiz
        const battleVotes = starVotes.get(battleId) || {};
        
        // Clean and store username and first name properly
        const cleanUsername = username ? username.replace('@', '') : '';
        const participantCount = Object.keys(battleVotes).length;
        const displayName = cleanUsername ? `@${cleanUsername}` : (firstName || 'Foydalanuvchi');
        const buttonText = cleanUsername ? `@${cleanUsername}-[${participantCount}]` : `${firstName || 'User'}-[${participantCount}]`;
        
        battleVotes[userId] = { 
          userId: userId,
          username: cleanUsername,
          firstName: firstName || '',
          displayName: displayName,
          buttonText: buttonText,
          message: userMessage,
          channelLink: chat.id,
          voteCount: 0,
          votedBy: {},
          index: participantCount
        };
        
        // Foydalanuvchining ovoz berganligini saqlaymiz
        userVoted.set(userKey, true);
        
        // Battle statistikasini yangilaymiz
        const battle = battles.get(battleId);
        if (battle) {
          battle.votes = Object.keys(battleVotes).length;
          battle.participants[userId] = displayName;  // Use displayName instead of userDisplayName
          
          // Xabarni kanalga yuboramiz
          try {
            let sentMessage;
            const caption = `${battle.title || '⭐ Star Battle'}\n\n${displayName} tomonidan qo'shildi`;
            
            if (userMessage.photo) {
              sentMessage = await bot.sendPhoto(chat.id, userMessage.photo, { caption });
            } else if (userMessage.video) {
              sentMessage = await bot.sendVideo(chat.id, userMessage.video, { caption });
            } else if (userMessage.audio) {
              sentMessage = await bot.sendAudio(chat.id, userMessage.audio, { caption });
            } else if (userMessage.document) {
              sentMessage = await bot.sendDocument(chat.id, userMessage.document, { caption });
            } else {
              sentMessage = await bot.sendMessage(chat.id, `${displayName} tomonidan qo'shildi:\n\n${userMessage.text}`);
            }
            
            // Qatnashish tugmasi va ishtirokchilar ro'yxati
            const battleVotes = starVotes.get(battleId) || {};
            const participants = Object.values(battleVotes).map((user, index) => ({
              text: `${user.username} [${index}]`,
              callback_data: `view_star_${battleId}_${user.userId}`
            }));
            
            // Har bir qatnashuvchi uchun alohida qator
            const participantRows = [];
            for (let i = 0; i < participants.length; i += 2) {
              const row = participants.slice(i, i + 2);
              participantRows.push(row);
            }
            
            // Qatnashish tugmasi
            const inlineKeyboard = {
              inline_keyboard: [
                ...participantRows,
                [{
                  text: '⭐ Qatnashish',
                  callback_data: `join_star_${battleId}_${userId}`
                }]
              ]
            };
            
            // Postni yangilash
            try {
              await bot.editMessageReplyMarkup(
                { inline_keyboard: inlineKeyboard.inline_keyboard },
                {
                  chat_id: sentMessage.chat.id,
                  message_id: sentMessage.message_id
                }
              );
            } catch (error) {
              console.error('Error updating message markup:', error);
            }
            
            await bot.sendMessage(userId, `Xabaringiz muvaffaqiyatli yuborildi! ${chat.title} kanaliga qarang.`);
            
          } catch (error) {
            console.error('Error sending message to channel:', error);
            await bot.sendMessage(userId, 'Xabarni yuborishda xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
            resolve({ success: false, error: 'Xabar yuborishda xatolik' });
            return;
          }
          
          // Postdagi matnni yangilaymiz
          await updateStarBattlePost(battleId);
        }
        
        resolve({ success: true });
      }
    };
    
    bot.on('message', messageHandler);
    
    // 5 daqiqadan keyin timeout
    setTimeout(() => {
      bot.removeListener('message', messageHandler);
      resolve({ success: false, error: 'Vaqt tugadi' });
    }, 5 * 60 * 1000);
  });
  
  return await waitForMessage;
}

// Star battle postini yangilash
async function updateStarBattlePost(battleId) {
  const battle = battles.get(battleId);
  if (!battle || !battle.postMessageId) return false;
  
  try {
    const battleVotes = starVotes.get(battleId) || {};
    const participants = Object.values(battleVotes);
    
    // Create inline keyboard with all participants
    const buttons = [];
    
    // Sort participants by vote count (descending)
    const sortedParticipants = Object.entries(battleVotes)
      .map(([id, p]) => ({
        id,
        ...p,
        // Calculate index based on vote count
        displayIndex: (p.voteCount || 0) + 1
      }))
      .sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
    
    // Add participants as buttons with vote count
    for (const participant of sortedParticipants) {
      const displayName = participant.username 
        ? `@${participant.username.replace('@', '')}`
        : `${participant.firstName || 'Foydalanuvchi'}`;
      
      // Add vote count to the button text
      const buttonText = `${displayName} (${participant.voteCount || 0} 👍)`;
      
      buttons.push([
        { 
          text: buttonText,
          callback_data: `vote_${battleId}_${participant.id}`
        }
      ]);
    }
    
    // Add the main participation button
    buttons.push([
      { text: '⭐️ Qatnashish', callback_data: `stars_join_${battleId}` }
    ]);
    
    // Add results button
    buttons.push([
      { text: '📊 Natijalar', url: `https://t.me/${battle.botUsername}?start=results_${battleId}` }
    ]);
    
    const inlineKeyboard = { inline_keyboard: buttons };
    
    // Just update the reply markup without forwarding the message
    try {
      await bot.editMessageReplyMarkup(inlineKeyboard, {
        chat_id: battle.postChatId,
        message_id: battle.postMessageId
      });
    } catch (error) {
      console.error('Error updating message markup:', error);
      // If editing fails, try to send a new message (fallback)
      if (error.code === 400 && error.description && error.description.includes('message is not modified')) {
        // The message is already up to date, no need to do anything
      } else {
        throw error; // Re-throw other errors
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error updating star battle post:', error);
    return false;
  }
}

// Foydalanuvchini ro'yxatdan o'tkazish
function registerUser(userId, username, firstName) {
  if (!users.has(userId)) {
    users.set(userId, {
      id: userId,
      username: username || 'No username',
      firstName: firstName || 'User',
      battles_created: 0,
      battles_participated: 0,
      wins: 0,
      joined_date: new Date(),
      balance: 0
    });
  }
}

// Oddiy battle yaratish
async function createOddiyBattle(chatId, userId, channelLink) {
  const battleId = Date.now();
  
  // Kanal nomini olish va tozalash
  let channelId = channelLink.trim();
  
  // Bot usernameni o'zgartiring!
  const botUsername = 'GetStars_zs_Bot'; // O'z bot usernamengizni qo'ying (without @)
  
  // Kanal ID sini tekshirish va tozalash
  let targetChatId = channelId;
  
  // Agar to'liq link berilgan bo'lsa
  if (channelId.startsWith('https://t.me/')) {
    targetChatId = '@' + channelId.split('/').pop();
  } 
  // Agar @ bilan boshlanmasa
  else if (!channelId.startsWith('@')) {
    targetChatId = '@' + channelId;
  }
  
  // Kanal ID sini tekshirish
  if (!targetChatId) {
    return { 
      success: false, 
      error: 'Kanal topilmadi. Iltimos, kanal usernameni to\'g\'ri kiriting.' 
    };
  }
  
  const battle = {
    id: battleId,
    type: 'oddiy',
    createdBy: userId,
    channel: targetChatId,
    channelUsername: targetChatId, // Store the channel username
    participants: [],
    status: 'active',
    createdAt: new Date(),
    reactions: {},
    botUsername: botUsername,
    prize: '5 Stars', // Add prize information
    chatId: null // Will be set when we get the actual chat ID
  };

  battles.set(battleId, battle);
  
  // Get creator's username
  const creator = users.get(userId);
  const creatorUsername = creator?.username ? `@${creator.username}` : 'Foydalanuvchi';
  
  // Simple post format for Oddiy Battle
  const battlePost = `🏆 ${creatorUsername} \n\n` +
    `⭐️ Stars: 5 ball\n` +
    `👍 Reaksiya: 1 ball\n\n` 
    
  // Store the simple post format in the battle object
  battle.simplePost = battlePost;

  try {
    // Avval botni kanalga qo'shganingizga ishonch hosil qiling
    const sentMessage = await bot.sendMessage(targetChatId, battlePost, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🎮 Qatnashish', callback_data: `oddiy_join_${battleId}` }
        ]]
      }
    });

    battle.postMessageId = sentMessage.message_id;
    battle.chatId = sentMessage.chat.id; // Save the numeric chat ID
    battle.postChatId = sentMessage.chat.id; // For backward compatibility
    
    return { 
      success: true, 
      battleId,
      channel: targetChatId
    };
  } catch (error) {
    console.error('Xatolik yuz berdi:', error);
    let errorMessage = 'Xatolik yuz berdi! ';
    
    if (error.response && error.response.body) {
      const tgError = error.response.body;
      if (tgError.error_code === 400) {
        errorMessage = '❌ Xatolik: Kanal topilmadi yoki botda yozish huquqi yo\'q.\n\n' +
          'Iltimos, quyidagilarni tekshiring:\n' +
          '1. Bot kanalga qo\'shilganmi?\n' +
          '2. Botda xabarlar yozish huquqi bormi?\n' +
          '3. Kanal usernameni to\'g\'ri yozganmisiz?\n' +
          '4. Bot kanalda admin qilinganmi?\n\n' +
          'Kanalga qo\'shish uchun: @' + botUsername + ' ni kanalingizga qo\'shing va admin qiling.';
      } else {
        errorMessage += tgError.description || error.message;
      }
    } else {
      errorMessage += error.message;
    }
    
    return { 
      success: false, 
      error: errorMessage 
    };
  }
}

// Ovoz Battle yaratish
async function createStarsBattle(chatId, userId, channelLink) {
  const battleId = Date.now();
  
  // Kanal nomini olish va tozalash
  let channelId = channelLink.trim();
  
  // Bot usernameni o'zgartiring!
  const botUsername = 'GetStars_zs_Bot'; // O'z bot usernamengizni qo'ying (without @)
  
  // Kanal ID sini tekshirish va tozalash
  let targetChatId = channelId;
  let isNumericId = /^-?\d+$/.test(targetChatId);
  
  // Agar raqamli ID bo'lsa (masalan, -1001234567890)
  if (isNumericId) {
    // Raqamli ID ni number ga o'tkazamiz
    targetChatId = parseInt(targetChatId, 10);
  } 
  // Agar to'liq link berilgan bo'lsa
  else if (targetChatId.startsWith('https://t.me/')) {
    targetChatId = '@' + targetChatId.split('/').pop();
  } 
  // Agar @ bilan boshlanmasa va raqamli ID ham bo'lmasa
  else if (!targetChatId.startsWith('@') && !isNumericId) {
    targetChatId = '@' + targetChatId;
  }
  
  // Kanal ID sini tekshirish
  if (!targetChatId) {
    return { 
      success: false, 
      error: 'Kanal topilmadi. Iltimos, kanal usernameni yoki ID sini to\'g\'ri kiriting.' 
    };
  }
  
  const battle = {
    id: battleId,
    type: 'stars',
    createdBy: userId,
    channel: targetChatId,
    channelUsername: targetChatId,
    participants: [],
    status: 'active',
    createdAt: new Date(),
    reactions: {},
    botUsername: botUsername,
    prize: '10 Stars', // Ovoz battle uchun ko'proq yutuq
    chatId: null
  };

  battles.set(battleId, battle);
  
  // Get creator's username
  const creator = users.get(userId);
  const creatorUsername = creator?.username ? `@${creator.username}` : 'Foydalanuvchi';
  
  // Post format for Stars Battle
  const battlePost = `🏆 #konkurs Boshlandi🥳\n\n` +
    `❗️Konkurs shartlari (${targetChatId}) shu kanalga obuna bo'lish va do'stlaringiz sizga ovoz berishini so'rashdan iborat.\n\n` +
    `🎁 Konkursga qo'yilgan yutuqlar Hozircha sir🤫\n\n` +
    `➕ Quyidagi tugma orqali qatnashing!`;
    
  // Store the post format in the battle object
  battle.simplePost = battlePost;

  try {
    // Initialize empty participants list for this battle
    starVotes.set(battleId, {});
    
    // Prepare message options
    const messageOptions = {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⭐️ Qatnashish', callback_data: `stars_join_${battleId}` }],
          [{ text: '📊 Natijalar', url: `https://t.me/${botUsername}?start=results_${battleId}` }]
        ]
      }
    };
    
    // Send the battle post to the channel
    const sentMessage = await bot.sendMessage(targetChatId, battlePost, messageOptions);

    battle.postMessageId = sentMessage.message_id;
    battle.chatId = sentMessage.chat.id;
    battle.postChatId = sentMessage.chat.id;
    
    return { 
      success: true, 
      battleId,
      channel: targetChatId
    };
  } catch (error) {
    console.error('Xatolik yuz berdi:', error);
    let errorMessage = 'Xatolik yuz berdi! ';
    
    if (error.response && error.response.body) {
      const tgError = error.response.body;
      if (tgError.error_code === 400) {
        errorMessage = '❌ Xatolik: Kanal topilmadi yoki botda yozish huquqi yo\'q.\n\n' +
          'Iltimos, quyidagilarni tekshiring:\n' +
          '1. Bot kanalga qo\'shilganmi?\n' +
          '2. Botda xabarlar yozish huquqi bormi?\n' +
          '3. Kanal usernameni to\'g\'ri yozganmisiz?\n' +
          '4. Bot kanalda admin qilinganmi?\n\n' +
          'Kanalga qo\'shish uchun: @' + botUsername + ' ni kanalingizga qo\'shing va admin qiling.';
      } else {
        errorMessage += tgError.description || error.message;
      }
    } else {
      errorMessage += error.message;
    }
    
    return { 
      success: false, 
      error: errorMessage 
    };
  }
}

// Random stiker tanlash
function getRandomSticker() {
  return stickerIds[Math.floor(Math.random() * stickerIds.length)];
}

// Battle postini yangilash (kanal/guruhda)
async function updateBattlePost(battleId) {
  const battle = battles.get(battleId);
  if (!battle || !battle.postMessageId || !battle.postChatId) return;

  let battlePost = `❤️ <b>Reaksiya Battle</b>\n\n`;
  
  // Format prize text based on prize type
  let prizeText = '';
  const prizeType = battle.prizeType || 'stars';
  
  switch (prizeType) {
    case 'nft':
      prizeText = `🏆 Yutuq: NFT (${battle.prize})`;
      break;
    case 'money':
      prizeText = `💰 Yutuq: ${parseInt(battle.prize).toLocaleString()} so'm`;
      break;
    case 'stars':
    default:
      prizeText = `⭐ Yutuq: ${battle.prize} Stars`;
  }
  
  battlePost += `${prizeText}\n\n`;
  battlePost += `👥 <b>Ishtirokchilar:</b>\n`;
  
  if (battle.participants.length === 0) {
    battlePost += `<i>Hozircha ishtirokchilar yo'q...</i>\n`;
  } else {
    battle.participants.forEach((participant, index) => {
      battlePost += `${participant.username} ${reactions[index % reactions.length]}\n`;
    });
  }
  
  battlePost += `\n📊 Jami: ${battle.participants.length}/10 ishtirokchi\n`;
  battlePost += `📢 Kanal: ${battle.channel}\n`;
 

  try {
    await bot.editMessageText(battlePost, {
      chat_id: battle.postChatId,
      message_id: battle.postMessageId,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🎮 Qatnashish', url: `https://t.me/${battle.botUsername}?start=join_${battleId}` }
        ]]
      }
    });
  } catch (error) {
    console.log('Post yangilashda xato:', error.message);
  }
}

// /start buyrug'i (yagona handler - oddiy /start va referal parametrlarini boshqaradi)
bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username;
  const firstName = msg.from.first_name;
  const param = (match[1] || '').trim();

  registerUser(userId, username, firstName);

  // Battle ga qo'shilish
  if (param.startsWith('join_')) {
    const battleId = parseInt(param.split('_')[1]);
    const battle = battles.get(battleId);

    if (!battle) {
      bot.sendMessage(chatId, '❌ Battle topilmadi!', {
        reply_markup: mainKeyboard
      });
      return;
    }

    // Allaqachon qatnashganmi tekshirish
    const alreadyParticipant = battle.participants.some(p => p.userId === userId);
    
    if (alreadyParticipant) {
      bot.sendMessage(chatId, '⚠️ Siz allaqachon bu battle da qatnashyapsiz!', {
        reply_markup: mainKeyboard
      });
      return;
    }

    // Cheksiz ishtirokchi mumkin

    // Random emoji/text yuborish (stiker o'rniga)
    const congratsMessages = [
      '🎉 Tabriklaymiz!',
      '✨ Sizga omad tilaymiz!',
      '🔥 Zo\'r tanlov!',
      '⭐️ Ajoyib!',
      '💎 A\'lochi!',
      '🎊 Omad yor bo\'lsin!',
      '🎁 Mukofotga harakat qiling!',
      '🏆 G\'olib bo\'lasiz!',
      '⚡️ Juda yaxshi!',
      '🌟 Super!'
    ];
    const randomMessage = congratsMessages[Math.floor(Math.random() * congratsMessages.length)];
    
    await bot.sendMessage(chatId, `${randomMessage}\n\n✅ Siz battle ga qabul qilindingiz!`);

    // Username mavjudligini tekshirish
    if (!username) {
      await bot.sendMessage(chatId, 
        `❌ Iltimos, avval Telegram profilingizda username yarating!\n\n` +
        `Buning uchun: \n` +
        `1. Telegram sozlamalaringizga kiring\n` +
        `2. Usernameni o'zgartirish tugmasini bosing\n` +
        `3. O'zingizga yoqqan usernameni kiriting\n\n` +
        `Keyin qaytadan urinib ko'ring!`,
        { reply_markup: mainKeyboard }
      );
      return;
    }

    // Ishtirokchiga qo'shish
    battle.participants.push({
      userId: userId,
      username: `@${username}`,
      firstName: firstName,
      message: randomMessage,
      joined: new Date()
    });

    // Statistikani yangilash
    const userState = users.get(userId);
    userState.battles_participated++;

    // Battle postini yangilash
    await updateBattlePost(battleId);

    // Kanalda post qilish
    try {
      const participantCount = battle.participants.length;
      // Send a single consolidated success message to user
      await bot.sendMessage(userId, `✅ Tabriklaymiz! Siz battle ga qo'shildingiz!\n\n` +
        `🎮 Battle ID: ${battleId}\n` +
        `👥 Sizning o'rningiz: ${battle.participants.length}-chi ishtirokchi\n` +
        `📢 Kanal: ${battle.channelUsername || battle.channel}\n` +
        `💰 Yutuq: ${battle.prize}`, { parse_mode: 'HTML' });

      // Battle yaratuvchiga xabar
      try {
        await bot.sendMessage(battle.creator,
          `🔔 <b>Yangi ishtirokchi!</b>\n\n` +
          `Battle ID: ${battleId}\n` +
          `Ishtirokchi: @${username}\n` +
          `Jami ishtirokchilar: ${participantCount}/10`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {}

    } catch (error) {
      console.error('Kanalga xabar yuborishda xato:', error);
      bot.sendMessage(chatId, '❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.', {
        reply_markup: mainKeyboard
      });
    }

    return;
  }

  // Oddiy start
  const welcomeText = `⚔️ <b>${BOT_NAME}</b> - Battle yaratish platformasiga xush kelibsiz!\n\n` +
    `Men sizga o'z jamoangiz yoki kanalingiz uchun qiziqarli battlelar yaratishda yordam beraman.\n\n` +
    `✨ <b>Qanday ishlatish mumkin?</b>\n` +
    `- 🛠 <b>Battle Yaratish</b> - Yangi battle boshlash\n` +
    `- ⚔️ <b>Battlelar</b> - Faol battlelarni ko'rish\n` +
    `- 📊 <b>Statistika</b> - O'yin statistikangiz\n\n` +
    `Bot versiyasi: ${BOT_VERSION}`;

  bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'HTML',
    reply_markup: mainKeyboard
  });
});

// Asosiy menyu tugmalari
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;
  const username = msg.from.username || 'No username';
  const firstName = msg.from.first_name || 'User';
  
  // Register user if not already registered
  registerUser(userId, username, firstName);

  // Oddiy Battle bosilganda (Ovoz Battle alohida blok orqali quyida boshqariladi)
  if (text === '🎮 Oddiy Battle') {
    const isStarsBattle = false;
    
    // Kanal linkini so'rash
    const message = await bot.sendMessage(chatId, 
      `🔗 Iltimos, Oddiy Battle uchun kanal yoki guruh linkini yuboring:\n\n` +
      'Misol uchun:\n' +
      '- Kanal usernamesi: @channel_username\n' +
      '- Yoki to\'liq link: https://t.me/channel_username\n\n' +
      '⚠️ Iltimos, botni kanalga admin qilinganligiga ishonch hosil qiling!', {
      reply_markup: {
        force_reply: true,
        selective: true
      }
    });
    
    // User state ni yangilaymiz
    const userState = users.get(userId) || {};
    userState.waitingForChannel = true;
    userState.battleType = isStarsBattle ? 'stars' : 'oddiy';
    userState.lastMessageId = message.message_id;
    users.set(userId, userState);
    
    // Foydalanuvchi javobini kutilayotgan holat
    const replyListener = async (reply) => {
      const userState = users.get(userId) || {};
      
      if (reply.reply_to_message && 
          (reply.reply_to_message.text.includes('kanal yoki guruh linkini') || 
           reply.reply_to_message.text.includes('Battle uchun'))) {
        try {
          const channel = reply.text.trim();
          
          // Kanal linkini tekshirish
          if (!channel.startsWith('@') && !channel.startsWith('https://t.me/')) {
            return bot.sendMessage(chatId, '❌ Noto\'g\'ri format! Iltimos, quyidagi formatlardan birida yuboring:\n\n' +
              '- @channel_username\n' +
              '- https://t.me/channel_username');
          }
          
          // Yuborilayotgan xabar
          const processingMsg = await bot.sendMessage(chatId, `⏳ ${userState.battleType === 'stars' ? 'Stars' : 'Oddiy'} Battle yaratilmoqda, iltimos kuting...`);
          
          // Battle yaratish
          const result = userState.battleType === 'stars' 
            ? await createStarsBattle(chatId, userId, channel)
            : await createOddiyBattle(chatId, userId, channel);
          
          // Yuborilayotgan xabarni o'chirish
          await bot.deleteMessage(chatId, processingMsg.message_id);
          
          if (result.success) {
            const battleType = userState.battleType === 'stars' ? 'Stars' : 'Oddiy';
            const buttonText = userState.battleType === 'stars' ? '⭐️ Qatnashish' : '🎮 Qatnashish';
            
            await bot.sendMessage(chatId, `✅ ${battleType} Battle muvaffaqiyatli yaratildi!\n\n` +
              `Kanal: ${channel}\n` +
              `Endi ishtirokchilar "${buttonText}" tugmasi orqali qatnashishi mumkin!`, {
              reply_markup: mainKeyboard,
              parse_mode: 'HTML'
            });
            const currentState = users.get(userId) || {};
            currentState.state = 'await_paid_battle_id';
            users.set(userId, currentState);
            await bot.sendMessage(chatId, `💰 Pullik battle yaratish uchun hozir yaratilgan Battle ID ni yuboring.\n\nMasalan: ${result.battleId}`, {
              reply_markup: { keyboard: [[{ text: '🔙 Bekor qilish' }]], resize_keyboard: true }
            });
          } else {
            await bot.sendMessage(chatId, `❌ Xatolik: ${result.error}\n\n` +
              'Iltimos, quyidagilarni tekshiring:\n' +
              '1. Bot kanalga qo\'shilganmi?\n' +
              '2. Botda xabarlar yozish huquqi bormi?\n' +
              '3. Kanal usernameni to\'g\'ri yozganmisiz?\n' +
              '4. Bot kanalda admin qilinganmi?', {
              reply_markup: mainKeyboard,
              parse_mode: 'HTML'
            });
          }
        } catch (error) {
          console.error('Xatolik:', error);
          await bot.sendMessage(chatId, '❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.', {
            reply_markup: mainKeyboard
          });
        } finally {
          // Event listenerni olib tashlash
          bot.removeListener('message', replyListener);
        }
      }
    };
    
    // Event listener qo'shamiz
    bot.on('message', replyListener);
    
    // 2 daqiqadan keyin event listenerni olib tashlash
    setTimeout(() => {
      bot.removeListener('message', replyListener);
    }, 120000); // 2 daqiqa = 120000 millisekund
    
    return;
  }

  if (!text) return;

  registerUser(userId, username, msg.from.first_name);

  // Battle Yaratish
  if (text === '🛠 Battle Yaratish') {
    bot.sendMessage(chatId, '🎯 <b>Battle turini tanlang:</b>', {
      parse_mode: 'HTML',
      reply_markup: battleTypeKeyboard
    });
  }

  // Reaksiya Battle yaratish
  else if (text === '❤️ Reaksiya Battle' || text === 'Reaksiya Battle' || text === 'reaction') {
    const userState = users.get(userId);
    userState.creating_battle = 'reaction';
    userState.battle_step = 'prize_type';
    userState.showedPrizeKeyboard = true; // Mark that we've shown the keyboard
    
    const prizeTypeKeyboard = {
      reply_markup: {
        keyboard: [
          ['⭐ Stars', '🎮 NFT'],
          ['💰 Pul', '🔙 Orqaga']
        ],
        resize_keyboard: true,
        one_time_keyboard: true
      }
    };
    
    // Remove any existing message listeners to prevent duplicates
    bot.removeTextListener(/.*/);
    
    // Send the prize type selection message
    await bot.sendMessage(chatId, 
      '🎁 <b>Yutuq turini tanlang:</b>\n\n' +
      '• ⭐ Stars - Bot ichidagi valyuta\n' +
      '• 🎮 NFT - Raqamli san\'at asari\n' +
      '• 💰 Pul - Naqd pul mukofoti\n\n' +
      '❌ Bekor qilish: /cancel',
      { 
        parse_mode: 'HTML',
        ...prizeTypeKeyboard
      }
    );
  }

  // Ovoz Battle yaratish
  else if (text === 'Ovoz Battle') {
    // Kanal linkini so'rash
    const message = await bot.sendMessage(chatId, 
      '🎯 <b>Ovoz Battle yaratish uchun quyidagilardan birini yuboring:</b>\n\n' +
      '1. Ochiq kanal/guruh uchun:\n' +
      '   • Kanal usernamesi: @channel_username\n' +
      '   • Yoki to\'liq link: https://t.me/channel_username\n\n' +
      '2. Yopiq kanal/guruh uchun:\n' +
      '   • Guruh ID raqami: -1001234567890\n   (Guruh ID sini olish uchun /getgroupid buyrug\'ini guruhga yuboring)\n\n' +
      '⚠️ <b>Eslatma:</b> Botni kanalga admin qilinganligiga ishonch hosil qiling!', {
        parse_mode: 'HTML',
        reply_markup: {
          force_reply: true,
          selective: true
        }
      }
    );

    // User state ni yangilaymiz
    const userState = users.get(userId) || {};
    userState.waitingForChannel = true;
    userState.battleType = 'stars';
    userState.lastMessageId = message.message_id;
    users.set(userId, userState);
    
    // Foydalanuvchi javobini kutilayotgan holat
    const replyListener = async (reply) => {
      if (reply.reply_to_message && 
          reply.reply_to_message.message_id === userState.lastMessageId) {
        try {
          const channel = reply.text.trim();
          
          // Kanal linkini tekshirish
          const isNumericId = /^-?\d+$/.test(channel);
          const isValidFormat = channel.startsWith('@') || 
                             channel.startsWith('https://t.me/') || 
                             isNumericId;
          
          if (!isValidFormat) {
            return bot.sendMessage(chatId, '❌ Noto\'g\'ri format! Iltimos, quyidagi formatlardan birida yuboring:\n\n' +
              '1. Ochiq kanal/guruh uchun:\n' +
              '   • @channel_username\n' +
              '   • https://t.me/channel_username\n\n' +
              '2. Yopiq kanal/guruh uchun:\n' +
              '   • Guruh ID raqami (masalan: -1001234567890)');
          }
          
          // Yuborilayotgan xabar
          const processingMsg = await bot.sendMessage(chatId, '⏳ Ovoz Battle yaratilmoqda, iltimos kuting...');
          
          // Ovoz Battle yaratish
          const result = await createStarsBattle(chatId, userId, channel);
          
          // Yuborilayotgan xabarni o'chirish
          await bot.deleteMessage(chatId, processingMsg.message_id);
          
          if (result.success) {
            await bot.sendMessage(chatId, `✅ Ovoz Battle muvaffaqiyatli yaratildi!\n\n` +
              `Kanal: ${channel}\n` +
              `Endi ishtirokchilar "⭐️ Qatnashish" tugmasi orqali qatnashishi mumkin!`, {
              reply_markup: mainKeyboard,
              parse_mode: 'HTML'
            });
            const currentState = users.get(userId) || {};
            currentState.state = 'await_paid_battle_id';
            users.set(userId, currentState);
            await bot.sendMessage(chatId, `💰 Pullik battle yaratish uchun hozir yaratilgan Battle ID ni yuboring.\n\nMasalan: ${result.battleId}`, {
              reply_markup: { keyboard: [[{ text: '🔙 Bekor qilish' }]], resize_keyboard: true }
            });
          } else {
            await bot.sendMessage(chatId, `❌ Xatolik: ${result.error}\n\n` +
              'Iltimos, quyidagilarni tekshiring:\n' +
              '1. Bot kanalga qo\'shilganmi?\n' +
              '2. Botda xabarlar yozish huquqi bormi?\n' +
              '3. Kanal usernameni to\'g\'ri yozganmisiz?\n' +
              '4. Bot kanalda admin qilinganmi?', {
              reply_markup: mainKeyboard,
              parse_mode: 'HTML'
            });
          }
        } catch (error) {
          console.error('Xatolik:', error);
          await bot.sendMessage(chatId, '❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.', {
            reply_markup: mainKeyboard
          });
        } finally {
          // Event listenerni olib tashlash
          bot.removeListener('message', replyListener);
        }
      }
    };
    
    // Event listener qo'shamiz
    bot.on('message', replyListener);
    
    // 2 daqiqadan keyin event listenerni olib tashlash
    setTimeout(() => {
      bot.removeListener('message', replyListener);
    }, 120000); // 2 daqiqa = 120000 millisekund
    
    return;
  }

  // Battlelar
  else if (text === '⚔️ Battlelar') {
    if (battles.size === 0) {
      bot.sendMessage(chatId, '📭 <b>Hozircha faol battlelar yo\'q</b>', {
        parse_mode: 'HTML'
      });
      return;
    }

    let battleList = '⚔️ <b>Faol Battlelar:</b>\n\n';
    let count = 1;
    
    battles.forEach((battle, battleId) => {
      battleList += `${count}. ${battle.type === 'reaction' ? '❤️' : '⭐️'} Battle #${battleId}\n`;
      battleList += `   Yutuq: ${battle.prize} Stars\n`;
      battleList += `   Ishtirokchilar: ${battle.participants.length}/10\n\n`;
      count++;
    });

    bot.sendMessage(chatId, battleList, { parse_mode: 'HTML' });
  }

  // Kabinet
  else if (text === '📲 Kabinet') {
    // Make sure user is registered
    registerUser(userId, username, firstName);
    const userState = users.get(userId) || {};
    const cabinetText = `
👤 <b>Shaxsiy Kabinet</b>

📝 Ism: ${userState.firstName}
🆔 Username: @${userState.username}
🆔 ID: ${userId}

📊 <b>Statistika:</b>
• Yaratilgan battlelar: ${userState.battles_created}
• Qatnashgan battlelar: ${userState.battles_participated}
• G'alabalar: ${userState.wins}
• Ro'yxatdan o'tgan: ${(userState.joined_date ? new Date(userState.joined_date) : new Date()).toLocaleDateString()}

💳 <b>Hisob:</b> ${(userState.balance || 0).toLocaleString()} so'm
    `;

    bot.sendMessage(chatId, cabinetText, { parse_mode: 'HTML' });
  }

  // Statistika
  else if (text === '📊 Statistika') {
    const totalUsers = users.size;
    const totalBattles = battles.size;
    
    const statsText = `
📊 <b>Umumiy Statistika</b>

👥 Foydalanuvchilar: ${totalUsers}
⚔️ Jami battlelar: ${totalBattles}
🔥 Faol battlelar: ${totalBattles}

📈 Bot statistikasi muntazam yangilanib turadi.
    `;

    bot.sendMessage(chatId, statsText, { parse_mode: 'HTML' });
  }

  // Ma'lumotlar
  else if (text === '📋 Ma\'lumotlar') {
    const infoText = `
📋 Bot Haqida To'liq Ma'lumot
🤖 Bot nimalarga qodir?
Ushbu bot orqali siz do'stlaringiz va obunachilaringiz bilan turli xil battle (jang) larni o'tkazishingiz mumkin.

🎯 Battle Turlari:

❤️ Reaksiya Battle
Ishtirokchilar postga reaksiya qo'shish orqali qatnashadi
Eng ko'p reaksiya to'plagan ishtirokchi g'olib bo'ladi
Oddiy va tushinarli interfeys

⭐️ Ovoz Battle
Ishtirokchilar "Ovoz berish" orqali qatnashadi
Har bir ishtirokchi faqat bir marta ovoz bera oladi
Eng ko'p ovoz to'plagan ishtirokchi g'olib hisoblanadi

🎮 Oddiy Battle
Oddiy va tezkor battle turi
Ishtirokchilar "Qatnashish" tugmasi orqali ro'yxatdan o'tadilar
Tizim tasodifiy g'olibni tanlaydi

💡 Qanday foydalanish?

"Battle Yaratish" tugmasini bosing
Kerakli battle turini tanlang
Yutuq miqdorini kiriting
Kanal yoki guruh havolasini yuboring
Battle postini kanalingizga joylang!

📊 Shaxsiy Kabinet
Yaratilgan va qatnashilgan battlelar statistikasi
Balans va to'lovlar tarixi
G'alabalar va faollik ko'rsatkichlari

⚙️ Qo'shimcha imkoniyatlar:
Kanal yoki guruhlarda ishlaydi
Oson va tushinarli interfeys
Avtomatik hisob-kitob va g'oliblarni aniqlash
Adminlar uchun keng boshqaruv imkoniyatlari

📞 Qo'llab-quvvatlash
Agar savollaringiz bo'lsa, "📞 Admin" tugmasi orqali murojaat qilishingiz mumkin.

Botdan to'liq foydalanish uchun uni kanalingiz yoki guruhingizga admin qilib qo'ying!
    `;

    bot.sendMessage(chatId, infoText, { parse_mode: 'HTML' });
  }

  // Admin
  else if (text === '📞 Admin') {
    const adminText = `
📞 <b>Admin bilan bog'lanish</b>

Savollaringiz yoki muammolaringiz bo'lsa, admin bilan bog'laning:

👤 Admin: @${admins[0]}

💬 Yoki quyidagi xabar orqali murojaat qiling:
/support [xabaringiz]

⏱ Odatda 24 soat ichida javob beriladi.
    `;

    bot.sendMessage(chatId, adminText, { parse_mode: 'HTML' });
  }

  // Orqaga
  else if (text === '🔙 Orqaga') {
    bot.sendMessage(chatId, '🏠 Asosiy menyu', {
      reply_markup: mainKeyboard
    });
  }
});

// Battle yaratish jarayoni
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;

  if (!users.has(userId)) return;
  
  const userState = users.get(userId);
  
  if (!userState.creating_battle) return;
  if (!text || text.startsWith('/') || text.startsWith('🛠') || text.startsWith('⚔️') || text.startsWith('📲') || text.startsWith('📊') || text.startsWith('📋') || text.startsWith('📞')) return;

  // Handle prize type selection
  if (userState.battle_step === 'prize_type') {
    // If we get a command or other non-prize type, ignore it
    if (text.startsWith('/') || text.startsWith('🛠') || text.startsWith('⚔️') || text.startsWith('📲') || text.startsWith('📊') || text.startsWith('📋') || text.startsWith('📞')) {
      return;
    }
    
    let prizeType = '';
    let prizePrompt = '';
    
    // Trim and normalize the input text for comparison
    const normalizedText = text.trim();
    
    // Handle back button
    if (normalizedText === '🔙 Orqaga' || normalizedText === 'Orqaga' || normalizedText === 'orqaga') {
      userState.battle_step = null;
      userState.creating_battle = null;
      bot.sendMessage(chatId, '🏠 Bosh menyuga qaytildi', { reply_markup: mainKeyboard });
      return;
    }
    
    // Check prize type selection
    if (normalizedText.includes('Star') || normalizedText.includes('star') || normalizedText.includes('⭐')) {
      prizeType = 'stars';
      prizePrompt = '⭐ <b>Yutuq miqdorini kiriting (Stars):</b>\n\nMasalan: 100';
    } else if (normalizedText.includes('NFT') || normalizedText.includes('nft') || normalizedText.includes('🎮')) {
      prizeType = 'nft';
      prizePrompt = '🖼 <b>NFT raqamini yoki nomini kiriting:</b>\n\nMasalan: Bored Ape #1234';
    } else if (normalizedText.includes('Pul') || normalizedText.includes('pul') || normalizedText.includes('💰')) {
      prizeType = 'money';
      prizePrompt = '💵 <b>Mukofot miqdorini kiriting (so\'mda):</b>\n\nMasalan: 100000';
    } else {
      // If we get here, the input wasn't recognized as a prize type
      // Don't send a new message, just show the keyboard again
      const prizeTypeKeyboard = {
        reply_markup: {
          keyboard: [
            ['⭐ Stars', '🎮 NFT'],
            ['💰 Pul', '🔙 Orqaga']
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      };
      
      // Only send a new message if we haven't shown the keyboard yet
      if (!userState.showedPrizeKeyboard) {
        await bot.sendMessage(chatId, 
          '🎁 <b>Yutuq turini tanlang:</b>\n\n' +
          '• ⭐ Stars - Bot ichidagi valyuta\n' +
          '• 🎮 NFT - Raqamli san\'at asari\n' +
          '• 💰 Pul - Naqd pul mukofoti\n\n' +
          '❌ Bekor qilish: /cancel',
          { 
            parse_mode: 'HTML',
            ...prizeTypeKeyboard
          }
        );
        userState.showedPrizeKeyboard = true;
      }
      return;
    }
    
    // If we got a valid prize type, proceed to the next step
    userState.battle_step = 'prize_amount';
    userState.battle_data = { prizeType };
    userState.showedPrizeKeyboard = false; // Reset for next time
    
    // Remove the prize type keyboard
    await bot.sendMessage(chatId, prizePrompt + '\n\n❌ Bekor qilish: /cancel', { 
      parse_mode: 'HTML',
      reply_markup: { remove_keyboard: true }
    });
  }
  // Handle prize amount input
  else if (userState.battle_step === 'prize_amount') {
    const prizeData = userState.battle_data || {};
    const prizeType = prizeData.prizeType || 'stars';
    
    if (prizeType === 'nft' && text.trim() === '') {
      bot.sendMessage(chatId, '❌ NFT nomi bo\'sh bo\'lmasligi kerak!');
      return;
    }
    
    if ((prizeType === 'stars' || prizeType === 'money') && (isNaN(parseInt(text)) || parseInt(text) <= 0)) {
      bot.sendMessage(chatId, `❌ Noto'g'ri miqdor kiritildi. Iltimos, musbat son kiriting!`);
      return;
    }
    
    userState.battle_data = {
      ...prizeData,
      prize: text.trim(),
      prizeType: prizeType
    };
    userState.battle_step = 'channel';
    
    bot.sendMessage(chatId, 
      '📢 <b>Battle kanalini yuboring:</b>\n\n' +
      'Kanal usernamesi yoki to\'liq linkini yuboring.\n' +
      'Masalan: @channel yoki https://t.me/channel\n\n' +
      '❌ Bekor qilish: /cancel',
      { parse_mode: 'HTML' }
    );
  }

  // Kanal yoki guruh linkini so'rash
  else if (userState.battle_step === 'channel') {
    const channelLink = text.trim();
    
    // Bekor qilish tekshiruvi
    if (channelLink === '/cancel' || channelLink === '🔙 Orqaga') {
      userState.battle_step = null;
      userState.creating_battle = null;
      return bot.sendMessage(chatId, '❌ Battle yaratish bekor qilindi.', { reply_markup: mainKeyboard });
    }

    // Check if it's a private group link
    const privateCheck = await handlePrivateGroupLink(chatId, channelLink);
    if (privateCheck.isPrivate) {
      if (privateCheck.error) return;
      userState.waiting_for_group_id = true;
      userState.temp_channel_link = channelLink;
      return;
    }
    
    // Kanal yoki guruh ID/username ni ajratib olish
    let targetChat = channelLink;
    let isPrivateGroup = false;
    let errorMessage = '';
    
    // To'g'ri formatdagi link tekshiruvi
    const validLinkPatterns = [
      /^@[a-zA-Z0-9_]{5,}$/,  // @username format
      /^https?:\/\/t\.me\/[a-zA-Z0-9_]{5,}$/,  // https://t.me/username
      /^https?:\/\/t\.me\/joinchat\/[a-zA-Z0-9_-]+$/,  // Private group invite link
      /^https?:\/\/t\.me\/\+[a-zA-Z0-9_-]+$/,  // Public group link
      /^-?\d+$/,  // Numeric ID (with optional - for groups)
      /^-[a-zA-Z0-9_]+$/  // Private group username
    ];
    
    const isValidLink = validLinkPatterns.some(pattern => pattern.test(targetChat));
    
    if (!isValidLink) {
      return bot.sendMessage(chatId, 
        '❌ Noto\'g\'ri format! Iltimos, quyidagi formatlardan birida yuboring:\n\n' +
        '1. Ochiq kanal/guruh uchun:\n' +
        '   • Kanal usernamesi: @channel_username\n' +
        '   • Yoki to\'liq link: https://t.me/channel_username\n\n' +
        '2. Yopiq kanal/guruh uchun:\n' +
        '   • Guruh ID raqami: -1001234567890\n   (Guruh ID sini olish uchun /getgroupid buyrug\'ini guruhga yuboring)',
        { reply_to_message_id: userState.lastMessageId, parse_mode: 'HTML' }
      );
    }
    
    // Link tahlili
    if (targetChat.includes('joinchat/')) {
      // Eski formatdagi yopiq guruh linki
      isPrivateGroup = true;
      // Linkdan guruh ID sini ajratib olish
      const parts = targetChat.split('joinchat/');
      targetChat = parts[1];
    } 
    else if (targetChat.includes('t.me/+') || targetChat.startsWith('+')) {
      // Yangi formatdagi yopiq guruh linki
      isPrivateGroup = true;
      // + dan keyingi qismni olish
      const code = targetChat.split('+').pop();
      if (code && code.length > 5) {
        targetChat = code;
      } else {
        return bot.sendMessage(chatId, 
          '❌ Noto\'g\'ri formatdagi guruh linki! Iltimos, quyidagi formatda yuboring:\n' +
          '• https://t.me/joinchat/xxxxx\n' +
          '• https://t.me/+xxxxxxxxxxx',
          { parse_mode: 'HTML' }
        );
      }
    }
    else if (targetChat.startsWith('https://t.me/') || targetChat.startsWith('t.me/')) {
      // Public channel/group link
      targetChat = targetChat.replace('https://t.me/', '').replace('t.me/', '');
    }
    // Agar @ bilan boshlanmasa va raqam bo'lsa (channel ID)
    else if (/^\d+$/.test(targetChat)) {
      targetChat = `-100${targetChat}`;
      isPrivateGroup = true;
    }
    // Agar @ bilan boshlanmasa
    else if (!targetChat.startsWith('@') && !targetChat.startsWith('-100')) {
      targetChat = '@' + targetChat;
    }
    
    // Kanal yoki guruh mavjudligini tekshirish
    try {
      const chatInfo = await bot.getChat(targetChat).catch(() => null);
      if (!chatInfo) {
        return bot.sendMessage(chatId, 
          '❌ Kanal yoki guruh topilmadi! Iltimos, quyidagilarni tekshiring:\n' +
          '1. Kanal/grurh to\'g\'ri kiritilganmi?\n' +
          '2. Bot kanalga qo\'shilganmi?\n' +
          '3. Kanal yopiq bo\'lsa, bot admin qilinganmi?',
          { parse_mode: 'HTML' }
        );
      }
      
      // Bot adminligini tekshirish
      const botMember = await bot.getChatMember(chatInfo.id, bot.token.split(':')[0]).catch(() => null);
      if (!botMember || !['administrator', 'creator'].includes(botMember.status)) {
        return bot.sendMessage(chatId,
          '⚠️ Bot bu kanalda admin emas! Iltimos, quyidagi qadamlarni bajaring:\n\n' +
          `1. ${chatInfo.title} kanaliga o\'ting\n` +
          `2. Bot (@${bot.options.username}) ni admin qiling\n` +
          '3. "Xabarlarni yuborish" va "Xabarlarni tahrirlash" huquqlarini bering\n\n' +
          'Keyin qayta urinib ko\'ring.',
          { parse_mode: 'HTML' }
        );
      }
      
      // Kanal ma'lumotlarini saqlash
      userState.battle_data = userState.battle_data || {};
      userState.battle_data.channel = chatInfo.id;
      userState.battle_data.channelUsername = chatInfo.username ? `@${chatInfo.username}` : chatInfo.title;
      userState.battle_data.isPrivateGroup = isPrivateGroup;
      
    } catch (error) {
      console.error('Kanal ma\'lumotlarini olishda xatolik:', error);
      return bot.sendMessage(chatId, 
        '❌ Xatolik yuz berdi! Iltimos, quyidagilarni tekshiring:\n' +
        '1. Bot kanalga qo\'shilganmi?\n' +
        '2. Kanal to\'g\'ri kiritilganmi?\n' +
        '3. Kanal yopiq bo\'lsa, bot admin qilinganmi?\n\n' +
        'Qayta urinish uchun kanal linkini yuboring yoki /cancel tugmasini bosing.',
        { parse_mode: 'HTML' }
      );
    }

    userState.battle_data.channel = targetChat;
    userState.battle_data.channelUsername = targetChat;
    userState.battle_data.isPrivateGroup = isPrivateGroup;
    
    // Battle yaratish
    const battleId = Date.now();
    const botInfo = await bot.getMe();
    
    const battleData = {
      id: battleId,
      creator: userId,
      creatorUsername: msg.from.username,
      type: userState.creating_battle,
      participants: [],
      prize: userState.battle_data.prize,
      prizeType: userState.battle_data.prizeType || 'stars',
      channel: userState.battle_data.channel,
      channelUsername: userState.battle_data.channelUsername,
      votes: new Map(),
      created: new Date(),
      botUsername: botInfo.username,
      postMessageId: null,
      postChatId: null
    };

    battles.set(battleId, battleData);
    userState.battles_created++;

    // Battle post yaratish
    let battlePost = '';
    
    if (userState.creating_battle === 'reaction') {
      const prizeType = userState.battle_data.prizeType || 'stars';
      let prizeText = '';
      
      switch (prizeType) {
        case 'nft':
          prizeText = `🏆 Yutuq: NFT (${battleData.prize})`;
          break;
        case 'money':
          prizeText = `💰 Yutuq: ${parseInt(battleData.prize).toLocaleString()} so'm`;
          break;
        case 'stars':
        default:
          prizeText = `⭐ Yutuq: ${battleData.prize} Stars`;
      }
      
      battlePost = `❤️ <b>Reaksiya Battle</b>\n\n`;
      battlePost += `${prizeText}\n\n`;
      battlePost += `👥 <b>Ishtirokchilar:</b>\n`;
      battlePost += `<i>Hozircha ishtirokchilar yo'q...</i>\n\n`;
      battlePost += `📊 Jami: 0/10 ishtirokchi\n`;
      battlePost += `📢 Kanal: ${battleData.channel}\n`;
      
    }

    // Kanal yoki guruhga post yuborish
    try {
      console.log('Trying to send message to:', battleData.channel);
      console.log('Is private group:', battleData.isPrivateGroup);
      
      let channelPost;
      
      // Yopiq guruh uchun alohida ishlov berish
      if (battleData.isPrivateGroup) {
        console.log('Private group detected, using direct message sending');
        
        // 1. Avval oddiy xabar yuborish
        channelPost = await bot.sendMessage(battleData.channel, battlePost, { 
          parse_mode: 'HTML',
          disable_web_page_preview: true
        });
        
        // 2. Tugmani alohida qo'shishga urinamiz
        try {
          await bot.editMessageReplyMarkup(
            { 
              inline_keyboard: [
                [{ text: '🎮 Qatnashish', url: `https://t.me/${botInfo.username}?start=join_${battleId}` }]
              ] 
            },
            { 
              chat_id: channelPost.chat.id, 
              message_id: channelPost.message_id 
            }
          );
          console.log('Successfully added button to private group message');
        } catch (editError) {
          console.log('Could not add button to private group message, but message was sent:', editError.message);
          // Xabar yuborilgan bo'lsa ham davom etamiz
        }
      } 
      // Oddiy kanal yoki ochiq guruh uchun
      else {
        console.log('Public channel/group detected, using standard message sending');
        channelPost = await bot.sendMessage(battleData.channel, battlePost, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎮 Qatnashish', url: `https://t.me/${botInfo.username}?start=join_${battleId}` }]
            ]
          },
          disable_web_page_preview: true
        });
      }

      // Post ID ni saqlash
      battleData.postMessageId = channelPost.message_id;
      battleData.postChatId = channelPost.chat.id;

      bot.sendMessage(chatId, 
        '✅ <b>Battle muvaffaqiyatli yaratildi va kanalga yuborildi!</b>\n\n' +
        `🆔 Battle ID: ${battleId}\n` +
        `💰 Yutuq: ${battleData.prize} Stars\n` +
        `📢 Kanal: ${battleData.channelUsername}\n\n` +
        `⚡️ Odamlar "Qatnashish" tugmasini bossalar:\n` +
        `• Tabrik xabari oladilar\n` +
        `• Avtomatik ishtirokchilar ro'yxatiga qo'shiladi\n` +
        `• Kanaldagi postda username ko'rinadi!\n\n` +
        `📊 Natijalar: /results_${battleId}`,
        { 
          parse_mode: 'HTML',
          reply_markup: mainKeyboard
        }
      );
      const currentState = users.get(userId) || {};
      currentState.state = 'await_paid_battle_id';
      users.set(userId, currentState);
      await bot.sendMessage(chatId, `💰 Pullik battle yaratish uchun hozir yaratilgan Battle ID ni yuboring.\n\nMasalan: ${battleId}`, {
        reply_markup: { keyboard: [[{ text: '🔙 Bekor qilish' }]], resize_keyboard: true }
      });

    } catch (error) {
      console.error('Xatolik yuz berdi:', error);
      let errorMessage = '';
      if (battleData.isPrivateGroup) {
        errorMessage = `⚠️ <b>Xatolik yuz berdi!</b>\n\n` +
        `Iltimos, quyidagi qadamlarni bajaring:\n` +
        `1. Botni guruhga qo'shish uchun: @${botInfo.username} ni guruhga qo'shing\n` +
        `2. Botga admin huquqlarini bering (agar admin bo'lmasa):\n` +
        `   • Guruh sozlamalari > Administratorlar > Administrator qo'shish > @${botInfo.username}\n` +
        `   • Kerakli huquqlar: Xabarlar yuborish, Xabarlarni tahrirlash\n` +
        `3. Agar guruh yopiq bo'lsa, bot admin bo'lishi shart\n\n` +
        `❌ Iltimos, yuqoridagi qadamlarni bajaring va qayta urinib ko'ring`;
      } else {
        errorMessage = `⚠️ <b>Botni kanalga admin qilishingiz kerak!</b>\n\n` +
        `Qadamlar:\n` +
        `1. ${battleData.channelUsername} ga o'ting\n` +
        `2. Bot: @${botInfo.username} ni admin qiling\n` +
        `3. "Post yuborish" huquqini bering\n` +
        `4. Qaytadan /start bosing va battle yaratishni boshlang\n\n` +
        `❌ Battle yaratish bekor qilindi`;
      }
      
      bot.sendMessage(chatId, errorMessage, { 
        parse_mode: 'HTML',
        reply_markup: mainKeyboard 
      });
      
      // Battle ni o'chirish
      battles.delete(battleId);
      userState.battles_created--;
    }

    // Tozalash
    delete userState.creating_battle;
    delete userState.battle_step;
    delete userState.battle_data;
  }
});

// Battle natijalarini ko'rish
bot.onText(/\/results_(\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const battleId = parseInt(match[1]);
  const battle = battles.get(battleId);

  if (!battle) {
    bot.sendMessage(chatId, '❌ Battle topilmadi!');
    return;
  }

  let resultsText = `📊 <b>Battle #${battleId} Natijalari</b>\n\n`;
  resultsText += `💰 Yutuq: ${battle.prize} Stars\n`;
  resultsText += `📢 Kanal: ${battle.channel}\n\n`;
  resultsText += `👥 <b>Ishtirokchilar (${battle.participants.length}/10):</b>\n\n`;

  if (battle.participants.length === 0) {
    resultsText += `<i>Hozircha ishtirokchilar yo'q</i>`;
  } else {
    battle.participants.forEach((participant, index) => {
      resultsText += `${index + 1}. ${participant.username} ${reactions[index % reactions.length]}\n`;
    });
  }

  bot.sendMessage(chatId, resultsText, { parse_mode: 'HTML' });
});

// Bekor qilish (yagona /cancel handler - battle yaratish va admin javobini ham bekor qiladi)
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userState = users.get(userId);

  if (userState) {
    if (userState.replyingTo) {
      delete userState.replyingTo;
      users.set(userId, userState);
      bot.sendMessage(chatId, '❌ Javob yozish bekor qilindi.', {
        reply_markup: { remove_keyboard: true }
      });
      return;
    }

    delete userState.creating_battle;
    delete userState.battle_step;
    delete userState.battle_data;
  }

  bot.sendMessage(chatId, '❌ Bekor qilindi', {
    reply_markup: mainKeyboard
  });
});

// Handle callback queries (button clicks)
// Pullik battle uchun to'lov qilish
async function processBattlePayment(chatId, userId, battleId, callbackQuery) {
  const battle = paidBattles.get(parseInt(battleId));
  if (!battle) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Battle topilmadi!' });
    return;
  }
  
  // Check if user already joined
  if (battle.participants.some(p => p.userId === userId)) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Siz allaqachon ushbu battlega qo\'shilgansiz!' });
    return;
  }
  
  // Check if battle is full
  if (battle.participants.length >= 2) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Ushbu battle allaqachon to\'ldirilgan!' });
    return;
  }

  // Balance check and deduction
  let profile = users.get(userId);
  if (!profile) {
    // Initialize a minimal profile if missing
    profile = {
      id: userId,
      username: callbackQuery.from.username || 'No username',
      firstName: callbackQuery.from.first_name || 'User',
      battles_created: 0,
      battles_participated: 0,
      wins: 0,
      joined_date: new Date(),
      balance: 0
    };
  }
  const currentBalance = profile.balance || 0;
  if (currentBalance < battle.price) {
    await bot.answerCallbackQuery(callbackQuery.id, { 
      text: `❌ Balans yetarli emas. Kerak: ${battle.price.toLocaleString()} so'm, Sizda: ${currentBalance.toLocaleString()} so'm`,
      show_alert: true
    });
    // Send helper message to top up
    await bot.sendMessage(chatId, `💳 Hisobingiz yetarli emas. Hisobni to'ldirish uchun admin bilan bog'laning.
ID: <code>${userId}</code>`, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '➕ Hisobni to\'ldirish', callback_data: 'topup_request' }]] }
    });
    return;
  }
  // Deduct balance
  profile.balance = currentBalance - battle.price;
  users.set(userId, profile);
  
  // Add user to participants
  battle.participants.push({
    userId: userId,
    paidAt: new Date(),
    username: callbackQuery.from.username || `User_${userId}`
  });
  
  // Update battle in the map
  paidBattles.set(parseInt(battleId), battle);
  
  // Send success message
  await bot.answerCallbackQuery(callbackQuery.id, { 
    text: `✅ To'lov qabul qilindi! Siz battlega qo'shildingiz.` 
  });
  await bot.sendMessage(chatId, `💳 To'lov: ${battle.price.toLocaleString()} so'm
✅ Qoldiq balans: ${profile.balance.toLocaleString()} so'm`);
  
  // If we have 2 participants, notify them
  if (battle.participants.length === 2) {
    for (const participant of battle.participants) {
      try {
        await bot.sendMessage(
          participant.userId,
          `🎉 Sizning pullik batingiz to'liq to'ldirildi!\n` +
          `🆔 Battle ID: ${battleId}\n` +
          `${battle.battleType ? `⚔️ Turi: ${battle.battleType}\n` : ''}` +
          `📢 Kanal: ${battle.channelId}\n` +
          `💰 Narxi: ${battle.price.toLocaleString()} so'm\n\n` +
          `Endi kanalga o'tib, batingizni boshlashingiz mumkin!`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{
                  text: '📢 Kanalga o\'tish',
                  url: `https://t.me/${battle.channelId.replace('@', '')}`
                }]
              ]
            }
          }
        );
      } catch (e) {
        console.error('Failed to notify participant:', e);
      }
    }
    
    // Remove battle from active battles
    paidBattles.delete(parseInt(battleId));
  }
  
  // Update the battle list message
  await showPaidBattles(chatId, userId);
}

bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;
  const username = callbackQuery.from.username || callbackQuery.from.first_name || 'Foydalanuvchi';
  
  // Handle 'Qatnashish' button click
  if (data.startsWith('join_')) {
    try {
      const battleId = data.split('_')[1];
      const battle = battles.get(parseInt(battleId));
      
      if (!battle) {
        return await bot.answerCallbackQuery(callbackQuery.id, {
          text: '❌ Ushbu battle mavjud emas yoki muddati tugagan',
          show_alert: true
        });
      }
      
      // Check if user already joined
      if (battle.participants.some(p => p.userId === userId)) {
        return await bot.answerCallbackQuery(callbackQuery.id, {
          text: '✅ Siz allaqachon qatnashgansiz!',
          show_alert: true
        });
      }
      
      // Add participant
      battle.participants.push({
        userId,
        username: callbackQuery.from.username || '',
        firstName: callbackQuery.from.first_name || 'Foydalanuvchi',
        joinedAt: new Date()
      });
      
      // Update battle post
      await updateBattlePost(battleId);
      
      // Send confirmation to user
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '✅ Siz muvaffaqiyatli qatnashdingiz!',
        show_alert: false
      });
      
      return;
    } catch (error) {
      console.error('Error in join battle:', error);
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '❌ Xatolik yuz berdi. Iltimos, keyinroq qayta urinib k\'oring.',
        show_alert: true
      });
      return;
    }
  }
  
  try {
    // Handle back to main menu
    if (data === 'back_to_main') {
      await bot.editMessageText('Asosiy menyu', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { ...mainKeyboard, resize_keyboard: true }
      });
      return;
    }
    
    // Handle create paid battle
    if (data === 'create_paid_battle') {
      // Save user state to ask for battle ID
      users.set(userId, {
        ...(users.get(userId) || {}),
        waitingFor: 'paid_battle_id',
        tempData: {}
      });
      
      await bot.sendMessage(chatId, '🆔 Iltimos, battle ID sini yuboring:', {
        reply_markup: {
          keyboard: [[{ text: '❌ Bekor qilish' }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
      
      return;
    }
    
    // Handle view paid battles
    if (data === 'view_paid_battles') {
      await showPaidBattles(chatId, userId);
      return;
    }
    
    // Handle top up request from Cabinet
    if (data === 'topup_request') {
      const profile = users.get(userId) || {};
      await bot.answerCallbackQuery(callbackQuery.id);
      await bot.sendMessage(chatId,
        `💳 Hisobingiz: ${(profile.balance || 0).toLocaleString()} so'm\n` +
        `🆔 Sizning ID: <code>${userId}</code>\n\n` +
        `Hisobni to'ldirish uchun admin bilan bog'laning va ID hamda summani yuboring.\n\n` +
        `Admin uchun: <code>/addbalance ${userId} 10000</code> (misol)`,
        { parse_mode: 'HTML' }
      );
      return;
    }
    
    // Handle pay battle
    if (data.startsWith('pay_battle_')) {
      const battleId = data.split('_')[2];
      const battle = paidBattles.get(parseInt(battleId));
      
      if (!battle) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Ushbu battle topilmadi yoki tugatilgan!' });
        return;
      }
      
      // Check if user is the creator
      if (battle.userId === userId) {
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: `ℹ️ Siz ushbu battle yaratuvchisisiz. Boshqa foydalanuvchilar qo'shilishini kuting.` 
        });
        return;
      }
      
      // Show payment confirmation
      await bot.sendMessage(
        chatId,
        `💰 *To'lov qilish*\n\n` +
        `🆔 Battle ID: ${battleId}\n` +
        `${battle.battleType ? `⚔️ Turi: *${battle.battleType}*\n` : ''}` +
        `💳 To'lov miqdori: *${battle.price.toLocaleString()} so'm*\n` +
        `Battleda qatnashish uchun to'lov qilishingiz kerak. To'lov qilishni tasdiqlaysizmi?`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📢 Kanal', url: `https://t.me/${battle.channelId.replace('@','')}` }],
              [{
                text: `✅ Ha, to'lov qilish (${battle.price.toLocaleString()} so'm)`,
                callback_data: `join_paid_${battleId}`
              }],
              [{
                text: '❌ Bekor qilish',
                callback_data: 'view_paid_battles'
              }]
            ]
          }
        }
      );
      
      return;
    }
    
    // Handle join paid battle
    if (data.startsWith('join_paid_')) {
      const battleId = data.split('_')[2];
      await processBattlePayment(chatId, userId, battleId, callbackQuery);
      return;
    }
    
    // Handle other callback queries
    const username = callbackQuery.from.username || callbackQuery.from.first_name;
    
    // Handle Star Battle participation (⭐️ Qatnashish)
    if (data.startsWith('stars_join_')) {
      try {
        const [_, __, battleId] = data.split('_');
        const battle = battles.get(parseInt(battleId));
        if (!battle) {
          await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Battle topilmadi!' });
          return;
        }
        
        // Check if user is already a participant
        const battleVotes = starVotes.get(parseInt(battleId)) || {};
        const existingParticipant = Object.values(battleVotes).find(p => p.userId === userId);
        
        if (existingParticipant) {
          await bot.answerCallbackQuery(callbackQuery.id, { 
            text: `✅ Siz allaqachon qatnashgansiz! (@${existingParticipant.username || 'foydalanuvchi'}-[${existingParticipant.index}])` 
          });
          return;
        }
        
        // Get user info
        const starUsername = callbackQuery.from.username || '';
        const firstName = callbackQuery.from.first_name || '';
        const participantCount = Object.keys(battleVotes).length;
        const buttonText = starUsername ? `@${starUsername}` : `${firstName || 'User'}`;
        
        // Add participant
        const participantId = Date.now();
        battleVotes[participantId] = {
          userId: userId,
          username: starUsername,
          firstName: firstName,
          buttonText: buttonText,
          index: participantCount,
          votedBy: {}
        };
        
        starVotes.set(parseInt(battleId), battleVotes);
        
        // Update battle post with new participant list
        await updateStarBattlePost(parseInt(battleId));
        
        // Send confirmation to user
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: `✅ Siz muvaffaqiyatli qatnashdingiz! (${buttonText})` 
        });
        
        return;
      } catch (error) {
        console.error('Error in join_star_ handler:', error);
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Xatolik yuz berdi!' });
        return;
      }
    }
    // Handle voting for a participant
    else if (data.startsWith('vote_')) {
      try {
        const [_, battleId, participantId] = data.split('_');
        const battle = battles.get(parseInt(battleId));
        if (!battle) {
          await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Battle topilmadi!' });
          return;
        }

        const battleVotes = starVotes.get(parseInt(battleId)) || {};
        const participant = battleVotes[participantId];

        if (!participant) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ Qatnashuvchi topilmadi!'
          });
          return;
        }

        // Check if user is trying to vote for themselves
        if (participant.userId === userId) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: '❌ O`zingizga ovoz bera olmaysiz!'
          });
          return;
        }

        // Check if user already voted for this participant
        if (participant.votedBy && participant.votedBy[userId]) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: `❌ Siz allaqachon ovoz bergansiz!`
          });
          return;
        }

        // Register the vote
        participant.voteCount = (participant.voteCount || 0) + 1;
        participant.votedBy = participant.votedBy || {};
        participant.votedBy[userId] = true;

        // Update the participant's display index to match their vote count
        participant.displayIndex = participant.voteCount;

        // Save the updated votes
        starVotes.set(parseInt(battleId), battleVotes);

        // Update the battle post with new vote counts
        await updateStarBattlePost(parseInt(battleId));

        // Show success message
        const username = participant.username ? `@${participant.username}` : participant.firstName;
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: `✅ Siz ${username} foydalanuvchisiga ovoz berdingiz!`
        });

        return;
      } catch (error) {
        console.error('Error in vote handler:', error);
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: '❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.'
        });
      }
    }
    // Handle view star post
    else if (data.startsWith('view_star_')) {
      try {
        const [_, __, battleId, targetUserId] = data.split('_');
        const battleVotes = starVotes.get(parseInt(battleId)) || {};
        const targetUser = battleVotes[targetUserId];
        
        if (!targetUser) {
          await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Foydalanuvchi topilmadi!' });
          return;
        }
        
        // Show user's post
        if (targetUser.message.photo) {
          await bot.sendPhoto(userId, targetUser.message.photo, {
            caption: `📸 ${targetUser.username} tomonidan yuborilgan rasm\n\n` +
                     `⭐️ Jami ovozlar: ${targetUser.voteCount || 0}`
          });
        } else if (targetUser.message.video) {
          await bot.sendVideo(userId, targetUser.message.video, {
            caption: `🎥 ${targetUser.username} tomonidan yuborilgan video\n\n` +
                     `⭐️ Jami ovozlar: ${targetUser.voteCount || 0}`
          });
        } else if (targetUser.message.text) {
          await bot.sendMessage(
            userId,
            `📝 ${targetUser.username} tomonidan yuborilgan xabar:\n\n` +
            `${targetUser.message.text}\n\n` +
            `⭐️ Jami ovozlar: ${targetUser.voteCount || 0}`
          );
        }
        
        // Acknowledge the callback
        await bot.answerCallbackQuery(callbackQuery.id);
      } catch (error) {
        console.error('Error in view_star_ handler:', error);
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: '❌ Xatolik yuz berdi. Post yuborib bo\'lmadi.' 
        });
      }
    }
    // Handle Oddiy Battle participation (🎮 Oddiy Battle)
    else if (data.startsWith('oddiy_join_')) {
      const battleId = parseInt(data.split('_')[2]);
      const battle = battles.get(battleId);
      
      if (!battle || battle.type !== 'oddiy') {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Bu battle mavjud emas yoki tugatilgan!' });
        return;
      }
      
      // Check if user has a username
      if (!username) {
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: '❌ Iltimos, avval Telegram profilingizda username o\'rnating!',
          show_alert: true
        });
        return;
      }
      
      // Check if user already participated
      const userKey = `${userId}_${battleId}`;
      if (userVoted.get(userKey)) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Siz allaqachon qatnashgansiz!' });
        return;
      }
      
      // Add user to participants
      battle.participants.push({
        id: userId,
        username: username,
        timestamp: new Date()
      });
      
      // Mark user as voted
      userVoted.set(userKey, true);
      
      // Notify user
      await bot.answerCallbackQuery(callbackQuery.id, { 
        text: '✅ Siz Oddiy Battle da qatnashdingiz!',
        show_alert: false
      });

      // Update the original post's participant count instead of spamming a new post per join
      try {
        const participantUsername = username ? `@${username}` : 'Foydalanuvchi';
        const updatedPost = `🏆 ${participantUsername} \n\n` +
          `⭐️ Stars: 5 ball\n` +
          `👍 Reaksiya: 1 ball\n\n` +
          `📊 Jami ishtirokchilar: ${battle.participants.length}`;

        if (battle.postMessageId && battle.postChatId) {
          await bot.editMessageText(updatedPost, {
            chat_id: battle.postChatId,
            message_id: battle.postMessageId,
            reply_markup: {
              inline_keyboard: [[
                { text: '🎮 Qatnashish', callback_data: `oddiy_join_${battleId}` }
              ]]
            }
          }).catch(() => {});
        }
      } catch (e) {
        console.error('Oddiy battle postini yangilashda xatolik:', e);
      }
      
      // Send a random sticker to the user
      try {
        const sticker = getRandomSticker();
        await bot.sendSticker(userId, sticker);
      } catch (stickerError) {
        console.error('Sticker yuborishda xatolik:', stickerError);
        // Continue even if sticker fails
      }
    }
    // Handle Reaction Battle participation (❤️ Reaksiya Battle)
    else if (data.startsWith('react_join_')) {
      const battleId = parseInt(data.split('_')[2]);
      const battle = battles.get(battleId);
      
      if (!battle || battle.type !== 'reaction') {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Bu battle mavjud emas yoki tugatilgan!' });
        return;
      }
      
      // Check if user already participated
      const userKey = `${userId}_${battleId}`;
      if (userVoted.get(userKey)) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Siz allaqachon qatnashgansiz!' });
        return;
      }
      
      // Mark user as voted
      userVoted.set(userKey, true);
      
      try {
        // Check if this is a duplicate request
        const existingIndex = battle.participants.findIndex(p => p.id === userId);
        if (existingIndex >= 0) {
          // User already participated, just update their reaction
          battle.participants[existingIndex].reaction = '❤️';
          battle.participants[existingIndex].timestamp = new Date();
        } else {
          // Add new participant
          battle.participants.push({
            id: userId,
            username: username,
            timestamp: new Date(),
            reaction: '❤️',
            stars: 0,
            reactionCount: 1
          });
        }
        
        // Update the battle post with new participant
        let participantsText = '👥 Ishtirokchilar:\n';
        battle.participants.forEach((p, index) => {
          participantsText += `${index + 1}. @${p.username} ${p.reaction || '❤️'}\n`;
        });
        
        // Build the updated message
        const updatedText = `❤️ Reaksiya Battle\n\n` +
                          `💰 Yutuq: ${battle.prize} Stars\n\n` +
                          `${participantsText}\n` +
                          `📊 Jami: ${battle.participants.length}/10 ishtirokchi\n` +
                          `📢 Kanal: ${battle.channelUsername || battle.channel}\n\n` 
        
        // Update the original message
        await bot.editMessageText(updatedText, {
          chat_id: battle.postChatId,
          message_id: battle.postMessageId,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '❤️ Qatnashish', callback_data: `react_join_${battleId}` }
            ]]
          }
        });
        
        // Send a random sticker to the user if it's a new participation
        if (existingIndex === -1) {
          const sticker = getRandomSticker();
          await bot.sendSticker(userId, sticker);
        }
        
        // Notify user only with callback answer (no additional message)
        await bot.answerCallbackQuery(callbackQuery.id, { 
          text: existingIndex >= 0 ? '✅ Sizning reaksiyangiz yangilandi!' : '✅ Siz Reaksiya Battle da qatnashdingiz!',
          show_alert: false
        });
        
      } catch (error) {
        console.error('Error updating reaction battle:', error);
        await bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Xatolik yuz berdi, iltimos qaytadan urinib ko\'ring.' });
      }
    }
  // Regular battle handler has been removed
  } catch (error) {
    console.error('Error in callback query handler:', error);
    try {
      await bot.answerCallbackQuery(callbackQuery.id, { 
        text: '❌ Xatolik yuz berdi, iltimos qaytadan urinib ko\'ring.' 
      });
    } catch (e) {
      console.error('Error sending callback query answer:', e);
    }
  }
});

// Support command handler
bot.onText(/\/support(?:(?: (.*)|$))/, async (msg, match) => {
  const chatId = msg.chat.id;
  const message = match[1] || '';
  const userId = msg.from.id;
  const username = msg.from.username || 'foydalanuvchi';
  const firstName = msg.from.first_name || 'Foydalanuvchi';

  // If no message provided, show help
  if (!message.trim()) {
    return bot.sendMessage(chatId, `❌ Iltimos, xabaringizni yozing.\n\nMisol: /support Men yordam kerak`);
  }

  try {
    // Check if there are any admins
    if (admins.length === 0) {
      return bot.sendMessage(chatId, '❌ Admin topilmadi. Iltimos, keyinroq urinib ko\'ring.');
    }

    // Prepare admin message with inline keyboard
    const adminMessage = `🆘 *YANGI SUPPORT XABARI*\n\n` +
      `👤 *Foydalanuvchi:* ${firstName}${username ? ` (@${username})` : ''}\n` +
      `🆔 *ID:* \`${userId}\`\n` +
      `\n💬 *Xabar:* ${message}`;

    // Inline keyboard for admin to reply
    const replyMarkup = {
      inline_keyboard: [
        [{
          text: '✍️ Javob yozish',
          callback_data: `reply_${userId}`
        }],
        [{
          text: '✅ Bajarildi',
          callback_data: `done_${userId}`
        }]
      ]
    };

    // Send to all admins
    const sendPromises = admins.map(adminId => 
      bot.sendMessage(adminId, adminMessage, {
        parse_mode: 'Markdown',
        reply_markup: replyMarkup
      })
    );
    
    await Promise.all(sendPromises);
    
    // Send confirmation to user with a nice message
    await bot.sendMessage(chatId, `✅ Xabaringiz adminga yuborildi! Tez orada aloqaga chiqamiz.\n\nSiz yozgan xabar: *${message}*`, {
      parse_mode: 'Markdown'
    });
    
  } catch (error) {
    console.error('Support xabar yuborishda xatolik:', error);
    bot.sendMessage(chatId, '❌ Xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko\'ring.');
  }
});

// Handle inline button clicks for support
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const messageId = callbackQuery.message.message_id;
  const userId = callbackQuery.from.id;
  
  try {
    // Handle reply button
    if (data.startsWith('reply_')) {
      const targetUserId = data.split('_')[1];
      
      // Store that admin is replying to this user
      const userState = users.get(userId) || {};
      userState.replyingTo = targetUserId;
      users.set(userId, userState);
      
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '✍️ Endi yozgan xabaringiz ushbu foydalanuvchiga yuboriladi.',
        show_alert: true
      });
      
      return bot.sendMessage(chatId, `✍️ *Javob yozish*\n\nEndi yozgan xabaringiz foydalanuvchiga yuboriladi. Xabar yozing yoki /cancel tugmasini bosing.`, {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [[{ text: '/cancel' }]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      });
    }
    
    // Handle done button
    if (data.startsWith('done_')) {
      const targetUserId = data.split('_')[1];
      
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '✅ Xabar yopildi',
        show_alert: true
      });
      
      // Edit the message to show it's done
      const messageText = callbackQuery.message.text;
      return bot.editMessageText(`${messageText}\n\n✅ *Yopildi* ${new Date().toLocaleString()}`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      });
    }
    
  } catch (error) {
    console.error('Error handling callback query:', error);
    bot.answerCallbackQuery(callbackQuery.id, {
      text: '❌ Xatolik yuz berdi!',
      show_alert: true
    });
  }
});

// Pullik battle yaratish
async function createPaidBattle(chatId, userId, channelLink, extra = {}) {
  const battleId = extra.battleId || Date.now();
  
  // Kanal nomini olish va tozalash
  let targetChatId = channelLink.trim();
  
  if (targetChatId.startsWith('https://t.me/')) {
    targetChatId = '@' + targetChatId.split('/').pop();
  } else if (!targetChatId.startsWith('@')) {
    targetChatId = '@' + targetChatId;
  }
  
  // Kanal ID sini tekshirish
  if (!targetChatId) {
    return { 
      success: false, 
      error: 'Kanal topilmadi. Iltimos, kanal usernameni to\'g\'ri kiriting.' 
    };
  }
  
  const battle = {
    id: battleId,
    userId: userId,
    channelId: targetChatId,
    price: extra.price || PAID_BATTLE_PRICE,
    participants: [],
    createdAt: new Date(),
    sourceBattleId: extra.sourceBattleId || null,
    battleType: extra.battleType || null,
    prize: extra.prize || null
  };
  
  paidBattles.set(battleId, battle);
  
  // Foydalanuchiga to'lov haqida xabar yuborish
  await bot.sendMessage(
    chatId,
    `💰 <b>Pullik Battle Yaratish</b>\n\n` +
    `🆔 Battle ID: <code>${battleId}</code>\n` +
    `⚔️ Battle turi: <b>${battle.battleType === 'reaction' ? '❤️ Reaksiya Battle' : 'Ovoz Battle'}</b>\n` +
    `💳 To'lov miqdori: <b>${battle.price.toLocaleString()} so'm</b>\n` +
    `\nTo'lov qilish uchun quyidagi tugmani bosing:`, 
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📢 Kanal', url: `https://t.me/${targetChatId.replace('@','')}` }],
          [{
            text: `💳 ${PAID_BATTLE_PRICE.toLocaleString()} so'm to'lash`,
            callback_data: `pay_battle_${battleId}`
          }]
        ]
      }
    }
  );
  
  return { success: true, battleId };
}

// Pullik battlelar ro'yxatini ko'rsatish
async function showPaidBattles(chatId, userId) {
  const activeBattles = Array.from(paidBattles.entries())
    .filter(([_, battle]) => battle.participants.length < 2); // Faqat to'liq bo'lmagan battlelarni ko'rsatish
  
  if (activeBattles.length === 0) {
    await bot.sendMessage(chatId, '🔄 Hozirda aktiv pullik battlelar mavjud emas.');
    return;
  }
  
  const message = `💰 *Pullik Battles*\n\n` +
    `Quyidagi pullik battlelardan birini tanlang:\n\n` +
    activeBattles.map(([id, battle]) => 
      `🆔 ${id}\n` +
      `${battle.battleType ? `⚔️ Turi: ${battle.battleType}\n` : ''}` +
      `💵 Narx: ${battle.price.toLocaleString()} so'm\n` +
      `👥 Qatnashuvchilar: ${battle.participants.length}/2\n` +
      `📅 Yaratilgan: ${battle.createdAt.toLocaleString()}\n`
    ).join('\n');
  
  const keyboard = {
    inline_keyboard: activeBattles.map(([id, battle]) => [{
      text: `🆔 ${id} (${battle.participants.length}/2)`,
      callback_data: `join_paid_${id}`
    }])
  };
  
  await bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

bot.on('message', async (msg) => {
  if (!msg.text) return;
  
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text = msg.text;
  let userState = users.get(userId) || {};
  
  // Handle paid battle creation flow
  if (userState.waitingFor === 'paid_battle_id') {
    if (text === '❌ Bekor qilish') {
      users.delete(userId);
      return bot.sendMessage(chatId, '❌ Bekor qilindi.', {
        reply_markup: { remove_keyboard: true }
      });
    }
    
    // Save battle ID and ask for battle type
    userState.tempData.battleId = text;
    userState.waitingFor = 'paid_battle_type';
    users.set(userId, userState);
    
    const keyboard = {
      keyboard: [
        [{ text: '❤️ Reaksiya Battle' }],
        [{ text: 'Ovoz Battle' }],
        [{ text: '❌ Bekor qilish' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    };
    
    return bot.sendMessage(chatId, '⚔️ Battle turini tanlang:', {
      reply_markup: keyboard
    });
  }
  
  // Handle battle type selection
  if (userState.waitingFor === 'paid_battle_type' && ['❤️ Reaksiya Battle', 'Ovoz Battle'].includes(text)) {
    const battleType = text.includes('Reaksiya') ? 'reaction' : 'star';
    const battleId = userState.tempData.battleId;
    
    // Create the paid battle
    const result = await createPaidBattle(chatId, userId, battleId, {
      battleType: battleType,
      price: PAID_BATTLE_PRICE
    });
    
    // Clear user state
    users.delete(userId);
    
    if (!result.success) {
      return bot.sendMessage(chatId, `❌ Xatolik: ${result.error}`, {
        reply_markup: { remove_keyboard: true }
      });
    }
    
    return; // createPaidBattle will send the payment message
  }
  
  // Handle Pullik Battle button
  if (text === '💰 Pullik Battle') {
    const keyboard = {
      inline_keyboard: [
        [{ text: '➕ Pullik Battle Yaratish', callback_data: 'create_paid_battle' }],
        [{ text: '📋 Pullik Battlarni Ko\'rish', callback_data: 'view_paid_battles' }],
        [{ text: '🔙 Orqaga', callback_data: 'back_to_main' }]
      ]
    };
    
    await bot.sendMessage(chatId, '💰 *Pullik Battle Menyusi*\n\nBu yerda pullik battlelar yaratishingiz yoki ulardan biriga qatnashishingiz mumkin.', {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    return;
  }
  
  // New: handle asking for existing battle ID to create paid battle
  if (userState.state === 'paid_battle_id') {
    if (text === '🔙 Bekor qilish') {
      users.set(userId, {});
      await bot.sendMessage(chatId, 'Bekor qilindi.', { reply_markup: mainKeyboard });
      return;
    }
    const idNum = text.trim(); 
    const src = battles.get(idNum);
    if (!src) {
      await bot.sendMessage(chatId, '❌ Ushbu ID bo\'yicha battle topilmadi.');
      return;
    }
    const channelLink = src.channelUsername || src.channel;
    const typeLabel = (src.type === 'stars' || src.type === 'star') ? 'Stars' : (src.type === 'oddiy' ? 'Oddiy' : (src.type === 'reaction' ? 'Reaksiya' : src.type || 'Battle'));
    let prizeLabel = '';
    if (src.prizeType) {
      if (src.prizeType === 'stars') prizeLabel = `${src.prize} Stars`;
      else if (src.prizeType === 'money') prizeLabel = `${parseInt(src.prize).toLocaleString()} so'm`;
      else if (src.prizeType === 'nft') prizeLabel = `NFT (${src.prize})`;
      else prizeLabel = `${src.prize}`;
    } else if (src.prize) {
      prizeLabel = `${src.prize}`;
    }
    const created = await createPaidBattle(chatId, userId, channelLink, {
      sourceBattleId: idNum,
      battleType: typeLabel,
      prize: prizeLabel
    });
    if (!created.success) {
      await bot.sendMessage(chatId, `❌ Xatolik: ${created.error}`);
    }
    users.set(userId, {});
    return;
  }

  if (userState.state === 'await_paid_battle_id') {
    if (text === '🔙 Bekor qilish') {
      users.set(userId, {});
      await bot.sendMessage(chatId, 'Bekor qilindi.', { reply_markup: mainKeyboard });
      return;
    }
    
    const battleId = text.trim();
    
    // Try to find the battle with the exact ID first
    let foundBattle = battles.get(battleId);
    
    // If not found, try case-insensitive search
    if (!foundBattle) {
      // Convert battle IDs to lowercase and search
      const battleIdLower = battleId.toLowerCase();
      for (const [id, battle] of battles.entries()) {
        if (id.toLowerCase() === battleIdLower) {
          foundBattle = battle;
          break;
        }
      }
    }
    
    if (!foundBattle) {
      console.log(`Battle not found for ID: ${battleId}. Total battles in memory: ${battles.size}`);
      await bot.sendMessage(chatId, 
        '❌ Ushbu ID bo\'yicha battle topilmadi.\n\n' +
        'Iltimos, quyidagilarni tekshiring:\n' +
        '1. ID to\'g\'ri kiritilganligiga ishonch hosil qiling\n' +
        '2. Battle hali ham mavjudligiga ishonch hosil qiling\n' +
        '3. Yangi battle yaratish uchun /battle buyrug\'ini bosing'
      );
      return;
    }
    const usernameNoAt = (foundBattle.channelUsername || foundBattle.channel || '').replace('@', '');
    let url = `https://t.me/${usernameNoAt}`;
    if (usernameNoAt && foundBattle.postMessageId) {
      url = `https://t.me/${usernameNoAt}/${foundBattle.postMessageId}`;
    }
    await bot.sendMessage(chatId, `📢 Kanalga o\'tish: ${foundBattle.channelUsername || foundBattle.channel}`, {
      reply_markup: {
        inline_keyboard: [[{ text: '🔗 Battle postiga o\'tish', url }]]
      }
    });
    users.set(userId, {});
    return;
  }

  if (text.startsWith('/')) return;
  
  // Handle paid battle channel input
  if (userState.state === 'paid_battle_channel') {
    if (text === '🔙 Bekor qilish') {
      users.set(userId, {});
      await bot.sendMessage(chatId, 'Bekor qilindi.', { reply_markup: mainKeyboard });
      return;
    }
    
    const result = await createPaidBattle(chatId, userId, text);
    if (!result.success) {
      await bot.sendMessage(chatId, `❌ Xatolik: ${result.error}`);
    }
    
    // Clear user state
    users.set(userId, {});
    return;
  }
  
  // Update user state in case it was modified
  userState = users.get(userId) || {};
  
  // Check if admin is replying to a support ticket
  if (userState.replyingTo) {
    try {
      const targetUserId = userState.replyingTo;
      
      // Send message to user
      await bot.sendMessage(targetUserId, `📨 *Admin javobi:*\n\n${msg.text}`, {
        parse_mode: 'Markdown'
      });
      
      
            // Notify admin
      await bot.sendMessage(userId, `✅ Javobingiz foydalanuvchiga yuborildi!`, {
        reply_markup: { remove_keyboard: true }
      });

      // Clear replying state for admin
      delete userState.replyingTo;
      users.set(userId, userState);

      return;
    } catch (error) {
      console.error('Admin javobini yuborishda xatolik:', error);
      try {
        await bot.sendMessage(userId, '❌ Javob yuborishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.', {
          reply_markup: { remove_keyboard: true }
        });
      } catch (e) {
        console.error('Xabar yuborishda qo\'shimcha xato:', e);
      }
      return;
    }
  }

  // Other generic message handling could go here...

});
 
// Graceful shutdown handlers
process.on('SIGINT', async () => {
  console.log('⛔️ SIGINT qabul qilindi - bot to\'xtatilyapti...');
  try {
    // Stop polling if used
    if (bot && typeof bot.stopPolling === 'function') {
      try { bot.stopPolling(); } catch (e) {}
    }
  } catch (e) {
    console.error('Botni to\'xtatishda xatolik:', e);
  } finally {
    process.exit(0);
  }
});

process.on('SIGTERM', async () => {
  console.log('⛔️ SIGTERM qabul qilindi - bot to\'xtatilyapti...');
  try {
    if (bot && typeof bot.stopPolling === 'function') {
      try { bot.stopPolling(); } catch (e) {}
    }
  } catch (e) {
    console.error('Botni to\'xtatishda xatolik:', e);
  } finally {
    process.exit(0);
  }
});

// Log unhandled promise rejections and uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
  // It's often best to exit after an uncaught exception in Node.js
  process.exit(1);
});
      
